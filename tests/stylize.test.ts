import { createDefaultStylize } from "../src/constants";
import { applyStylizeToData, boxBlurRgba, stylizeIsNeutral } from "../src/utils/stylize";

function gray(v: number, count: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) data.set([v, v, v, 255], i * 4);
  return data;
}

describe("stylize effects", () => {
  it("none is neutral and leaves pixels untouched", () => {
    expect(stylizeIsNeutral(createDefaultStylize())).toBe(true);
    const data = gray(120, 4);
    applyStylizeToData(data, 2, 2, createDefaultStylize());
    expect(data[0]).toBe(120);
  });

  it("posterize quantizes to few levels at high amount", () => {
    const data = new Uint8ClampedArray(16 * 4);
    for (let i = 0; i < 16; i++) data.set([i * 16, i * 16, i * 16, 255], i * 4);
    applyStylizeToData(data, 16, 1, { ...createDefaultStylize(), kind: "posterize", amount: 100 });
    const distinct = new Set<number>();
    for (let i = 0; i < 16; i++) distinct.add(data[i * 4]);
    expect(distinct.size).toBeLessThanOrEqual(3);
  });

  it("duotone at full strength maps shadows and highlights to the chosen colors", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    applyStylizeToData(data, 2, 1, {
      kind: "duotone",
      amount: 100,
      position: 0.5,
      shadow: "#102040",
      highlight: "#F0E0C0",
    });
    expect([data[0], data[1], data[2]]).toEqual([16, 32, 64]);
    expect([data[4], data[5], data[6]]).toEqual([240, 224, 192]);
  });

  it("pixelate averages blocks", () => {
    // 4×1: two dark then two light pixels, block size ≥ 4 → all equal
    const data = new Uint8ClampedArray([
      0, 0, 0, 255, 0, 0, 0, 255, 200, 200, 200, 255, 200, 200, 200, 255,
    ]);
    applyStylizeToData(data, 4, 1, { ...createDefaultStylize(), kind: "pixelate", amount: 100 });
    expect(data[0]).toBe(data[12]);
    expect(data[0]).toBe(100);
  });

  it("halftone renders dark cells as ink and light cells as paper", () => {
    const dark = gray(10, 8 * 8);
    applyStylizeToData(dark, 8, 8, { ...createDefaultStylize(), kind: "halftone", amount: 20 });
    const light = gray(250, 8 * 8);
    applyStylizeToData(light, 8, 8, { ...createDefaultStylize(), kind: "halftone", amount: 20 });
    const center = (8 * 4 + 4) * 4;
    expect(dark[center]).toBeLessThan(50); // ink dot
    expect(light[center]).toBeGreaterThan(200); // paper
  });

  it("tilt-shift blurs outside the band and keeps the band sharp", () => {
    const w = 16;
    const h = 32;
    const data = new Uint8ClampedArray(w * h * 4);
    // vertical stripes for measurable sharpness
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = x % 2 === 0 ? 0 : 255;
        data.set([v, v, v, 255], (y * w + x) * 4);
      }
    }
    applyStylizeToData(data, w, h, { ...createDefaultStylize(), kind: "tiltshift", amount: 100 });
    const contrastAt = (y: number) => Math.abs(data[(y * w + 6) * 4] - data[(y * w + 7) * 4]);
    expect(contrastAt(Math.floor(h / 2))).toBe(255); // band center untouched
    expect(contrastAt(1)).toBeLessThan(200); // top edge blurred
  });

  it("box blur flattens a spike", () => {
    const data = gray(0, 9);
    data.set([255, 255, 255, 255], 4 * 4);
    const out = boxBlurRgba(data, 9, 1, 2);
    expect(out[4 * 4]).toBeLessThan(120);
    expect(out[2 * 4]).toBeGreaterThan(0);
  });
});
