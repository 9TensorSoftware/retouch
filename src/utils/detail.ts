import { clamp } from "./math";

/**
 * Clarity and dehaze — spatial "detail" passes that no color matrix can
 * express. Clarity is a midtone-weighted unsharp mask against a large-radius
 * box blur; dehaze removes the black-lift of atmospheric haze with a
 * contrast regain and a slight blue bias correction.
 */

export function detailIsNeutral(clarity: number, dehaze: number): boolean {
  return clarity === 0 && dehaze === 0;
}

/** Separable box blur (three passes ≈ gaussian), luminance-only output. */
function blurLuminance(
  lum: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const src = lum.slice();
  const dst = new Float32Array(lum.length);
  const window = radius * 2 + 1;

  for (let pass = 0; pass < 3; pass++) {
    // Horizontal
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += src[row + clamp(x, 0, width - 1)];
      for (let x = 0; x < width; x++) {
        dst[row + x] = sum / window;
        sum += src[row + clamp(x + radius + 1, 0, width - 1)];
        sum -= src[row + clamp(x - radius, 0, width - 1)];
      }
    }
    // Vertical
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += dst[clamp(y, 0, height - 1) * width + x];
      for (let y = 0; y < height; y++) {
        src[y * width + x] = sum / window;
        sum += dst[clamp(y + radius + 1, 0, height - 1) * width + x];
        sum -= dst[clamp(y - radius, 0, height - 1) * width + x];
      }
    }
  }
  return src;
}

/** Apply clarity/dehaze in place over RGBA pixel data. */
export function applyDetailToData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  clarity: number,
  dehaze: number,
): void {
  if (width === 0 || height === 0) return;

  if (clarity !== 0) {
    const lum = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      lum[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    const radius = Math.max(2, Math.round(Math.min(width, height) * 0.015));
    const blurred = blurLuminance(lum, width, height, radius);
    const amount = (clarity / 100) * 0.8;
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const l = lum[p];
      // Midtone weighting keeps highlights/shadows from haloing.
      const midWeight = 1 - Math.abs(l - 128) / 128;
      const boost = amount * midWeight * (l - blurred[p]);
      if (boost === 0) continue;
      data[i] = clamp(data[i] + boost, 0, 255);
      data[i + 1] = clamp(data[i + 1] + boost, 0, 255);
      data[i + 2] = clamp(data[i + 2] + boost, 0, 255);
    }
  }

  if (dehaze > 0) {
    const d = dehaze / 100;
    const lift = 28 * d;
    const gain = 1 + 0.3 * d;
    const blueGain = 1 - 0.06 * d;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = clamp((data[i] - lift) * gain, 0, 255);
      data[i + 1] = clamp((data[i + 1] - lift) * gain, 0, 255);
      data[i + 2] = clamp((data[i + 2] - lift) * gain * blueGain, 0, 255);
    }
  }
}

/** Canvas wrapper around applyDetailToData. */
export function applyDetailToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  clarity: number,
  dehaze: number,
): void {
  if (width === 0 || height === 0) return;
  const image = ctx.getImageData(0, 0, width, height);
  applyDetailToData(image.data, width, height, clarity, dehaze);
  ctx.putImageData(image, 0, 0);
}
