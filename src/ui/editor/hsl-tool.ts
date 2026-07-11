import type { HslBand, HslMixer } from "../../types";
import { HSL_BANDS } from "../../utils/hsl";
import { h } from "../h";

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

const BAND_COLORS: Record<HslBand, string> = {
  red: "#E05A5A",
  orange: "#E08B4A",
  yellow: "#D9C34A",
  green: "#6CC46C",
  aqua: "#4AC4C4",
  blue: "#5A8FE0",
  purple: "#9B6CE0",
  magenta: "#D95AB4",
};

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

const AXES: { key: "h" | "s" | "l"; label: string }[] = [
  { key: "h", label: "Hue" },
  { key: "s", label: "Saturation" },
  { key: "l", label: "Luminance" },
];

/**
 * Lightroom-style HSL mixer: pick a hue band chip, then shift its hue,
 * saturation, and luminance with three sliders. A dot marks touched bands.
 */
export function createHslTool(options: HslToolOptions): HslToolHandle {
  const hsl: HslMixer = structuredClone(options.hsl);
  const abort = new AbortController();
  const signal = abort.signal;
  let band: HslBand = "red";

  const chips = new Map<HslBand, HTMLElement>();
  const sliders = new Map<"h" | "s" | "l", { input: HTMLInputElement; valueEl: HTMLElement }>();

  function format(v: number): string {
    if (v === 0) return "0";
    return v > 0 ? `+${v}` : `${v}`;
  }

  function syncChipDot(target: HslBand): void {
    const s = hsl[target];
    chips
      .get(target)
      ?.classList.toggle("rt-dock__chip--touched", s.h !== 0 || s.s !== 0 || s.l !== 0);
  }

  function syncSliders(): void {
    for (const [key, control] of sliders) {
      control.input.value = String(hsl[band][key]);
      control.valueEl.textContent = format(hsl[band][key]);
    }
  }

  // ── Slider row (Hue / Saturation / Luminance for the active band) ──

  const sliderRow = h("div", { class: "rt-dock__row" });
  for (const axis of AXES) {
    const valueEl = h("span", { class: "rt-dock__slider-value" }, format(hsl[band][axis.key]));
    const input = h("input", {
      type: "range",
      min: -100,
      max: 100,
      step: 1,
      value: hsl[band][axis.key],
      "aria-label": `${BAND_LABELS[band]} ${axis.label.toLowerCase()}`,
    }) as HTMLInputElement;
    input.addEventListener(
      "input",
      () => {
        hsl[band][axis.key] = Number(input.value);
        valueEl.textContent = format(hsl[band][axis.key]);
        syncChipDot(band);
        options.onChange(structuredClone(hsl));
      },
      { signal },
    );
    const label = h(
      "span",
      { class: "rt-dock__slider-label", title: "Double-click to reset" },
      axis.label,
    );
    label.addEventListener(
      "dblclick",
      () => {
        hsl[band][axis.key] = 0;
        input.value = "0";
        valueEl.textContent = "0";
        syncChipDot(band);
        options.onChange(structuredClone(hsl));
      },
      { signal },
    );
    sliders.set(axis.key, { input, valueEl });
    sliderRow.appendChild(
      h("div", { class: "rt-dock__group rt-dock__slider rt-hsl__slider" }, label, input, valueEl),
    );
  }

  // ── Band chips ──

  function select(next: HslBand): void {
    chips.get(band)?.classList.remove("rt-dock__chip--active");
    band = next;
    chips.get(band)?.classList.add("rt-dock__chip--active");
    for (const axis of AXES) {
      sliders
        .get(axis.key)
        ?.input.setAttribute("aria-label", `${BAND_LABELS[band]} ${axis.label.toLowerCase()}`);
    }
    syncSliders();
  }

  const chipRow = h("div", { class: "rt-dock__row rt-dock__chips" });
  for (const id of HSL_BANDS) {
    const chip = h(
      "button",
      {
        class: `rt-dock__chip rt-hsl__chip${id === band ? " rt-dock__chip--active" : ""}`,
        title: `${BAND_LABELS[id]} band`,
      },
      BAND_LABELS[id],
    );
    chip.style.setProperty("--rt-band-color", BAND_COLORS[id]);
    chip.addEventListener("click", () => select(id), { signal });
    chips.set(id, chip);
    chipRow.appendChild(chip);
    syncChipDot(id);
  }

  const root = h("div", { class: "rt-adjust" }, sliderRow, chipRow);

  return {
    root,
    setHsl(next) {
      for (const id of HSL_BANDS) {
        hsl[id] = { ...next[id] };
        syncChipDot(id);
      }
      syncSliders();
    },
    destroy() {
      abort.abort();
    },
  };
}
