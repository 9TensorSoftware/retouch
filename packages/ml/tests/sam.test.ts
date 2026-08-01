import { describe, expect, it } from "vitest";
import {
  maskLogitsToGray,
  pickBestMask,
  pointsToSamTensors,
  rgbaToSamTensor,
  SAM_SIZE,
  samResizedSize,
} from "../src/sam";

describe("samResizedSize", () => {
  it("caps the long edge at 1024 keeping aspect", () => {
    expect(samResizedSize(900, 600)).toEqual({ width: 1024, height: 683 });
    expect(samResizedSize(600, 900)).toEqual({ width: 683, height: 1024 });
    expect(samResizedSize(2048, 2048)).toEqual({ width: 1024, height: 1024 });
  });

  it("upscales small images to the working size and floors at 1", () => {
    expect(samResizedSize(512, 256)).toEqual({ width: 1024, height: 512 });
    expect(samResizedSize(2000, 1).height).toBe(1);
  });
});

describe("rgbaToSamTensor", () => {
  it("normalizes with ImageNet stats in planar order", () => {
    // One white pixel at (0,0) of a 1×1 "resized" image
    const chw = rgbaToSamTensor(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1);
    const plane = SAM_SIZE * SAM_SIZE;
    expect(chw[0]).toBeCloseTo((1 - 0.485) / 0.229, 4);
    expect(chw[plane]).toBeCloseTo((1 - 0.456) / 0.224, 4);
    expect(chw[plane * 2]).toBeCloseTo((1 - 0.406) / 0.225, 4);
  });

  it("keeps padding at exactly zero, bottom and right", () => {
    // 2×1 gray image: pixels land at row 0, columns 0..1; everything else 0
    const chw = rgbaToSamTensor(
      new Uint8ClampedArray([128, 128, 128, 255, 128, 128, 128, 255]),
      2,
      1,
    );
    expect(chw[0]).not.toBe(0);
    expect(chw[1]).not.toBe(0);
    expect(chw[2]).toBe(0); // right padding on row 0
    expect(chw[SAM_SIZE]).toBe(0); // row 1 = bottom padding
    expect(chw[SAM_SIZE * SAM_SIZE - 1]).toBe(0);
  });
});

describe("pointsToSamTensors", () => {
  it("scales normalized clicks into the 1024-resized space", () => {
    // 900×600 source: scale = 1024/900
    const { coords, labels } = pointsToSamTensors(
      [
        { x: 0.5, y: 0.5, label: 1 },
        { x: 1, y: 0, label: 0 },
      ],
      900,
      600,
    );
    const scale = SAM_SIZE / 900;
    expect(coords[0]).toBeCloseTo(450 * scale, 3);
    expect(coords[1]).toBeCloseTo(300 * scale, 3);
    expect(coords[2]).toBeCloseTo(900 * scale, 3);
    expect(coords[3]).toBeCloseTo(0, 3);
    expect(labels).toBeInstanceOf(BigInt64Array);
    expect(labels[0]).toBe(1n);
    expect(labels[1]).toBe(0n);
  });
});

describe("pickBestMask", () => {
  it("selects the slice matching the argmax score", () => {
    const masks = new Float32Array([1, 1, 2, 2, 3, 3]); // 3 masks × 2 px
    const { mask, score } = pickBestMask(new Float32Array([0.2, 0.9, 0.5]), masks, 2);
    expect(score).toBeCloseTo(0.9);
    expect(Array.from(mask)).toEqual([2, 2]);
  });
});

describe("maskLogitsToGray", () => {
  it("maps logits through a sigmoid to opaque gray", () => {
    const rgba = maskLogitsToGray(new Float32Array([0, 10, -10]));
    expect(rgba[0]).toBeGreaterThanOrEqual(127);
    expect(rgba[0]).toBeLessThanOrEqual(128);
    expect(rgba[4]).toBe(255);
    expect(rgba[8]).toBe(0);
    expect(rgba[3]).toBe(255);
  });

  it("is monotone in the logit", () => {
    const rgba = maskLogitsToGray(new Float32Array([-2, -1, 0, 1, 2]));
    const grays = [rgba[0], rgba[4], rgba[8], rgba[12], rgba[16]];
    for (let i = 1; i < grays.length; i++) {
      expect(grays[i]).toBeGreaterThan(grays[i - 1]);
    }
  });
});
