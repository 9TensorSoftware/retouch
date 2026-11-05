import { describe, expect, it } from "vitest";
import { DEFAULT_EDITS } from "../src/constants";
import type { ImageEdits } from "../src/types";
import { framingOf, outlineOf, toSource } from "../src/utils/framing";
import { rotateCropCCW, rotateCropCW } from "../src/utils/transform";

const edits = (changes: Partial<ImageEdits>): ImageEdits => ({
  ...structuredClone(DEFAULT_EDITS),
  ...changes,
});
const step = (changes: Partial<ImageEdits>, width = 2000, height = 1000) =>
  framingOf(edits(changes), width, height);

function expectPoints(actual: { x: number; y: number }[] | null, expected: number[][]): void {
  expect(actual).toHaveLength(expected.length);
  expected.forEach(([x, y], i) => {
    expect(actual?.[i].x).toBeCloseTo(x, 6);
    expect(actual?.[i].y).toBeCloseTo(y, 6);
  });
}

describe("outlineOf", () => {
  it("has nothing to show when the result is still the whole photo", () => {
    expect(outlineOf([step({})])).toBeNull();
    expect(outlineOf([step({ orientation: 90, flipH: true })])).toBeNull();
    expect(outlineOf([step({}), step({})])).toBeNull();
  });

  it("traces a crop clockwise from its top left", () => {
    const crop = { x: 0.25, y: 0.5, width: 0.5, height: 0.25 };
    expectPoints(outlineOf([step({ crop })]), [
      [0.25, 0.5],
      [0.75, 0.5],
      [0.75, 0.75],
      [0.25, 0.75],
    ]);
  });

  it("puts a crop of a turned photo back where it was on the unturned one", () => {
    // Cropping the top of a photo turned clockwise keeps the left of the original.
    const crop = { x: 0, y: 0, width: 1, height: 0.25 };
    expectPoints(outlineOf([step({ orientation: 90, crop })]), [
      [0, 1],
      [0, 0],
      [0.25, 0],
      [0.25, 1],
    ]);
    // ...and turned counter-clockwise, the right of it.
    expectPoints(outlineOf([step({ orientation: 270, crop })]), [
      [1, 0],
      [1, 1],
      [0.75, 1],
      [0.75, 0],
    ]);
    expectPoints(outlineOf([step({ orientation: 180, crop })]), [
      [1, 1],
      [0, 1],
      [0, 0.75],
      [1, 0.75],
    ]);
  });

  it("agrees with how a turn remaps a crop", () => {
    const crop = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
    const corners = (changes: Partial<ImageEdits>) => outlineOf([step(changes)]);
    const start = corners({ crop }) ?? [];
    // The same content, so the same box, starting from another of its corners.
    expectPoints(corners({ orientation: 90, crop: rotateCropCW(crop) }), [
      [start[3].x, start[3].y],
      [start[0].x, start[0].y],
      [start[1].x, start[1].y],
      [start[2].x, start[2].y],
    ]);
    expectPoints(corners({ orientation: 270, crop: rotateCropCCW(crop) }), [
      [start[1].x, start[1].y],
      [start[2].x, start[2].y],
      [start[3].x, start[3].y],
      [start[0].x, start[0].y],
    ]);
  });

  it("mirrors a crop of a flipped photo", () => {
    const crop = { x: 0, y: 0, width: 0.25, height: 1 };
    expectPoints(outlineOf([step({ flipH: true, crop })]), [
      [1, 0],
      [0.75, 0],
      [0.75, 1],
      [1, 1],
    ]);
    const top = { x: 0, y: 0, width: 1, height: 0.25 };
    expectPoints(outlineOf([step({ flipV: true, crop: top })]), [
      [0, 1],
      [1, 1],
      [1, 0.75],
      [0, 0.75],
    ]);
  });

  it("tilts against the straighten, inside the photo", () => {
    const outline = outlineOf([step({ rotation: 10 }, 1000, 1000)]) ?? [];
    expect(outline).toHaveLength(4);
    for (const { x, y } of outline) {
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(x).toBeLessThanOrEqual(1 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
    }
    // The picture turned clockwise, so the frame's top edge runs uphill on it.
    expect(outline[1].y).toBeLessThan(outline[0].y);
    expect(outline[3].x).toBeGreaterThan(outline[0].x);
    // Turning about its center leaves the center where it was.
    const middle = toSource({ x: 0.5, y: 0.5 }, step({ rotation: 10 }));
    expect(middle.x).toBeCloseTo(0.5, 6);
    expect(middle.y).toBeCloseTo(0.5, 6);
  });

  it("keeps a straightened frame's shape on a wide photo", () => {
    const framing = step({ rotation: 30 }, 2000, 1000);
    const [a, b] = outlineOf([framing]) ?? [];
    const [, , c] = outlineOf([framing]) ?? [];
    // In pixels, the corners still meet square.
    const ab = { x: (b.x - a.x) * 2000, y: (b.y - a.y) * 1000 };
    const bc = { x: (c.x - b.x) * 2000, y: (c.y - b.y) * 1000 };
    expect(ab.x * bc.x + ab.y * bc.y).toBeCloseTo(0, 4);
    expect(Math.hypot(ab.x, ab.y) / Math.hypot(bc.x, bc.y)).toBeCloseTo(2, 6);
  });

  it("undoes the keystone warp that made the result", () => {
    // Positive vertical keystone widens the top row, so the frame's top shows less of it.
    const outline = outlineOf([step({ keystoneV: 50 })]) ?? [];
    expect(outline).toHaveLength(32 * 4);
    expect(outline[0].x).toBeGreaterThan(0);
    expect(outline[0].y).toBeCloseTo(0, 6);
    // Below the middle the row shrank, so the frame reaches past the photo there.
    const bottomLeft = toSource({ x: 0, y: 1 }, step({ keystoneV: 50 }));
    expect(bottomLeft.x).toBeLessThan(0);
  });

  it("bends the edge for a lens correction, sampling where the remap does", () => {
    const framing = step({ lensDistortion: 40 });
    const corner = toSource({ x: 0, y: 0 }, framing);
    // r = 1 at the corners: 1 + 0.4 * 0.35.
    expect(corner.x).toBeCloseTo(0.5 - 0.5 * 1.14, 6);
    expect(corner.y).toBeCloseTo(0.5 - 0.5 * 1.14, 6);
    // The middle of the top edge moves by less, so the edge isn't straight.
    const top = toSource({ x: 0.5, y: 0 }, framing);
    expect(top.x).toBeCloseTo(0.5, 6);
    expect(top.y).toBeGreaterThan(corner.y);
  });

  it("follows a crop through an earlier bake", () => {
    const baked = step({ crop: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 } });
    const now = step({ crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }, 1000, 500);
    expectPoints(outlineOf([baked, now]), [
      [0.5, 0.5],
      [0.75, 0.5],
      [0.75, 0.75],
      [0.5, 0.75],
    ]);
  });

  it("follows a crop through an earlier turn", () => {
    const baked = step({ orientation: 90 });
    const now = step({ crop: { x: 0, y: 0, width: 1, height: 0.25 } }, 1000, 2000);
    expectPoints(outlineOf([baked, now]), [
      [0, 1],
      [0, 0],
      [0.25, 0],
      [0.25, 1],
    ]);
  });

  it("counts a narrowed source when it straightens", () => {
    expect(step({ seamWidth: 50 }, 2000, 1000).width).toBe(1000);
  });
});
