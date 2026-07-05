import { createDefaultVideoEdits } from "../src/constants";
import { createFramePipeline } from "../src/export/frame-pipeline";
import type { CropRect } from "../src/types";
import {
  flipCropX,
  flipCropY,
  orientedDims,
  rotateCropCCW,
  rotateCropCW,
  rotateOrientation,
} from "../src/utils/transform";

const CROP: CropRect = { x: 0.1, y: 0.2, width: 0.5, height: 0.25 };

describe("orientation math", () => {
  it("swaps dimensions for quarter turns", () => {
    expect(orientedDims(640, 360, 0)).toEqual({ width: 640, height: 360 });
    expect(orientedDims(640, 360, 90)).toEqual({ width: 360, height: 640 });
    expect(orientedDims(640, 360, 180)).toEqual({ width: 640, height: 360 });
    expect(orientedDims(640, 360, 270)).toEqual({ width: 360, height: 640 });
  });

  it("steps orientation in both directions with wraparound", () => {
    expect(rotateOrientation(0, 1)).toBe(90);
    expect(rotateOrientation(270, 1)).toBe(0);
    expect(rotateOrientation(0, -1)).toBe(270);
    expect(rotateOrientation(180, -1)).toBe(90);
  });
});

describe("crop remapping", () => {
  it("rotating CW then CCW round-trips", () => {
    const there = rotateCropCW(CROP);
    const back = rotateCropCCW(there);
    expect(back.x).toBeCloseTo(CROP.x);
    expect(back.y).toBeCloseTo(CROP.y);
    expect(back.width).toBeCloseTo(CROP.width);
    expect(back.height).toBeCloseTo(CROP.height);
  });

  it("four CW rotations are the identity", () => {
    let crop = { ...CROP };
    for (let i = 0; i < 4; i++) crop = rotateCropCW(crop);
    expect(crop.x).toBeCloseTo(CROP.x);
    expect(crop.y).toBeCloseTo(CROP.y);
  });

  it("CW rotation maps the expected corner", () => {
    // A crop hugging the top-left lands hugging the top-right after CW.
    const topLeft: CropRect = { x: 0, y: 0, width: 0.3, height: 0.2 };
    const rotated = rotateCropCW(topLeft);
    expect(rotated).toEqual({ x: 0.8, y: 0, width: 0.2, height: 0.3 });
  });

  it("flips are involutions and swap the expected axis", () => {
    expect(flipCropX(flipCropX(CROP)).x).toBeCloseTo(CROP.x);
    expect(flipCropY(flipCropY(CROP)).y).toBeCloseTo(CROP.y);
    expect(flipCropX(CROP).x).toBeCloseTo(1 - CROP.x - CROP.width);
    expect(flipCropX(CROP).y).toBe(CROP.y);
    expect(flipCropY(CROP).y).toBeCloseTo(1 - CROP.y - CROP.height);
  });
});

describe("frame pipeline with orientation", () => {
  it("swaps output dimensions for 90° orientation", () => {
    const edits = createDefaultVideoEdits(5);
    edits.orientation = 90;
    const p = createFramePipeline(edits, 640, 360);
    expect(p.outWidth).toBe(360);
    expect(p.outHeight).toBe(640);
    expect(p.isIdentity).toBe(false);
    p.dispose();
  });

  it("flips break the identity fast path", () => {
    const edits = createDefaultVideoEdits(5);
    edits.flipH = true;
    const p = createFramePipeline(edits, 640, 360);
    expect(p.isIdentity).toBe(false);
    p.dispose();
  });

  it("stays identity when untransformed and neutral", () => {
    const p = createFramePipeline(createDefaultVideoEdits(5), 640, 360);
    expect(p.isIdentity).toBe(true);
    p.dispose();
  });
});
