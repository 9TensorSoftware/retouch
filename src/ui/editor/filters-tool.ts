import type { FilterPreset } from "../../types";
import { FILTER_PRESETS } from "../../utils/filters";
import { h } from "../h";
import { createTiles } from "./controls";
import { renderLook } from "./preview";
import { createSlider } from "./slider";

export interface FiltersToolOptions {
  /** A small copy of the photo the preview tiles are drawn from. */
  base: HTMLCanvasElement;
  filter: FilterPreset;
  strength: number;
  onChange: (filter: FilterPreset) => void;
  onStrengthChange: (strength: number) => void;
}

export interface FiltersToolHandle {
  root: HTMLElement;
  getFilter(): FilterPreset;
  setFilter(filter: FilterPreset): void;
  /** Sync the intensity slider after an external change (does not fire onStrengthChange). */
  setStrength(strength: number): void;
  destroy(): void;
}

/**
 * Filters as preview tiles drawn from the photo itself, with the intensity
 * slider beneath them while a filter is on.
 */
export function createFiltersTool(options: FiltersToolOptions): FiltersToolHandle {
  const abort = new AbortController();
  const signal = abort.signal;

  const strength = createSlider(
    {
      label: "Intensity",
      min: 0,
      max: 100,
      value: options.strength,
      neutral: 100,
      fillFrom: 0,
      format: (v) => `${v}%`,
      onInput: (v) => options.onStrengthChange(v),
    },
    signal,
  );

  const tiles = createTiles(
    {
      label: "Filter",
      options: FILTER_PRESETS.map((preset) => ({
        value: preset.id,
        label: preset.label,
        preview: renderLook(options.base, { filter: preset.id }),
      })),
      value: options.filter,
      onChange: (filter) => {
        syncStrength();
        options.onChange(filter);
      },
    },
    signal,
  );

  /** Intensity only means something while a filter is on. */
  function syncStrength(): void {
    strength.root.hidden = tiles.value === "none";
  }
  syncStrength();

  const root = h("div", { class: "rt-filters" }, tiles.root, strength.root);

  return {
    root,
    getFilter: () => tiles.value ?? "none",
    setFilter(filter) {
      tiles.set(filter);
      syncStrength();
    },
    setStrength(value) {
      strength.set(value);
    },
    destroy() {
      abort.abort();
    },
  };
}
