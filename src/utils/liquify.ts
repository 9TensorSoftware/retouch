import type { WarpField } from "../types";
import { clamp } from "./math";

/**
 * Liquify (push warp): a brush paints displacement vectors into a coarse
 * grid; rendering bilinearly interpolates the grid and backward-maps each
 * output pixel. Geometric — runs at the end of the frame stage, after the
 * keystone and lens warps.
 */

/** Grid resolution — coarse enough to stay light in history snapshots. */
export const LIQUIFY_GRID = 33;

/** Displacement magnitude cap, as a fraction of the frame dimension. */
const MAX_DISPLACEMENT = 0.25;

export function createWarpField(cols = LIQUIFY_GRID, rows = LIQUIFY_GRID): WarpField {
  return {
    cols,
    rows,
    dx: new Array(cols * rows).fill(0),
    dy: new Array(cols * rows).fill(0),
  };
}

export function liquifyIsNeutral(field: WarpField | null | undefined): boolean {
  if (!field) return true;
  return field.dx.every((v) => v === 0) && field.dy.every((v) => v === 0);
}

/**
 * Push grid nodes around (x, y) along (moveX, moveY) — everything normalized
 * to the frame. `radius` is a fraction of the frame height; `aspect`
 * (width/height) keeps the brush circular on non-square frames. `strength`
 * is 0–100.
 */
export function applyBrushStroke(
  field: WarpField,
  x: number,
  y: number,
  moveX: number,
  moveY: number,
  radius: number,
  strength: number,
  aspect = 1,
): void {
  const { cols, rows, dx, dy } = field;
  const k = clamp(strength, 0, 100) / 100;
  if (radius <= 0 || k === 0 || (moveX === 0 && moveY === 0)) return;

  for (let r = 0; r < rows; r++) {
    const ny = rows > 1 ? r / (rows - 1) : 0;
    for (let c = 0; c < cols; c++) {
      const nx = cols > 1 ? c / (cols - 1) : 0;
      // Distance in height units so the brush stays round on screen.
      const d = Math.hypot((nx - x) * aspect, ny - y) / radius;
      if (d >= 1) continue;
      const t = 1 - d;
      const falloff = t * t * (3 - 2 * t);
      const i = r * cols + c;
      dx[i] = clamp(dx[i] + moveX * k * falloff, -MAX_DISPLACEMENT, MAX_DISPLACEMENT);
      dy[i] = clamp(dy[i] + moveY * k * falloff, -MAX_DISPLACEMENT, MAX_DISPLACEMENT);
    }
  }
}

/** Bilinear sample of the displacement grid at normalized (u, v). */
export function sampleField(field: WarpField, u: number, v: number): [number, number] {
  const { cols, rows, dx, dy } = field;
  const gx = clamp(u, 0, 1) * (cols - 1);
  const gy = clamp(v, 0, 1) * (rows - 1);
  const c0 = Math.floor(gx);
  const r0 = Math.floor(gy);
  const c1 = Math.min(cols - 1, c0 + 1);
  const r1 = Math.min(rows - 1, r0 + 1);
  const fx = gx - c0;
  const fy = gy - r0;
  const i00 = r0 * cols + c0;
  const i10 = r0 * cols + c1;
  const i01 = r1 * cols + c0;
  const i11 = r1 * cols + c1;
  return [
    (dx[i00] * (1 - fx) + dx[i10] * fx) * (1 - fy) + (dx[i01] * (1 - fx) + dx[i11] * fx) * fy,
    (dy[i00] * (1 - fx) + dy[i10] * fx) * (1 - fy) + (dy[i01] * (1 - fx) + dy[i11] * fx) * fy,
  ];
}

/**
 * Backward-map RGBA data through the field: the output pixel at p shows the
 * source at p − displacement, so painted strokes read as pushing pixels
 * along the drag. Samples clamp to the frame edge (no transparent tears).
 */
export function remapLiquifyData(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  field: WarpField,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < height; y++) {
    const v = height > 1 ? y / (height - 1) : 0;
    for (let x = 0; x < width; x++) {
      const u = width > 1 ? x / (width - 1) : 0;
      const [fdx, fdy] = sampleField(field, u, v);
      const i = (y * width + x) * 4;
      if (fdx === 0 && fdy === 0) {
        out[i] = src[i];
        out[i + 1] = src[i + 1];
        out[i + 2] = src[i + 2];
        out[i + 3] = src[i + 3];
        continue;
      }
      const sx = clamp(x - fdx * width, 0, width - 1);
      const sy = clamp(y - fdy * height, 0, height - 1);

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
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bottom = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        out[i + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}

/** Warp `src` into `dst` (same dimensions) through the displacement field. */
export function applyLiquifyToCanvas(
  src: HTMLCanvasElement,
  dst: CanvasRenderingContext2D,
  field: WarpField,
): void {
  const w = src.width;
  const h = src.height;
  if (w === 0 || h === 0) return;
  const srcCtx = src.getContext("2d");
  if (!srcCtx) return;
  const image = srcCtx.getImageData(0, 0, w, h);
  const out = remapLiquifyData(image.data, w, h, field);
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.clearRect(0, 0, w, h);
  dst.putImageData(new ImageData(out, w, h), 0, 0);
}
