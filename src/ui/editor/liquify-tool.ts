import { h } from "../h";

export interface LiquifyToolOptions {
  /** Restore the untouched frame (clears the whole field). */
  onReset: () => void;
  /** Brush geometry changed — the overlay resizes its cursor circle. */
  onBrushChange: (size: number, strength: number) => void;
}

export interface LiquifyToolHandle {
  root: HTMLElement;
  /** Current brush: size as a fraction of frame height, strength 0–100. */
  getBrush(): { size: number; strength: number };
  /** Enable/disable Reset (enabled while the field has strokes). */
  setResetEnabled(enabled: boolean): void;
  destroy(): void;
}

/**
 * Liquify controls: brush size/strength plus Reset. The actual pushing
 * happens on the canvas through the liquify overlay; this pane only holds
 * the brush parameters.
 */
export function createLiquifyTool(options: LiquifyToolOptions): LiquifyToolHandle {
  const abort = new AbortController();
  const signal = abort.signal;

  let size = 20; // percent of frame height
  let strength = 50;

  function slider(
    label: string,
    min: number,
    max: number,
    value: number,
    onInput: (v: number) => void,
  ): { group: HTMLElement } {
    const valueEl = h("span", { class: "rt-dock__slider-value" }, String(value));
    const input = h("input", {
      type: "range",
      min,
      max,
      step: 1,
      value,
      "aria-label": label,
    }) as HTMLInputElement;
    input.addEventListener(
      "input",
      () => {
        valueEl.textContent = input.value;
        onInput(Number(input.value));
      },
      { signal },
    );
    const group = h(
      "div",
      { class: "rt-dock__group rt-dock__slider" },
      h("span", { class: "rt-dock__slider-label" }, label),
      input,
      valueEl,
    );
    return { group };
  }

  const sizeSlider = slider("Size", 5, 45, size, (v) => {
    size = v;
    options.onBrushChange(size / 100, strength);
  });
  const strengthSlider = slider("Strength", 10, 100, strength, (v) => {
    strength = v;
    options.onBrushChange(size / 100, strength);
  });

  const resetBtn = h(
    "button",
    { class: "rt-dock__chip", disabled: "" },
    "Reset",
  ) as HTMLButtonElement;
  resetBtn.addEventListener("click", () => options.onReset(), { signal });

  const root = h(
    "div",
    { class: "rt-adjust" },
    h(
      "div",
      { class: "rt-dock__row" },
      h(
        "span",
        { class: "rt-dock__slider-label rt-liquify__hint" },
        "Drag on the image to push pixels",
      ),
      sizeSlider.group,
      strengthSlider.group,
      resetBtn,
    ),
  );

  return {
    root,
    getBrush() {
      return { size: size / 100, strength };
    },
    setResetEnabled(enabled) {
      resetBtn.disabled = !enabled;
    },
    destroy() {
      abort.abort();
    },
  };
}
