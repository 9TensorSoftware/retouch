import type { HslBand, HslMixer } from "../../types";
import { BAND_CENTERS, HSL_BANDS, MAX_HUE_SHIFT } from "../../utils/hsl";
import { h } from "../h";
import type { SliderHandle } from "./slider";
import { createSlider } from "./slider";

export interface HslToolOptions {
  hsl: HslMixer;
  onChange: (hsl: HslMixer) => void;
}

export interface HslToolHandle {
  root: HTMLElement;
  /** Sync after an external change (undo/reset/AI) — does not fire onChange. */
  setHsl(hsl: HslMixer): void;
  destroy(): void;
}

const BAND_LABELS: Record<HslBand, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  aqua: "Aqua",
  blue: "Blue",
  purple: "Purple",
  magenta: "Magenta",
};

type Axis = "h" | "s" | "l";

const AXES: { key: Axis; label: string }[] = [
  { key: "h", label: "Hue" },
  { key: "s", label: "Saturation" },
  { key: "l", label: "Luminance" },
];

/** The swatch for a band: its hue center, vivid. */
const swatch = (band: HslBand): string => `hsl(${BAND_CENTERS[band]} 80% 55%)`;

/** Each axis's track, drawn in the band's own color. */
function track(band: HslBand, axis: Axis): string {
  const hue = BAND_CENTERS[band];
  if (axis === "h") {
    return `linear-gradient(90deg, hsl(${hue - MAX_HUE_SHIFT} 80% 55%), hsl(${hue} 85% 55%), hsl(${hue + MAX_HUE_SHIFT} 80% 55%))`;
  }
  if (axis === "s") return `linear-gradient(90deg, hsl(${hue} 0% 52%), hsl(${hue} 90% 55%))`;
  return `linear-gradient(90deg, hsl(${hue} 70% 14%), hsl(${hue} 85% 52%), hsl(${hue} 75% 90%))`;
}

/**
 * Color mix: pick a band from its swatch, then shift its hue, saturation and
 * luminance. The tracks redraw in the band's color, so each slider shows
 * where it goes; a dot under a swatch marks a band with changes.
 */
export function createHslTool(options: HslToolOptions): HslToolHandle {
  const hsl: HslMixer = structuredClone(options.hsl);
  const abort = new AbortController();
  const signal = abort.signal;
  let band: HslBand = "red";

  const swatches = new Map<HslBand, HTMLButtonElement>();
  const sliders = new Map<Axis, SliderHandle>();

  const touched = (target: HslBand): boolean => {
    const s = hsl[target];
    return s.h !== 0 || s.s !== 0 || s.l !== 0;
  };

  function paintSwatches(): void {
    for (const [id, button] of swatches) {
      button.setAttribute("aria-pressed", String(id === band));
      button.classList.toggle("rt-swatch--touched", touched(id));
      button.setAttribute(
        "aria-label",
        touched(id) ? `${BAND_LABELS[id]}, changed` : BAND_LABELS[id],
      );
    }
  }

  const bandName = h("span", { class: "rt-hsl__name" });

  function showBand(): void {
    bandName.textContent = BAND_LABELS[band];
    bandName.style.setProperty("--rt-swatch", swatch(band));
    for (const axis of AXES) {
      const slider = sliders.get(axis.key);
      slider?.setLabel(axis.label, `${BAND_LABELS[band]} ${axis.label.toLowerCase()}`);
      slider?.setTrack(track(band, axis.key));
      slider?.set(hsl[band][axis.key]);
    }
    paintSwatches();
  }

  const swatchRow = h("div", { class: "rt-swatches", role: "group", "aria-label": "Color band" });
  for (const id of HSL_BANDS) {
    const button = h("button", { type: "button", class: "rt-swatch", title: BAND_LABELS[id] });
    button.style.setProperty("--rt-swatch", swatch(id));
    button.addEventListener(
      "click",
      () => {
        band = id;
        showBand();
      },
      { signal },
    );
    swatches.set(id, button);
    swatchRow.appendChild(button);
  }

  const sliderStack = h("div", { class: "rt-hsl__sliders" });
  for (const axis of AXES) {
    const slider = createSlider(
      {
        label: axis.label,
        min: -100,
        max: 100,
        value: hsl[band][axis.key],
        onInput: (v) => {
          hsl[band][axis.key] = v;
          paintSwatches();
          options.onChange(structuredClone(hsl));
        },
      },
      signal,
    );
    sliders.set(axis.key, slider);
    sliderStack.appendChild(slider.root);
  }

  const root = h(
    "div",
    { class: "rt-hsl" },
    swatchRow,
    h("div", { class: "rt-hsl__band" }, bandName),
    sliderStack,
  );
  showBand();

  return {
    root,
    setHsl(next) {
      for (const id of HSL_BANDS) hsl[id] = { ...next[id] };
      showBand();
    },
    destroy() {
      abort.abort();
    },
  };
}
