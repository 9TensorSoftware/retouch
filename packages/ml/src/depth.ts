import { loadOrt, type RuntimeOptions, runResilient } from "./runtime";

/**
 * Depth estimation via Depth Anything V2 Small (Apache-2.0, quantized
 * ~27 MB — verified 0.9993-correlated with the fp32 export). Dynamic input
 * dims (multiples of 14, longest edge ≈ 518), RGB /255 with ImageNet
 * mean/std, no padding. Output is relative inverse depth at input dims:
 * **higher = closer** (verified empirically). The bokeh built on it lives
 * in bokeh.ts.
 */

export const DEFAULT_DEPTH_MODEL_URL =
  "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model_quantized.onnx";

const DEPTH_TARGET = 518;
const DEPTH_MULTIPLE = 14;

export interface DepthOptions extends RuntimeOptions {
  modelUrl?: string;
}

/** Relative depth, normalized 0–1 (1 = closest), at model resolution. */
export interface DepthMap {
  data: Float32Array;
  width: number;
  height: number;
}

/** Model input dims: longest edge ≈ 518, both multiples of 14, aspect kept. */
export function depthResizedSize(width: number, height: number): { width: number; height: number } {
  const scale = DEPTH_TARGET / Math.max(width, height, 1);
  const snap = (v: number) =>
    Math.max(DEPTH_MULTIPLE, Math.round((v * scale) / DEPTH_MULTIPLE) * DEPTH_MULTIPLE);
  return { width: snap(width), height: snap(height) };
}

/** RGBA bytes → CHW float tensor data: /255 then ImageNet mean/std. */
export function rgbaToDepthTensor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const plane = width * height;
  const chw = new Float32Array(plane * 3);
  const mean = [0.485, 0.456, 0.406];
  const std = [0.229, 0.224, 0.225];
  for (let p = 0; p < plane; p++) {
    chw[p] = (data[p * 4] / 255 - mean[0]) / std[0];
    chw[plane + p] = (data[p * 4 + 1] / 255 - mean[1]) / std[1];
    chw[plane * 2 + p] = (data[p * 4 + 2] / 255 - mean[2]) / std[2];
  }
  return chw;
}

/** Min-max normalize raw model output to 0–1 (constant maps become 0). */
export function normalizeDepth(raw: Float32Array): Float32Array {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of raw) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  const out = new Float32Array(raw.length);
  if (range <= 0) return out;
  for (let i = 0; i < raw.length; i++) out[i] = (raw[i] - min) / range;
  return out;
}

/** Bilinear depth sample at normalized (0–1) coordinates. */
export function depthAt(map: DepthMap, nx: number, ny: number): number {
  const x = Math.min(Math.max(nx, 0), 1) * (map.width - 1);
  const y = Math.min(Math.max(ny, 0), 1) * (map.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(map.width - 1, x0 + 1);
  const y1 = Math.min(map.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const top = map.data[y0 * map.width + x0] * (1 - fx) + map.data[y0 * map.width + x1] * fx;
  const bottom = map.data[y1 * map.width + x0] * (1 - fx) + map.data[y1 * map.width + x1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Per-image depth cache (same scheme as the SAM embeddings). */
const DEPTH_CACHE_MAX = 3;
const depthCache = new Map<HTMLImageElement | HTMLCanvasElement, Promise<DepthMap>>();

/** Drop all cached depth maps. */
export function clearDepthCache(): void {
  depthCache.clear();
}

/** Estimate relative depth, memoized per element. Higher = closer. */
export function estimateDepth(
  source: HTMLImageElement | HTMLCanvasElement,
  options: DepthOptions = {},
): Promise<DepthMap> {
  const cached = depthCache.get(source);
  if (cached) return cached;

  const promise = (async () => {
    const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
    const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (srcW < 2 || srcH < 2) throw new Error("[Retouch ML] Image too small to analyze");

    const size = depthResizedSize(srcW, srcH);
    const canvas = canvasOf(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[Retouch ML] Failed to create canvas context");
    ctx.drawImage(source, 0, 0, size.width, size.height);
    const data = ctx.getImageData(0, 0, size.width, size.height).data;

    const ort = await loadOrt();
    const input = new ort.Tensor("float32", rgbaToDepthTensor(data, size.width, size.height), [
      1,
      3,
      size.height,
      size.width,
    ]);
    const { session, results } = await runResilient(
      options.modelUrl ?? DEFAULT_DEPTH_MODEL_URL,
      options,
      (s) => ({ [s.inputNames[0]]: input }),
    );
    const raw = results[session.outputNames[0]].data as Float32Array;
    return { data: normalizeDepth(raw), width: size.width, height: size.height };
  })();
  promise.catch(() => depthCache.delete(source));
  depthCache.set(source, promise);
  if (depthCache.size > DEPTH_CACHE_MAX) {
    const oldest = depthCache.keys().next().value;
    if (oldest) depthCache.delete(oldest);
  }
  return promise;
}
