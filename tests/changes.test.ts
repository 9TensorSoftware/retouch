import { createDefaultVideoEdits, DEFAULT_EDITS } from "../src/constants";
import type { ImageEdits } from "../src/types";
import { listChanges } from "../src/ui/editor/changes";

const base = (): ImageEdits => structuredClone(DEFAULT_EDITS);

describe("listChanges", () => {
  it("reads adjustments the way the sliders do: offsets from neutral", () => {
    const next = base();
    next.adjustments = { ...next.adjustments, contrast: 115, temperature: -20, hue: 30 };
    expect(listChanges(base(), next)).toEqual(["Contrast +15", "Temperature −20", "Hue +30°"]);
  });

  it("names filters, color mix bands and effects", () => {
    const next = base();
    next.filter = "vintage";
    next.filterStrength = 60;
    next.hsl.blue = { h: 0, s: 30, l: -10 };
    next.stylize = { ...next.stylize, kind: "duotone" };
    expect(listChanges(base(), next)).toEqual([
      "Vintage filter",
      "Filter 60%",
      "Blue saturation +30",
      "Blue luminance −10",
      "Duotone",
    ]);
  });

  it("reports a turn, not the crop it remapped", () => {
    const next = base();
    next.orientation = 90;
    next.crop = { x: 0.1, y: 0, width: 0.8, height: 1 };
    expect(listChanges(base(), next)).toEqual(["Turn 90°"]);
    const cropped = base();
    cropped.crop = { x: 0.1, y: 0, width: 0.8, height: 1 };
    cropped.rotation = 2.5;
    expect(listChanges(base(), cropped)).toEqual(["Crop", "Straighten +2.5°"]);
  });

  it("covers trim, sound and speed for video", () => {
    const prev = createDefaultVideoEdits(10);
    const next = structuredClone(prev);
    next.trim = { start: 1, end: 6 };
    next.mute = true;
    next.speed = 2;
    expect(listChanges(prev, next)).toEqual(["Trim 0:01–0:06", "Mute", "Speed 2×"]);
  });

  it("folds a long list into +N more", () => {
    const next = base();
    for (const key of Object.keys(next.adjustments) as (keyof typeof next.adjustments)[]) {
      next.adjustments[key] += 5;
    }
    const changes = listChanges(base(), next);
    expect(changes).toHaveLength(8);
    expect(changes[7]).toBe("+7 more");
  });

  it("is empty when nothing changed", () => {
    expect(listChanges(base(), base())).toEqual([]);
  });
});
