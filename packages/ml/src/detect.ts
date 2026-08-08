import { ort, type RuntimeOptions, runResilient } from "./runtime";

/**
 * Detection models. Faces: UltraFace (MIT, ~1.2 MB) — the RFB-320 export
 * decodes its priors in-graph, so the outputs are softmaxed scores [1,N,2]
 * and normalized corner boxes [1,N,4]; threshold + NMS is all that's left.
 * Objects: YOLOX-nano (Apache-2.0, ~3.5 MB) — raw per-anchor output
 * [1,3549,85] decoded here (xy = (pred+grid)·stride, wh = exp(pred)·stride,
 * score = objectness × class), 80 COCO classes.
 *
 * Conventions verified against the exports: UltraFace takes RGB CHW
 * normalized (v−127)/128 at a fixed squashed 320×240. YOLOX takes **BGR**
 * CHW in raw 0–255 (no normalization) on a 114-gray letterbox canvas,
 * image pasted top-left at ratio = min(416/w, 416/h) — BGR confirmed
 * empirically (person 0.90 vs 0.78 with RGB).
 */

export const DEFAULT_FACE_MODEL_URL =
  "https://media.githubusercontent.com/media/onnx/models/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx";

export const DEFAULT_OBJECT_MODEL_URL =
  "https://huggingface.co/hr16/yolox-onnx/resolve/main/yolox_nano.onnx";

const INPUT_W = 320;
const INPUT_H = 240;

/** YOLOX-nano's fixed square input. */
const YOLOX_SIZE = 416;
const YOLOX_STRIDES = [8, 16, 32];

/** The 80 COCO class names, in YOLOX output order. */
export const COCO_CLASSES = [
  "person",
  "bicycle",
  "car",
  "motorcycle",
  "airplane",
  "bus",
  "train",
  "truck",
  "boat",
  "traffic light",
  "fire hydrant",
  "stop sign",
  "parking meter",
  "bench",
  "bird",
  "cat",
  "dog",
  "horse",
  "sheep",
  "cow",
  "elephant",
  "bear",
  "zebra",
  "giraffe",
  "backpack",
  "umbrella",
  "handbag",
  "tie",
  "suitcase",
  "frisbee",
  "skis",
  "snowboard",
  "sports ball",
  "kite",
  "baseball bat",
  "baseball glove",
  "skateboard",
  "surfboard",
  "tennis racket",
  "bottle",
  "wine glass",
  "cup",
  "fork",
  "knife",
  "spoon",
  "bowl",
  "banana",
  "apple",
  "sandwich",
  "orange",
  "broccoli",
  "carrot",
  "hot dog",
  "pizza",
  "donut",
  "cake",
  "chair",
  "couch",
  "potted plant",
  "bed",
  "dining table",
  "toilet",
  "tv",
  "laptop",
  "mouse",
  "remote",
  "keyboard",
  "cell phone",
  "microwave",
  "oven",
  "toaster",
  "sink",
  "refrigerator",
  "book",
  "clock",
  "vase",
  "scissors",
  "teddy bear",
  "hair drier",
  "toothbrush",
];

/** A detected box, normalized 0–1 over the source image. */
export interface Detection {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
  /** COCO class name for object detections; faces leave it unset. */
  label?: string;
}

export interface DetectFacesOptions extends RuntimeOptions {
  modelUrl?: string;
  /** Minimum face probability. Defaults to 0.7. */
  scoreThreshold?: number;
  /** NMS overlap threshold. Defaults to 0.35. */
  iouThreshold?: number;
}

export interface DetectObjectsOptions extends RuntimeOptions {
  modelUrl?: string;
  /** Minimum objectness × class score. Defaults to 0.35. */
  scoreThreshold?: number;
  /** NMS overlap threshold (applied per class). Defaults to 0.45. */
  iouThreshold?: number;
}

/** RGBA bytes → UltraFace tensor data: RGB CHW, (v−127)/128. */
export function rgbaToUltraFaceTensor(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const chw = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    chw[p] = (data[p * 4] - 127) / 128;
    chw[pixelCount + p] = (data[p * 4 + 1] - 127) / 128;
    chw[pixelCount * 2 + p] = (data[p * 4 + 2] - 127) / 128;
  }
  return chw;
}

/** Intersection-over-union of two normalized boxes. */
export function iou(a: Detection, b: Detection): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

/** Greedy non-maximum suppression, highest score first. */
export function nms(detections: Detection[], iouThreshold: number): Detection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score);
  const kept: Detection[] = [];
  for (const det of sorted) {
    if (kept.every((k) => iou(k, det) < iouThreshold)) kept.push(det);
  }
  return kept;
}

/**
 * Threshold the raw UltraFace outputs into candidate boxes (still
 * overlapping — run `nms` after). Boxes are clamped to the frame; empty or
 * inverted ones are dropped.
 */
export function decodeUltraFace(
  scores: Float32Array,
  boxes: Float32Array,
  count: number,
  scoreThreshold: number,
): Detection[] {
  const out: Detection[] = [];
  for (let i = 0; i < count; i++) {
    const score = scores[i * 2 + 1];
    if (score < scoreThreshold) continue;
    const x0 = Math.max(0, Math.min(1, boxes[i * 4]));
    const y0 = Math.max(0, Math.min(1, boxes[i * 4 + 1]));
    const x1 = Math.max(0, Math.min(1, boxes[i * 4 + 2]));
    const y1 = Math.max(0, Math.min(1, boxes[i * 4 + 3]));
    if (x1 <= x0 || y1 <= y0) continue;
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, score });
  }
  return out;
}

/**
 * Per-anchor grid coordinates and strides for YOLOX at 416: 52² + 26² + 13²
 * anchors, level-major in stride order 8/16/32.
 */
export function buildYoloxGrid(): { gridX: Int32Array; gridY: Int32Array; stride: Int32Array } {
  let total = 0;
  for (const s of YOLOX_STRIDES) total += (YOLOX_SIZE / s) ** 2;
  const gridX = new Int32Array(total);
  const gridY = new Int32Array(total);
  const stride = new Int32Array(total);
  let i = 0;
  for (const s of YOLOX_STRIDES) {
    const n = YOLOX_SIZE / s;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        gridX[i] = x;
        gridY[i] = y;
        stride[i] = s;
        i++;
      }
    }
  }
  return { gridX, gridY, stride };
}

/**
 * Letterboxed-canvas RGBA → YOLOX tensor data: CHW **BGR**, raw 0–255.
 * The canvas is expected to already hold the 114-gray letterbox.
 */
export function rgbaToYoloxTensor(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const chw = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    chw[p] = data[p * 4 + 2]; // B plane first
    chw[pixelCount + p] = data[p * 4 + 1];
    chw[pixelCount * 2 + p] = data[p * 4]; // R plane last
  }
  return chw;
}

/**
 * Decode raw YOLOX output [N,85] into thresholded candidate boxes,
 * normalized 0–1 over the source (still overlapping — run `nms` after).
 * `ratio` is the letterbox scale min(416/w, 416/h).
 */
export function decodeYolox(
  output: Float32Array,
  grid: { gridX: Int32Array; gridY: Int32Array; stride: Int32Array },
  ratio: number,
  srcWidth: number,
  srcHeight: number,
  scoreThreshold: number,
): Detection[] {
  const out: Detection[] = [];
  const count = grid.stride.length;
  for (let i = 0; i < count; i++) {
    const o = i * 85;
    const objectness = output[o + 4];
    // score = objectness × classProb ≤ objectness, so this skip is exact.
    if (objectness < scoreThreshold) continue;
    let bestCls = 0;
    let bestProb = 0;
    for (let c = 0; c < 80; c++) {
      const p = output[o + 5 + c];
      if (p > bestProb) {
        bestProb = p;
        bestCls = c;
      }
    }
    const score = objectness * bestProb;
    if (score < scoreThreshold) continue;
    const s = grid.stride[i];
    const cx = (output[o] + grid.gridX[i]) * s;
    const cy = (output[o + 1] + grid.gridY[i]) * s;
    const w = Math.exp(output[o + 2]) * s;
    const h = Math.exp(output[o + 3]) * s;
    // Back to source pixels, then normalize
    const x0 = Math.max(0, (cx - w / 2) / ratio);
    const y0 = Math.max(0, (cy - h / 2) / ratio);
    const x1 = Math.min(srcWidth, (cx + w / 2) / ratio);
    const y1 = Math.min(srcHeight, (cy + h / 2) / ratio);
    if (x1 <= x0 || y1 <= y0) continue;
    out.push({
      x: x0 / srcWidth,
      y: y0 / srcHeight,
      w: (x1 - x0) / srcWidth,
      h: (y1 - y0) / srcHeight,
      score,
      label: COCO_CLASSES[bestCls],
    });
  }
  return out;
}

/** NMS per class: boxes of different labels never suppress each other. */
export function nmsByClass(detections: Detection[], iouThreshold: number): Detection[] {
  const byLabel = new Map<string, Detection[]>();
  for (const d of detections) {
    const key = d.label ?? "";
    const list = byLabel.get(key);
    if (list) list.push(d);
    else byLabel.set(key, [d]);
  }
  const kept: Detection[] = [];
  for (const list of byLabel.values()) kept.push(...nms(list, iouThreshold));
  return kept.sort((a, b) => b.score - a.score);
}

/** Detect COCO objects in an image or canvas. Boxes come back normalized 0–1. */
export async function detectObjects(
  source: HTMLImageElement | HTMLCanvasElement,
  options: DetectObjectsOptions = {},
): Promise<Detection[]> {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (srcW < 2 || srcH < 2) return [];

  const ratio = Math.min(YOLOX_SIZE / srcW, YOLOX_SIZE / srcH);
  const canvas = document.createElement("canvas");
  canvas.width = YOLOX_SIZE;
  canvas.height = YOLOX_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[Retouch ML] Failed to create canvas context");
  ctx.fillStyle = "rgb(114, 114, 114)";
  ctx.fillRect(0, 0, YOLOX_SIZE, YOLOX_SIZE);
  ctx.drawImage(source, 0, 0, Math.round(srcW * ratio), Math.round(srcH * ratio));
  const data = ctx.getImageData(0, 0, YOLOX_SIZE, YOLOX_SIZE).data;

  const input = new ort.Tensor("float32", rgbaToYoloxTensor(data, YOLOX_SIZE * YOLOX_SIZE), [
    1,
    3,
    YOLOX_SIZE,
    YOLOX_SIZE,
  ]);
  const { session, results } = await runResilient(
    options.modelUrl ?? DEFAULT_OBJECT_MODEL_URL,
    options,
    (s) => ({ [s.inputNames[0]]: input }),
  );
  const output = results[session.outputNames[0]].data as Float32Array;

  const candidates = decodeYolox(
    output,
    buildYoloxGrid(),
    ratio,
    srcW,
    srcH,
    options.scoreThreshold ?? 0.35,
  );
  return nmsByClass(candidates, options.iouThreshold ?? 0.45);
}

/** Detect faces in an image or canvas. Boxes come back normalized 0–1. */
export async function detectFaces(
  source: HTMLImageElement | HTMLCanvasElement,
  options: DetectFacesOptions = {},
): Promise<Detection[]> {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (srcW < 2 || srcH < 2) return [];

  const canvas = document.createElement("canvas");
  canvas.width = INPUT_W;
  canvas.height = INPUT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[Retouch ML] Failed to create canvas context");
  ctx.drawImage(source, 0, 0, INPUT_W, INPUT_H);
  const data = ctx.getImageData(0, 0, INPUT_W, INPUT_H).data;

  const input = new ort.Tensor("float32", rgbaToUltraFaceTensor(data, INPUT_W * INPUT_H), [
    1,
    3,
    INPUT_H,
    INPUT_W,
  ]);
  const { session, results } = await runResilient(
    options.modelUrl ?? DEFAULT_FACE_MODEL_URL,
    options,
    (s) => ({ [s.inputNames[0]]: input }),
  );
  const scores = results[session.outputNames[0]];
  const boxes = results[session.outputNames[1]];
  const count = (scores.dims as number[])[1];

  const candidates = decodeUltraFace(
    scores.data as Float32Array,
    boxes.data as Float32Array,
    count,
    options.scoreThreshold ?? 0.7,
  );
  return nms(candidates, options.iouThreshold ?? 0.35);
}
