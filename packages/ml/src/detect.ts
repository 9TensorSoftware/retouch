import { ort, type RuntimeOptions, runResilient } from "./runtime";

/**
 * Face detection via UltraFace (MIT, ~1.2 MB): the RFB-320 export decodes
 * its priors in-graph, so the outputs are softmaxed scores [1,N,2] and
 * normalized corner boxes [1,N,4] — threshold + NMS is all that's left.
 *
 * Conventions verified against the export: RGB CHW normalized (v−127)/128,
 * fixed 320×240 input (aspect squashed, per the reference implementation),
 * class 1 = face.
 */

export const DEFAULT_FACE_MODEL_URL =
  "https://media.githubusercontent.com/media/onnx/models/main/validated/vision/body_analysis/ultraface/models/version-RFB-320.onnx";

const INPUT_W = 320;
const INPUT_H = 240;

/** A detected box, normalized 0–1 over the source image. */
export interface Detection {
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export interface DetectFacesOptions extends RuntimeOptions {
  modelUrl?: string;
  /** Minimum face probability. Defaults to 0.7. */
  scoreThreshold?: number;
  /** NMS overlap threshold. Defaults to 0.35. */
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
