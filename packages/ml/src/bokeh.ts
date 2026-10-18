import type { DepthMap } from "./depth";

/**
 * Bokeh from a depth map. For a focus depth, the photo is blurred at a few
 * fixed radii, and any aperture is then a cheap per-pixel blend between the
 * two bracketing levels, so scrubbing Aperture never re-runs a blur. The
 * background's levels leave out what's in focus, so a sharp subject doesn't
 * glow into it, and what's in front of the focus is blurred as a layer of
 * its own, laid over the rest as a lens would.
 */

/** Blur-level radii as fractions of the output's long edge. */
const LEVEL_RADII = [0, 0.002, 0.005, 0.01, 0.018];

/** Depth this close to the focus stays sharp: the depth of field. */
const IN_FOCUS = 0.03;

/** Pixels sharper than this defocus count less in the blur levels (see levelWeight). */
const SUBJECT_DEFOCUS = 0.25;

/** The least a pixel counts, so a window of only sharp pixels still averages. */
const MIN_WEIGHT = 1e-3;

/** In front of the focus, the defocus by which a pixel has moved into the near layer. */
const NEAR_FULL = 0.3;

/**
 * A focus to start from, before any click: the nearer part of the photo's
 * middle, where a subject usually is (three quarters of the way up the
 * depths in the central box).
 */
export function suggestFocus(map: DepthMap): number {
  const values: number[] = [];
  const x1 = Math.ceil(map.width * 0.7);
  const y1 = Math.ceil(map.height * 0.7);
  for (let y = Math.floor(map.height * 0.3); y < y1; y++) {
    for (let x = Math.floor(map.width * 0.3); x < x1; x++) values.push(map.data[y * map.width + x]);
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length * 0.75)] ?? 0.5;
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

/**
 * Box blur, in place, over `channels` interleaved float channels; edges
 * repeat. Two rounds approximate a soft gaussian. `tmp` is scratch space the
 * size of `buf`. Rows run in memory order in both directions, so large
 * images stay cache-friendly.
 */
export function boxBlur(
  buf: Float32Array,
  tmp: Float32Array,
  width: number,
  height: number,
  channels: number,
  radius: number,
  rounds = 2,
): void {
  const r = Math.max(1, Math.round(radius));
  const scale = 1 / (r * 2 + 1);
  const stride = width * channels;
  const sums = new Float64Array(stride);
  for (let round = 0; round < rounds; round++) {
    // Across: buf → tmp
    for (let y = 0; y < height; y++) {
      const row = y * stride;
      sums.fill(0, 0, channels);
      for (let x = -r; x <= r; x++) {
        const i = row + Math.min(Math.max(x, 0), width - 1) * channels;
        for (let c = 0; c < channels; c++) sums[c] += buf[i + c];
      }
      for (let x = 0; x < width; x++) {
        const o = row + x * channels;
        const add = row + Math.min(x + r + 1, width - 1) * channels;
        const sub = row + Math.max(x - r, 0) * channels;
        for (let c = 0; c < channels; c++) {
          tmp[o + c] = sums[c] * scale;
          sums[c] += buf[add + c] - buf[sub + c];
        }
      }
    }
    // Down: tmp → buf, keeping a running sum per column
    sums.fill(0);
    for (let y = -r; y <= r; y++) {
      const row = Math.min(Math.max(y, 0), height - 1) * stride;
      for (let k = 0; k < stride; k++) sums[k] += tmp[row + k];
    }
    for (let y = 0; y < height; y++) {
      const row = y * stride;
      const add = Math.min(y + r + 1, height - 1) * stride;
      const sub = Math.max(y - r, 0) * stride;
      for (let k = 0; k < stride; k++) {
        buf[row + k] = sums[k] * scale;
        sums[k] += tmp[add + k] - tmp[sub + k];
      }
    }
  }
}

/**
 * How out of focus a depth is, 0 (sharp) to 1 (fully blurred), for a focus
 * depth. Depth within IN_FOCUS of the focus stays sharp, so the whole
 * subject does, not just the spot that was clicked.
 */
export function defocus(depth: number, focus: number): number {
  return Math.min(1, Math.max(0, (Math.abs(depth - focus) - IN_FOCUS) * 2));
}

function smoothstep(from: number, to: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

/**
 * How much a pixel counts in the blur levels, from its defocus: sharp
 * pixels hardly count, so the subject stays out of the background's blur
 * instead of glowing into it.
 */
export function levelWeight(defocused: number): number {
  return Math.max(MIN_WEIGHT, smoothstep(0, SUBJECT_DEFOCUS, defocused));
}

/**
 * How much of a pixel belongs to the near layer: in front of the focus and
 * well out of it. A lens spreads what's in front over what's behind it, so
 * the near layer is blurred on its own and laid over the rest.
 */
export function nearAlpha(depth: number, focus: number): number {
  return depth > focus ? smoothstep(0, NEAR_FULL, defocus(depth, focus)) : 0;
}

/** Grow high values by `radius` pixels: a square max filter. */
export function dilate(
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius < 1) return values;
  const across = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let m = 0;
      const to = Math.min(width - 1, x + radius);
      for (let k = Math.max(0, x - radius); k <= to; k++) m = Math.max(m, values[row + k]);
      across[row + x] = m;
    }
  }
  const out = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    const from = Math.max(0, y - radius);
    const to = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x++) {
      let m = 0;
      for (let k = from; k <= to; k++) m = Math.max(m, across[k * width + x]);
      out[y * width + x] = m;
    }
  }
  return out;
}

/**
 * nearAlpha for every pixel, grown by a few pixels and feathered. Along a
 * near object's outline, the photo's pixels mix it with what's behind (a
 * dog's fur over the hedge), so their depth falls in between, and drawn
 * partly sharp they would trace the outline in a bright fringe. Feathering
 * keeps the grown edge from showing as steps. Null when nothing is near.
 */
export function nearMask(
  depth: Float32Array,
  width: number,
  height: number,
  focus: number,
): Float32Array | null {
  const alpha = new Float32Array(width * height);
  let any = false;
  for (let p = 0; p < alpha.length; p++) {
    alpha[p] = nearAlpha(depth[p], focus);
    if (alpha[p] > 0) any = true;
  }
  if (!any) return null;
  const radius = Math.max(1, Math.round(Math.max(width, height) / 400));
  const mask = dilate(alpha, width, height, radius);
  boxBlur(mask, new Float32Array(mask.length), width, height, 1, radius, 1);
  return mask;
}

/**
 * The blur levels for one focus depth (see focusLayers). Each list holds
 * levels 1… (index 0 is level 1): level 0 is the photo itself.
 */
export interface FocusLayers {
  focus: number;
  /**
   * The background's blur: normalized, with only what's behind the focus
   * and out of it counting, so the blur around a subject is background.
   */
  behind: Uint8ClampedArray[];
  /** The near layer, premultiplied; null when nothing is in front of the focus. */
  near: Uint8ClampedArray[] | null;
  /** A plain blur, for the near layer's own pixels; null with `near`. */
  plain: Uint8ClampedArray[] | null;
  /** The near layer's defocus, averaged around each pixel: how far its blur spreads there. */
  nearDefocus: Float32Array | null;
  /** How much of each pixel the near layer holds (see nearMask). */
  mask: Float32Array | null;
}

/** Halve an interleaved float image by 2×2 averages (an odd last row or column repeats). */
function halve(src: Float32Array, width: number, height: number, channels: number): Float32Array {
  const hw = Math.ceil(width / 2);
  const hh = Math.ceil(height / 2);
  const out = new Float32Array(hw * hh * channels);
  for (let y = 0; y < hh; y++) {
    const r0 = 2 * y * width;
    const r1 = Math.min(2 * y + 1, height - 1) * width;
    for (let x = 0; x < hw; x++) {
      const c1 = Math.min(2 * x + 1, width - 1);
      const a = (r0 + 2 * x) * channels;
      const b = (r0 + c1) * channels;
      const c = (r1 + 2 * x) * channels;
      const d = (r1 + c1) * channels;
      const o = (y * hw + x) * channels;
      for (let k = 0; k < channels; k++) {
        out[o + k] = (src[a + k] + src[b + k] + src[c + k] + src[d + k]) * 0.25;
      }
    }
  }
  return out;
}

/** Source taps for a bilinear resize from `from` to `to` pixels, centers aligned. */
function resizeTaps(from: number, to: number): { i0: Int32Array; i1: Int32Array; t: Float32Array } {
  const i0 = new Int32Array(to);
  const i1 = new Int32Array(to);
  const t = new Float32Array(to);
  for (let x = 0; x < to; x++) {
    const f = Math.min(Math.max(((x + 0.5) * from) / to - 0.5, 0), from - 1);
    i0[x] = Math.floor(f);
    i1[x] = Math.min(i0[x] + 1, from - 1);
    t[x] = f - i0[x];
  }
  return { i0, i1, t };
}

/**
 * Rows `y0`… `y1` of an interleaved image resized bilinearly from `sw`×`sh`
 * to `dw`×`dh`, written to the start of `out`. Each source row is resized
 * across once and kept while the output rows between it and the next need it.
 */
function resizeRows<T extends Uint8ClampedArray | Float32Array>(
  src: T,
  sw: number,
  sh: number,
  channels: number,
  dw: number,
  dh: number,
  y0: number,
  y1: number,
  out: T,
  cols = resizeTaps(sw, dw),
): T {
  const span = dw * channels;
  let upper = new Float32Array(span);
  let lower = new Float32Array(span);
  let upperRow = -1;
  let lowerRow = -1;
  const across = (row: number, into: Float32Array): void => {
    const from = row * sw * channels;
    for (let x = 0, o = 0; x < dw; x++) {
      const a = from + cols.i0[x] * channels;
      const b = from + cols.i1[x] * channels;
      const t = cols.t[x];
      for (let c = 0; c < channels; c++, o++) into[o] = src[a + c] + (src[b + c] - src[a + c]) * t;
    }
  };
  let o = 0;
  for (let y = y0; y < y1; y++) {
    const fy = Math.min(Math.max(((y + 0.5) * sh) / dh - 0.5, 0), sh - 1);
    const top = Math.floor(fy);
    const bottom = Math.min(top + 1, sh - 1);
    const ty = fy - top;
    if (top !== upperRow) {
      if (top === lowerRow) {
        [upper, lower] = [lower, upper];
        upperRow = top;
        lowerRow = -1;
      } else {
        across(top, upper);
        upperRow = top;
      }
    }
    if (bottom !== lowerRow) {
      across(bottom, lower);
      lowerRow = bottom;
    }
    for (let k = 0; k < span; k++) out[o++] = upper[k] + (lower[k] - upper[k]) * ty;
  }
  return out;
}

/**
 * Blur the photo at `radii` for a focus depth: the slow part of the bokeh,
 * so composing a new aperture reuses it. The blurs run at half size, a
 * quarter of the work, and scale back up: blurred, nothing shows the seam.
 *
 * Behind the focus, the background blurs without the subject, which would
 * otherwise glow into it. In front of the focus, a lens spreads the near
 * layer over what's behind it, so the near layer is blurred on its own, to
 * lay over the rest. Its own pixels take a plain blur: the near layer over
 * an estimate of what it hides (the blur of everything else around) adds up
 * to exactly that.
 */
export function focusLayers(
  base: Uint8ClampedArray,
  depth: Float32Array,
  width: number,
  height: number,
  focus: number,
  radii: number[],
): FocusLayers {
  const n = width * height;
  const mask = nearMask(depth, width, height, focus);
  const hw = Math.ceil(width / 2);
  const hh = Math.ceil(height / 2);
  const hn = hw * hh;
  const cols = resizeTaps(hw, width);
  const up = <T extends Uint8ClampedArray | Float32Array>(src: T, channels: number, out: T): T =>
    resizeRows(src, hw, hh, channels, width, height, 0, height, out, cols);
  const buf = new Float32Array(hn * 7);
  const tmp = new Float32Array(hn * 7);

  // The background: behind the focus, by defocus; in front, barely (the
  // near layer blurs those). The floor keeps a window of only near pixels
  // from dividing by zero.
  const weighted = new Float32Array(n * 4);
  for (let p = 0; p < n; p++) {
    const w =
      (depth[p] < focus ? levelWeight(defocus(depth[p], focus)) : MIN_WEIGHT) *
        (1 - (mask ? mask[p] : 0)) +
      1e-6;
    const i = p * 4;
    weighted[i] = base[i] * w;
    weighted[i + 1] = base[i + 1] * w;
    weighted[i + 2] = base[i + 2] * w;
    weighted[i + 3] = w;
  }
  let small = halve(weighted, width, height, 4);
  const behind: Uint8ClampedArray[] = [];
  const level = new Uint8ClampedArray(hn * 4);
  for (let l = 1; l < radii.length; l++) {
    const four = buf.subarray(0, hn * 4);
    four.set(small);
    boxBlur(four, tmp, hw, hh, 4, radii[l] / 2);
    for (let i = 0; i < hn * 4; i += 4) {
      const k = 1 / four[i + 3];
      level[i] = four[i] * k;
      level[i + 1] = four[i + 1] * k;
      level[i + 2] = four[i + 2] * k;
      level[i + 3] = 255;
    }
    behind.push(up(level, 4, new Uint8ClampedArray(n * 4)));
  }
  if (!mask) return { focus, behind, near: null, plain: null, nearDefocus: null, mask };

  // The near layer, premultiplied, and the plain blur, seven channels at once
  const both = new Float32Array(n * 7);
  for (let p = 0; p < n; p++) {
    const a = mask[p];
    const i = p * 4;
    const o = p * 7;
    both[o] = base[i] * a;
    both[o + 1] = base[i + 1] * a;
    both[o + 2] = base[i + 2] * a;
    both[o + 3] = a;
    both[o + 4] = base[i];
    both[o + 5] = base[i + 1];
    both[o + 6] = base[i + 2];
  }
  small = halve(both, width, height, 7);
  const near: Uint8ClampedArray[] = [];
  const plain: Uint8ClampedArray[] = [];
  const plainLevel = new Uint8ClampedArray(hn * 4);
  for (let l = 1; l < radii.length; l++) {
    buf.set(small);
    boxBlur(buf, tmp, hw, hh, 7, radii[l] / 2);
    for (let p = 0; p < hn; p++) {
      const i = p * 4;
      const o = p * 7;
      level[i] = buf[o];
      level[i + 1] = buf[o + 1];
      level[i + 2] = buf[o + 2];
      level[i + 3] = buf[o + 3] * 255;
      plainLevel[i] = buf[o + 4];
      plainLevel[i + 1] = buf[o + 5];
      plainLevel[i + 2] = buf[o + 6];
      plainLevel[i + 3] = 255;
    }
    near.push(up(level, 4, new Uint8ClampedArray(n * 4)));
    plain.push(up(plainLevel, 4, new Uint8ClampedArray(n * 4)));
  }

  // How far the near layer spreads: its own pixels' defocus, averaged around
  const spread = new Float32Array(n * 2);
  for (let p = 0; p < n; p++) {
    spread[p * 2] = defocus(depth[p], focus) * mask[p];
    spread[p * 2 + 1] = mask[p];
  }
  const two = halve(spread, width, height, 2);
  boxBlur(two, tmp, hw, hh, 2, radii[radii.length - 1] / 2);
  const reach = new Float32Array(hn);
  for (let p = 0; p < hn; p++) {
    const w = two[p * 2 + 1];
    reach[p] = w > 1e-4 ? two[p * 2] / w : 0;
  }
  const nearDefocus = up(reach, 1, new Float32Array(n));
  return { focus, behind, near, plain, nearDefocus, mask };
}

/** What composing reads for a run of pixels: each array covers the same pixels. */
interface BokehSpan {
  base: Uint8ClampedArray;
  depth: Float32Array;
  mask: Float32Array | null;
  behind: Uint8ClampedArray[];
  near: Uint8ClampedArray[] | null;
  plain: Uint8ClampedArray[] | null;
  nearDefocus: Float32Array | null;
}

/** Defocus steps in the level lookup. */
const STEPS = 1024;

/** Compose a run of pixels into `out` for an aperture strength (see focusLayers). */
function composeSpan(
  span: BokehSpan,
  focus: number,
  strength: number,
  radii: number[],
  out: Uint8ClampedArray,
): void {
  const { base, depth, mask, behind, near, plain, nearDefocus } = span;
  const reach = near ? near[near.length - 1] : null;
  // The level pair and mix for each defocus
  const levelLo = new Uint8Array(STEPS + 1);
  const levelT = new Float32Array(STEPS + 1);
  for (let k = 0; k <= STEPS; k++) {
    const w = blendWeights((k / STEPS) * strength * radii[radii.length - 1], radii);
    levelLo[k] = w.lo;
    levelT[k] = w.t;
  }

  for (let p = 0, i = 0; p < depth.length; p++, i += 4) {
    const d = depth[p];
    const a = mask ? mask[p] : 0;
    let r = base[i];
    let g = base[i + 1];
    let b = base[i + 2];

    // Behind the focus and out of it, the background's blur
    if (a < 1 && d < focus) {
      const k = Math.round(defocus(d, focus) * STEPS);
      const lo = levelLo[k];
      const t = levelT[k];
      if (lo > 0) {
        const level = behind[lo - 1];
        r = level[i];
        g = level[i + 1];
        b = level[i + 2];
      }
      if (t > 0) {
        const level = behind[lo];
        r += (level[i] - r) * t;
        g += (level[i + 1] - g) * t;
        b += (level[i + 2] - b) * t;
      }
    }

    // In front of it, the near layer, blurred by its own pixels' defocus:
    // laid over what's behind, and in its own pixels, the plain blur
    if (near && plain && nearDefocus && reach && (a > 0 || reach[i + 3] > 0)) {
      const k = Math.round(nearDefocus[p] * STEPS);
      const lo = levelLo[k];
      const t = levelT[k];
      if (a < 1) {
        let nr = base[i] * a;
        let ng = base[i + 1] * a;
        let nb = base[i + 2] * a;
        let na = a;
        if (lo > 0) {
          const level = near[lo - 1];
          nr = level[i];
          ng = level[i + 1];
          nb = level[i + 2];
          na = level[i + 3] / 255;
        }
        if (t > 0) {
          const level = near[lo];
          nr += (level[i] - nr) * t;
          ng += (level[i + 1] - ng) * t;
          nb += (level[i + 2] - nb) * t;
          na += (level[i + 3] / 255 - na) * t;
        }
        // In front of the focus, a pixel the near layer only partly holds
        // mixes the two (fur over the hedge), so what the near layer leaves
        // shows comes from the surroundings, not the mix, sharp. It fades in
        // with the blur, so a zero aperture changes nothing.
        const hidden = 1 - near[0][i + 3] / 255;
        if (a > 0 && d >= focus && hidden > 0.05 && lo + t > 0) {
          const w = smoothstep(0, 0.5, a) * Math.min(1, lo + t);
          const p1 = plain[0];
          const n1 = near[0];
          r += (Math.min(255, Math.max(0, (p1[i] - n1[i]) / hidden)) - r) * w;
          g += (Math.min(255, Math.max(0, (p1[i + 1] - n1[i + 1]) / hidden)) - g) * w;
          b += (Math.min(255, Math.max(0, (p1[i + 2] - n1[i + 2]) / hidden)) - b) * w;
        }
        r = nr + (1 - na) * r;
        g = ng + (1 - na) * g;
        b = nb + (1 - na) * b;
      }
      if (a > 0) {
        let pr = base[i];
        let pg = base[i + 1];
        let pb = base[i + 2];
        if (lo > 0) {
          const level = plain[lo - 1];
          pr = level[i];
          pg = level[i + 1];
          pb = level[i + 2];
        }
        if (t > 0) {
          const level = plain[lo];
          pr += (level[i] - pr) * t;
          pg += (level[i + 1] - pg) * t;
          pb += (level[i + 2] - pb) * t;
        }
        r += (pr - r) * a;
        g += (pg - g) * a;
        b += (pb - b) * a;
      }
    }

    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = 255;
  }
}

/** Area-average RGBA bytes down to `dw`×`dh`, as RGB floats 0–1. */
function shrinkRgb(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dw: number,
  dh: number,
): Float32Array {
  const out = new Float32Array(dw * dh * 3);
  for (let ly = 0; ly < dh; ly++) {
    const y0 = Math.floor((ly * height) / dh);
    const y1 = Math.max(y0 + 1, Math.floor(((ly + 1) * height) / dh));
    for (let lx = 0; lx < dw; lx++) {
      const x0 = Math.floor((lx * width) / dw);
      const x1 = Math.max(x0 + 1, Math.floor(((lx + 1) * width) / dw));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
        }
      }
      const k = 1 / (255 * (y1 - y0) * (x1 - x0));
      const o = (ly * dw + lx) * 3;
      out[o] = r * k;
      out[o + 1] = g * k;
      out[o + 2] = b * k;
    }
  }
  return out;
}

/**
 * Depth at the photo's size, with its edges on the photo's own. The model
 * sees the photo at about 518 px, so scaled up, its edges are soft and
 * stepped, and a blur that follows them cuts a jagged outline. A fast color
 * guided filter (He et al.) fits depth as a linear function of color in
 * each small window at the model's resolution, then applies the fitted
 * coefficients to the full-size photo, where the edges are crisp.
 */
export function guidedDepth(
  depth: DepthMap,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  radius = 2,
  eps = 1e-3,
): Float32Array {
  const dw = depth.width;
  const dh = depth.height;
  const n = dw * dh;
  const guide = shrinkRgb(rgba, width, height, dw, dh);

  // Window means of I, p, I·p and the upper triangle of I·Iᵀ
  const S = 13;
  const stats = new Float32Array(n * S);
  for (let p = 0; p < n; p++) {
    const r = guide[p * 3];
    const g = guide[p * 3 + 1];
    const b = guide[p * 3 + 2];
    const d = depth.data[p];
    const o = p * S;
    stats[o] = r;
    stats[o + 1] = g;
    stats[o + 2] = b;
    stats[o + 3] = d;
    stats[o + 4] = r * d;
    stats[o + 5] = g * d;
    stats[o + 6] = b * d;
    stats[o + 7] = r * r;
    stats[o + 8] = r * g;
    stats[o + 9] = r * b;
    stats[o + 10] = g * g;
    stats[o + 11] = g * b;
    stats[o + 12] = b * b;
  }
  boxBlur(stats, new Float32Array(n * S), dw, dh, S, radius, 1);

  // Per window: a = (Σ + εI)⁻¹ cov(I, p), b = mean(p) − a·mean(I)
  const coef = new Float32Array(n * 4);
  for (let p = 0; p < n; p++) {
    const o = p * S;
    const mr = stats[o];
    const mg = stats[o + 1];
    const mb = stats[o + 2];
    const md = stats[o + 3];
    const cr = stats[o + 4] - mr * md;
    const cg = stats[o + 5] - mg * md;
    const cb = stats[o + 6] - mb * md;
    const rr = stats[o + 7] - mr * mr + eps;
    const rg = stats[o + 8] - mr * mg;
    const rb = stats[o + 9] - mr * mb;
    const gg = stats[o + 10] - mg * mg + eps;
    const gb = stats[o + 11] - mg * mb;
    const bb = stats[o + 12] - mb * mb + eps;
    // Symmetric 3×3 inverse by cofactors
    const i00 = gg * bb - gb * gb;
    const i01 = rb * gb - rg * bb;
    const i02 = rg * gb - rb * gg;
    const i11 = rr * bb - rb * rb;
    const i12 = rb * rg - rr * gb;
    const i22 = rr * gg - rg * rg;
    const det = rr * i00 + rg * i01 + rb * i02;
    const k = det > 0 ? 1 / det : 0;
    const ar = (i00 * cr + i01 * cg + i02 * cb) * k;
    const ag = (i01 * cr + i11 * cg + i12 * cb) * k;
    const ab = (i02 * cr + i12 * cg + i22 * cb) * k;
    const c = p * 4;
    coef[c] = ar;
    coef[c + 1] = ag;
    coef[c + 2] = ab;
    coef[c + 3] = md - ar * mr - ag * mg - ab * mb;
  }
  boxBlur(coef, new Float32Array(n * 4), dw, dh, 4, radius, 1);

  // Coefficients up to full size (bilinear, centers aligned), applied to the photo
  const out = new Float32Array(width * height);
  const sx = dw / width;
  const sy = dh / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), dh - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, dh - 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), dw - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, dw - 1);
      const tx = fx - x0;
      const w00 = (1 - tx) * (1 - ty);
      const w01 = tx * (1 - ty);
      const w10 = (1 - tx) * ty;
      const w11 = tx * ty;
      const c00 = (y0 * dw + x0) * 4;
      const c01 = (y0 * dw + x1) * 4;
      const c10 = (y1 * dw + x0) * 4;
      const c11 = (y1 * dw + x1) * 4;
      const i = (y * width + x) * 4;
      let q = 0;
      for (let ch = 0; ch < 4; ch++) {
        const v =
          coef[c00 + ch] * w00 + coef[c01 + ch] * w01 + coef[c10 + ch] * w10 + coef[c11 + ch] * w11;
        q += ch < 3 ? (v * rgba[i + ch]) / 255 : v;
      }
      out[y * width + x] = Math.min(1, Math.max(0, q));
    }
  }
  return out;
}

/** The photo and its depth at preview size, plus the blur layers for the last focus. */
export interface BokehPrep {
  width: number;
  height: number;
  /** The sharp photo, RGBA. */
  base: Uint8ClampedArray;
  /** Depth per pixel, 0–1, its edges on the photo's (see guidedDepth). */
  depth: Float32Array;
  levelRadii: number[];
  /** The layers for the last focus composed, kept while the focus stays. */
  layers: FocusLayers | null;
}

/** A BokehPrep from the photo's pixels at preview size and its depth map. */
export function createBokehPrep(
  base: Uint8ClampedArray,
  width: number,
  height: number,
  depth: DepthMap,
): BokehPrep {
  const long = Math.max(width, height);
  return {
    width,
    height,
    base,
    depth: guidedDepth(depth, base, width, height),
    levelRadii: LEVEL_RADII.map((f) => Math.round(f * long * 4)),
    layers: null,
  };
}

function sizeOf(source: HTMLImageElement | HTMLCanvasElement): { width: number; height: number } {
  return "naturalWidth" in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

function pixelsOf(
  source: HTMLImageElement | HTMLCanvasElement,
  width: number,
  height: number,
): Uint8ClampedArray {
  const ctx = canvasOf(width, height).getContext("2d");
  if (!ctx) throw new Error("[Retouch ML] Failed to create canvas context");
  ctx.drawImage(source, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function canvasFrom(pixels: Uint8ClampedArray, width: number, height: number): HTMLCanvasElement {
  const canvas = canvasOf(width, height);
  canvas.getContext("2d")?.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

/**
 * Draw the photo at preview size (long edge up to `maxDim`) and fit the
 * depth map to it. The blur comes later, with the focus.
 */
export function prepareBokeh(
  source: HTMLImageElement | HTMLCanvasElement,
  depth: DepthMap,
  maxDim = 1280,
): BokehPrep {
  const size = sizeOf(source);
  const cap = Math.min(1, maxDim / Math.max(size.width, size.height, 1));
  const w = Math.max(2, Math.round(size.width * cap));
  const h = Math.max(2, Math.round(size.height * cap));
  return createBokehPrep(pixelsOf(source, w, h), w, h, depth);
}

function layersFor(prep: BokehPrep, focus: number): FocusLayers {
  if (prep.layers && prep.layers.focus === focus) return prep.layers;
  const layers = focusLayers(
    prep.base,
    prep.depth,
    prep.width,
    prep.height,
    focus,
    prep.levelRadii,
  );
  prep.layers = layers;
  return layers;
}

/**
 * The bokeh's pixels at preview size for a focus depth (0–1, from a click)
 * and aperture strength (0–1): the blur grows with distance from the focus.
 * A new focus builds its blur layers first, the slow part; a new strength
 * after that is cheap enough for every slider tick.
 */
export function composeBokehPixels(
  prep: BokehPrep,
  focus: number,
  strength: number,
): Uint8ClampedArray {
  const layers = layersFor(prep, focus);
  const out = new Uint8ClampedArray(prep.width * prep.height * 4);
  composeSpan(
    { ...layers, base: prep.base, depth: prep.depth },
    focus,
    strength,
    prep.levelRadii,
    out,
  );
  return out;
}

/** composeBokehPixels, on a canvas. */
export function composeBokeh(prep: BokehPrep, focus: number, strength: number): HTMLCanvasElement {
  return canvasFrom(composeBokehPixels(prep, focus, strength), prep.width, prep.height);
}

/** Rows per strip in a full-size render. */
const STRIP = 64;

/**
 * The bokeh at the photo's full size, matching the preview: the sharp photo,
 * its depth and the near mask are full size, and the blur comes from the
 * preview's layers, scaled up a strip at a time. They're smooth enough that
 * scaling shows nothing, and it's far lighter than blurring at full size.
 */
export function renderBokeh(
  prep: BokehPrep,
  source: HTMLImageElement | HTMLCanvasElement,
  depth: DepthMap,
  focus: number,
  strength: number,
): HTMLCanvasElement {
  const { width, height } = sizeOf(source);
  const pixels = renderBokehPixels(
    prep,
    pixelsOf(source, width, height),
    width,
    height,
    depth,
    focus,
    strength,
  );
  return canvasFrom(pixels, width, height);
}

/** renderBokeh's pixels, from the photo's RGBA at `width`×`height`. */
export function renderBokehPixels(
  prep: BokehPrep,
  base: Uint8ClampedArray,
  width: number,
  height: number,
  depth: DepthMap,
  focus: number,
  strength: number,
): Uint8ClampedArray {
  const layers = layersFor(prep, focus);
  const fullDepth = guidedDepth(depth, base, width, height);
  const mask = layers.near ? nearMask(fullDepth, width, height, focus) : null;
  const out = new Uint8ClampedArray(width * height * 4);

  const cols = resizeTaps(prep.width, width);
  const strip = (): Uint8ClampedArray => new Uint8ClampedArray(STRIP * width * 4);
  const behind = layers.behind.map(strip);
  const near = layers.near?.map(strip) ?? null;
  const plain = layers.plain?.map(strip) ?? null;
  const nearDefocus = layers.nearDefocus ? new Float32Array(STRIP * width) : null;
  for (let y0 = 0; y0 < height; y0 += STRIP) {
    const y1 = Math.min(height, y0 + STRIP);
    const from = y0 * width;
    const to = y1 * width;
    const scale = <T extends Uint8ClampedArray | Float32Array>(src: T, channels: number, dst: T) =>
      resizeRows(src, prep.width, prep.height, channels, width, height, y0, y1, dst, cols).subarray(
        0,
        (to - from) * channels,
      ) as T;
    composeSpan(
      {
        base: base.subarray(from * 4, to * 4),
        depth: fullDepth.subarray(from, to),
        mask: mask?.subarray(from, to) ?? null,
        behind: layers.behind.map((level, k) => scale(level, 4, behind[k])),
        near: near && layers.near ? layers.near.map((level, k) => scale(level, 4, near[k])) : null,
        plain:
          plain && layers.plain ? layers.plain.map((level, k) => scale(level, 4, plain[k])) : null,
        nearDefocus:
          nearDefocus && layers.nearDefocus ? scale(layers.nearDefocus, 1, nearDefocus) : null,
      },
      focus,
      strength,
      prep.levelRadii,
      out.subarray(from * 4, to * 4),
    );
  }
  return out;
}
