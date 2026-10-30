import { fetchModel } from "./model-cache";
import { loadOrt, type RuntimeOptions, runResilient } from "./runtime";

/**
 * Text recognition (OCR) with PaddleOCR's two-stage pipeline, both stages
 * Apache-2.0 ONNX exports:
 *
 * - Detection: PP-OCRv4 mobile det (~4.7 MB), a DB (differentiable
 *   binarization) network. It takes BGR CHW normalized with ImageNet
 *   mean/std, sides a multiple of 32 with the long side at most 1280, and
 *   returns a per-pixel text probability map [1,1,H,W]. Lines are the
 *   connected regions above 0.3, boxed by their minimum-area rectangle and
 *   grown ("unclipped") by area × 1.5 / perimeter, since the network
 *   predicts shrunk text kernels.
 * - Recognition: PP-OCRv5 latin mobile rec (~7.9 MB, 32 Latin-script
 *   languages, accents included). Each line is cut out upright at height 48,
 *   BGR CHW normalized to [-1, 1], and its output [1,T,C] is CTC-decoded:
 *   index 0 is the blank, then the dictionary, then a space.
 *
 * Thresholds match PaddleOCR's own predictor (0.3 / 0.6, unclip 1.5, lines
 * under 0.5 confidence dropped).
 */

const DETECTOR_BASE =
  "https://huggingface.co/SWHL/RapidOCR/resolve/1cfba2e90fc938db55889873735088de210cc173";
const RECOGNIZER_BASE =
  "https://huggingface.co/monkt/paddleocr-onnx/resolve/7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65";

export const DEFAULT_TEXT_DETECTOR_URL = `${DETECTOR_BASE}/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx`;
export const DEFAULT_TEXT_RECOGNIZER_URL = `${RECOGNIZER_BASE}/languages/latin/rec.onnx`;
export const DEFAULT_TEXT_DICTIONARY_URL = `${RECOGNIZER_BASE}/languages/latin/dict.txt`;

/** The recognizer's fixed line height. */
const REC_HEIGHT = 48;
/** Longest line crop the recognizer sees; wider lines are squeezed to fit. */
const REC_MAX_WIDTH = 1600;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export type Point = readonly [x: number, y: number];

/** A rotated rectangle: center, unit axis along the line, and its size. */
export interface TextBox {
  cx: number;
  cy: number;
  /** Unit vector along the text; the other axis is (−uy, ux). */
  ux: number;
  uy: number;
  /** Length along the text. */
  width: number;
  /** Thickness across it. */
  height: number;
  /** Mean text probability over the region. */
  score: number;
}

/** A line of text, normalized 0–1 over the source image. */
export interface TextLine {
  text: string;
  /** Mean per-character confidence, 0–1. */
  score: number;
  /** Corners clockwise from the line's top-left, normalized 0–1. */
  quad: [Point, Point, Point, Point];
  /** Axis-aligned bounds of the quad. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrOptions extends RuntimeOptions {
  detectorUrl?: string;
  recognizerUrl?: string;
  /** One character per line, in the recognizer's class order. */
  dictionaryUrl?: string;
  /** Long side of the detector's input. Defaults to 1280; small text reads better larger. */
  maxSide?: number;
  /** Probability a pixel needs to count as text. Defaults to 0.3. */
  binaryThreshold?: number;
  /** Mean probability a region needs to count as a line. Defaults to 0.6. */
  boxThreshold?: number;
  /** How far boxes grow past the network's shrunk kernels. Defaults to 1.5. */
  unclipRatio?: number;
  /** Lines read with less confidence are dropped. Defaults to 0.5. */
  minScore?: number;
}

// ── Geometry ──────────────────────────────────

/** Convex hull (monotone chain), counter-clockwise in y-down coordinates. */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = sorted.filter(
    (p, i) => i === 0 || p[0] !== sorted[i - 1][0] || p[1] !== sorted[i - 1][1],
  );
  if (unique.length < 3) return unique;
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The smallest rotated rectangle around `points` (rotating calipers over
 * the hull: the best rectangle has a side on a hull edge). The returned
 * axis runs along the rectangle's longer side, pointing right.
 */
export function minAreaRect(points: readonly Point[]): Omit<TextBox, "score"> {
  const hull = convexHull(points);
  let best: {
    area: number;
    ux: number;
    uy: number;
    a0: number;
    a1: number;
    b0: number;
    b1: number;
  } | null = null;
  const edges =
    hull.length < 2
      ? [[1, 0]]
      : hull.map((p, i) => {
          const q = hull[(i + 1) % hull.length];
          return [q[0] - p[0], q[1] - p[1]];
        });
  for (const [ex, ey] of edges) {
    const len = Math.hypot(ex, ey);
    if (len === 0) continue;
    const ux = ex / len;
    const uy = ey / len;
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const [x, y] of hull) {
      const a = x * ux + y * uy;
      const b = -x * uy + y * ux;
      if (a < a0) a0 = a;
      if (a > a1) a1 = a;
      if (b < b0) b0 = b;
      if (b > b1) b1 = b;
    }
    const area = (a1 - a0) * (b1 - b0);
    if (!best || area < best.area) best = { area, ux, uy, a0, a1, b0, b1 };
  }
  if (!best)
    return { cx: hull[0]?.[0] ?? 0, cy: hull[0]?.[1] ?? 0, ux: 1, uy: 0, width: 0, height: 0 };
  let { ux, uy } = best;
  const am = (best.a0 + best.a1) / 2;
  const bm = (best.b0 + best.b1) / 2;
  const cx = am * ux - bm * uy;
  const cy = am * uy + bm * ux;
  let width = best.a1 - best.a0;
  let height = best.b1 - best.b0;
  if (height > width) {
    [ux, uy] = [-uy, ux];
    [width, height] = [height, width];
  }
  if (ux < 0 || (ux === 0 && uy < 0)) {
    ux = -ux;
    uy = -uy;
  }
  return { cx, cy, ux, uy, width, height };
}

/** Corners of a box, clockwise from top-left along its axis (y down). */
export function boxCorners(box: Omit<TextBox, "score">): [Point, Point, Point, Point] {
  const { cx, cy, ux, uy } = box;
  const hw = box.width / 2;
  const hh = box.height / 2;
  // The across axis, pointing "down" the line.
  const vx = -uy;
  const vy = ux;
  const at = (su: number, sv: number): Point => [
    cx + ux * hw * su + vx * hh * sv,
    cy + uy * hw * su + vy * hh * sv,
  ];
  return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
}

// ── Detection ─────────────────────────────────

/**
 * Text regions in a DB probability map, in map pixels. Each 4-connected
 * region over `binaryThreshold` becomes its minimum-area rectangle, kept
 * when its mean probability clears `boxThreshold`, then grown by
 * area × unclipRatio / perimeter on every side.
 */
export function textBoxesFromMap(
  prob: Float32Array,
  width: number,
  height: number,
  options: { binaryThreshold?: number; boxThreshold?: number; unclipRatio?: number } = {},
): TextBox[] {
  const bin = options.binaryThreshold ?? 0.3;
  const minBox = options.boxThreshold ?? 0.6;
  const unclip = options.unclipRatio ?? 1.5;
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const boxes: TextBox[] = [];
  for (let start = 0; start < prob.length; start++) {
    if (seen[start] || prob[start] <= bin) continue;
    // Flood the region, collecting the outline of every pixel square.
    seen[start] = 1;
    let top = 0;
    stack[top++] = start;
    const corners: Point[] = [];
    let sum = 0;
    let count = 0;
    while (top > 0) {
      const i = stack[--top];
      const x = i % width;
      const y = (i - x) / width;
      sum += prob[i];
      count++;
      // Only edge pixels can shape the hull; interior ones are skipped.
      const left = x > 0 && prob[i - 1] > bin;
      const right = x < width - 1 && prob[i + 1] > bin;
      const up = y > 0 && prob[i - width] > bin;
      const down = y < height - 1 && prob[i + width] > bin;
      if (!(left && right && up && down)) {
        corners.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]);
      }
      if (left && !seen[i - 1]) {
        seen[i - 1] = 1;
        stack[top++] = i - 1;
      }
      if (right && !seen[i + 1]) {
        seen[i + 1] = 1;
        stack[top++] = i + 1;
      }
      if (up && !seen[i - width]) {
        seen[i - width] = 1;
        stack[top++] = i - width;
      }
      if (down && !seen[i + width]) {
        seen[i + width] = 1;
        stack[top++] = i + width;
      }
    }
    if (count < 4) continue;
    const rect = minAreaRect(corners);
    if (Math.min(rect.width, rect.height) < 3) continue;
    const score = sum / count;
    if (score < minBox) continue;
    const grow = (rect.width * rect.height * unclip) / (2 * (rect.width + rect.height));
    const grown = { ...rect, width: rect.width + 2 * grow, height: rect.height + 2 * grow, score };
    if (Math.min(grown.width, grown.height) < 5) continue;
    boxes.push(grown);
  }
  return boxes;
}

/** Detector input size: the long side at most `maxSide`, both sides multiples of 32. */
export function detectorSize(srcW: number, srcH: number, maxSide: number): [number, number] {
  const ratio = Math.min(1, maxSide / Math.max(srcW, srcH));
  return [
    Math.max(32, Math.round((srcW * ratio) / 32) * 32),
    Math.max(32, Math.round((srcH * ratio) / 32) * 32),
  ];
}

/** RGBA bytes → detector tensor: BGR CHW, ImageNet mean/std (in PaddleOCR's channel order). */
export function rgbaToDetectorTensor(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const chw = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    for (let c = 0; c < 3; c++) {
      chw[c * pixelCount + p] = (data[p * 4 + 2 - c] / 255 - MEAN[c]) / STD[c];
    }
  }
  return chw;
}

/** RGBA bytes → recognizer tensor: BGR CHW in [-1, 1]. */
export function rgbaToRecognizerTensor(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const chw = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    for (let c = 0; c < 3; c++) {
      chw[c * pixelCount + p] = data[p * 4 + 2 - c] / 127.5 - 1;
    }
  }
  return chw;
}

// ── Recognition ───────────────────────────────

/**
 * Greedy CTC decode of [steps, classes] logits: best class per step,
 * repeats merged, blanks (class 0) dropped. `charset[k]` names class k.
 */
export function ctcDecode(
  logits: Float32Array,
  steps: number,
  classes: number,
  charset: readonly string[],
): { text: string; score: number } {
  let text = "";
  let total = 0;
  let kept = 0;
  let previous = 0;
  for (let t = 0; t < steps; t++) {
    let best = 0;
    let bestValue = -Infinity;
    const o = t * classes;
    for (let k = 0; k < classes; k++) {
      if (logits[o + k] > bestValue) {
        bestValue = logits[o + k];
        best = k;
      }
    }
    if (best !== 0 && best !== previous) {
      text += charset[best] ?? "";
      total += bestValue;
      kept++;
    }
    previous = best;
  }
  return { text: text.trim(), score: kept ? total / kept : 0 };
}

/** The recognizer's classes: blank, the dictionary's characters, then a space. */
export function charsetFromDictionary(dictionary: string): string[] {
  const chars = dictionary.split(/\r?\n/);
  if (chars[chars.length - 1] === "") chars.pop();
  return ["", ...chars, " "];
}

/**
 * Reading order: lines whose centers sit within half a line height of each
 * other share a row, rows run top to bottom, lines in a row left to right.
 */
export function readingOrder<T extends { x: number; y: number; w: number; h: number }>(
  lines: readonly T[],
): T[][] {
  const sorted = [...lines].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: { cy: number; h: number; items: T[] }[] = [];
  for (const line of sorted) {
    const cy = line.y + line.h / 2;
    const row = rows.find((r) => Math.abs(r.cy - cy) < Math.min(r.h, line.h) / 2);
    if (row) row.items.push(line);
    else rows.push({ cy, h: line.h, items: [line] });
  }
  return rows.map((r) => r.items.sort((a, b) => a.x - b.x));
}

/** The lines as plain text: one row per line, gaps between a row's pieces. */
export function linesToText(lines: readonly TextLine[]): string {
  return readingOrder(lines)
    .map((row) => row.map((l) => l.text).join("  "))
    .join("\n");
}

const dictionaries = new Map<string, Promise<string[]>>();

function loadCharset(url: string): Promise<string[]> {
  let pending = dictionaries.get(url);
  if (!pending) {
    pending = fetchModel(url).then((buffer) =>
      charsetFromDictionary(new TextDecoder().decode(buffer)),
    );
    pending.catch(() => dictionaries.delete(url));
    dictionaries.set(url, pending);
  }
  return pending;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("[Retouch ML] Failed to create canvas context");
  return ctx;
}

/**
 * Cut a rotated box out of the source, upright, at the recognizer's height:
 * the canvas transform maps the box's top-left/top-right/bottom-left corners
 * onto the crop's.
 */
function cropLine(
  source: CanvasImageSource,
  corners: [Point, Point, Point, Point],
): HTMLCanvasElement {
  const [tl, tr, , bl] = corners;
  const lineW = Math.hypot(tr[0] - tl[0], tr[1] - tl[1]);
  const lineH = Math.hypot(bl[0] - tl[0], bl[1] - tl[1]);
  const width = Math.max(
    REC_HEIGHT / 4,
    Math.min(REC_MAX_WIDTH, Math.ceil((REC_HEIGHT * lineW) / Math.max(1, lineH))),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = REC_HEIGHT;
  const ctx = context2d(canvas);
  // Crop → source is p = tl + u·ax + v·ay; draw with its inverse.
  const ax = [(tr[0] - tl[0]) / width, (tr[1] - tl[1]) / width];
  const ay = [(bl[0] - tl[0]) / REC_HEIGHT, (bl[1] - tl[1]) / REC_HEIGHT];
  const det = ax[0] * ay[1] - ay[0] * ax[1];
  const a = ay[1] / det;
  const b = -ax[1] / det;
  const c = -ay[0] / det;
  const d = ax[0] / det;
  ctx.imageSmoothingQuality = "high";
  ctx.setTransform(a, b, c, d, -(a * tl[0] + c * tl[1]), -(b * tl[0] + d * tl[1]));
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/**
 * Find and read the text in an image or canvas. Lines come back in reading
 * order, normalized 0–1, with their rotated corners and axis-aligned bounds.
 */
export async function recognizeText(
  source: HTMLImageElement | HTMLCanvasElement,
  options: OcrOptions = {},
): Promise<TextLine[]> {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (srcW < 2 || srcH < 2) return [];

  const ort = await loadOrt();
  const charsetPending = loadCharset(options.dictionaryUrl ?? DEFAULT_TEXT_DICTIONARY_URL);

  // 1. Where the text is
  const [detW, detH] = detectorSize(srcW, srcH, options.maxSide ?? 1280);
  const canvas = document.createElement("canvas");
  canvas.width = detW;
  canvas.height = detH;
  const dctx = context2d(canvas);
  dctx.imageSmoothingQuality = "high";
  dctx.drawImage(source, 0, 0, detW, detH);
  const pixels = dctx.getImageData(0, 0, detW, detH).data;
  const input = new ort.Tensor("float32", rgbaToDetectorTensor(pixels, detW * detH), [
    1,
    3,
    detH,
    detW,
  ]);
  const detected = await runResilient(
    options.detectorUrl ?? DEFAULT_TEXT_DETECTOR_URL,
    options,
    (s) => ({ [s.inputNames[0]]: input }),
  );
  const map = detected.results[detected.session.outputNames[0]];
  const [mapH, mapW] = (map.dims as number[]).slice(-2);
  const boxes = textBoxesFromMap(map.data as Float32Array, mapW, mapH, options);
  if (boxes.length === 0) return [];

  // 2. What it says, a line at a time
  const charset = await charsetPending;
  const sx = srcW / mapW;
  const sy = srcH / mapH;
  const minScore = options.minScore ?? 0.5;
  const lines: TextLine[] = [];
  for (const box of boxes) {
    // Back to source pixels; the map can be squashed differently per axis.
    const corners = boxCorners(box).map(([x, y]) => [x * sx, y * sy] as Point) as [
      Point,
      Point,
      Point,
      Point,
    ];
    const crop = cropLine(source, corners);
    const data = context2d(crop).getImageData(0, 0, crop.width, crop.height).data;
    const tensor = new ort.Tensor(
      "float32",
      rgbaToRecognizerTensor(data, crop.width * crop.height),
      [1, 3, REC_HEIGHT, crop.width],
    );
    const read = await runResilient(
      options.recognizerUrl ?? DEFAULT_TEXT_RECOGNIZER_URL,
      options,
      (s) => ({ [s.inputNames[0]]: tensor }),
    );
    const out = read.results[read.session.outputNames[0]];
    const [steps, classes] = (out.dims as number[]).slice(-2);
    const { text, score } = ctcDecode(out.data as Float32Array, steps, classes, charset);
    if (!text || score < minScore) continue;
    const quad = corners.map(([x, y]) => [x / srcW, y / srcH] as Point) as TextLine["quad"];
    const xs = quad.map((p) => p[0]);
    const ys = quad.map((p) => p[1]);
    const x0 = Math.max(0, Math.min(...xs));
    const y0 = Math.max(0, Math.min(...ys));
    const x1 = Math.min(1, Math.max(...xs));
    const y1 = Math.min(1, Math.max(...ys));
    lines.push({ text, score, quad, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return readingOrder(lines).flat();
}
