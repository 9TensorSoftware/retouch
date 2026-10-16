import { h } from "../h";
import { createSlider } from "./slider";

export interface LiquifyToolOptions {
  /** Brush geometry changed — the overlay resizes its ring. */
  onBrushChange: (size: number, strength: number) => void;
}

export interface LiquifyToolHandle {
  root: HTMLElement;
  /** Current brush: size as a fraction of frame height, strength 0–100. */
  getBrush(): { size: number; strength: number };
  /** Step the brush size down (−1) or up (+1), as the [ and ] keys do. */
  nudgeSize(direction: 1 | -1): void;
  destroy(): void;
}

const SIZE_MIN = 5;
const SIZE_MAX = 45;
const SIZE_STEP = 3;

/**
 * Liquify controls: brush size and strength. The pushing happens on the
 * photo through the liquify overlay; this pane only holds the brush.
 */
export function createLiquifyTool(options: LiquifyToolOptions): LiquifyToolHandle {
  const abort = new AbortController();
  const signal = abort.signal;

  let size = 20; // percent of frame height
  let strength = 50;

  const sizeSlider = createSlider(
    {
      label: "Size",
      ariaLabel: "Brush size",
      min: SIZE_MIN,
      max: SIZE_MAX,
      value: size,
      neutral: 20,
      fillFrom: SIZE_MIN,
      format: (v) => `${v}%`,
      onInput: (v) => {
        size = v;
        options.onBrushChange(size / 100, strength);
      },
    },
    signal,
  );
  const strengthSlider = createSlider(
    {
      label: "Strength",
      ariaLabel: "Brush strength",
      min: 10,
      max: 100,
      value: strength,
      neutral: 50,
      fillFrom: 10,
      onInput: (v) => {
        strength = v;
        options.onBrushChange(size / 100, strength);
      },
    },
    signal,
  );

  const root = h(
    "div",
    { class: "rt-liquify" },
    h(
      "p",
      { class: "rt-dock__hint rt-liquify__hint" },
      "Drag on the photo to push pixels.",
      h("span", { class: "rt-keys" }, " Press [ and ] to change the brush size."),
    ),
    sizeSlider.root,
    strengthSlider.root,
  );

  return {
    root,
    getBrush() {
      return { size: size / 100, strength };
    },
    nudgeSize(direction) {
      const next = Math.min(SIZE_MAX, Math.max(SIZE_MIN, size + direction * SIZE_STEP));
      if (next === size) return;
      size = next;
      sizeSlider.set(size);
      options.onBrushChange(size / 100, strength);
    },
    destroy() {
      abort.abort();
    },
  };
}
