import { ort, type RuntimeOptions, runResilient } from "./runtime";
import { computeTileGrid } from "./tiles";

/**
 * Super-resolution via Real-ESRGAN (BSD-3-Clause): the image runs through
 * the network tile by tile (with overlap so seams never show), each tile
 * upscaled by the model's native factor. RGB in 0–1, CHW — the classic
 * ESRGAN convention. Alpha, which the network doesn't model, upsamples
 * separately with canvas filtering.
 */

export const DEFAULT_UPSCALE_MODEL_URL =
  "https://huggingface.co/fernandotonon/QtMeshEditor-realesrgan-onnx/resolve/main/RealESRGAN_x4plus.onnx";

export interface UpscaleOptions extends RuntimeOptions {
  modelUrl?: string;
  /** Core tile edge in source pixels. Defaults to 64 (keeps WebGPU buffers small). */
  tileSize?: number;
  /** Context padding around each tile. Defaults to 8. */
  tileOverlap?: number;
  /** Reject sources with a longer edge than this. Defaults to 2048. */
  maxInputDim?: number;
  /** Tile-level progress — fires after each tile completes. */
  onTileProgress?: (done: number, total: number) => void;
}

/** RGBA bytes → CHW float tensor data in 0–1 (ESRGAN convention). */
export function rgbaToChw01(data: Uint8ClampedArray, pixelCount: number): Float32Array {
  const chw = new Float32Array(pixelCount * 3);
  for (let p = 0; p < pixelCount; p++) {
    chw[p] = data[p * 4] / 255;
    chw[pixelCount + p] = data[p * 4 + 1] / 255;
    chw[pixelCount * 2 + p] = data[p * 4 + 2] / 255;
  }
  return chw;
}

/** CHW floats in 0–1 → opaque RGBA bytes, clamping out-of-range values. */
export function chw01ToRgba(chw: Float32Array, pixelCount: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let p = 0; p < pixelCount; p++) {
    rgba[p * 4] = Math.max(0, Math.min(1, chw[p])) * 255;
    rgba[p * 4 + 1] = Math.max(0, Math.min(1, chw[pixelCount + p])) * 255;
    rgba[p * 4 + 2] = Math.max(0, Math.min(1, chw[pixelCount * 2 + p])) * 255;
    rgba[p * 4 + 3] = 255;
  }
  return rgba;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Upscale an image or canvas by the model's native factor. Returns a canvas
 * at scale× the source dimensions.
 */
export async function upscaleImage(
  source: HTMLImageElement | HTMLCanvasElement,
  options: UpscaleOptions = {},
): Promise<HTMLCanvasElement> {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  const maxDim = options.maxInputDim ?? 2048;
  if (srcW < 2 || srcH < 2) throw new Error("[Retouch ML] Image too small to upscale");
  if (Math.max(srcW, srcH) > maxDim) {
    throw new Error(`[Retouch ML] Image exceeds the ${maxDim}px upscale input limit`);
  }

  const modelUrl = options.modelUrl ?? DEFAULT_UPSCALE_MODEL_URL;

  const srcCanvas = canvasOf(srcW, srcH);
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  srcCtx.drawImage(source, 0, 0);

  const tiles = computeTileGrid(srcW, srcH, options.tileSize ?? 64, options.tileOverlap ?? 8);

  // The true scale comes from the model's own output on the first tile —
  // trusting an option here would silently garble the stitch on a mismatch.
  let scale = 0;
  let out: HTMLCanvasElement | null = null;
  let outCtx: CanvasRenderingContext2D | null = null;

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const tileData = srcCtx.getImageData(t.sx, t.sy, t.sw, t.sh).data;
    const input = new ort.Tensor("float32", rgbaToChw01(tileData, t.sw * t.sh), [1, 3, t.sh, t.sw]);
    const { session, results } = await runResilient(modelUrl, options, (s) => ({
      [s.inputNames[0]]: input,
    }));
    const output = results[session.outputNames[0]];
    const [, , oh, ow] = output.dims as number[];
    if (out === null) {
      scale = ow / t.sw;
      if (!Number.isInteger(scale) || scale < 1 || oh !== t.sh * scale) {
        throw new Error(
          `[Retouch ML] Unexpected model output ${ow}×${oh} for a ${t.sw}×${t.sh} tile`,
        );
      }
      out = canvasOf(srcW * scale, srcH * scale);
      outCtx = out.getContext("2d");
      if (!outCtx) throw new Error("[Retouch ML] Failed to create canvas context");
    } else if (ow !== t.sw * scale || oh !== t.sh * scale) {
      throw new Error("[Retouch ML] Model output scale changed between tiles");
    }
    const rgba = chw01ToRgba(output.data as Float32Array, ow * oh);
    // Place the full tile at its read position, but only paint the core.
    outCtx?.putImageData(
      new ImageData(rgba, ow, oh),
      t.sx * scale,
      t.sy * scale,
      t.keepX * scale,
      t.keepY * scale,
      t.keepW * scale,
      t.keepH * scale,
    );
    options.onTileProgress?.(i + 1, tiles.length);
    // Yield so progress UI can paint between tiles.
    await new Promise((r) => setTimeout(r, 0));
  }
  if (!out || !outCtx) throw new Error("[Retouch ML] Upscale produced no tiles");

  // The network is RGB-only: carry transparency over by upsampling the
  // source alpha with canvas filtering, when there is any.
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  let hasAlpha = false;
  for (let i = 3; i < srcData.length; i += 4) {
    if (srcData[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  if (hasAlpha) {
    const alphaUp = canvasOf(srcW * scale, srcH * scale);
    const alphaCtx = alphaUp.getContext("2d");
    if (alphaCtx) {
      alphaCtx.imageSmoothingEnabled = true;
      alphaCtx.imageSmoothingQuality = "high";
      alphaCtx.drawImage(srcCanvas, 0, 0, srcW * scale, srcH * scale);
      const alphaData = alphaCtx.getImageData(0, 0, alphaUp.width, alphaUp.height).data;
      const outImage = outCtx.getImageData(0, 0, out.width, out.height);
      for (let i = 3; i < outImage.data.length; i += 4) {
        outImage.data[i] = alphaData[i];
      }
      outCtx.putImageData(outImage, 0, 0);
    }
  }
  return out;
}
