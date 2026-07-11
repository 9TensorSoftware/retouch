import { loadSession, ort, type RuntimeOptions } from "./runtime";

/**
 * Background removal via MODNet (Apache-2.0): the image runs through the
 * network at a capped reference size, the predicted matte upsamples back to
 * full resolution, and the result is the original RGBA with the matte as its
 * alpha channel. Swap `modelUrl` for a BiRefNet ONNX export when quality
 * matters more than the download.
 */

export const DEFAULT_CUTOUT_MODEL_URL =
  "https://huggingface.co/Xenova/modnet/resolve/main/onnx/model.onnx";

export interface CutoutOptions extends RuntimeOptions {
  modelUrl?: string;
  /** Network reference size (long edge). Defaults to MODNet's 512. */
  refSize?: number;
}

/**
 * Network input dimensions: long edge capped at `refSize`, both dimensions
 * snapped to multiples of 32 (MODNet's stride).
 */
export function fitRefSize(
  width: number,
  height: number,
  refSize = 512,
): { width: number; height: number } {
  const scale = Math.min(1, refSize / Math.max(width, height));
  const snap = (v: number) => Math.max(32, Math.round((v * scale) / 32) * 32);
  return { width: snap(width), height: snap(height) };
}

/** RGBA bytes → normalized CHW float tensor data, MODNet convention (x−0.5)/0.5. */
export function rgbaToNormalizedChw(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const chw = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    chw[p] = (data[p * 4] / 255 - 0.5) / 0.5;
    chw[pixelCount + p] = (data[p * 4 + 1] / 255 - 0.5) / 0.5;
    chw[pixelCount * 2 + p] = (data[p * 4 + 2] / 255 - 0.5) / 0.5;
  }
  return chw;
}

/** Matte floats (0–1) → grayscale RGBA bytes, for canvas-based upsampling. */
export function matteToRgba(matte: Float32Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(matte.length * 4);
  for (let p = 0; p < matte.length; p++) {
    const v = Math.max(0, Math.min(1, matte[p])) * 255;
    rgba[p * 4] = v;
    rgba[p * 4 + 1] = v;
    rgba[p * 4 + 2] = v;
    rgba[p * 4 + 3] = 255;
  }
  return rgba;
}

/** Write a grayscale matte (as RGBA) into the alpha channel of `target`, in place. */
export function applyMatteAlpha(target: Uint8ClampedArray, matteRgba: Uint8ClampedArray): void {
  for (let i = 0; i < target.length; i += 4) {
    target[i + 3] = Math.min(target[i + 3], matteRgba[i]);
  }
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Remove the background of an image or canvas. Returns a new canvas holding
 * the original pixels with the predicted matte as alpha.
 */
export async function removeBackground(
  source: HTMLImageElement | HTMLCanvasElement,
  options: CutoutOptions = {},
): Promise<HTMLCanvasElement> {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  if (srcW < 2 || srcH < 2) throw new Error("[Retouch ML] Image too small for cutout");

  const session = await loadSession(options.modelUrl ?? DEFAULT_CUTOUT_MODEL_URL, options);

  // Downscale to the network's reference size
  const ref = fitRefSize(srcW, srcH, options.refSize);
  const refCanvas = canvasOf(ref.width, ref.height);
  const refCtx = refCanvas.getContext("2d");
  if (!refCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  refCtx.drawImage(source, 0, 0, ref.width, ref.height);
  const refData = refCtx.getImageData(0, 0, ref.width, ref.height).data;

  const input = new ort.Tensor("float32", rgbaToNormalizedChw(refData, ref.width * ref.height), [
    1,
    3,
    ref.height,
    ref.width,
  ]);
  const inputName = session.inputNames[0];
  const outputs = await session.run({ [inputName]: input });
  const matte = outputs[session.outputNames[0]].data as Float32Array;

  // Upsample the matte to full resolution with canvas bilinear filtering
  const matteSmall = canvasOf(ref.width, ref.height);
  matteSmall
    .getContext("2d")
    ?.putImageData(new ImageData(matteToRgba(matte), ref.width, ref.height), 0, 0);
  const matteFull = canvasOf(srcW, srcH);
  const matteFullCtx = matteFull.getContext("2d");
  if (!matteFullCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  matteFullCtx.imageSmoothingEnabled = true;
  matteFullCtx.imageSmoothingQuality = "high";
  matteFullCtx.drawImage(matteSmall, 0, 0, srcW, srcH);

  // Composite: original pixels, matte as alpha
  const out = canvasOf(srcW, srcH);
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  outCtx.drawImage(source, 0, 0);
  const outImage = outCtx.getImageData(0, 0, srcW, srcH);
  applyMatteAlpha(outImage.data, matteFullCtx.getImageData(0, 0, srcW, srcH).data);
  outCtx.putImageData(outImage, 0, 0);
  return out;
}
