import { describe, expect, it } from "vitest";
import type { WarpField } from "../src/types";
import {
  applyBrushStroke,
  createWarpField,
  liquifyIsNeutral,
  remapLiquifyData,
  sampleField,
} from "../src/utils/liquify";

describe("createWarpField / liquifyIsNeutral", () => {
  it("creates a zeroed grid that reads as neutral", () => {
    const field = createWarpField(5, 4);
    expect(field.cols).toBe(5);
    expect(field.rows).toBe(4);
    expect(field.dx).toHaveLength(20);
    expect(liquifyIsNeutral(field)).toBe(true);
    expect(liquifyIsNeutral(null)).toBe(true);
    expect(liquifyIsNeutral(undefined)).toBe(true);
  });

  it("reads as non-neutral once a stroke lands", () => {
    const field = createWarpField();
    applyBrushStroke(field, 0.5, 0.5, 0.1, 0, 0.3, 100);
    expect(liquifyIsNeutral(field)).toBe(false);
  });
});

describe("applyBrushStroke", () => {
  it("pushes nodes under the brush and leaves distant nodes untouched", () => {
    const field = createWarpField(11, 11);
    applyBrushStroke(field, 0.5, 0.5, 0.1, 0, 0.2, 100);
    const center = 5 * 11 + 5;
    const corner = 0;
    expect(field.dx[center]).toBeGreaterThan(0);
    expect(field.dx[corner]).toBe(0);
    // Vertical movement was zero — dy stays zero everywhere.
    expect(field.dy.every((v) => v === 0)).toBe(true);
  });

  it("falls off toward the brush edge", () => {
    const field = createWarpField(11, 11);
    applyBrushStroke(field, 0.5, 0.5, 0.1, 0, 0.35, 100);
    const center = field.dx[5 * 11 + 5];
    const offCenter = field.dx[5 * 11 + 7];
    expect(center).toBeGreaterThan(offCenter);
    expect(offCenter).toBeGreaterThan(0);
  });

  it("clamps accumulated displacement", () => {
    const field = createWarpField(5, 5);
    for (let i = 0; i < 50; i++) {
      applyBrushStroke(field, 0.5, 0.5, 0.2, 0.2, 0.5, 100);
    }
    for (const v of [...field.dx, ...field.dy]) {
      expect(Math.abs(v)).toBeLessThanOrEqual(0.25);
    }
  });
});

describe("sampleField", () => {
  it("interpolates between grid nodes", () => {
    const field: WarpField = {
      cols: 2,
      rows: 2,
      dx: [0, 0.2, 0, 0.2],
      dy: [0, 0, 0.1, 0.1],
    };
    expect(sampleField(field, 0, 0)).toEqual([0, 0]);
    expect(sampleField(field, 1, 1)[0]).toBeCloseTo(0.2);
    const [dx, dy] = sampleField(field, 0.5, 0.5);
    expect(dx).toBeCloseTo(0.1);
    expect(dy).toBeCloseTo(0.05);
  });
});

describe("remapLiquifyData", () => {
  function gradient(width: number, height: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const v = Math.round((x / (width - 1)) * 255);
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
    }
    return data;
  }

  it("is an identity for a neutral field", () => {
    const width = 8;
    const height = 6;
    const src = gradient(width, height);
    const out = remapLiquifyData(src, width, height, createWarpField(5, 5));
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it("shifts pixels along a uniform push", () => {
    const width = 21;
    const height = 5;
    const src = gradient(width, height);
    // Uniform push right by 25% of the width: output shows the source from
    // 25% further left, so values at the center drop.
    const field: WarpField = {
      cols: 2,
      rows: 2,
      dx: [0.25, 0.25, 0.25, 0.25],
      dy: [0, 0, 0, 0],
    };
    const out = remapLiquifyData(src, width, height, field);
    const mid = (2 * width + 10) * 4;
    // sx = 10 − 0.25·21 = 4.75 → bilinear between x=4 and x=5
    const sx = 10 - 0.25 * width;
    const x0 = Math.floor(sx);
    const fx = sx - x0;
    const expected = src[(2 * width + x0) * 4] * (1 - fx) + src[(2 * width + x0 + 1) * 4] * fx;
    expect(Math.abs(out[mid] - expected)).toBeLessThanOrEqual(1);
  });

  it("clamps samples at the frame edge instead of tearing", () => {
    const width = 10;
    const height = 4;
    const src = gradient(width, height);
    const field: WarpField = {
      cols: 2,
      rows: 2,
      dx: [0.5, 0.5, 0.5, 0.5],
      dy: [0, 0, 0, 0],
    };
    const out = remapLiquifyData(src, width, height, field);
    // Every output pixel stays opaque — no transparent holes.
    for (let i = 3; i < out.length; i += 4) {
      expect(out[i]).toBe(255);
    }
  });
});
