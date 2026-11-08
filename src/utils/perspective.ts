/**
 * Keystone (perspective) correction — pure canvas 2D, no dependencies.
 * Vertical keystone rescales each row around the center (fixing converging
 * verticals); horizontal keystone does the same per column. The two run as
 * if one after the other, vertical first, which approximates the full
 * homography closely enough for correction work.
 *
 * It works on the pixels, as the lens correction does: drawing it as a
 * strip per row and per column queued thousands of GPU draws per redraw,
 * and a slider drag could queue them faster than the GPU drew them, which
 * froze the whole browser.
 */

/** Slider range is −100..100; map to a max edge scale change of ±30%. */
const KEYSTONE_STRENGTH = 0.006;

export function hasKeystone(keystoneV: number, keystoneH: number): boolean {
  return keystoneV !== 0 || keystoneH !== 0;
}

/**
 * Horizontal scale of the row at normalized position t (0 = top, 1 = bottom)
 * for a vertical-keystone amount (−100..100). Positive widens the top —
 * correcting the converging verticals of an upward shot.
 */
export function keystoneScaleAt(t: number, amount: number): number {
  return Math.max(0.4, 1 + (0.5 - t) * amount * KEYSTONE_STRENGTH);
}

/**
 * Remap RGBA data through the keystone warp: a pass along the rows for the
 * vertical amount, then down the columns for the horizontal, each sampling
 * linearly between the two nearest pixels. Returns a new buffer; pixels the
 * warp pulls in from outside the frame stay transparent. Rows and columns are
 * placed at their centers, as fractions of the frame, the same way
 * `framing.ts` maps points back through the warp.
 */
export function remapKeystoneData(
  src: Uint8ClampedArray,
  width: number,
  height: number,
  keystoneV: number,
  keystoneH: number,
): Uint8ClampedArray {
  const rows = width > 1 && keystoneV !== 0;
  const columns = height > 1 && keystoneH !== 0;
  if (!rows && !columns) return src.slice();
  // A pixel as one 32-bit word, so a blend moves all four channels at once.
  // Each pass writes a new buffer, so the source is only read.
  const aligned = src.byteOffset % 4 === 0;
  let pixels = new Uint32Array(
    aligned ? src.buffer : src.slice().buffer,
    aligned ? src.byteOffset : 0,
    width * height,
  );
  if (rows) pixels = scaleRows(pixels, width, height, keystoneV);
  if (columns) pixels = scaleColumns(pixels, width, height, keystoneH);
  return new Uint8ClampedArray(pixels.buffer, 0, width * height * 4);
}

/**
 * `a` and `b` blended by `f` of 256, every channel at once: red and blue in
 * one lane pair, green and alpha in the other, rounded to nearest.
 */
function blend(a: number, b: number, f: number): number {
  const g = 256 - f;
  const rb = (((a & 0xff00ff) * g + (b & 0xff00ff) * f + 0x800080) >>> 8) & 0xff00ff;
  const ga = (((a >>> 8) & 0xff00ff) * g + ((b >>> 8) & 0xff00ff) * f + 0x800080) & 0xff00ff00;
  return rb | ga;
}

/** Each row scaled around the middle by its vertical-keystone amount. */
function scaleRows(src: Uint32Array, width: number, height: number, amount: number): Uint32Array {
  const out = new Uint32Array(width * height);
  const c = (width - 1) / 2;
  const last = width - 1;
  for (let y = 0; y < height; y++) {
    const scale = keystoneScaleAt((y + 0.5) / height, amount);
    const step = 1 / scale;
    // The span of the row the scaled source covers.
    const from = Math.max(0, Math.ceil(c - c * scale));
    const to = Math.min(last, Math.floor(c + c * scale));
    const row = y * width;
    for (let x = from; x <= to; x++) {
      let sx = c + (x - c) * step;
      if (sx < 0) sx = 0;
      let x0 = sx | 0;
      if (x0 >= last) x0 = last - 1;
      out[row + x] = blend(src[row + x0], src[row + x0 + 1], ((sx - x0) * 256 + 0.5) | 0);
    }
  }
  return out;
}

/** Each column scaled around the middle by its horizontal-keystone amount. */
function scaleColumns(
  src: Uint32Array,
  width: number,
  height: number,
  amount: number,
): Uint32Array {
  const out = new Uint32Array(width * height);
  const c = (height - 1) / 2;
  const last = height - 1;
  const step = new Float64Array(width);
  for (let x = 0; x < width; x++) step[x] = 1 / keystoneScaleAt((x + 0.5) / width, amount);
  for (let y = 0; y < height; y++) {
    const offset = y - c;
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const sy = c + offset * step[x];
      if (sy < 0 || sy > last) continue;
      let y0 = sy | 0;
      if (y0 >= last) y0 = last - 1;
      const i = y0 * width + x;
      out[row + x] = blend(src[i], src[i + width], ((sy - y0) * 256 + 0.5) | 0);
    }
  }
  return out;
}

/** Warp `src` into `dst` (same dimensions) applying vertical then horizontal keystone. */
export function applyKeystone(
  src: HTMLCanvasElement,
  dst: CanvasRenderingContext2D,
  keystoneV: number,
  keystoneH: number,
): void {
  const w = src.width;
  const h = src.height;
  if (w === 0 || h === 0) return;
  const srcCtx = src.getContext("2d");
  if (!srcCtx) return;
  const image = srcCtx.getImageData(0, 0, w, h);
  const out = remapKeystoneData(image.data, w, h, keystoneV, keystoneH);
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.clearRect(0, 0, w, h);
  dst.putImageData(new ImageData(out, w, h), 0, 0);
}
