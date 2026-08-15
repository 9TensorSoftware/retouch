import { describe, expect, it } from "vitest";
import { ceilToMultiple, DENOISE_DIM_MULTIPLE, padRgbaReplicate } from "../src/denoise";

describe("ceilToMultiple", () => {
  it("keeps exact multiples", () => {
    expect(ceilToMultiple(64, 64)).toBe(64);
    expect(ceilToMultiple(128, 64)).toBe(128);
  });

  it("rounds up to the next multiple", () => {
    expect(ceilToMultiple(65, 64)).toBe(128);
    expect(ceilToMultiple(1, 64)).toBe(64);
    expect(ceilToMultiple(200, 64)).toBe(256);
  });

  it("floors at one multiple", () => {
    expect(ceilToMultiple(0, 64)).toBe(64);
  });

  it("matches the SCUNet constraint constant", () => {
    expect(DENOISE_DIM_MULTIPLE).toBe(64);
  });
});

describe("padRgbaReplicate", () => {
  // 2×2 source with distinct pixels, alpha included.
  const src = new Uint8ClampedArray([
    10, 20, 30, 255, 40, 50, 60, 200, 70, 80, 90, 255, 100, 110, 120, 50,
  ]);

  function px(data: Uint8ClampedArray, w: number, x: number, y: number): number[] {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }

  it("copies verbatim when dimensions already match", () => {
    const out = padRgbaReplicate(src, 2, 2, 2, 2);
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it("keeps the source region untouched", () => {
    const out = padRgbaReplicate(src, 2, 2, 4, 3);
    expect(px(out, 4, 0, 0)).toEqual([10, 20, 30, 255]);
    expect(px(out, 4, 1, 0)).toEqual([40, 50, 60, 200]);
    expect(px(out, 4, 0, 1)).toEqual([70, 80, 90, 255]);
    expect(px(out, 4, 1, 1)).toEqual([100, 110, 120, 50]);
  });

  it("replicates the last column rightward and the last row downward", () => {
    const out = padRgbaReplicate(src, 2, 2, 4, 3);
    expect(px(out, 4, 2, 0)).toEqual([40, 50, 60, 200]);
    expect(px(out, 4, 3, 0)).toEqual([40, 50, 60, 200]);
    expect(px(out, 4, 0, 2)).toEqual([70, 80, 90, 255]);
    expect(px(out, 4, 1, 2)).toEqual([100, 110, 120, 50]);
  });

  it("fills the pad corner from the source corner pixel", () => {
    const out = padRgbaReplicate(src, 2, 2, 4, 3);
    expect(px(out, 4, 3, 2)).toEqual([100, 110, 120, 50]);
  });

  it("grows a 1×1 source into a constant field", () => {
    const one = new Uint8ClampedArray([1, 2, 3, 4]);
    const out = padRgbaReplicate(one, 1, 1, 64, 64);
    expect(out.length).toBe(64 * 64 * 4);
    expect(px(out, 64, 0, 0)).toEqual([1, 2, 3, 4]);
    expect(px(out, 64, 63, 63)).toEqual([1, 2, 3, 4]);
    expect(px(out, 64, 31, 47)).toEqual([1, 2, 3, 4]);
  });
});
