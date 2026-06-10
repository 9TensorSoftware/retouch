import { filters } from "fabric";
import { DEFAULT_EDITS } from "../src/constants";
import type { Adjustments } from "../src/types";
import { buildFabricFilters, buildPresetFilter, FILTER_PRESETS } from "../src/utils/filters";

const NEUTRAL: Adjustments = { brightness: 100, contrast: 100, saturation: 100 };

describe("filter presets", () => {
  it("defaults to the 'none' preset", () => {
    expect(DEFAULT_EDITS.filter).toBe("none");
  });

  it("lists 'none' first and includes the documented presets", () => {
    expect(FILTER_PRESETS).toHaveLength(7);
    expect(FILTER_PRESETS[0].id).toBe("none");
    expect(FILTER_PRESETS.map((p) => p.id)).toEqual(
      expect.arrayContaining(["bw", "sepia", "warm", "cool", "vintage", "vivid"]),
    );
  });

  it("returns null for the 'none' preset", () => {
    expect(buildPresetFilter("none")).toBeNull();
  });

  it("maps 'bw' to a Grayscale filter", () => {
    expect(buildPresetFilter("bw")).toBeInstanceOf(filters.Grayscale);
  });

  it("maps 'warm' to a ColorMatrix filter", () => {
    expect(buildPresetFilter("warm")).toBeInstanceOf(filters.ColorMatrix);
  });
});

describe("buildFabricFilters", () => {
  it("returns only the three adjustment filters when no preset is set", () => {
    expect(buildFabricFilters(NEUTRAL, "none")).toHaveLength(3);
  });

  it("prepends the preset filter beneath the adjustments", () => {
    const stack = buildFabricFilters(NEUTRAL, "bw");
    expect(stack).toHaveLength(4);
    expect(stack[0]).toBeInstanceOf(filters.Grayscale);
  });
});
