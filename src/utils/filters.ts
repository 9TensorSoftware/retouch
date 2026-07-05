import type { FabricImage } from "fabric";
import { filters } from "fabric";
import type { Adjustments, FilterPreset } from "../types";

/** Element type of an image's fabric filter stack. */
type FabricFilter = FabricImage["filters"][number];

/** 4×5 RGBA color matrix (fabric's ColorMatrix shape), row-major. */
export type ColorMatrix20 = number[];

// biome-ignore format: matrix rows read better unwrapped
const IDENTITY: ColorMatrix20 = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

/** Rec. 709 luma weights, matching fabric's grayscale behavior. */
const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Filter presets shown in the editor's Filters panel, in display order. */
export const FILTER_PRESETS: { id: FilterPreset; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "bw", label: "B&W" },
  { id: "sepia", label: "Sepia" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "vivid", label: "Vivid" },
  { id: "vintage", label: "Vintage" },
  { id: "kodachrome", label: "Kodachrome" },
  { id: "technicolor", label: "Technicolor" },
  { id: "polaroid", label: "Polaroid" },
  { id: "brownie", label: "Brownie" },
  { id: "invert", label: "Invert" },
];

/** Classic saturation matrix: lerp between luma gray and the original color. */
export function saturationMatrix(s: number): ColorMatrix20 {
  const ir = LUMA_R * (1 - s);
  const ig = LUMA_G * (1 - s);
  const ib = LUMA_B * (1 - s);
  // biome-ignore format: matrix rows read better unwrapped
  return [
    ir + s, ig, ib, 0, 0,
    ir, ig + s, ib, 0, 0,
    ir, ig, ib + s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/**
 * Preset color matrices. The film looks (sepia, vintage, kodachrome,
 * technicolor, polaroid, brownie) use fabric.js's exact matrices so the
 * results match its named filters pixel-for-pixel.
 */
// biome-ignore format: matrix rows read better unwrapped
const PRESET_MATRICES: Record<Exclude<FilterPreset, "none">, ColorMatrix20> = {
  bw: [
    LUMA_R, LUMA_G, LUMA_B, 0, 0,
    LUMA_R, LUMA_G, LUMA_B, 0, 0,
    LUMA_R, LUMA_G, LUMA_B, 0, 0,
    0, 0, 0, 1, 0,
  ],
  sepia: [
    0.393, 0.769, 0.189, 0, 0,
    0.349, 0.686, 0.168, 0, 0,
    0.272, 0.534, 0.131, 0, 0,
    0, 0, 0, 1, 0,
  ],
  warm: [
    1.1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 0.9, 0, 0,
    0, 0, 0, 1, 0,
  ],
  cool: [
    0.9, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1.1, 0, 0,
    0, 0, 0, 1, 0,
  ],
  vivid: saturationMatrix(1.45),
  vintage: [
    0.62793, 0.32021, -0.03965, 0, 0.03784,
    0.02578, 0.64411, 0.03259, 0, 0.02926,
    0.0466, -0.08512, 0.52416, 0, 0.02023,
    0, 0, 0, 1, 0,
  ],
  kodachrome: [
    1.12855, -0.39673, -0.03992, 0, 0.24991,
    -0.16404, 1.08352, -0.05498, 0, 0.09698,
    -0.16786, -0.56034, 1.60148, 0, 0.13972,
    0, 0, 0, 1, 0,
  ],
  technicolor: [
    1.91252, -0.85453, -0.09155, 0, 0.04624,
    -0.30878, 1.76589, -0.10601, 0, -0.27589,
    -0.2311, -0.75018, 1.84759, 0, 0.12137,
    0, 0, 0, 1, 0,
  ],
  polaroid: [
    1.438, -0.062, -0.062, 0, 0,
    -0.122, 1.378, -0.122, 0, 0,
    -0.016, -0.016, 1.483, 0, 0,
    0, 0, 0, 1, 0,
  ],
  brownie: [
    0.5997, 0.34553, -0.27082, 0, 0.186,
    -0.0377, 0.86095, 0.15059, 0, -0.1449,
    0.24113, -0.07441, 0.44972, 0, -0.02965,
    0, 0, 0, 1, 0,
  ],
  invert: [
    -1, 0, 0, 0, 1,
    0, -1, 0, 0, 1,
    0, 0, -1, 0, 1,
    0, 0, 0, 1, 0,
  ],
};

/** Element-wise lerp between two color matrices (t=0 → a, t=1 → b). */
export function lerpColorMatrix(a: ColorMatrix20, b: ColorMatrix20, t: number): ColorMatrix20 {
  return a.map((v, i) => v + ((b[i] ?? 0) - v) * t);
}

/**
 * Compose two 4×5 affine color matrices: the result applies `inner` first,
 * then `outer` (like function composition outer ∘ inner).
 */
export function multiplyColorMatrices(outer: ColorMatrix20, inner: ColorMatrix20): ColorMatrix20 {
  const out: ColorMatrix20 = new Array(20).fill(0);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += (outer[row * 5 + k] ?? 0) * (inner[k * 5 + col] ?? 0);
      }
      // The offset column also carries the outer matrix's own offset.
      if (col === 4) sum += outer[row * 5 + 4] ?? 0;
      out[row * 5 + col] = sum;
    }
  }
  return out;
}

/** The preset's color matrix at the given strength (0–100), or null for "none"/0. */
export function buildPresetColorMatrix(
  preset: FilterPreset,
  strength: number,
): ColorMatrix20 | null {
  if (preset === "none") return null;
  const t = Math.min(100, Math.max(0, strength)) / 100;
  if (t <= 0) return null;
  const matrix = PRESET_MATRICES[preset];
  return t >= 1 ? matrix : lerpColorMatrix(IDENTITY, matrix, t);
}

/** Convenience: a ready fabric filter for a preset (used by preview thumbnails). */
export function buildPresetFilter(preset: FilterPreset, strength = 100): FabricFilter | null {
  const matrix = buildPresetColorMatrix(preset, strength);
  return matrix ? newColorMatrix(matrix) : null;
}

/** Exposure/temperature/tint composed into one diagonal-ish matrix, or null if neutral. */
function adjustmentColorMatrix(adj: Adjustments): ColorMatrix20 | null {
  if (adj.exposure === 0 && adj.temperature === 0 && adj.tint === 0) return null;
  // Exposure: ±100 → ±2 EV (multiplicative)
  const ev = 2 ** (adj.exposure / 50);
  // Temperature: warm raises red / lowers blue; cool the reverse
  const t = adj.temperature / 100;
  // Tint: magenta raises red+blue / lowers green; green the reverse
  const g = adj.tint / 100;
  const r = ev * (1 + 0.16 * t) * (1 + 0.08 * g);
  const gr = ev * (1 - 0.12 * g);
  const b = ev * (1 - 0.16 * t) * (1 + 0.08 * g);
  // biome-ignore format: matrix rows read better unwrapped
  return [
    r, 0, 0, 0, 0,
    0, gr, 0, 0, 0,
    0, 0, b, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

/** 3×3 sharpen kernel blended toward identity by s (0–1). */
export function sharpenKernel(s: number): number[] {
  return [0, -s, 0, -s, 1 + 4 * s, -s, 0, -s, 0];
}

/** fabric's ColorMatrix expects a fixed 20-number tuple. */
// biome-ignore format: one line per row would be noise here
type FabricMatrixTuple = [
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
  number, number, number, number, number,
];

function newColorMatrix(matrix: ColorMatrix20): FabricFilter {
  return new filters.ColorMatrix({ matrix: matrix as FabricMatrixTuple });
}

/** True when the fabric filter stack for these values would be empty. */
export function isNeutral(adj: Adjustments, preset: FilterPreset, strength = 100): boolean {
  return (
    (preset === "none" || strength <= 0) &&
    adj.brightness === 100 &&
    adj.contrast === 100 &&
    adj.saturation === 100 &&
    adj.exposure === 0 &&
    adj.temperature === 0 &&
    adj.tint === 0 &&
    adj.hue === 0 &&
    adj.vibrance === 0 &&
    adj.sharpen === 0 &&
    adj.blur === 0 &&
    adj.grain === 0
  );
}

/**
 * Build the full fabric filter stack: the preset (at its strength) sits
 * beneath the adjustments, matrix-based steps are pre-composed into a single
 * ColorMatrix, and neutral steps are omitted entirely. Shared by the live
 * renderer, both export paths, and the Filters tool previews so all four
 * produce identical pixels. (Vignette is not a fabric filter — it is drawn
 * as a 2D pass via drawVignette.)
 */
export function buildFabricFilters(
  adj: Adjustments,
  preset: FilterPreset,
  strength = 100,
): FabricFilter[] {
  const stack: FabricFilter[] = [];

  const presetMatrix = buildPresetColorMatrix(preset, strength);
  const adjMatrix = adjustmentColorMatrix(adj);
  const combined =
    presetMatrix && adjMatrix
      ? multiplyColorMatrices(adjMatrix, presetMatrix)
      : (adjMatrix ?? presetMatrix);
  if (combined) stack.push(newColorMatrix(combined));

  if (adj.brightness !== 100) {
    stack.push(new filters.Brightness({ brightness: (adj.brightness - 100) / 100 }));
  }
  if (adj.contrast !== 100) {
    stack.push(new filters.Contrast({ contrast: (adj.contrast - 100) / 100 }));
  }
  if (adj.saturation !== 100) {
    stack.push(new filters.Saturation({ saturation: (adj.saturation - 100) / 100 }));
  }
  if (adj.hue !== 0) {
    stack.push(new filters.HueRotation({ rotation: (adj.hue * Math.PI) / 180 }));
  }
  if (adj.vibrance !== 0) {
    stack.push(new filters.Vibrance({ vibrance: adj.vibrance / 100 }));
  }
  if (adj.blur > 0) {
    stack.push(new filters.Blur({ blur: (adj.blur / 100) * 0.3 }));
  }
  if (adj.sharpen > 0) {
    stack.push(new filters.Convolute({ matrix: sharpenKernel(adj.sharpen / 100) }));
  }
  if (adj.grain > 0) {
    stack.push(new filters.Noise({ noise: adj.grain * 3 }));
  }

  return stack;
}

/**
 * Darken the frame's edges with a radial gradient. `source-atop` keeps
 * transparent regions (e.g. rotation letterboxing) untouched. Used by the
 * live renderer's after:render hook and both export paths.
 */
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  strength: number,
): void {
  const s = Math.min(100, Math.max(0, strength)) / 100;
  if (s <= 0) return;
  const cx = width / 2;
  const cy = height / 2;
  const outer = Math.hypot(cx, cy);
  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, outer);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(Math.max(0.2, 0.65 - 0.3 * s), "rgba(0,0,0,0)");
  gradient.addColorStop(1, `rgba(0,0,0,${0.85 * s})`);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
