import { ort, type RuntimeOptions, runResilient } from "./runtime";

/**
 * Depth estimation via Depth Anything V2 Small (Apache-2.0, quantized
 * ~27 MB — verified 0.9993-correlated with the fp32 export). Dynamic input
 * dims (multiples of 14, longest edge ≈ 518), RGB /255 with ImageNet
 * mean/std, no padding. Output is relative inverse depth at input dims:
 * **higher = closer** (verified empirically).
 *
 * Bokeh: the image is pre-blurred at a few fixed radii once, then any
 * focus/aperture combination is a cheap per-pixel blend between the two
 * bracketing levels — so scrubbing the controls never re-runs a blur.
 */

export const DEFAULT_DEPTH_MODEL_URL =
  "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx";

const DEPTH_TARGET = 518;
const DEPTH_MULTIPLE = 14;

/** Blur-level radii as fractions of the output's long edge. */
const LEVEL_RADII = [0, 0.002, 0.005, 0.01, 0.018];

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

/**
 * Which pre-blurred levels to mix for a desired radius: the bracketing pair
 * plus the interpolation factor. Radii must be ascending, starting at 0.
 */
export function blendWeights(
  radius: number,
  levelRadii: number[],
): { lo: number; hi: number; t: number } {
  const last = levelRadii.length - 1;
  if (radius <= levelRadii[0]) return { lo: 0, hi: 0, t: 0 };
  if (radius >= levelRadii[last]) return { lo: last, hi: last, t: 0 };
  let hi = 1;
  while (levelRadii[hi] < radius) hi++;
  const lo = hi - 1;
  const span = levelRadii[hi] - levelRadii[lo];
  return { lo, hi, t: span > 0 ? (radius - levelRadii[lo]) / span : 0 };
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Separable box blur over RGB (two passes ≈ soft gaussian), alpha kept. */
function boxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius));
  const src = Float32Array.from(data);
  const dst = new Float32Array(data.length);
  const window = r * 2 + 1;
  const clampi = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      for (let c = 0; c < 3; c++) {
        const row = y * width * 4 + c;
        let sum = 0;
        for (let x = -r; x <= r; x++) sum += src[row + clampi(x, 0, width - 1) * 4];
        for (let x = 0; x < width; x++) {
          dst[row + x * 4] = sum / window;
          sum += src[row + clampi(x + r + 1, 0, width - 1) * 4];
          sum -= src[row + clampi(x - r, 0, width - 1) * 4];
        }
      }
    }
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        const col = x * 4 + c;
        let sum = 0;
        for (let y = -r; y <= r; y++) sum += dst[clampi(y, 0, height - 1) * width * 4 + col];
        for (let y = 0; y < height; y++) {
          src[y * width * 4 + col] = sum / window;
          sum += dst[clampi(y + r + 1, 0, height - 1) * width * 4 + col];
          sum -= dst[clampi(y - r, 0, height - 1) * width * 4 + col];
        }
      }
    }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = src[i];
    out[i + 1] = src[i + 1];
    out[i + 2] = src[i + 2];
    out[i + 3] = data[i + 3];
  }
  return out;
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

/** Pre-blurred levels + per-pixel depth, ready for cheap re-composition. */
export interface BokehPrep {
  width: number;
  height: number;
  levels: Uint8ClampedArray[];
  levelRadii: number[];
  /** Depth per output pixel, 0–1. */
  depth: Float32Array;
}

/**
 * Blur the image at the fixed level radii and resample the depth map to the
 * output resolution — the expensive one-time half of the bokeh render.
 */
export function prepareBokeh(
  source: HTMLImageElement | HTMLCanvasElement,
  depth: DepthMap,
  maxDim = 1280,
): BokehPrep {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  const cap = Math.min(1, maxDim / Math.max(srcW, srcH, 1));
  const w = Math.max(2, Math.round(srcW * cap));
  const h = Math.max(2, Math.round(srcH * cap));

  const base = canvasOf(w, h);
  const baseCtx = base.getContext("2d");
  if (!baseCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  baseCtx.drawImage(source, 0, 0, w, h);
  const baseData = baseCtx.getImageData(0, 0, w, h).data;

  const long = Math.max(w, h);
  const levelRadii = LEVEL_RADII.map((f) => Math.round(f * long * 4));
  const levels: Uint8ClampedArray[] = [baseData];
  for (let i = 1; i < levelRadii.length; i++) {
    levels.push(boxBlur(baseData, w, h, levelRadii[i]));
  }

  // Depth resampled to output pixels via canvas bilinear
  const depthCanvas = canvasOf(depth.width, depth.height);
  const depthCtx = depthCanvas.getContext("2d");
  if (!depthCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  const gray = new Uint8ClampedArray(depth.width * depth.height * 4);
  for (let p = 0; p < depth.data.length; p++) {
    const v = depth.data[p] * 255;
    gray[p * 4] = v;
    gray[p * 4 + 1] = v;
    gray[p * 4 + 2] = v;
    gray[p * 4 + 3] = 255;
  }
  depthCtx.putImageData(new ImageData(gray, depth.width, depth.height), 0, 0);
  const up = canvasOf(w, h);
  const upCtx = up.getContext("2d");
  if (!upCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  upCtx.imageSmoothingEnabled = true;
  upCtx.imageSmoothingQuality = "high";
  upCtx.drawImage(depthCanvas, 0, 0, w, h);
  const upData = upCtx.getImageData(0, 0, w, h).data;
  const depthOut = new Float32Array(w * h);
  for (let p = 0; p < depthOut.length; p++) depthOut[p] = upData[p * 4] / 255;

  return { width: w, height: h, levels, levelRadii, depth: depthOut };
}

/**
 * Compose the bokeh for a focus depth (0–1, from a click) and aperture
 * strength (0–1): blur radius grows with distance from the focal plane.
 * Cheap enough to run on every slider tick.
 */
export function composeBokeh(prep: BokehPrep, focus: number, strength: number): HTMLCanvasElement {
  const { width, height, levels, levelRadii, depth } = prep;
  const maxRadius = levelRadii[levelRadii.length - 1];
  const out = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    // Distance from the focal plane, eased so near-focus stays crisp
    const d = Math.min(1, Math.abs(depth[p] - focus) * 2) * strength;
    const radius = d * maxRadius;
    const { lo, hi, t } = blendWeights(radius, levelRadii);
    const a = levels[lo];
    const b = levels[hi];
    const i = p * 4;
    out[i] = a[i] * (1 - t) + b[i] * t;
    out[i + 1] = a[i + 1] * (1 - t) + b[i + 1] * t;
    out[i + 2] = a[i + 2] * (1 - t) + b[i + 2] * t;
    out[i + 3] = 255;
  }
  const canvas = canvasOf(width, height);
  canvas.getContext("2d")?.putImageData(new ImageData(out, width, height), 0, 0);
  return canvas;
}
