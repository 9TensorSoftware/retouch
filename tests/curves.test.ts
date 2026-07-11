import { createDefaultCurves } from "../src/constants";
import {
  applyCurvesToContext,
  buildCurveLut,
  buildCurveLuts,
  curveIsIdentity,
  curvesAreIdentity,
} from "../src/utils/curves";

describe("curve LUT construction", () => {
  it("two corner points produce the identity LUT", () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });

  it("a lifted midpoint brightens midtones without moving the endpoints", () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.5, y: 0.7 },
      { x: 1, y: 1 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
    expect(lut[128]).toBeGreaterThan(160);
  });

  it("monotone interpolation never inverts (no overshoot)", () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 0.3, y: 0.6 },
      { x: 0.4, y: 0.62 },
      { x: 1, y: 1 },
    ]);
    for (let i = 1; i < 256; i++) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it("sanitizes unsorted and out-of-range points", () => {
    const lut = buildCurveLut([
      { x: 1.4, y: 2 },
      { x: -0.2, y: -1 },
      { x: 0.5, y: 0.5 },
    ]);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });
});

describe("curves identity checks", () => {
  it("detects the default curves as identity", () => {
    expect(curvesAreIdentity(createDefaultCurves())).toBe(true);
    expect(
      curveIsIdentity([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(true);
  });

  it("any moved point breaks identity", () => {
    const curves = createDefaultCurves();
    curves.r = [
      { x: 0, y: 0 },
      { x: 0.5, y: 0.6 },
      { x: 1, y: 1 },
    ];
    expect(curvesAreIdentity(curves)).toBe(false);
  });
});

describe("LUT application", () => {
  it("master composes on top of channel curves and applies per pixel", () => {
    const curves = createDefaultCurves();
    // Invert the red channel; master stays identity.
    curves.r = [
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];
    const luts = buildCurveLuts(curves);
    expect(luts.r[0]).toBe(255);
    expect(luts.r[255]).toBe(0);
    expect(luts.g[100]).toBe(100);

    // jsdom has no pixel backend — drive the pass through a mock context
    // backed by a real array (the browser E2E covers the canvas path).
    const pixels = new Uint8ClampedArray([255, 10, 20, 255, 40, 50, 60, 255]);
    const ctx = {
      getImageData: () => ({ data: pixels, width: 2, height: 1 }),
      putImageData: () => {},
    } as unknown as CanvasRenderingContext2D;
    applyCurvesToContext(ctx, 2, 1, luts);
    expect(pixels[0]).toBe(0); // red inverted (255 → 0)
    expect(pixels[1]).toBe(10); // green untouched
    expect(pixels[4]).toBe(215); // red inverted (40 → 215)
    expect(pixels[6]).toBe(60); // blue untouched
  });
});
