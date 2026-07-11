import { describe, expect, it } from "vitest";
import { carveWidthSync } from "../src/utils/seam";

/** Build a solid-color RGBA buffer. */
function solid(width: number, height: number, rgb: [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return data;
}

describe("carveWidthSync", () => {
  it("is an identity when the target equals the current width", () => {
    const data = solid(8, 6, [120, 60, 200]);
    const result = carveWidthSync(data, 8, 6, 8);
    expect(result.width).toBe(8);
    expect(result.height).toBe(6);
    expect(Array.from(result.data)).toEqual(Array.from(data));
  });

  it("removes one seam per step down to the target width", () => {
    const data = solid(10, 5, [50, 50, 50]);
    const result = carveWidthSync(data, 10, 5, 6);
    expect(result.width).toBe(6);
    expect(result.height).toBe(5);
    expect(result.data.length).toBe(6 * 5 * 4);
  });

  it("clamps the target to a sane minimum", () => {
    const data = solid(6, 4, [10, 10, 10]);
    const result = carveWidthSync(data, 6, 4, -3);
    expect(result.width).toBe(2);
    expect(result.data.length).toBe(2 * 4 * 4);
  });

  it("removes low-energy flat regions before a high-contrast stripe", () => {
    // Flat gray image with one bright vertical stripe at x=10 (high gradient
    // energy on its flanks). Carving 8 seams must leave the stripe intact.
    const width = 24;
    const height = 12;
    const data = solid(width, height, [100, 100, 100]);
    for (let y = 0; y < height; y++) {
      const i = (y * width + 10) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
    }

    const result = carveWidthSync(data, width, height, width - 8);
    expect(result.width).toBe(16);

    // Every row still contains exactly one bright pixel.
    for (let y = 0; y < height; y++) {
      let bright = 0;
      for (let x = 0; x < result.width; x++) {
        if (result.data[(y * result.width + x) * 4] > 200) bright++;
      }
      expect(bright).toBe(1);
    }
  });

  it("keeps seams vertically connected (removes a contiguous path)", () => {
    // A gradient image: energy is uniform, so any seam works — but each
    // carve must remove exactly one pixel per row.
    const width = 9;
    const height = 7;
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
    const result = carveWidthSync(data, width, height, width - 1);
    expect(result.width).toBe(width - 1);
    // Rows remain monotonically non-decreasing after removing one pixel each.
    for (let y = 0; y < height; y++) {
      for (let x = 1; x < result.width; x++) {
        const cur = result.data[(y * result.width + x) * 4];
        const prev = result.data[(y * result.width + x - 1) * 4];
        expect(cur).toBeGreaterThanOrEqual(prev);
      }
    }
  });
});
