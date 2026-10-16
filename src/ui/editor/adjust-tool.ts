import type { Adjustments } from "../../types";
import { h } from "../h";
import { ICON_EYEDROPPER } from "../icons";
import { createSection } from "./controls";
import type { SliderHandle } from "./slider";
import { createSlider, parseTyped, signed } from "./slider";
import {
  TRACK_BRIGHTNESS,
  TRACK_EXPOSURE,
  TRACK_HUE,
  TRACK_SATURATION,
  TRACK_TEMPERATURE,
  TRACK_TINT,
  TRACK_VIBRANCE,
} from "./tracks";

export interface AdjustToolOptions {
  adjustments: Adjustments;
  onChange: (adjustments: Adjustments) => void;
  /** Starts the white-balance eyedropper (click a neutral area on the canvas). */
  onWhiteBalancePick?: () => void;
}

export interface AdjustToolHandle {
  root: HTMLElement;
  getAdjustments(): Adjustments;
  /** Sync the UI after an external change (does not fire onChange). */
  setAdjustments(adjustments: Adjustments): void;
  destroy(): void;
}

interface SliderDef {
  key: keyof Adjustments;
  label: string;
  min: number;
  max: number;
  neutral: number;
  /** A track showing what the slider does; omitted ones fill from neutral. */
  track?: string;
  unit?: string;
}

const DEFS: Record<keyof Adjustments, SliderDef> = {
  exposure: {
    key: "exposure",
    label: "Exposure",
    min: -100,
    max: 100,
    neutral: 0,
    track: TRACK_EXPOSURE,
  },
  brightness: {
    key: "brightness",
    label: "Brightness",
    min: 0,
    max: 200,
    neutral: 100,
    track: TRACK_BRIGHTNESS,
  },
  contrast: { key: "contrast", label: "Contrast", min: 0, max: 200, neutral: 100 },
  dehaze: { key: "dehaze", label: "Dehaze", min: 0, max: 100, neutral: 0 },
  temperature: {
    key: "temperature",
    label: "Temperature",
    min: -100,
    max: 100,
    neutral: 0,
    track: TRACK_TEMPERATURE,
  },
  tint: {
    key: "tint",
    label: "Tint",
    min: -100,
    max: 100,
    neutral: 0,
    track: TRACK_TINT,
  },
  vibrance: {
    key: "vibrance",
    label: "Vibrance",
    min: -100,
    max: 100,
    neutral: 0,
    track: TRACK_VIBRANCE,
  },
  saturation: {
    key: "saturation",
    label: "Saturation",
    min: 0,
    max: 200,
    neutral: 100,
    track: TRACK_SATURATION,
  },
  hue: {
    key: "hue",
    label: "Hue",
    min: -180,
    max: 180,
    neutral: 0,
    unit: "°",
    track: TRACK_HUE,
  },
  clarity: { key: "clarity", label: "Clarity", min: -100, max: 100, neutral: 0 },
  vignette: { key: "vignette", label: "Vignette", min: 0, max: 100, neutral: 0 },
  grain: { key: "grain", label: "Grain", min: 0, max: 100, neutral: 0 },
  sharpen: { key: "sharpen", label: "Sharpen", min: 0, max: 100, neutral: 0 },
  blur: { key: "blur", label: "Blur", min: 0, max: 100, neutral: 0 },
};

const SECTIONS: { title: string; open: boolean; keys: (keyof Adjustments)[] }[] = [
  { title: "Light", open: true, keys: ["exposure", "brightness", "contrast", "dehaze"] },
  { title: "Color", open: true, keys: ["temperature", "tint", "vibrance", "saturation", "hue"] },
  { title: "Effects", open: false, keys: ["clarity", "vignette", "grain"] },
  { title: "Detail", open: false, keys: ["sharpen", "blur"] },
];

/** Which sections are folded, remembered for the page's lifetime. */
const sectionOpen = new Map<string, boolean>();

/**
 * All fourteen adjustments at once, in four sections (Light, Color, Effects,
 * Detail). Values read as offsets from neutral; each section counts its
 * changed sliders, so a folded section still shows it's been touched.
 */
export function createAdjustTool(options: AdjustToolOptions): AdjustToolHandle {
  const adj: Adjustments = { ...options.adjustments };
  const abort = new AbortController();
  const signal = abort.signal;
  const sliders = new Map<keyof Adjustments, SliderHandle>();
  const counters: Array<() => void> = [];

  function slider(def: SliderDef): SliderHandle {
    const unit = def.unit ?? "";
    const handle = createSlider(
      {
        label: def.label,
        min: def.min,
        max: def.max,
        value: adj[def.key],
        neutral: def.neutral,
        track: def.track,
        // Readouts are offsets from neutral, so typed values are too.
        format: (v) => `${signed(v - def.neutral)}${unit}`,
        parse: (text) => {
          const typed = parseTyped(text);
          return typed === null ? null : def.neutral + typed;
        },
        onInput: (v) => {
          adj[def.key] = v;
          for (const count of counters) count();
          options.onChange({ ...adj });
        },
      },
      signal,
    );
    sliders.set(def.key, handle);
    return handle;
  }

  const root = h("div", { class: "rt-adjust" });
  for (const def of SECTIONS) {
    const section = createSection({
      title: def.title,
      collapsible: true,
      open: sectionOpen.get(def.title) ?? def.open,
    });
    section.root.addEventListener(
      "toggle",
      () => sectionOpen.set(def.title, (section.root as HTMLDetailsElement).open),
      { signal },
    );
    for (const key of def.keys) {
      const handle = slider(DEFS[key]);
      if (key === "temperature" && options.onWhiteBalancePick) {
        const pick = h("button", {
          type: "button",
          class: "rt-dock__icon-btn rt-adjust__wb",
          title: "White balance: click something that should be neutral gray or white",
          "aria-label": "White balance eyedropper",
        });
        pick.innerHTML = ICON_EYEDROPPER;
        pick.addEventListener("click", () => options.onWhiteBalancePick?.(), { signal });
        handle.addAccessory(pick);
      }
      section.body.appendChild(handle.root);
    }
    const count = (): void =>
      section.setCount(def.keys.filter((k) => adj[k] !== DEFS[k].neutral).length);
    count();
    counters.push(count);
    root.appendChild(section.root);
  }

  return {
    root,
    getAdjustments: () => ({ ...adj }),
    setAdjustments(next) {
      for (const key of Object.keys(DEFS) as (keyof Adjustments)[]) {
        adj[key] = next[key];
        sliders.get(key)?.set(next[key]);
      }
      for (const count of counters) count();
    },
    destroy() {
      abort.abort();
    },
  };
}
