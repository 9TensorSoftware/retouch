import type { Adjustments } from "../../types";
import { h } from "../h";

export interface AdjustToolOptions {
  adjustments: Adjustments;
  onChange: (adjustments: Adjustments) => void;
}

export interface AdjustToolHandle {
  root: HTMLElement;
  getAdjustments(): Adjustments;
  /** Sync sliders after an external change (does not fire onChange). */
  setAdjustments(adjustments: Adjustments): void;
  destroy(): void;
}

interface SliderDef {
  key: keyof Adjustments;
  label: string;
  min: number;
  max: number;
  neutral: number;
}

const GROUPS: { title: string; sliders: SliderDef[] }[] = [
  {
    title: "Light",
    sliders: [
      { key: "exposure", label: "Exposure", min: -100, max: 100, neutral: 0 },
      { key: "brightness", label: "Brightness", min: 0, max: 200, neutral: 100 },
      { key: "contrast", label: "Contrast", min: 0, max: 200, neutral: 100 },
    ],
  },
  {
    title: "Color",
    sliders: [
      { key: "temperature", label: "Temperature", min: -100, max: 100, neutral: 0 },
      { key: "tint", label: "Tint", min: -100, max: 100, neutral: 0 },
      { key: "hue", label: "Hue", min: -180, max: 180, neutral: 0 },
      { key: "saturation", label: "Saturation", min: 0, max: 200, neutral: 100 },
      { key: "vibrance", label: "Vibrance", min: -100, max: 100, neutral: 0 },
    ],
  },
  {
    title: "Effects",
    sliders: [
      { key: "sharpen", label: "Sharpen", min: 0, max: 100, neutral: 0 },
      { key: "blur", label: "Blur", min: 0, max: 100, neutral: 0 },
      { key: "grain", label: "Grain", min: 0, max: 100, neutral: 0 },
      { key: "vignette", label: "Vignette", min: 0, max: 100, neutral: 0 },
    ],
  },
];

/** Signed offset from neutral: "0", "+12", "-45". */
function formatValue(value: number, neutral: number): string {
  const diff = value - neutral;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function createAdjustTool(options: AdjustToolOptions): AdjustToolHandle {
  const adj: Adjustments = { ...options.adjustments };
  const abort = new AbortController();
  const signal = abort.signal;
  const controls = new Map<
    keyof Adjustments,
    { input: HTMLInputElement; valueEl: HTMLElement; neutral: number }
  >();

  function createSlider(def: SliderDef): HTMLElement {
    const valueEl = h(
      "span",
      { class: "rt-props__slider-value" },
      formatValue(adj[def.key], def.neutral),
    );
    const input = h("input", {
      type: "range",
      min: def.min,
      max: def.max,
      step: 1,
      value: adj[def.key],
      "aria-label": def.label,
    }) as HTMLInputElement;

    input.addEventListener(
      "input",
      () => {
        adj[def.key] = Number(input.value);
        valueEl.textContent = formatValue(adj[def.key], def.neutral);
        options.onChange({ ...adj });
      },
      { signal },
    );

    // Double-click the label to snap the slider back to neutral.
    const label = h("div", { class: "rt-props__label", title: "Double-click to reset" }, def.label);
    label.addEventListener(
      "dblclick",
      () => {
        adj[def.key] = def.neutral;
        input.value = String(def.neutral);
        valueEl.textContent = formatValue(def.neutral, def.neutral);
        options.onChange({ ...adj });
      },
      { signal },
    );

    controls.set(def.key, { input, valueEl, neutral: def.neutral });

    return h(
      "div",
      { class: "rt-props__row" },
      label,
      h("div", { class: "rt-props__slider" }, input, valueEl),
    );
  }

  const root = h("div", null, h("div", { class: "rt-props__title" }, "Adjustments"));
  for (const group of GROUPS) {
    root.appendChild(h("div", { class: "rt-props__subtitle" }, group.title));
    for (const def of group.sliders) {
      root.appendChild(createSlider(def));
    }
  }

  return {
    root,
    getAdjustments: () => ({ ...adj }),
    setAdjustments(next) {
      for (const [key, control] of controls) {
        adj[key] = next[key];
        control.input.value = String(next[key]);
        control.valueEl.textContent = formatValue(next[key], control.neutral);
      }
    },
    destroy() {
      abort.abort();
    },
  };
}
