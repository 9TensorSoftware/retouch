import type { EditMask } from "../src/types";
import {
  applyMasksToContext,
  composeLocalMatrix,
  createDefaultLocalAdjust,
  maskAlphaAt,
  masksAreNeutral,
  prepareMasks,
} from "../src/utils/masks";

function makeMask(overrides: Partial<EditMask> = {}): EditMask {
  return {
    id: "m1",
    kind: "linear",
    x0: 0,
    y0: 0.5,
    x1: 1,
    y1: 0.5,
    invert: false,
    adjust: createDefaultLocalAdjust(),
    ...overrides,
  };
}

describe("mask alpha math", () => {
  it("linear masks are full at the start, zero past the end, half midway", () => {
    const mask = makeMask();
    expect(maskAlphaAt(mask, 0, 0.5)).toBeCloseTo(1, 5);
    expect(maskAlphaAt(mask, 1, 0.5)).toBeCloseTo(0, 5);
    expect(maskAlphaAt(mask, 0.5, 0.5)).toBeCloseTo(0.5, 5);
    expect(maskAlphaAt(mask, -0.2, 0.5)).toBeCloseTo(1, 5); // before start stays full
  });

  it("radial masks are full at the center and fade past the radius", () => {
    const mask = makeMask({ kind: "radial", x0: 0.5, y0: 0.5, x1: 0.7, y1: 0.7 });
    expect(maskAlphaAt(mask, 0.5, 0.5)).toBeCloseTo(1, 5);
    expect(maskAlphaAt(mask, 0.99, 0.5)).toBeLessThan(0.2); // well outside rx
    expect(maskAlphaAt(mask, 0.6, 0.5)).toBeGreaterThan(0.5); // inside
  });

  it("invert flips the alpha", () => {
    const mask = makeMask({ invert: true });
    expect(maskAlphaAt(mask, 0, 0.5)).toBeCloseTo(0, 5);
    expect(maskAlphaAt(mask, 1, 0.5)).toBeCloseTo(1, 5);
  });
});

describe("local adjustment matrices", () => {
  it("neutral adjustments compose to the identity", () => {
    const m = composeLocalMatrix(createDefaultLocalAdjust());
    expect(m[0]).toBeCloseTo(1, 6);
    expect(m[6]).toBeCloseTo(1, 6);
    expect(m[12]).toBeCloseTo(1, 6);
    expect(m[4]).toBeCloseTo(0, 6);
  });

  it("exposure +50 doubles the channels", () => {
    const m = composeLocalMatrix({ ...createDefaultLocalAdjust(), exposure: 50 });
    expect(m[0]).toBeCloseTo(2, 5);
    expect(m[6]).toBeCloseTo(2, 5);
    expect(m[12]).toBeCloseTo(2, 5);
  });

  it("neutral masks are skipped by prepare and detected as neutral", () => {
    expect(masksAreNeutral([])).toBe(true);
    expect(masksAreNeutral([makeMask()])).toBe(true);
    expect(prepareMasks([makeMask()])).toHaveLength(0);
    const active = makeMask({ adjust: { ...createDefaultLocalAdjust(), exposure: 30 } });
    expect(masksAreNeutral([active])).toBe(false);
    expect(prepareMasks([active])).toHaveLength(1);
  });
});

describe("masked apply pass", () => {
  it("brightens only the masked side of the image", () => {
    const mask = makeMask({ adjust: { ...createDefaultLocalAdjust(), exposure: 50 } });
    const pixels = new Uint8ClampedArray([100, 100, 100, 255, 100, 100, 100, 255]);
    const ctx = {
      getImageData: () => ({ data: pixels, width: 2, height: 1 }),
      putImageData: () => {},
    } as unknown as CanvasRenderingContext2D;
    applyMasksToContext(ctx, 2, 1, prepareMasks([mask]));
    expect(pixels[0]).toBe(200); // left pixel doubled (alpha 1)
    expect(pixels[4]).toBe(100); // right pixel untouched (alpha 0)
  });
});
