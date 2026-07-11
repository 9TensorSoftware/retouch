import { filters } from "fabric";
import { DEFAULT_ADJUSTMENTS, DEFAULT_EDITS } from "../src/constants";
import type { Adjustments } from "../src/types";
import {
  buildFabricFilters,
  buildPresetColorMatrix,
  buildPresetFilter,
  FILTER_PRESETS,
  isNeutral,
  lerpColorMatrix,
  multiplyColorMatrices,
  saturationMatrix,
  sharpenKernel,
} from "../src/utils/filters";

const NEUTRAL: Adjustments = { ...DEFAULT_ADJUSTMENTS };

describe("filter presets", () => {
  it("defaults to 'none' at full strength", () => {
    expect(DEFAULT_EDITS.filter).toBe("none");
    expect(DEFAULT_EDITS.filterStrength).toBe(100);
  });

  it("lists 'none' first and ships 12 presets", () => {
    expect(FILTER_PRESETS).toHaveLength(12);
    expect(FILTER_PRESETS[0].id).toBe("none");
    expect(FILTER_PRESETS.map((p) => p.id)).toEqual(
      expect.arrayContaining(["bw", "sepia", "kodachrome", "technicolor", "polaroid", "invert"]),
    );
  });

  it("returns null for 'none' and for zero strength", () => {
    expect(buildPresetColorMatrix("none", 100)).toBeNull();
    expect(buildPresetColorMatrix("bw", 0)).toBeNull();
    expect(buildPresetFilter("sepia")).toBeInstanceOf(filters.ColorMatrix);
  });

  it("lerps toward identity at partial strength", () => {
    const full = buildPresetColorMatrix("invert", 100);
    const half = buildPresetColorMatrix("invert", 50);
    expect(full?.[0]).toBe(-1);
    expect(half?.[0]).toBeCloseTo(0); // halfway between identity 1 and invert -1
    expect(half?.[4]).toBeCloseTo(0.5); // offset halfway between 0 and 1
  });
});

describe("color matrix math", () => {
  const IDENTITY = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

  it("lerp endpoints return the inputs", () => {
    const m = saturationMatrix(1.45);
    expect(lerpColorMatrix(IDENTITY, m, 0)).toEqual(IDENTITY);
    expect(lerpColorMatrix(IDENTITY, m, 1).map((v) => Number(v.toFixed(6)))).toEqual(
      m.map((v) => Number(v.toFixed(6))),
    );
  });

  it("saturation 1 is the identity", () => {
    for (const [i, v] of saturationMatrix(1).entries()) {
      expect(v).toBeCloseTo(IDENTITY[i]);
    }
  });

  it("composes matrices including offsets", () => {
    // inner adds +0.5 to red; outer doubles red → red' = 2r + 1
    const inner = [...IDENTITY];
    inner[4] = 0.5;
    const outer = [...IDENTITY];
    outer[0] = 2;
    const composed = multiplyColorMatrices(outer, inner);
    expect(composed[0]).toBe(2);
    expect(composed[4]).toBe(1);
    // identity ∘ m === m
    const m = saturationMatrix(0.5);
    expect(multiplyColorMatrices(IDENTITY, m).map((v) => Number(v.toFixed(6)))).toEqual(
      m.map((v) => Number(v.toFixed(6))),
    );
  });

  it("sharpen kernel preserves total brightness", () => {
    const kernel = sharpenKernel(0.7);
    expect(kernel.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe("buildFabricFilters", () => {
  it("emits nothing for fully neutral values", () => {
    expect(buildFabricFilters(NEUTRAL, "none")).toHaveLength(0);
    expect(isNeutral(NEUTRAL, "none")).toBe(true);
    expect(isNeutral(NEUTRAL, "bw", 0)).toBe(true);
    expect(isNeutral(NEUTRAL, "bw", 100)).toBe(false);
  });

  it("composes preset + exposure/temperature/tint into one ColorMatrix", () => {
    const adj = { ...NEUTRAL, exposure: 30, temperature: -20, tint: 10 };
    const stack = buildFabricFilters(adj, "sepia", 100);
    expect(stack).toHaveLength(1);
    expect(stack[0]).toBeInstanceOf(filters.ColorMatrix);
  });

  it("emits only the filters whose values are non-neutral", () => {
    const adj = { ...NEUTRAL, brightness: 150, hue: 45, grain: 20 };
    const stack = buildFabricFilters(adj, "none");
    expect(stack).toHaveLength(3);
    expect(stack.some((f) => f instanceof filters.Brightness)).toBe(true);
    expect(stack.some((f) => f instanceof filters.HueRotation)).toBe(true);
    expect(stack.some((f) => f instanceof filters.Noise)).toBe(true);
  });

  it("covers the full stack when everything is active", () => {
    const adj: Adjustments = {
      brightness: 120,
      contrast: 90,
      saturation: 110,
      exposure: 10,
      temperature: 15,
      tint: -5,
      hue: 30,
      vibrance: 40,
      sharpen: 25,
      blur: 10,
      grain: 15,
      vignette: 50, // not a fabric filter — must not appear in the stack
      clarity: 30, // spatial post pass — not a fabric filter either
      dehaze: 20,
    };
    const stack = buildFabricFilters(adj, "vintage", 80);
    // ColorMatrix + brightness + contrast + saturation + hue + vibrance + blur + sharpen + grain
    expect(stack).toHaveLength(9);
    expect(isNeutral(adj, "vintage", 80)).toBe(false);
  });

  it("treats vignette as outside the fabric stack", () => {
    const adj = { ...NEUTRAL, vignette: 80 };
    expect(buildFabricFilters(adj, "none")).toHaveLength(0);
    expect(isNeutral(adj, "none")).toBe(true);
  });
});
