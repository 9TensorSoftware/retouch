import { ort, type RuntimeOptions, runResilient } from "./runtime";
import { computeTileGrid } from "./tiles";
import { chw01ToRgba, rgbaToChw01 } from "./upscale";

/**
 * Blind real-noise removal via SCUNet (Apache-2.0): the image runs through
 * the network tile by tile at native resolution — RGB in 0–1, CHW, output
 * the same shape. The export splits into a small graph stub plus a
 * `.onnx.data` weights sidecar, loaded through the runtime's external-data
 * support. Swin attention windows constrain every input dimension to a
 * multiple of 64, so each tile pads up to the next multiple by replicating
 * its edge pixels (verified: zero-padding bleeds a dark rim into cores that
 * sit on the image border).
 */

export const DEFAULT_DENOISE_MODEL_URL =
  "https://huggingface.co/Heliosoph/scunet-onnx/resolve/main/scunet_color_real_psnr.onnx";

export const DEFAULT_DENOISE_DATA_URL =
  "https://huggingface.co/Heliosoph/scunet-onnx/resolve/main/scunet_color_real_psnr.onnx.data";

/** Every SCUNet input dimension must divide by this (Swin window math). */
export const DENOISE_DIM_MULTIPLE = 64;

export interface DenoiseOptions extends RuntimeOptions {
  modelUrl?: string;
  /** Core tile edge in source pixels. Defaults to 192. */
  tileSize?: number;
  /** Context padding around each tile. Defaults to 16. */
  tileOverlap?: number;
  /** Reject sources with a longer edge than this. Defaults to 2048. */
  maxInputDim?: number;
  /** Tile-level progress — fires after each tile completes. */
  onTileProgress?: (done: number, total: number) => void;
}

/** Round `value` up to the next multiple of `multiple` (at least one). */
export function ceilToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.ceil(value / multiple) * multiple);
}

/**
 * Grow an RGBA buffer from sw×sh to pw×ph by clamping reads to the source
 * edge — the classic replicate pad, so the network never sees a synthetic
 * black border.
 */
export function padRgbaReplicate(
  data: Uint8ClampedArray,
  sw: number,
  sh: number,
  pw: number,
  ph: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    const sy = Math.min(y, sh - 1);
    for (let x = 0; x < pw; x++) {
      const sx = Math.min(x, sw - 1);
      const si = (sy * sw + sx) * 4;
      const di = (y * pw + x) * 4;
      out[di] = data[si];
      out[di + 1] = data[si + 1];
      out[di + 2] = data[si + 2];
      out[di + 3] = data[si + 3];
    }
  }
  return out;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Denoise an image or canvas in place (1:1 dimensions). Returns a canvas
 * at the source size with the noise removed and alpha carried through.
 */
export async function denoiseImage(
  source: HTMLImageElement | HTMLCanvasElement,
  options: DenoiseOptions = {},
): Promise<HTMLCanvasElement> {
  const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
  const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
  const maxDim = options.maxInputDim ?? 2048;
  if (srcW < 2 || srcH < 2) throw new Error("[Retouch ML] Image too small to denoise");
  if (Math.max(srcW, srcH) > maxDim) {
    throw new Error(`[Retouch ML] Image exceeds the ${maxDim}px denoise input limit`);
  }

  const modelUrl = options.modelUrl ?? DEFAULT_DENOISE_MODEL_URL;
  // The default export needs its sidecar; a custom single-file export
  // doesn't — only wire the default data URL alongside the default model.
  const runOptions: RuntimeOptions = {
    ...options,
    externalDataUrl:
      options.externalDataUrl ?? (options.modelUrl ? undefined : DEFAULT_DENOISE_DATA_URL),
  };

  const srcCanvas = canvasOf(srcW, srcH);
  const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
  if (!srcCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  srcCtx.drawImage(source, 0, 0);

  const tiles = computeTileGrid(srcW, srcH, options.tileSize ?? 192, options.tileOverlap ?? 16);
  const out = canvasOf(srcW, srcH);
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("[Retouch ML] Failed to create canvas context");

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const tileData = srcCtx.getImageData(t.sx, t.sy, t.sw, t.sh).data;
    const pw = ceilToMultiple(t.sw, DENOISE_DIM_MULTIPLE);
    const ph = ceilToMultiple(t.sh, DENOISE_DIM_MULTIPLE);
    const padded =
      pw === t.sw && ph === t.sh ? tileData : padRgbaReplicate(tileData, t.sw, t.sh, pw, ph);
    const input = new ort.Tensor("float32", rgbaToChw01(padded, pw * ph), [1, 3, ph, pw]);
    const { session, results } = await runResilient(modelUrl, runOptions, (s) => ({
      [s.inputNames[0]]: input,
    }));
    const output = results[session.outputNames[0]];
    const [, , oh, ow] = output.dims as number[];
    if (ow !== pw || oh !== ph) {
      throw new Error(`[Retouch ML] Unexpected model output ${ow}×${oh} for a ${pw}×${ph} tile`);
    }
    const rgba = chw01ToRgba(output.data as Float32Array, pw * ph);
    // Place the padded tile at its read position, but only paint the core.
    outCtx.putImageData(
      new ImageData(rgba, pw, ph),
      t.sx,
      t.sy,
      t.keepX,
      t.keepY,
      t.keepW,
      t.keepH,
    );
    options.onTileProgress?.(i + 1, tiles.length);
    // Yield so progress UI can paint between tiles.
    await new Promise((r) => setTimeout(r, 0));
  }

  // The network is RGB-only: dimensions are 1:1, so transparency carries
  // over as a straight alpha copy, when there is any.
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;
  let hasAlpha = false;
  for (let i = 3; i < srcData.length; i += 4) {
    if (srcData[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  if (hasAlpha) {
    const outImage = outCtx.getImageData(0, 0, srcW, srcH);
    for (let i = 3; i < outImage.data.length; i += 4) {
      outImage.data[i] = srcData[i];
    }
    outCtx.putImageData(outImage, 0, 0);
  }
  return out;
}
