import { describe, expect, it } from "vitest";
import {
  chw255ToRgba,
  expandToSquare,
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
