import type { HslMixer, HslShift } from "../types";
import { clamp } from "./math";

/**
 * Per-hue-band HSL mixer (Lightroom-style): each of eight bands shifts hue,
 * saturation, and luminance for pixels near its hue center, with smooth
 * falloff to the neighboring bands. Runs as a CPU post pass like the curves.
 */

export const HSL_BANDS = [
  "red",
  "orange",
  "yellow",
  "green",
  "aqua",
  "blue",
  "purple",
  "magenta",
] as const;

/** Band hue centers in degrees, ascending (red wraps around 0/360). */
const BAND_CENTERS: Record<(typeof HSL_BANDS)[number], number> = {
  red: 0,
  orange: 30,
  yellow: 60,
  green: 120,
  aqua: 180,
  blue: 240,
  purple: 285,
  magenta: 330,
};

/** Max hue rotation at ±100, in degrees. */
const MAX_HUE_SHIFT = 30;
/** Max luminance shift at ±100 (scaled toward the nearer bound). */
const MAX_LUM_SHIFT = 0.35;

export function hslIsNeutral(hsl: HslMixer): boolean {
  return HSL_BANDS.every((band) => {
    const s = hsl[band];
    return s.h === 0 && s.s === 0 && s.l === 0;
  });
}

export interface HueTable {
  /** Hue shift in degrees, indexed by hue 0–359. */
  dh: Float32Array;
  /** Saturation multiplier. */
  sMul: Float32Array;
  /** Luminance shift amount (−1..1, applied toward the nearer bound). */
  dl: Float32Array;
}

/**
 * Fold the eight band shifts into one 360-entry table: for any hue the two
 * neighboring band centers contribute with linear circular falloff.
 */
export function buildHueTable(hsl: HslMixer): HueTable {
  const centers = HSL_BANDS.map((band) => ({ shift: hsl[band], center: BAND_CENTERS[band] }));
  const dh = new Float32Array(360);
  const sMul = new Float32Array(360).fill(1);
  const dl = new Float32Array(360);

  for (let hue = 0; hue < 360; hue++) {
    // Find the surrounding pair of centers (circular)
    let upper = centers.findIndex((c) => c.center > hue);
    if (upper === -1) upper = 0;
    const lower = (upper - 1 + centers.length) % centers.length;
    const lo = centers[lower];
    const hi = centers[upper];
    const span = (hi.center - lo.center + 360) % 360 || 360;
    const t = ((hue - lo.center + 360) % 360) / span;

    const mix = (a: HslShift, b: HslShift, key: keyof HslShift): number =>
      (a[key] * (1 - t) + b[key] * t) / 100;

    dh[hue] = mix(lo.shift, hi.shift, "h") * MAX_HUE_SHIFT;
    sMul[hue] = 1 + mix(lo.shift, hi.shift, "s");
    dl[hue] = mix(lo.shift, hi.shift, "l") * MAX_LUM_SHIFT;
  }
  return { dh, sMul, dl };
}

/** Apply the mixer in place over a canvas 2D context. */
export function applyHslToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  table: HueTable,
): void {
  if (width === 0 || height === 0) return;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const { dh, sMul, dl } = table;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    // RGB → HSL
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (d < 1e-4) continue; // gray — no meaningful hue
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;

    const hueIdx = Math.min(359, Math.floor(h * 360));
    // Grays barely respond: scale the effect by how saturated the pixel is.
    const weight = Math.min(1, s * 3);
    if (weight < 1e-3) continue;

    let h2 = h + (dh[hueIdx] / 360) * weight;
    h2 = ((h2 % 1) + 1) % 1;
    const s2 = clamp(s * (1 + (sMul[hueIdx] - 1) * weight), 0, 1);
    const shift = dl[hueIdx] * weight;
    const l2 = clamp(l + shift * (shift > 0 ? 1 - l : l), 0, 1);

    // HSL → RGB
    const q = l2 < 0.5 ? l2 * (1 + s2) : l2 + s2 - l2 * s2;
    const p = 2 * l2 - q;
    const channel = (tc: number): number => {
      const t = ((tc % 1) + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    data[i] = Math.round(channel(h2 + 1 / 3) * 255);
    data[i + 1] = Math.round(channel(h2) * 255);
    data[i + 2] = Math.round(channel(h2 - 1 / 3) * 255);
  }
  ctx.putImageData(image, 0, 0);
}
