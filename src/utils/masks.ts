import type { EditMask, LocalAdjust } from "../types";
import type { ColorMatrix20 } from "./filters";
import { multiplyColorMatrices, saturationMatrix } from "./filters";
import { clamp } from "./math";

/**
 * Selective (masked) adjustments: each mask pairs an analytic alpha function
 * (linear or radial gradient, pure math — no canvas needed) with a composed
 * 4×5 color matrix of its local adjustments. The pass blends the transformed
 * pixel with the original by the mask's alpha, running first in the post
 * chain (before HSL/curves/vignette).
 */

export function createDefaultLocalAdjust(): LocalAdjust {
  return { exposure: 0, brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0 };
}

export function localAdjustIsNeutral(a: LocalAdjust): boolean {
  return (
    a.exposure === 0 &&
    a.brightness === 0 &&
    a.contrast === 0 &&
    a.saturation === 0 &&
    a.temperature === 0 &&
    a.tint === 0
  );
}

/** True when no mask changes any pixel. */
export function masksAreNeutral(masks: EditMask[]): boolean {
  return masks.every((m) => localAdjustIsNeutral(m.adjust));
}

const IDENTITY: ColorMatrix20 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** Compose a mask's local deltas into one 4×5 color matrix. */
export function composeLocalMatrix(a: LocalAdjust): ColorMatrix20 {
  let m = IDENTITY;

  // Exposure: ±100 → ±2 EV, and temperature/tint with the same coefficients
  // the global adjustments use.
  const ev = 2 ** (a.exposure / 50);
  const t = a.temperature / 100;
  const g = a.tint / 100;
  const r = ev * (1 + 0.16 * t) * (1 + 0.08 * g);
  const gr = ev * (1 - 0.12 * g);
  const b = ev * (1 - 0.16 * t) * (1 + 0.08 * g);
  // biome-ignore format: matrix rows read better unwrapped
  m = multiplyColorMatrices([
    r, 0, 0, 0, 0,
    0, gr, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ], m);

  if (a.brightness !== 0) {
    const offset = (a.brightness / 200) * 255;
    // biome-ignore format: matrix rows read better unwrapped
    m = multiplyColorMatrices([
      1, 0, 0, 0, offset,
      0, 1, 0, 0, offset,
      0, 0, 1, 0, offset,
      0, 0, 0, 1, 0,
    ], m);
  }

  if (a.contrast !== 0) {
    const f = 1 + a.contrast / 100;
    const offset = 128 * (1 - f);
    // biome-ignore format: matrix rows read better unwrapped
    m = multiplyColorMatrices([
      f, 0, 0, 0, offset,
      0, f, 0, 0, offset,
      0, 0, f, 0, offset,
      0, 0, 0, 1, 0,
    ], m);
  }

  if (a.saturation !== 0) {
    m = multiplyColorMatrices(saturationMatrix(1 + a.saturation / 100), m);
  }

  return m;
}

function smooth(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Mask opacity at a normalized point — 1 = full local effect. */
export function maskAlphaAt(mask: EditMask, x: number, y: number): number {
  let alpha: number;
  if (mask.kind === "linear") {
    const dx = mask.x1 - mask.x0;
    const dy = mask.y1 - mask.y0;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-6) {
      alpha = 1;
    } else {
      const t = ((x - mask.x0) * dx + (y - mask.y0) * dy) / len2;
      alpha = smooth(1 - t);
    }
  } else {
    const rx = Math.max(0.02, Math.abs(mask.x1 - mask.x0));
    const ry = Math.max(0.02, Math.abs(mask.y1 - mask.y0));
    const nx = (x - mask.x0) / rx;
    const ny = (y - mask.y0) / ry;
    const d = Math.sqrt(nx * nx + ny * ny);
    // Feathered edge: full inside 60% of the radius, zero at 140%.
    alpha = smooth((1.4 - d) / 0.8);
  }
  return mask.invert ? 1 - alpha : alpha;
}

export interface PreparedMask {
  mask: EditMask;
  matrix: ColorMatrix20;
}

/** Precompute the color matrices once per edit (not per pixel). */
export function prepareMasks(masks: EditMask[]): PreparedMask[] {
  return masks
    .filter((m) => !localAdjustIsNeutral(m.adjust))
    .map((mask) => ({ mask, matrix: composeLocalMatrix(mask.adjust) }));
}

/** Apply the masked adjustments in place over a canvas 2D context. */
export function applyMasksToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  prepared: PreparedMask[],
): void {
  if (width === 0 || height === 0 || prepared.length === 0) return;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;

  for (let py = 0; py < height; py++) {
    const ny = height > 1 ? py / (height - 1) : 0.5;
    for (let px = 0; px < width; px++) {
      const nx = width > 1 ? px / (width - 1) : 0.5;
      const i = (py * width + px) * 4;
      for (const { mask, matrix } of prepared) {
        const a = maskAlphaAt(mask, nx, ny);
        if (a < 1e-3) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const tr = matrix[0] * r + matrix[1] * g + matrix[2] * b + matrix[4];
        const tg = matrix[5] * r + matrix[6] * g + matrix[7] * b + matrix[9];
        const tb = matrix[10] * r + matrix[11] * g + matrix[12] * b + matrix[14];
        data[i] = clamp(r + (tr - r) * a, 0, 255);
        data[i + 1] = clamp(g + (tg - g) * a, 0, 255);
        data[i + 2] = clamp(b + (tb - b) * a, 0, 255);
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}
