import { describe, expect, it } from "vitest";
import {
  chw255ToRgba,
  dilateMask,
  expandToSquare,
  maskBoundingBox,
  maskToTensor,
  rgbaToChw,
  strokesBoundingBox,
} from "../src/inpaint";

describe("strokesBoundingBox", () => {
  it("returns null with no strokes", () => {
    expect(strokesBoundingBox([], 100, 100, 10)).toBeNull();
  });

  it("bounds a single dab with padding, clamped to the image", () => {
    // Center dab: r = 0.1 × 200 = 20px around (100, 100)
    const box = strokesBoundingBox([{ x: 0.5, y: 0.5, r: 0.1 }], 200, 200, 10);
    expect(box).toEqual({ x: 70, y: 70, w: 60, h: 60 });
  });

  it("clamps to the image at the edges", () => {
    const box = strokesBoundingBox([{ x: 0, y: 0, r: 0.1 }], 200, 200, 10);
    expect(box?.x).toBe(0);
    expect(box?.y).toBe(0);
  });

  it("covers all strokes", () => {
    const box = strokesBoundingBox(
      [
        { x: 0.2, y: 0.2, r: 0.05 },
        { x: 0.8, y: 0.7, r: 0.05 },
      ],
      100,
      100,
      0,
    );
    expect(box?.x).toBeLessThanOrEqual(15);
    expect((box?.x ?? 0) + (box?.w ?? 0)).toBeGreaterThanOrEqual(85);
    expect((box?.y ?? 0) + (box?.h ?? 0)).toBeGreaterThanOrEqual(75);
  });
});

describe("expandToSquare", () => {
  it("grows the short side, centered", () => {
    const sq = expandToSquare({ x: 40, y: 50, w: 20, h: 60 }, 400, 400);
    expect(sq.w).toBe(60);
    expect(sq.h).toBe(60);
    expect(sq.x).toBe(20);
    expect(sq.y).toBe(50);
  });

  it("shifts inside the image instead of clipping", () => {
    const sq = expandToSquare({ x: 0, y: 0, w: 10, h: 100 }, 400, 400);
    expect(sq).toEqual({ x: 0, y: 0, w: 100, h: 100 });
  });

  it("caps the side at the image's short dimension", () => {
    const sq = expandToSquare({ x: 0, y: 0, w: 300, h: 40 }, 320, 200);
    expect(sq.w).toBe(200);
    expect(sq.h).toBe(200);
    expect(sq.x + sq.w).toBeLessThanOrEqual(320);
    expect(sq.y + sq.h).toBeLessThanOrEqual(200);
  });
});

describe("tensor conversions", () => {
  it("rgbaToChw scales to 0–1 planar", () => {
    const chw = rgbaToChw(new Uint8ClampedArray([255, 0, 128, 255]), 1);
    expect(chw[0]).toBeCloseTo(1);
    expect(chw[1]).toBeCloseTo(0);
    expect(chw[2]).toBeCloseTo(128 / 255);
  });

  it("maskToTensor thresholds gray to binary holes", () => {
    const data = new Uint8ClampedArray([255, 255, 255, 255, 40, 40, 40, 255, 200, 200, 200, 255]);
    expect(Array.from(maskToTensor(data, 3))).toEqual([1, 0, 1]);
  });

  it("chw255ToRgba clamps and stays opaque", () => {
    const rgba = chw255ToRgba(new Float32Array([300, -5, 127.6]), 1);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(128);
    expect(rgba[3]).toBe(255);
  });
});

describe("maskBoundingBox", () => {
  const grayMask = (w: number, h: number, bright: Array<[number, number]>): Uint8ClampedArray => {
    const gray = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < gray.length; i += 4) gray[i] = 255;
    for (const [x, y] of bright) gray[(y * w + x) * 4] = 255;
    return gray;
  };

  it("returns null for an empty mask", () => {
    expect(maskBoundingBox(grayMask(10, 8, []), 10, 8, 4)).toBeNull();
  });

  it("bounds bright pixels with padding, clamped to the image", () => {
    const box = maskBoundingBox(
      grayMask(20, 20, [
        [5, 6],
        [9, 10],
      ]),
      20,
      20,
      3,
    );
    expect(box).toEqual({ x: 2, y: 3, w: 11, h: 11 });
  });

  it("clamps at the image edges", () => {
    const box = maskBoundingBox(grayMask(10, 10, [[0, 0]]), 10, 10, 5);
    expect(box).toEqual({ x: 0, y: 0, w: 6, h: 6 });
  });

  it("ignores dim (\u2264127) pixels", () => {
    const gray = grayMask(10, 10, []);
    gray[(5 * 10 + 5) * 4] = 100;
    expect(maskBoundingBox(gray, 10, 10, 0)).toBeNull();
  });
});

describe("dilateMask", () => {
  const singleDot = (w: number, h: number, x: number, y: number): Uint8ClampedArray => {
    const gray = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < gray.length; i += 4) gray[i] = 255;
    gray[(y * w + x) * 4] = 255;
    return gray;
  };

  it("is an identity at radius 0", () => {
    const gray = singleDot(9, 9, 4, 4);
    expect(Array.from(dilateMask(gray, 9, 9, 0))).toEqual(Array.from(gray));
  });

  it("grows a single pixel into a (2r+1)\u00b2 Chebyshev square", () => {
    const out = dilateMask(singleDot(9, 9, 4, 4), 9, 9, 2);
    let bright = 0;
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        if (out[(y * 9 + x) * 4] > 127) {
          bright++;
          expect(Math.abs(x - 4)).toBeLessThanOrEqual(2);
          expect(Math.abs(y - 4)).toBeLessThanOrEqual(2);
        }
      }
    }
    expect(bright).toBe(25);
  });

  it("clamps growth at the borders and keeps alpha opaque", () => {
    const out = dilateMask(singleDot(5, 5, 0, 0), 5, 5, 3);
    expect(out[0]).toBe(255);
    expect(out[(4 * 5 + 4) * 4]).toBe(0);
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255);
  });
});
