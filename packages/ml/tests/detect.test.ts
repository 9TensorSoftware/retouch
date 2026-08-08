import { describe, expect, it } from "vitest";
import {
  buildYoloxGrid,
  COCO_CLASSES,
  type Detection,
  decodeUltraFace,
  decodeYolox,
  iou,
  nms,
  nmsByClass,
  rgbaToUltraFaceTensor,
  rgbaToYoloxTensor,
} from "../src/detect";

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

describe("buildYoloxGrid", () => {
  it("covers 52\u00b2 + 26\u00b2 + 13\u00b2 anchors in stride order", () => {
    const grid = buildYoloxGrid();
    expect(grid.stride.length).toBe(52 * 52 + 26 * 26 + 13 * 13);
    expect(grid.stride[0]).toBe(8);
    expect(grid.stride[52 * 52]).toBe(16);
    expect(grid.stride[52 * 52 + 26 * 26]).toBe(32);
    // Row-major within a level: anchor 1 is (1,0), anchor 52 is (0,1)
    expect(grid.gridX[1]).toBe(1);
    expect(grid.gridY[1]).toBe(0);
    expect(grid.gridX[52]).toBe(0);
    expect(grid.gridY[52]).toBe(1);
  });
});

describe("rgbaToYoloxTensor", () => {
  it("packs BGR planes with raw 0\u2013255 values", () => {
    const chw = rgbaToYoloxTensor(new Uint8ClampedArray([10, 20, 30, 255]), 1);
    expect(chw[0]).toBe(30); // B first
    expect(chw[1]).toBe(20);
    expect(chw[2]).toBe(10); // R last
  });
});

describe("decodeYolox", () => {
  const grid = buildYoloxGrid();

  const outputWith = (anchor: number, values: Partial<Record<number, number>>): Float32Array => {
    const out = new Float32Array(grid.stride.length * 85);
    for (const [k, v] of Object.entries(values)) out[anchor * 85 + Number(k)] = v as number;
    return out;
  };

  it("decodes xy/wh through grid and stride into normalized source boxes", () => {
    // Anchor 0: stride 8, grid (0,0). Pred: cx=0.5\u21924px, wh=exp(0)*8=8px.
    // ratio 416/416 = 1 on a 416\u00d7416 source.
    const out = outputWith(0, { 0: 0.5, 1: 0.5, 2: 0, 3: 0, 4: 0.9, 5: 0.9 });
    const dets = decodeYolox(out, grid, 1, 416, 416, 0.5);
    expect(dets).toHaveLength(1);
    expect(dets[0].label).toBe("person");
    expect(dets[0].score).toBeCloseTo(0.81, 3);
    expect(dets[0].x * 416).toBeCloseTo(0, 3); // 4 - 4 = 0
    expect(dets[0].w * 416).toBeCloseTo(8, 3);
  });

  it("drops anchors below the threshold via the exact objectness skip", () => {
    const out = outputWith(0, { 4: 0.4, 5: 1 }); // score 0.4 < 0.5
    expect(decodeYolox(out, grid, 1, 416, 416, 0.5)).toHaveLength(0);
  });

  it("labels the argmax class", () => {
    const out = outputWith(0, { 4: 1, 5: 0.2, 20: 0.9 }); // 5+15 → class 15 = cat
    const dets = decodeYolox(out, grid, 1, 416, 416, 0.5);
    expect(dets[0].label).toBe(COCO_CLASSES[15]);
    expect(COCO_CLASSES[15]).toBe("cat");
  });

  it("unletterboxes through the ratio", () => {
    // 832\u00d7832 source \u2192 ratio 0.5; anchor at stride 32 level center
    const anchor = 52 * 52 + 26 * 26; // first stride-32 anchor, grid (0,0)
    const out = outputWith(anchor, { 0: 1, 1: 1, 2: 0, 3: 0, 4: 1, 5: 1 });
    const dets = decodeYolox(out, grid, 0.5, 832, 832, 0.5);
    // cx = (1+0)*32 = 32 \u2192 /0.5 = 64px source; w = 32/0.5 = 64px
    expect(dets[0].x * 832).toBeCloseTo(32, 2);
    expect(dets[0].w * 832).toBeCloseTo(64, 2);
  });
});

describe("nmsByClass", () => {
  it("suppresses within a class but never across classes", () => {
    const a: Detection = { x: 0.1, y: 0.1, w: 0.2, h: 0.2, score: 0.9, label: "cat" };
    const b: Detection = { x: 0.11, y: 0.11, w: 0.2, h: 0.2, score: 0.8, label: "cat" };
    const c: Detection = { x: 0.1, y: 0.1, w: 0.2, h: 0.2, score: 0.7, label: "dog" };
    const kept = nmsByClass([a, b, c], 0.35);
    expect(kept).toHaveLength(2);
    expect(kept.map((k) => k.label).sort()).toEqual(["cat", "dog"]);
  });
});
