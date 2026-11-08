import { DEFAULT_EDITS } from "../src/constants";
import { framingOf, toSource } from "../src/utils/framing";
import { hasKeystone, keystoneScaleAt, remapKeystoneData } from "../src/utils/perspective";

describe("keystone helpers", () => {
  it("hasKeystone is false only when both axes are zero", () => {
    expect(hasKeystone(0, 0)).toBe(false);
    expect(hasKeystone(10, 0)).toBe(true);
    expect(hasKeystone(0, -5)).toBe(true);
  });

  it("scale is 1 at the center row regardless of amount", () => {
    expect(keystoneScaleAt(0.5, 80)).toBeCloseTo(1, 10);
    expect(keystoneScaleAt(0.5, -80)).toBeCloseTo(1, 10);
  });

  it("positive amounts widen the top and narrow the bottom symmetrically", () => {
    const top = keystoneScaleAt(0, 50);
    const bottom = keystoneScaleAt(1, 50);
    expect(top).toBeGreaterThan(1);
    expect(bottom).toBeLessThan(1);
    expect(top - 1).toBeCloseTo(1 - bottom, 10);
  });

  it("never collapses a row below the safety floor", () => {
    expect(keystoneScaleAt(1, 100)).toBeGreaterThanOrEqual(0.4);
  });
});

describe("remapKeystoneData", () => {
  // Red rises 6 a pixel across, green 10 a pixel down: bilinear sampling of a
  // ramp gives back exactly where it sampled.
  const W = 40;
  const H = 20;
  const ramp = (): Uint8ClampedArray => {
    const data = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        data[i] = 6 * x;
        data[i + 1] = 10 * y;
        data[i + 3] = 255;
      }
    }
    return data;
  };
  const alphaAt = (data: Uint8ClampedArray, x: number, y: number) => data[(y * W + x) * 4 + 3];

  it("leaves the pixels as they are at zero", () => {
    const src = ramp();
    expect(remapKeystoneData(src, W, H, 0, 0)).toEqual(src);
  });

  it("widens the top and narrows the bottom for a positive vertical amount", () => {
    const out = remapKeystoneData(ramp(), W, H, 60, 0);
    // The top row is stretched past the frame, so it still fills it.
    expect(alphaAt(out, 0, 0)).toBe(255);
    expect(alphaAt(out, W - 1, 0)).toBe(255);
    // The bottom row shrank: its ends are empty, its middle isn't.
    expect(alphaAt(out, 0, H - 1)).toBe(0);
    expect(alphaAt(out, W - 1, H - 1)).toBe(0);
    expect(alphaAt(out, W / 2, H - 1)).toBe(255);
  });

  it("samples where the editor's outline says the warp came from", () => {
    const keystoneV = 40;
    const keystoneH = -30;
    const out = remapKeystoneData(ramp(), W, H, keystoneV, keystoneH);
    const framing = framingOf({ ...structuredClone(DEFAULT_EDITS), keystoneV, keystoneH }, W, H);
    let checked = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (out[i + 3] !== 255) continue;
        const from = toSource({ x: (x + 0.5) / W, y: (y + 0.5) / H }, framing);
        expect(out[i]).toBeCloseTo(6 * (from.x * W - 0.5), -0.5);
        expect(out[i + 1]).toBeCloseTo(10 * (from.y * H - 0.5), -0.5);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(W * H * 0.7);
  });
});
