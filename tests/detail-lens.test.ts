import { applyDetailToData, detailIsNeutral } from "../src/utils/detail";
import { hasLens, remapLensData } from "../src/utils/lens";

describe("detail pass (clarity/dehaze)", () => {
  it("neutral detection", () => {
    expect(detailIsNeutral(0, 0)).toBe(true);
    expect(detailIsNeutral(10, 0)).toBe(false);
    expect(detailIsNeutral(0, 5)).toBe(false);
  });

  it("clarity increases local contrast across an edge", () => {
    // 8×1 half-dark half-light strip
    const w = 8;
    const data = new Uint8ClampedArray(w * 4);
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 90 : 170;
      data.set([v, v, v, 255], x * 4);
    }
    const before = data[2 * 4 + 0] - data[5 * 4 + 0]; // dark − light
    applyDetailToData(data, w, 1, 80, 0);
    const darkSide = data[2 * 4 + 0];
    const lightSide = data[5 * 4 + 0];
    expect(darkSide).toBeLessThan(90); // pushed darker near the edge blur
    expect(lightSide).toBeGreaterThan(170); // pushed lighter
    expect(lightSide - darkSide).toBeGreaterThan(-before);
  });

  it("dehaze lowers the black lift and boosts contrast", () => {
    const data = new Uint8ClampedArray([60, 60, 70, 255, 200, 200, 210, 255]);
    applyDetailToData(data, 2, 1, 0, 100);
    expect(data[0]).toBeLessThan(60); // hazy shadow pulled down
    expect(data[4]).toBeGreaterThanOrEqual(200); // highlight kept or boosted
    expect(data[6]).toBeLessThan(data[2] + 200); // blue not amplified relative to others
  });

  it("clarity 0 + dehaze 0 leaves pixels untouched", () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255]);
    applyDetailToData(data, 1, 1, 0, 0);
    expect([...data]).toEqual([10, 20, 30, 255]);
  });
});

describe("lens remap", () => {
  it("neutral detection", () => {
    expect(hasLens(0, 0)).toBe(false);
    expect(hasLens(10, 0)).toBe(true);
    expect(hasLens(0, 10)).toBe(true);
  });

  it("keeps the exact center fixed and moves off-center content", () => {
    const w = 9;
    const h = 9;
    const src = new Uint8ClampedArray(w * h * 4);
    // center pixel red, a corner-adjacent pixel green
    const set = (x: number, y: number, rgb: number[]) => src.set([...rgb, 255], (y * w + x) * 4);
    set(4, 4, [255, 0, 0]);
    set(1, 1, [0, 255, 0]);
    const out = remapLensData(src, w, h, 80, 0);
    const at = (x: number, y: number) => [...out.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
    expect(at(4, 4)).toEqual([255, 0, 0]); // center invariant
    expect(at(1, 1)).not.toEqual([0, 255, 0]); // corner content displaced
  });

  it("devignette brightens corners more than the center", () => {
    const w = 9;
    const h = 9;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < src.length; i += 4) src.set([100, 100, 100, 255], i);
    const out = remapLensData(src, w, h, 0, 100);
    const at = (x: number, y: number) => out[(y * w + x) * 4];
    expect(at(4, 4)).toBe(100); // center unchanged (r = 0)
    expect(at(0, 0)).toBeGreaterThan(150); // corner gained
  });
});
