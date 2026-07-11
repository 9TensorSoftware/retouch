import type { StylizeEffect } from "../types";
import { clamp } from "./math";

export { createDefaultStylize } from "../constants";

/**
 * Parametric stylize effects — one active at a time, applied as a post pass
 * late in the chain (after color work, before the vignette): tilt-shift,
 * duotone, posterize, pixelate, halftone.
 */

export function stylizeIsNeutral(effect: StylizeEffect): boolean {
  return effect.kind === "none";
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  const v = Number.parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Separable RGB box blur returning a new buffer (2 passes ≈ soft gaussian). */
export function boxBlurRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const src = Float32Array.from(data);
  const dst = new Float32Array(data.length);
  const window = radius * 2 + 1;

  for (let pass = 0; pass < 2; pass++) {
    // Horizontal
    for (let y = 0; y < height; y++) {
      for (let c = 0; c < 3; c++) {
        const row = y * width * 4 + c;
        let sum = 0;
        for (let x = -radius; x <= radius; x++) {
          sum += src[row + clamp(x, 0, width - 1) * 4];
        }
        for (let x = 0; x < width; x++) {
          dst[row + x * 4] = sum / window;
          sum += src[row + clamp(x + radius + 1, 0, width - 1) * 4];
          sum -= src[row + clamp(x - radius, 0, width - 1) * 4];
        }
      }
    }
    // Vertical
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        const col = x * 4 + c;
        let sum = 0;
        for (let y = -radius; y <= radius; y++) {
          sum += dst[clamp(y, 0, height - 1) * width * 4 + col];
        }
        for (let y = 0; y < height; y++) {
          src[y * width * 4 + col] = sum / window;
          sum += dst[clamp(y + radius + 1, 0, height - 1) * width * 4 + col];
          sum -= dst[clamp(y - radius, 0, height - 1) * width * 4 + col];
        }
      }
    }
  }
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    out[i] = src[i];
    out[i + 1] = src[i + 1];
    out[i + 2] = src[i + 2];
    out[i + 3] = data[i + 3];
  }
  return out;
}

/** Apply the active stylize effect in place over RGBA pixel data. */
export function applyStylizeToData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  effect: StylizeEffect,
): void {
  if (width === 0 || height === 0 || effect.kind === "none") return;
  const amount = clamp(effect.amount, 0, 100);

  if (effect.kind === "posterize") {
    // amount ↑ = fewer levels (stronger effect)
    const levels = clamp(Math.round(16 - (amount / 100) * 13), 3, 16);
    const step = 255 / (levels - 1);
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(Math.round(i / step) * step);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = lut[data[i]];
      data[i + 1] = lut[data[i + 1]];
      data[i + 2] = lut[data[i + 2]];
    }
    return;
  }

  if (effect.kind === "duotone") {
    const shadow = hexToRgb(effect.shadow);
    const highlight = hexToRgb(effect.highlight);
    const mix = amount / 100;
    for (let i = 0; i < data.length; i += 4) {
      const t = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      for (let c = 0; c < 3; c++) {
        const duo = shadow[c] * (1 - t) + highlight[c] * t;
        data[i + c] = data[i + c] * (1 - mix) + duo * mix;
      }
    }
    return;
  }

  if (effect.kind === "pixelate") {
    const block = clamp(Math.round(2 + (amount / 100) * 46), 2, 64);
    for (let by = 0; by < height; by += block) {
      for (let bx = 0; bx < width; bx += block) {
        const bw = Math.min(block, width - bx);
        const bh = Math.min(block, height - by);
        let r = 0;
        let g = 0;
        let b = 0;
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const i = ((by + y) * width + bx + x) * 4;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
          }
        }
        const n = bw * bh;
        r /= n;
        g /= n;
        b /= n;
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const i = ((by + y) * width + bx + x) * 4;
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
          }
        }
      }
    }
    return;
  }

  if (effect.kind === "halftone") {
    const cell = clamp(Math.round(4 + (amount / 100) * 18), 4, 32);
    const half = cell / 2;
    for (let by = 0; by < height; by += cell) {
      for (let bx = 0; bx < width; bx += cell) {
        const bw = Math.min(cell, width - bx);
        const bh = Math.min(cell, height - by);
        let lum = 0;
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const i = ((by + y) * width + bx + x) * 4;
            lum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          }
        }
        lum /= bw * bh;
        // Darker cells → bigger ink dots
        const radius = (1 - lum / 255) * half * 1.25;
        const r2 = radius * radius;
        for (let y = 0; y < bh; y++) {
          for (let x = 0; x < bw; x++) {
            const dx = x - bw / 2 + 0.5;
            const dy = y - bh / 2 + 0.5;
            const i = ((by + y) * width + bx + x) * 4;
            const ink = dx * dx + dy * dy <= r2 ? 20 : 245;
            data[i] = ink;
            data[i + 1] = ink;
            data[i + 2] = ink;
          }
        }
      }
    }
    return;
  }

  // tiltshift: blur everything outside a feathered horizontal band
  const radius = Math.max(2, Math.round((amount / 100) * Math.min(width, height) * 0.02));
  const blurred = boxBlurRgba(data, width, height, radius);
  const center = clamp(effect.position, 0, 1);
  const halfBand = 0.16;
  const feather = 0.18;
  for (let y = 0; y < height; y++) {
    const ny = height > 1 ? y / (height - 1) : 0.5;
    const dist = Math.abs(ny - center);
    let w = (dist - halfBand) / feather;
    w = clamp(w, 0, 1);
    w = w * w * (3 - 2 * w);
    if (w <= 0) continue;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = data[i] * (1 - w) + blurred[i] * w;
      data[i + 1] = data[i + 1] * (1 - w) + blurred[i + 1] * w;
      data[i + 2] = data[i + 2] * (1 - w) + blurred[i + 2] * w;
    }
  }
}

/** Canvas wrapper around applyStylizeToData. */
export function applyStylizeToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  effect: StylizeEffect,
): void {
  if (width === 0 || height === 0 || stylizeIsNeutral(effect)) return;
  const image = ctx.getImageData(0, 0, width, height);
  applyStylizeToData(image.data, width, height, effect);
  ctx.putImageData(image, 0, 0);
}
