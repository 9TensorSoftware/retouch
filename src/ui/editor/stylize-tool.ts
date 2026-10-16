import type { StylizeEffect, StylizeKind } from "../../types";
import { createDefaultStylize } from "../../utils/stylize";
import { h } from "../h";
import { createTiles } from "./controls";
import { renderLook } from "./preview";
import { createSlider } from "./slider";

export interface StylizeToolOptions {
  /** A small copy of the photo the preview tiles are drawn from. */
  base: HTMLCanvasElement;
  stylize: StylizeEffect;
  onChange: (stylize: StylizeEffect) => void;
}

export interface StylizeToolHandle {
  root: HTMLElement;
  /** Sync after an external change (undo/reset/AI) — does not fire onChange. */
  setStylize(stylize: StylizeEffect): void;
  destroy(): void;
}

/** Each effect, with the amount its tile shows it at (pixel sizes are absolute, so tiles go easy). */
const KINDS: { id: StylizeKind; label: string; previewAmount: number }[] = [
  { id: "none", label: "None", previewAmount: 0 },
  { id: "tiltshift", label: "Tilt-shift", previewAmount: 80 },
  { id: "duotone", label: "Duotone", previewAmount: 100 },
  { id: "posterize", label: "Posterize", previewAmount: 60 },
  { id: "pixelate", label: "Pixelate", previewAmount: 18 },
  { id: "halftone", label: "Halftone", previewAmount: 20 },
];

/**
 * One effect at a time, picked from preview tiles; then tune its amount
 * (plus the sharp band for tilt-shift and the two duotone colors).
 */
export function createStylizeTool(options: StylizeToolOptions): StylizeToolHandle {
  const effect: StylizeEffect = { ...options.stylize };
  const abort = new AbortController();
  const signal = abort.signal;

  function emit(): void {
    options.onChange({ ...effect });
  }

  const tiles = createTiles(
    {
      label: "Effect",
      options: KINDS.map((kind) => ({
        value: kind.id,
        label: kind.label,
        preview: renderLook(options.base, {
          stylize: { ...createDefaultStylize(), kind: kind.id, amount: kind.previewAmount },
        }),
      })),
      value: effect.kind,
      onChange: (kind) => {
        effect.kind = kind;
        syncParams();
        emit();
      },
    },
    signal,
  );

  const amount = createSlider(
    {
      label: "Amount",
      min: 0,
      max: 100,
      value: effect.amount,
      neutral: 50,
      fillFrom: 0,
      onInput: (v) => {
        effect.amount = v;
        emit();
      },
    },
    signal,
  );

  const focus = createSlider(
    {
      label: "Focus",
      ariaLabel: "Sharp band position",
      min: 0,
      max: 100,
      value: Math.round(effect.position * 100),
      neutral: 50,
      format: (v) => `${v}%`,
      onInput: (v) => {
        effect.position = v / 100;
        emit();
      },
    },
    signal,
  );

  const colorInputs = new Map<"shadow" | "highlight", HTMLInputElement>();
  function colorField(label: string, key: "shadow" | "highlight"): HTMLElement {
    const input = h("input", {
      type: "color",
      class: "rt-stylize__color",
      value: effect[key],
      "aria-label": `Duotone ${label.toLowerCase()} color`,
    }) as HTMLInputElement;
    input.addEventListener(
      "input",
      () => {
        effect[key] = input.value;
        emit();
      },
      { signal },
    );
    colorInputs.set(key, input);
    return h("label", { class: "rt-stylize__swatch" }, input, h("span", null, label));
  }
  const colors = h(
    "div",
    { class: "rt-stylize__colors" },
    colorField("Shadows", "shadow"),
    colorField("Highlights", "highlight"),
  );

  const params = h("div", { class: "rt-stylize__params" }, amount.root, focus.root, colors);

  function syncParams(): void {
    params.hidden = effect.kind === "none";
    focus.root.hidden = effect.kind !== "tiltshift";
    colors.hidden = effect.kind !== "duotone";
  }
  syncParams();

  const root = h("div", { class: "rt-stylize" }, tiles.root, params);

  return {
    root,
    setStylize(next) {
      Object.assign(effect, next);
      tiles.set(effect.kind);
      amount.set(effect.amount);
      focus.set(Math.round(effect.position * 100));
      const shadow = colorInputs.get("shadow");
      const highlight = colorInputs.get("highlight");
      if (shadow) shadow.value = effect.shadow;
      if (highlight) highlight.value = effect.highlight;
      syncParams();
    },
    destroy() {
      abort.abort();
    },
  };
}
