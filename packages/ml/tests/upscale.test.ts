import { describe, expect, it } from "vitest";
import { computeTileGrid } from "../src/tiles";
import { chw01ToRgba, rgbaToChw01 } from "../src/upscale";

describe("computeTileGrid", () => {
  it("uses a single full tile for images at or below the tile size", () => {
    const tiles = computeTileGrid(100, 80, 128, 8);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toEqual({
      sx: 0,
      sy: 0,
      sw: 100,
      sh: 80,
      keepX: 0,
      keepY: 0,
      keepW: 100,
      keepH: 80,
      dx: 0,
      dy: 0,
    });
  });

  it("partitions cores exactly — no gaps, no double-writes", () => {
    const width = 300;
    const height = 260;
    const tiles = computeTileGrid(width, height, 128, 8);
    const covered = new Uint8Array(width * height);
    for (const t of tiles) {
      for (let y = t.dy; y < t.dy + t.keepH; y++) {
        for (let x = t.dx; x < t.dx + t.keepW; x++) {
          covered[y * width + x]++;
        }
      }
    }
    expect(covered.every((v) => v === 1)).toBe(true);
  });

  it("keeps every read rect inside the image", () => {
    for (const t of computeTileGrid(300, 260, 128, 8)) {
      expect(t.sx).toBeGreaterThanOrEqual(0);
      expect(t.sy).toBeGreaterThanOrEqual(0);
      expect(t.sx + t.sw).toBeLessThanOrEqual(300);
      expect(t.sy + t.sh).toBeLessThanOrEqual(260);
      expect(t.keepX + t.keepW).toBeLessThanOrEqual(t.sw);
      expect(t.keepY + t.keepH).toBeLessThanOrEqual(t.sh);
    }
  });

  it("pads interior tiles with overlap on all sides", () => {
    const tiles = computeTileGrid(400, 400, 128, 8);
    // Tile whose core starts at (128, 128) is interior on top/left
    const interior = tiles.find((t) => t.dx === 128 && t.dy === 128);
    expect(interior).toBeDefined();
    expect(interior?.sx).toBe(120);
    expect(interior?.sy).toBe(120);
    expect(interior?.keepX).toBe(8);
    expect(interior?.keepY).toBe(8);
    expect(interior?.sw).toBe(128 + 16);
  });

  it("returns nothing for empty images", () => {
    expect(computeTileGrid(0, 100)).toHaveLength(0);
  });

  it("sanitizes negative overlap to zero instead of leaving unpainted stripes", () => {
    const negative = computeTileGrid(300, 260, 64, -8);
    expect(negative).toEqual(computeTileGrid(300, 260, 64, 0));
    // Partition still exact
    const covered = new Uint8Array(300 * 260);
    for (const t of negative) {
      expect(t.keepX).toBeGreaterThanOrEqual(0);
      expect(t.keepY).toBeGreaterThanOrEqual(0);
      for (let y = t.dy; y < t.dy + t.keepH; y++) {
        for (let x = t.dx; x < t.dx + t.keepW; x++) covered[y * 300 + x]++;
      }
    }
    expect(covered.every((v) => v === 1)).toBe(true);
  });

  it("floors fractional tile size and overlap", () => {
    expect(computeTileGrid(300, 260, 64.7, 8.9)).toEqual(computeTileGrid(300, 260, 64, 8));
  });
});

describe("rgbaToChw01 / chw01ToRgba", () => {
  it("round-trips RGB values through the 0–1 planar layout", () => {
    const rgba = new Uint8ClampedArray([255, 128, 0, 255, 0, 64, 255, 255]);
    const chw = rgbaToChw01(rgba, 2);
    expect(chw[0]).toBeCloseTo(1); // R plane
    expect(chw[1]).toBeCloseTo(0);
    expect(chw[2]).toBeCloseTo(128 / 255); // G plane
    expect(chw[4]).toBeCloseTo(0); // B plane
    expect(chw[5]).toBeCloseTo(1);
    const back = chw01ToRgba(chw, 2);
    expect(Array.from(back)).toEqual([255, 128, 0, 255, 0, 64, 255, 255]);
  });

  it("clamps model output that drifts outside 0–1", () => {
    const rgba = chw01ToRgba(new Float32Array([1.4, -0.3, 0.5, 0.5, 0.5, 0.5]), 2);
    expect(rgba[0]).toBe(255);
    expect(rgba[4]).toBe(0);
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(255);
  });
});
