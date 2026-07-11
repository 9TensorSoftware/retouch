import { describe, expect, it } from "vitest";
import { applyMatteAlpha, fitRefSize, matteToRgba, rgbaToNormalizedChw } from "../src/cutout";

describe("fitRefSize", () => {
  it("caps the long edge and snaps to multiples of 32", () => {
    const { width, height } = fitRefSize(2048, 1024);
    expect(width).toBe(512);
    expect(height).toBe(256);
    expect(width % 32).toBe(0);
    expect(height % 32).toBe(0);
  });

  it("never upscales small images", () => {
    const { width, height } = fitRefSize(300, 200);
    expect(width).toBeLessThanOrEqual(320);
    expect(height).toBeLessThanOrEqual(224);
    expect(width % 32).toBe(0);
    expect(height % 32).toBe(0);
  });

  it("keeps a floor of 32 on razor-thin inputs", () => {
    const { width, height } = fitRefSize(2000, 20);
    expect(height).toBe(32);
    expect(width % 32).toBe(0);
  });
});

describe("rgbaToNormalizedChw", () => {
  it("normalizes to [-1, 1] in channel-planar order", () => {
    // Two pixels: pure red and pure white
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255]);
    const chw = rgbaToNormalizedChw(rgba, 2);
    expect(chw).toHaveLength(6);
    // R plane
    expect(chw[0]).toBeCloseTo(1);
    expect(chw[1]).toBeCloseTo(1);
    // G plane
    expect(chw[2]).toBeCloseTo(-1);
    expect(chw[3]).toBeCloseTo(1);
    // B plane
    expect(chw[4]).toBeCloseTo(-1);
    expect(chw[5]).toBeCloseTo(1);
  });

  it("maps mid-gray to zero", () => {
    const rgba = new Uint8ClampedArray([128, 128, 128, 255]);
    const chw = rgbaToNormalizedChw(rgba, 1);
    for (const v of chw) expect(Math.abs(v)).toBeLessThan(0.01);
  });
});

describe("matteToRgba", () => {
  it("expands floats to opaque gray pixels, clamping out-of-range values", () => {
    const rgba = matteToRgba(new Float32Array([0, 0.5, 1, 1.7, -0.2]));
    expect(rgba).toHaveLength(20);
    expect(rgba[0]).toBe(0);
    expect(rgba[4]).toBe(128);
    expect(rgba[8]).toBe(255);
    expect(rgba[12]).toBe(255); // clamped high
    expect(rgba[16]).toBe(0); // clamped low
    expect(rgba[3]).toBe(255);
  });
});

describe("applyMatteAlpha", () => {
  it("writes the matte into the alpha channel without touching color", () => {
    const target = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    const matte = new Uint8ClampedArray([200, 200, 200, 255, 0, 0, 0, 255]);
    applyMatteAlpha(target, matte);
    expect(Array.from(target)).toEqual([10, 20, 30, 200, 40, 50, 60, 0]);
  });

  it("only ever reduces existing alpha", () => {
    const target = new Uint8ClampedArray([10, 20, 30, 100]);
    const matte = new Uint8ClampedArray([255, 255, 255, 255]);
    applyMatteAlpha(target, matte);
    expect(target[3]).toBe(100);
  });
});
