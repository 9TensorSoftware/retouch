import { describe, expect, it } from "vitest";
import { DEFAULT_EDITS } from "../src/constants";
import type { ImageEdits } from "../src/types";
import { imageEditsAreNeutral } from "../src/utils/edits";

const neutral = (): ImageEdits => structuredClone(DEFAULT_EDITS);

describe("imageEditsAreNeutral", () => {
  it("is true for the defaults", () => {
    expect(imageEditsAreNeutral(neutral())).toBe(true);
  });

  const cases: Array<[string, (e: ImageEdits) => void]> = [
    [
      "adjustment",
      (e) => {
        e.adjustments.exposure = 10;
      },
    ],
    [
      "vignette",
      (e) => {
        e.adjustments.vignette = 20;
      },
    ],
    [
      "clarity",
      (e) => {
        e.adjustments.clarity = 15;
      },
    ],
    [
      "dehaze",
      (e) => {
        e.adjustments.dehaze = 15;
      },
    ],
    [
      "filter",
      (e) => {
        e.filter = "warm";
      },
    ],
    [
      "crop",
      (e) => {
        e.crop = { x: 0.1, y: 0, width: 0.9, height: 1 };
      },
    ],
    [
      "rotation",
      (e) => {
        e.rotation = 3;
      },
    ],
    [
      "keystone",
      (e) => {
        e.keystoneV = 10;
      },
    ],
    [
      "lens",
      (e) => {
        e.lensDistortion = -20;
      },
    ],
    [
      "seam width",
      (e) => {
        e.seamWidth = 80;
      },
    ],
    [
      "orientation",
      (e) => {
        e.orientation = 90;
      },
    ],
    [
      "flip",
      (e) => {
        e.flipH = true;
      },
    ],
    ["curves", (e) => e.curves.master.splice(1, 0, { x: 0.5, y: 0.6 })],
    [
      "hsl",
      (e) => {
        e.hsl.red.s = -30;
      },
    ],
    [
      "mask",
      (e) =>
        e.masks.push({
          id: "m1",
          kind: "radial",
          x0: 0.5,
          y0: 0.5,
          x1: 0.7,
          y1: 0.7,
          invert: false,
          adjust: {
            exposure: 10,
            brightness: 0,
            contrast: 0,
            saturation: 0,
            temperature: 0,
            tint: 0,
          },
        }),
    ],
    [
      "stylize",
      (e) => {
        e.stylize = { ...e.stylize, kind: "duotone" };
      },
    ],
    [
      "liquify",
      (e) => {
        const dx = new Array(9).fill(0);
        dx[4] = 0.05;
        e.liquify = { cols: 3, rows: 3, dx, dy: new Array(9).fill(0) };
      },
    ],
  ];

  for (const [name, mutate] of cases) {
    it(`is false once ${name} changes`, () => {
      const edits = neutral();
      mutate(edits);
      expect(imageEditsAreNeutral(edits)).toBe(false);
    });
  }

  it("stays true for a filter at zero strength", () => {
    const edits = neutral();
    edits.filter = "warm";
    edits.filterStrength = 0;
    expect(imageEditsAreNeutral(edits)).toBe(true);
  });
});
