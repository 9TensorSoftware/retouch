import { createDefaultHsl } from "../src/constants";
import { applyHslToContext, buildHueTable, HSL_BANDS, hslIsNeutral } from "../src/utils/hsl";

describe("HSL mixer hue table", () => {
  it("is neutral by default", () => {
    expect(hslIsNeutral(createDefaultHsl())).toBe(true);
    const table = buildHueTable(createDefaultHsl());
    expect(table.dh[120]).toBe(0);
    expect(table.sMul[240]).toBeCloseTo(1, 6);
    expect(table.dl[0]).toBe(0);
  });

  it("covers all eight bands", () => {
    expect(HSL_BANDS).toHaveLength(8);
  });

  it("a band shift peaks at its center and falls off to neighbors", () => {
    const hsl = createDefaultHsl();
    hsl.green.s = 100; // +100 saturation on greens (center 120°)
    const table = buildHueTable(hsl);
    expect(table.sMul[120]).toBeCloseTo(2, 5); // full effect at the center
    expect(table.sMul[90]).toBeGreaterThan(1); // partial toward yellow
    expect(table.sMul[90]).toBeLessThan(2);
    expect(table.sMul[60]).toBeCloseTo(1, 5); // neighbor center untouched
    expect(table.sMul[240]).toBeCloseTo(1, 5); // far bands untouched
  });

  it("red wraps across 0/360", () => {
    const hsl = createDefaultHsl();
    hsl.red.l = 100;
    const table = buildHueTable(hsl);
    expect(table.dl[0]).toBeCloseTo(0.35, 4); // full at red center
    expect(table.dl[345]).toBeGreaterThan(0); // approaching from magenta side
    expect(table.dl[15]).toBeGreaterThan(0); // toward orange side
  });
});

describe("HSL apply pass", () => {
  function mockCtx(pixels: Uint8ClampedArray, w: number, h: number): CanvasRenderingContext2D {
    return {
      getImageData: () => ({ data: pixels, width: w, height: h }),
      putImageData: () => {},
    } as unknown as CanvasRenderingContext2D;
  }

  it("desaturating greens turns a green pixel gray but leaves blue alone", () => {
    const hsl = createDefaultHsl();
    hsl.green.s = -100;
    const table = buildHueTable(hsl);
    // pure-ish green and pure-ish blue pixels
    const pixels = new Uint8ClampedArray([40, 200, 40, 255, 40, 40, 200, 255]);
    applyHslToContext(mockCtx(pixels, 2, 1), 2, 1, table);
    const greenSpread =
      Math.max(pixels[0], pixels[1], pixels[2]) - Math.min(pixels[0], pixels[1], pixels[2]);
    const blueSpread =
      Math.max(pixels[4], pixels[5], pixels[6]) - Math.min(pixels[4], pixels[5], pixels[6]);
    expect(greenSpread).toBeLessThan(20); // collapsed toward gray
    expect(blueSpread).toBeGreaterThan(140); // untouched
  });

  it("leaves gray pixels untouched regardless of shifts", () => {
    const hsl = createDefaultHsl();
    hsl.red.h = 100;
    hsl.blue.l = -100;
    const table = buildHueTable(hsl);
    const pixels = new Uint8ClampedArray([128, 128, 128, 255]);
    applyHslToContext(mockCtx(pixels, 1, 1), 1, 1, table);
    expect([...pixels]).toEqual([128, 128, 128, 255]);
  });
});
