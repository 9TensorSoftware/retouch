import { describe, expect, it } from "vitest";
import {
  blendWeights,
  boxBlur,
  composeBokehPixels,
  createBokehPrep,
  defocus,
  dilate,
  guidedDepth,
  levelWeight,
  nearAlpha,
  renderBokehPixels,
  suggestFocus,
} from "../src/bokeh";
import type { DepthMap } from "../src/depth";

/** RGBA gray image from a value per pixel. */
function grayImage(
  width: number,
  height: number,
  value: (x: number, y: number) => number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[i] = out[i + 1] = out[i + 2] = value(x, y);
      out[i + 3] = 255;
    }
  }
  return out;
}

function depthMapOf(
  width: number,
  height: number,
  value: (x: number, y: number) => number,
): DepthMap {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = value(x, y);
  }
  return { data, width, height };
}

describe("blendWeights", () => {
  const radii = [0, 2, 5, 10];

  it("stays on the sharp level at radius 0", () => {
    expect(blendWeights(0, radii)).toEqual({ lo: 0, hi: 0, t: 0 });
  });

  it("clamps to the last level beyond the max radius", () => {
    expect(blendWeights(50, radii)).toEqual({ lo: 3, hi: 3, t: 0 });
  });

  it("brackets and interpolates in between", () => {
    const w = blendWeights(3.5, radii);
    expect(w.lo).toBe(1);
    expect(w.hi).toBe(2);
    expect(w.t).toBeCloseTo(0.5);
  });

  it("lands exactly on an interior level", () => {
    const w = blendWeights(5, radii);
    expect(w.hi).toBe(2);
    expect(w.t).toBeCloseTo(1 - (radii[2] - 5) / 3, 5);
  });
});

describe("defocus", () => {
  it("keeps depth near the focus sharp", () => {
    expect(defocus(0.5, 0.5)).toBe(0);
    expect(defocus(0.52, 0.5)).toBe(0);
    expect(defocus(0.48, 0.5)).toBe(0);
  });

  it("grows with distance on either side, up to 1", () => {
    expect(defocus(0.7, 0.5)).toBeCloseTo(0.34);
    expect(defocus(0.3, 0.5)).toBeCloseTo(0.34);
    expect(defocus(1, 0)).toBe(1);
  });
});

describe("levelWeight", () => {
  it("barely counts sharp pixels and fully counts blurred ones", () => {
    expect(levelWeight(0)).toBeGreaterThan(0);
    expect(levelWeight(0)).toBeLessThan(0.01);
    expect(levelWeight(0.1)).toBeGreaterThan(levelWeight(0.05));
    expect(levelWeight(0.25)).toBe(1);
    expect(levelWeight(1)).toBe(1);
  });
});

describe("nearAlpha", () => {
  it("holds only what's in front of the focus and out of it", () => {
    expect(nearAlpha(0.2, 0.5)).toBe(0);
    expect(nearAlpha(0.52, 0.5)).toBe(0);
    expect(nearAlpha(0.95, 0.5)).toBe(1);
    const between = nearAlpha(0.6, 0.5);
    expect(between).toBeGreaterThan(0);
    expect(between).toBeLessThan(1);
  });
});

describe("dilate", () => {
  it("grows a point into a square of the radius", () => {
    const values = new Float32Array(7 * 7);
    values[3 * 7 + 3] = 1;
    const out = dilate(values, 7, 7, 2);
    expect(out.filter((v) => v === 1).length).toBe(25);
    expect(out[3 * 7 + 1]).toBe(1);
    expect(out[3 * 7]).toBe(0);
  });
});

describe("boxBlur", () => {
  it("leaves a flat image flat", () => {
    const buf = new Float32Array(10 * 6 * 3).fill(0.4);
    boxBlur(buf, new Float32Array(buf.length), 10, 6, 3, 3);
    for (const v of buf) expect(v).toBeCloseTo(0.4, 5);
  });

  it("spreads a point evenly over its window, keeping its total", () => {
    const buf = new Float32Array(21 * 21);
    buf[10 * 21 + 10] = 25;
    boxBlur(buf, new Float32Array(buf.length), 21, 21, 1, 2, 1);
    expect(buf[10 * 21 + 10]).toBeCloseTo(1, 5);
    expect(buf[8 * 21 + 12]).toBeCloseTo(1, 5);
    expect(buf[7 * 21 + 10]).toBe(0);
    expect(buf.reduce((sum, v) => sum + v, 0)).toBeCloseTo(25, 4);
  });
});

describe("guidedDepth", () => {
  it("moves the model's soft depth edge onto the photo's edge", () => {
    const width = 64;
    const height = 8;
    const edge = 37;
    const rgba = grayImage(width, height, (x) => (x < edge ? 30 : 220));
    // The model saw 16 px across; its edge is soft and lands a little off
    const map = depthMapOf(16, 2, (x) => 0.2 + 0.6 * Math.min(1, Math.max(0, (x - 7) / 4)));
    const out = guidedDepth(map, rgba, width, height);
    const at = (x: number) => out[4 * width + x];
    // Scaled up plainly, the step would take about 16 px; here it takes one,
    // at the photo's edge
    let steepest = 1;
    for (let x = 2; x < width; x++) {
      if (at(x) - at(x - 1) > at(steepest) - at(steepest - 1)) steepest = x;
    }
    expect(steepest).toBe(edge);
    expect(at(edge) - at(edge - 1)).toBeGreaterThan(0.4);
    expect(at(edge - 3)).toBeLessThan(0.3);
    expect(at(edge + 2)).toBeGreaterThan(0.6);
  });
});

describe("composeBokehPixels", () => {
  // A bright square in front of a dark background, far behind it
  const size = 48;
  const inSquare = (x: number, y: number) => x >= 18 && x < 30 && y >= 18 && y < 30;
  const base = grayImage(size, size, (x, y) => (inSquare(x, y) ? 240 : 20));
  const map = depthMapOf(size, size, (x, y) => (inSquare(x, y) ? 0.9 : 0.1));
  const prepare = () => ({
    ...createBokehPrep(base, size, size, map),
    levelRadii: [0, 2, 4, 8, 12],
  });
  const gray = (pixels: Uint8ClampedArray, x: number, y: number) => pixels[(y * size + x) * 4];

  it("changes nothing at a zero aperture", () => {
    const prep = prepare();
    expect(composeBokehPixels(prep, 0.9, 0)).toEqual(base);
    expect(composeBokehPixels(prep, 0.1, 0)).toEqual(base);
  });

  it("keeps a sharp subject out of the background's blur", () => {
    const pixels = composeBokehPixels(prepare(), 0.9, 1);
    expect(gray(pixels, 24, 24)).toBe(240);
    expect(gray(pixels, 18, 18)).toBe(240);
    // Three pixels off the square, the background stays dark: no glow
    expect(gray(pixels, 15, 24)).toBeLessThan(25);
    expect(gray(pixels, 24, 32)).toBeLessThan(25);
  });

  it("spreads a near subject's blur over the sharp background behind it", () => {
    const pixels = composeBokehPixels(prepare(), 0.1, 1);
    expect(gray(pixels, 2, 2)).toBe(20);
    expect(gray(pixels, 15, 24)).toBeGreaterThan(40);
    expect(gray(pixels, 24, 24)).toBeLessThan(235);
  });

  it("keeps the blur levels while the focus stays", () => {
    const prep = prepare();
    composeBokehPixels(prep, 0.9, 1);
    const layers = prep.layers;
    composeBokehPixels(prep, 0.9, 0.5);
    expect(prep.layers).toBe(layers);
    composeBokehPixels(prep, 0.1, 0.5);
    expect(prep.layers).not.toBe(layers);
  });
});

describe("renderBokehPixels", () => {
  it("matches the preview at its size, across strips", () => {
    // Taller than a strip, with a near band crossing the strips' seams
    const width = 24;
    const height = 150;
    const inBand = (x: number, y: number) => Math.abs(x - y / 6) < 4;
    const base = grayImage(width, height, (x, y) => (inBand(x, y) ? 230 : 40 + (y % 7) * 5));
    const map = depthMapOf(width, height, (x, y) => (inBand(x, y) ? 0.8 : 0.3));
    const prep = { ...createBokehPrep(base, width, height, map), levelRadii: [0, 2, 4, 8, 12] };
    for (const focus of [0.8, 0.3]) {
      const preview = composeBokehPixels(prep, focus, 0.8);
      expect(renderBokehPixels(prep, base, width, height, map, focus, 0.8)).toEqual(preview);
    }
  });
});

describe("suggestFocus", () => {
  it("starts on the nearer part of the middle", () => {
    // Far background, with a subject covering the middle's lower half
    const map = depthMapOf(20, 20, (x, y) => (x >= 6 && x < 14 && y >= 10 && y < 14 ? 0.7 : 0.1));
    expect(suggestFocus(map)).toBeCloseTo(0.7);
  });

  it("falls back to the background when the middle holds nothing nearer", () => {
    const map = depthMapOf(20, 20, () => 0.3);
    expect(suggestFocus(map)).toBeCloseTo(0.3);
  });
});
