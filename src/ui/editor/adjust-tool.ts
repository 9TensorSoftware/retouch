import type { Adjustments } from "../../types";
import { h } from "../h";

export interface AdjustToolOptions {
  adjustments: Adjustments;
  onChange: (adjustments: Adjustments) => void;
}

export interface AdjustToolHandle {
  root: HTMLElement;
  getAdjustments(): Adjustments;
  destroy(): void;
}

export function createAdjustTool(options: AdjustToolOptions): AdjustToolHandle {
  const adj: Adjustments = { ...options.adjustments };
  const abort = new AbortController();
  const signal = abort.signal;

  function createSlider(
    label: string,
    key: keyof Adjustments,
    min: number,
    max: number,
  ): HTMLElement {
    const valueEl = h("span", { class: "rt-props__slider-value" }, formatValue(adj[key], key));
    const input = h("input", {
      type: "range",
      min,
      max,
      step: 1,
      value: adj[key],
    }) as HTMLInputElement;

    input.addEventListener("input", () => {
      adj[key] = Number(input.value);
      valueEl.textContent = formatValue(adj[key], key);
      options.onChange({ ...adj });
    }, { signal });

    return h(
      "div",
      { class: "rt-props__row" },
      h("div", { class: "rt-props__label" }, label),
      h("div", { class: "rt-props__slider" }, input, valueEl),
    );
  }

  const root = h(
    "div",
    null,
    h("div", { class: "rt-props__title" }, "Adjustments"),
    createSlider("Brightness", "brightness", 0, 200),
    createSlider("Contrast", "contrast", 0, 200),
    createSlider("Saturation", "saturation", 0, 200),
  );

  return {
    root,
    getAdjustments: () => ({ ...adj }),
    destroy() {
      abort.abort();
    },
  };
}

function formatValue(value: number, _key: keyof Adjustments): string {
  const diff = value - 100;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : `${diff}`;
}
