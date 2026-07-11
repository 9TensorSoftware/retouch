import { clamp } from "./math";

/**
 * Lens corrections: radial barrel/pincushion distortion (bilinear remap) and
 * devignetting (inverse radial gain). Geometric — runs in the frame stage
 * with the keystone warp, before color work.
 */

export function hasLens(distortion: number, devignette: number): boolean {
  return distortion !== 0 || devignette !== 0;
}

/** Max radial coefficient at ±100. */
const MAX_K = 0.35;
/** Max corner gain at 100 (× r²). */
const MAX_DEVIGNETTE = 0.9;

/**
 * Remap RGBA data through the radial model: positive distortion bulges the
 * center outward (corrects pincushion), negative pinches it (corrects
 * barrel). Returns a new buffer; out-of-frame samples stay transparent.
 */
export function remapLensData(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  distortion: number,
  devignette: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const k = (distortion / 100) * MAX_K;
  const vig = (devignette / 100) * MAX_DEVIGNETTE;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  // Normalize by the half-diagonal so r = 1 at the corners.
  const invNorm = 1 / Math.sqrt(cx * cx + cy * cy);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) * invNorm;
      const dy = (y - cy) * invNorm;
      const r2 = dx * dx + dy * dy;
      const scale = 1 + k * r2;
      const sx = cx + (x - cx) * scale;
      const sy = cy + (y - cy) * scale;
      const i = (y * width + x) * 4;

      if (sx < 0 || sy < 0 || sx > width - 1 || sy > height - 1) continue;

      // Bilinear sample
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * width + x0) * 4;
      const i10 = (y0 * width + x1) * 4;
      const i01 = (y1 * width + x0) * 4;
      const i11 = (y1 * width + x1) * 4;
      const gain = 1 + vig * r2;

      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bottom = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        const value = top * (1 - fy) + bottom * fy;
        out[i + c] = c === 3 ? value : clamp(value * gain, 0, 255);
      }
    }
  }
  return out;
}

/** Warp `src` into `dst` (same dimensions) through the lens model. */
export function applyLensToCanvas(
  src: HTMLCanvasElement,
  dst: CanvasRenderingContext2D,
  distortion: number,
  devignette: number,
): void {
  const w = src.width;
  const h = src.height;
  if (w === 0 || h === 0) return;
  const srcCtx = src.getContext("2d");
  if (!srcCtx) return;
  const image = srcCtx.getImageData(0, 0, w, h);
  const out = remapLensData(image.data, w, h, distortion, devignette);
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.clearRect(0, 0, w, h);
  dst.putImageData(new ImageData(out, w, h), 0, 0);
}
