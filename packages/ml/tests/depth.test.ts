import { describe, expect, it } from "vitest";
import {
  blendWeights,
  type DepthMap,
  depthAt,
  depthResizedSize,
  normalizeDepth,
  rgbaToDepthTensor,
} from "../src/depth";

describe("depthResizedSize", () => {
  it("caps the long edge near 518 with both dims multiples of 14", () => {
    const { width, height } = depthResizedSize(600, 800);
    expect(height).toBe(518); // 518 is itself a multiple of 14
    expect(width % 14).toBe(0);
    expect(width).toBe(392);
  });

  it("floors at one patch", () => {
    expect(depthResizedSize(2000, 10).height).toBe(14);
  });
});

describe("rgbaToDepthTensor", () => {
  it("applies /255 + ImageNet normalization in planar order", () => {
    const chw = rgbaToDepthTensor(new Uint8ClampedArray([255, 0, 128, 255]), 1, 1);
    expect(chw[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    expect(chw[1]).toBeCloseTo((0 - 0.456) / 0.224, 4);
    expect(chw[2]).toBeCloseTo((128 / 255 - 0.406) / 0.225, 4);
  });
});

describe("normalizeDepth", () => {
  it("min-max scales to 0–1", () => {
    const out = normalizeDepth(new Float32Array([2, 4, 6]));
    expect(Array.from(out)).toEqual([0, 0.5, 1]);
  });

  it("returns zeros for a constant map", () => {
    const out = normalizeDepth(new Float32Array([3, 3, 3]));
    expect(Array.from(out)).toEqual([0, 0, 0]);
  });
});

describe("depthAt", () => {
  const map: DepthMap = {
    data: new Float32Array([0, 1, 0, 1]), // 2×2: left column 0, right column 1
    width: 2,
    height: 2,
  };

  it("samples corners exactly and interpolates between", () => {
    expect(depthAt(map, 0, 0)).toBe(0);
    expect(depthAt(map, 1, 0)).toBe(1);
    expect(depthAt(map, 0.5, 0.5)).toBeCloseTo(0.5);
  });

  it("clamps out-of-range coordinates", () => {
    expect(depthAt(map, -1, 0)).toBe(0);
    expect(depthAt(map, 2, 2)).toBe(1);
  });
});

describe("blendWeights", () => {
  const radii = [0, 2, 5, 10];

  it("stays on the sharp level at radius 0", () => {
    expect(blendWeights(0, radii)).toEqual({ lo: 0, hi: 0, t: 0 });
  });

  it("clamps to the last level beyond the max radius", () => {
    expect(blendWeights(50, radii)).toEqual({ lo: 3, hi: 3, t: 0 });
  });

  it("brackets and interpolates in between", () => {
    const w = blendWeights(3.5, radii);
    expect(w.lo).toBe(1);
    expect(w.hi).toBe(2);
    expect(w.t).toBeCloseTo(0.5);
  });

  it("lands exactly on an interior level", () => {
    const w = blendWeights(5, radii);
    expect(w.hi).toBe(2);
    expect(w.t).toBeCloseTo(1 - (radii[2] - 5) / 3, 5);
  });
});
