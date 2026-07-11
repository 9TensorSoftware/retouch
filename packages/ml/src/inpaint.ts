import { enqueueInference } from "./queue";
import { loadSession, ort, type RuntimeOptions, releaseSession } from "./runtime";

/**
 * Object erase via LaMa (Apache-2.0): the brush strokes define a hole, a
 * padded square region around the hole runs through the network at its
 * fixed 512×512 size, and the inpainted patch composites back at full
 * resolution — masked pixels only, feathered edge.
 *
 * Conventions verified against the export: image RGB 0–1 CHW, mask 1=hole,
 * output 0–255 with unmasked pixels passing through unchanged.
 */

export const DEFAULT_INPAINT_MODEL_URL =
  "https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx";

/** The export's fixed spatial size. */
const MODEL_SIZE = 512;

export interface InpaintOptions extends RuntimeOptions {
  modelUrl?: string;
}

/** One brush dab, normalized to the image: center (0–1), radius as a fraction of height. */
export interface MaskStroke {
  x: number;
  y: number;
  r: number;
}

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Pixel bounding box of the strokes plus context padding, clamped to the
 * image. Returns null when there are no strokes.
 */
export function strokesBoundingBox(
  strokes: MaskStroke[],
  width: number,
  height: number,
  pad: number,
): Region | null {
  if (strokes.length === 0) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const s of strokes) {
    const r = s.r * height;
    minX = Math.min(minX, s.x * width - r);
    minY = Math.min(minY, s.y * height - r);
    maxX = Math.max(maxX, s.x * width + r);
    maxY = Math.max(maxY, s.y * height + r);
  }
  const x = Math.max(0, Math.floor(minX - pad));
  const y = Math.max(0, Math.floor(minY - pad));
  const x1 = Math.min(width, Math.ceil(maxX + pad));
  const y1 = Math.min(height, Math.ceil(maxY + pad));
  if (x1 <= x || y1 <= y) return null;
  return { x, y, w: x1 - x, h: y1 - y };
}

/**
 * Grow a region to a square (the network sees an undistorted patch),
 * shifting inside the image when possible; where the image itself is
 * smaller than the square, the region clamps to the image bounds.
 */
export function expandToSquare(region: Region, width: number, height: number): Region {
  const side = Math.min(Math.max(region.w, region.h), Math.min(width, height));
  const grow = (start: number, size: number, limit: number): number => {
    let s = start - Math.floor((side - size) / 2);
    s = Math.max(0, Math.min(s, limit - side));
    return s;
  };
  return {
    x: grow(region.x, region.w, width),
    y: grow(region.y, region.h, height),
    w: side,
    h: side,
  };
}

/** RGBA bytes → CHW float tensor data in 0–1. */
export function rgbaToChw(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const chw = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    chw[p] = data[p * 4] / 255;
    chw[pixelCount + p] = data[p * 4 + 1] / 255;
    chw[pixelCount * 2 + p] = data[p * 4 + 2] / 255;
  }
  return chw;
}

/** Grayscale mask RGBA → binary hole tensor (1 = inpaint). */
export function maskToTensor(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const mask = new Float32Array(pixelCount);
  for (let p = 0; p < pixelCount; p++) {
    mask[p] = data[p * 4] > 127 ? 1 : 0;
  }
  return mask;
}

/** CHW floats in 0–255 → opaque RGBA bytes. */
export function chw255ToRgba(chw: Float32Array, pixelCount: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let p = 0; p < pixelCount; p++) {
    rgba[p * 4] = Math.max(0, Math.min(255, chw[p]));
    rgba[p * 4 + 1] = Math.max(0, Math.min(255, chw[pixelCount + p]));
    rgba[p * 4 + 2] = Math.max(0, Math.min(255, chw[pixelCount * 2 + p]));
    rgba[p * 4 + 3] = 255;
  }
  return rgba;
}

// Once WebGPU inference fails for this model, skip straight to WASM later.
let preferWasm = false;

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: MaskStroke[],
  width: number,
  height: number,
  style: string,
): void {
  ctx.fillStyle = style;
  for (const s of strokes) {
    ctx.beginPath();
    ctx.arc(s.x * width, s.y * height, s.r * height, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Erase the brushed region of an image. Returns a full-resolution canvas:
 * the original pixels everywhere, the network's fill where the strokes are.
 */
export async function inpaintStrokes(
  source: HTMLImageElement | HTMLCanvasElement,
  strokes: MaskStroke[],
  options: InpaintOptions = {},
): Promise<HTMLCanvasElement> {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (srcW < 2 || srcH < 2) throw new Error("[Retouch ML] Image too small to erase from");

  // Context padding: a third of the brushed extent, at least 48px, so the
  // network sees enough surroundings to hallucinate a coherent fill.
  const rough = strokesBoundingBox(strokes, srcW, srcH, 0);
  if (!rough) throw new Error("[Retouch ML] Nothing brushed to erase");
  const pad = Math.max(48, Math.round(Math.max(rough.w, rough.h) / 3));
  const padded = strokesBoundingBox(strokes, srcW, srcH, pad);
  if (!padded) throw new Error("[Retouch ML] Nothing brushed to erase");
  const region = expandToSquare(padded, srcW, srcH);

  const modelUrl = options.modelUrl ?? DEFAULT_INPAINT_MODEL_URL;
  // preferWasm only overrides the defaults — an explicit provider list wins.
  const useWasmFirst = !options.executionProviders && preferWasm;
  let session = await loadSession(
    modelUrl,
    useWasmFirst ? { ...options, executionProviders: ["wasm"] } : options,
  );
  const wasmOnlyExplicit =
    options.executionProviders?.length === 1 && options.executionProviders[0] === "wasm";
  let fellBackToWasm = useWasmFirst || wasmOnlyExplicit === true;

  // Crop the region and letterbox-free resize to the model's fixed size
  const patch = canvasOf(MODEL_SIZE, MODEL_SIZE);
  const patchCtx = patch.getContext("2d");
  if (!patchCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  patchCtx.drawImage(source, region.x, region.y, region.w, region.h, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const patchData = patchCtx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;

  // Rasterize the strokes into the same patch space
  const maskCanvas = canvasOf(MODEL_SIZE, MODEL_SIZE);
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  maskCtx.fillStyle = "#000";
  maskCtx.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE);
  maskCtx.save();
  maskCtx.scale(MODEL_SIZE / region.w, MODEL_SIZE / region.h);
  maskCtx.translate(-region.x, -region.y);
  drawStrokes(maskCtx, strokes, srcW, srcH, "#fff");
  maskCtx.restore();
  const maskData = maskCtx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;

  const pixels = MODEL_SIZE * MODEL_SIZE;
  const feeds = {
    [session.inputNames[0]]: new ort.Tensor("float32", rgbaToChw(patchData, pixels), [
      1,
      3,
      MODEL_SIZE,
      MODEL_SIZE,
    ]),
    [session.inputNames[1]]: new ort.Tensor("float32", maskToTensor(maskData, pixels), [
      1,
      1,
      MODEL_SIZE,
      MODEL_SIZE,
    ]),
  };
  let results: Awaited<ReturnType<typeof session.run>>;
  try {
    results = await enqueueInference(() => session.run(feeds));
  } catch (error) {
    // Some WebGPU kernels only fail at inference time — retry on WASM once.
    if (fellBackToWasm) throw error;
    fellBackToWasm = true;
    if (!options.executionProviders) preferWasm = true;
    console.warn("[Retouch ML] WebGPU inference failed — retrying on WASM", error);
    void releaseSession(modelUrl, options);
    session = await loadSession(modelUrl, { ...options, executionProviders: ["wasm"] });
    results = await enqueueInference(() => session.run(feeds));
  }
  const output = results[session.outputNames[0]];
  const [, , oh, ow] = output.dims as number[];
  if (ow !== MODEL_SIZE || oh !== MODEL_SIZE) {
    throw new Error(`[Retouch ML] Unexpected inpaint output ${ow}×${oh}`);
  }

  // Inpainted patch back at region resolution
  const filled = canvasOf(MODEL_SIZE, MODEL_SIZE);
  filled
    .getContext("2d")
    ?.putImageData(
      new ImageData(chw255ToRgba(output.data as Float32Array, pixels), MODEL_SIZE, MODEL_SIZE),
      0,
      0,
    );

  // Feathered stroke mask at full resolution — masked pixels only, so the
  // (resized) network patch never degrades the untouched surroundings.
  const feather = canvasOf(srcW, srcH);
  const featherCtx = feather.getContext("2d");
  if (!featherCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  featherCtx.filter = "blur(2px)";
  drawStrokes(featherCtx, strokes, srcW, srcH, "#fff");
  featherCtx.filter = "none";

  const patchFull = canvasOf(srcW, srcH);
  const patchFullCtx = patchFull.getContext("2d");
  if (!patchFullCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  patchFullCtx.imageSmoothingEnabled = true;
  patchFullCtx.imageSmoothingQuality = "high";
  patchFullCtx.drawImage(
    filled,
    0,
    0,
    MODEL_SIZE,
    MODEL_SIZE,
    region.x,
    region.y,
    region.w,
    region.h,
  );
  patchFullCtx.globalCompositeOperation = "destination-in";
  patchFullCtx.drawImage(feather, 0, 0);

  const out = canvasOf(srcW, srcH);
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  outCtx.drawImage(source, 0, 0);
  outCtx.drawImage(patchFull, 0, 0);
  return out;
}
