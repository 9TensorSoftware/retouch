import type { CropRect, CropShape } from "../src/types";
import {
  applyCropShapes,
  areaOf,
  blurAlpha,
  boundsOf,
  containsPoint,
  featherPixels,
  flipShapeX,
  flipShapeY,
  frameOutline,
  reframeShape,
  rotateShapeCCW,
  rotateShapeCW,
  shapeOutline,
  shapeTouchesFrame,
} from "../src/utils/crop-shape";
import { flipCropX, flipCropY, rotateCropCCW, rotateCropCW } from "../src/utils/transform";

const BOX: CropRect = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 };

const shape = (points: number[], extra: Partial<CropShape> = {}): CropShape => ({
  points,
  feather: 0,
  invert: false,
  ...extra,
});

/** A rectangle's corners as an outline. */
const corners = (r: CropRect): number[] => [
  r.x,
  r.y,
  r.x + r.width,
  r.y,
  r.x + r.width,
  r.y + r.height,
  r.x,
  r.y + r.height,
];

function expectRect(actual: CropRect, expected: CropRect): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

describe("framed shapes", () => {
  it("fills the frame with each figure", () => {
    for (const mode of ["ellipse", "circle", "star", "heart", "hexagon", "triangle"] as const) {
      expectRect(boundsOf(frameOutline(mode, BOX, 1.5)), BOX);
    }
  });

  it("puts every ellipse point on the curve", () => {
    const points = frameOutline("ellipse", BOX, 1.5);
    const cx = BOX.x + BOX.width / 2;
    const cy = BOX.y + BOX.height / 2;
    for (let i = 0; i < points.length; i += 2) {
      const u = (points[i] - cx) / (BOX.width / 2);
      const v = (points[i + 1] - cy) / (BOX.height / 2);
      expect(u * u + v * v).toBeCloseTo(1, 6);
    }
  });

  it("leaves a rectangle its four corners until it's rounded", () => {
    expect(frameOutline("rect", BOX, 1.5)).toEqual(corners(BOX));
    expect(frameOutline("rect", BOX, 1.5, 40).length).toBeGreaterThan(8);
  });

  it("rounds corners round on screen, however the frame stretches them", () => {
    // A frame twice as wide as tall: normalized x counts double in pixels.
    const aspect = 2;
    const box = { x: 0, y: 0, width: 1, height: 1 };
    const points = frameOutline("rect", box, aspect, 100);
    const r = 0.5; // half the short side (the height), in frame-height units
    // The first corner's arc, top right, around (aspect - r, r) in pixel units.
    for (let i = 0; i <= 32; i++) {
      const px = points[i * 2] * aspect;
      const py = points[i * 2 + 1];
      expect(Math.hypot(px - (aspect - r), py - r)).toBeCloseTo(r, 6);
    }
  });
});

describe("outlines", () => {
  it("curves a smooth outline through the midpoints of its sides", () => {
    const square = [0, 0, 1, 0, 1, 1, 0, 1];
    expect(shapeOutline({ points: square })).toBe(square);
    const smooth = shapeOutline({ points: square, smooth: true });
    expect(smooth.length).toBeGreaterThan(square.length);
    // It starts each stretch on a side's midpoint and never leaves the square.
    expect(smooth.slice(0, 2)).toEqual([0, 0.5]);
    const b = boundsOf(smooth);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(1);
  });

  it("measures area and tells inside from out", () => {
    const square = corners({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(areaOf(square)).toBeCloseTo(0.25, 9);
    expect(containsPoint(square, 0.5, 0.5)).toBe(true);
    expect(containsPoint(square, 0.1, 0.5)).toBe(false);
  });
});

describe("moving a shape with its frame", () => {
  it("restates it over a part of the frame", () => {
    const moved = reframeShape(shape([0.25, 0.25, 0.75, 0.25, 0.5, 0.75]), {
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });
    expect(moved.points).toEqual([0, 0, 1, 0, 0.5, 1]);
  });

  it("turns and mirrors as the crop does", () => {
    const s = shape(corners(BOX));
    expectRect(boundsOf(rotateShapeCW(s).points), rotateCropCW(BOX));
    expectRect(boundsOf(rotateShapeCCW(s).points), rotateCropCCW(BOX));
    expectRect(boundsOf(flipShapeX(s).points), flipCropX(BOX));
    expectRect(boundsOf(flipShapeY(s).points), flipCropY(BOX));
  });

  it("drops a punched-out shape once it's wholly off the frame", () => {
    const off = [1.2, 0.2, 1.5, 0.2, 1.4, 0.6];
    expect(shapeTouchesFrame(shape(off, { invert: true }))).toBe(false);
    expect(shapeTouchesFrame(shape(off, { invert: false }))).toBe(true);
    expect(shapeTouchesFrame(shape(corners(BOX), { invert: true }))).toBe(true);
  });
});

describe("soft edges", () => {
  it("sizes the soft edge by the shape: a quarter of its short side at most", () => {
    const full = shape(corners({ x: 0, y: 0, width: 1, height: 1 }), { feather: 100 });
    expect(featherPixels(full, 400, 300)).toBeCloseTo(75, 9);
    expect(featherPixels({ ...full, feather: 50 }, 400, 300)).toBeCloseTo(37.5, 9);
    expect(featherPixels({ ...full, feather: 0 }, 400, 300)).toBe(0);
  });

  it("blurs an edge into a ramp, and leaves solid alpha solid out to the edges", () => {
    const width = 40;
    const data = new Uint8ClampedArray(width * 4);
    for (let x = 0; x < width; x++) data[x * 4 + 3] = x < 20 ? 255 : 0;
    blurAlpha(data, width, 1, 3);
    const alpha = Array.from({ length: width }, (_, x) => data[x * 4 + 3]);
    expect(alpha[0]).toBe(255);
    expect(alpha[width - 1]).toBe(0);
    for (let x = 1; x < width; x++) expect(alpha[x]).toBeLessThanOrEqual(alpha[x - 1]);
    expect(alpha[19]).toBeGreaterThan(100);
    expect(alpha[19]).toBeLessThan(200);

    const solid = new Uint8ClampedArray(8 * 8 * 4).fill(255);
    blurAlpha(solid, 8, 8, 2);
    expect(solid.every((v) => v === 255)).toBe(true);
  });
});

describe("cutting shapes from the frame", () => {
  function recordingContext() {
    const ops: string[] = [];
    const ctx = {
      save: () => {},
      restore: () => {},
      setTransform: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => ops.push("fill"),
      drawImage: () => ops.push("drawImage"),
      set globalCompositeOperation(value: string) {
        ops.push(value);
      },
      set fillStyle(_: string) {},
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
  }
  const tri = [0.5, 0, 1, 1, 0, 1];

  it("keeps the inside, or punches it out, with a hard edge", () => {
    const { ctx, ops } = recordingContext();
    applyCropShapes(ctx, 400, 300, [shape(tri), shape(tri, { invert: true })]);
    expect(ops).toEqual(["destination-in", "fill", "destination-out", "fill"]);
  });

  it("lays a soft edge on as a mask", () => {
    const { ctx, ops } = recordingContext();
    applyCropShapes(ctx, 400, 300, [shape(tri, { feather: 40 })]);
    expect(ops).toEqual(["destination-in", "drawImage"]);
  });

  it("skips an outline of fewer than three points", () => {
    const { ctx, ops } = recordingContext();
    applyCropShapes(ctx, 400, 300, [shape([0, 0, 1, 1])]);
    expect(ops).toEqual([]);
  });
});
