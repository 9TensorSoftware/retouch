import { describe, expect, it } from "vitest";
import { type Detection, decodeUltraFace, iou, nms, rgbaToUltraFaceTensor } from "../src/detect";

const box = (x: number, y: number, w: number, h: number, score = 1): Detection => ({
  x,
  y,
  w,
  h,
  score,
});

describe("iou", () => {
  it("is 1 for identical boxes and 0 for disjoint ones", () => {
    expect(iou(box(0.1, 0.1, 0.2, 0.2), box(0.1, 0.1, 0.2, 0.2))).toBeCloseTo(1);
    expect(iou(box(0, 0, 0.1, 0.1), box(0.5, 0.5, 0.1, 0.1))).toBe(0);
  });

  it("computes partial overlap", () => {
    // Two unit-quarter boxes sharing half their area
    const a = box(0, 0, 0.2, 0.2);
    const b = box(0.1, 0, 0.2, 0.2);
    // inter = 0.1*0.2 = 0.02, union = 0.04+0.04-0.02 = 0.06
    expect(iou(a, b)).toBeCloseTo(0.02 / 0.06);
  });
});

describe("nms", () => {
  it("keeps the highest-scoring of overlapping boxes", () => {
    const kept = nms(
      [box(0.1, 0.1, 0.2, 0.2, 0.8), box(0.11, 0.11, 0.2, 0.2, 0.9), box(0.6, 0.6, 0.2, 0.2, 0.7)],
      0.35,
    );
    expect(kept).toHaveLength(2);
    expect(kept[0].score).toBe(0.9);
    expect(kept.some((k) => k.x === 0.6)).toBe(true);
  });

  it("keeps everything when nothing overlaps", () => {
    const dets = [box(0, 0, 0.1, 0.1, 0.9), box(0.5, 0.5, 0.1, 0.1, 0.8)];
    expect(nms(dets, 0.35)).toHaveLength(2);
  });
});

describe("decodeUltraFace", () => {
  it("thresholds on the face-class probability and clamps boxes", () => {
    // Two candidates: [bg, face] scores; boxes as x1,y1,x2,y2
    const scores = new Float32Array([0.9, 0.1, 0.2, 0.8]);
    const boxes = new Float32Array([0.1, 0.1, 0.3, 0.3, -0.05, 0.2, 0.4, 1.2]);
    const out = decodeUltraFace(scores, boxes, 2, 0.7);
    expect(out).toHaveLength(1);
    expect(out[0].score).toBeCloseTo(0.8);
    expect(out[0].x).toBe(0);
    expect(out[0].y).toBeCloseTo(0.2);
    expect(out[0].w).toBeCloseTo(0.4);
    expect(out[0].h).toBeCloseTo(0.8);
  });

  it("drops degenerate boxes", () => {
    const scores = new Float32Array([0.1, 0.9]);
    const boxes = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    expect(decodeUltraFace(scores, boxes, 1, 0.5)).toHaveLength(0);
  });
});

describe("rgbaToUltraFaceTensor", () => {
  it("normalizes (v−127)/128 in planar order", () => {
    const chw = rgbaToUltraFaceTensor(new Uint8ClampedArray([255, 127, 0, 255]), 1);
    expect(chw[0]).toBeCloseTo(1);
    expect(chw[1]).toBeCloseTo(0);
    expect(chw[2]).toBeCloseTo(-127 / 128);
  });
});
