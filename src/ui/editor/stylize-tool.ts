import type { StylizeEffect, StylizeKind } from "../../types";
import { h } from "../h";
import { refreshRangeFill } from "../range-fill";

export interface StylizeToolOptions {
  stylize: StylizeEffect;
  onChange: (stylize: StylizeEffect) => void;
}

export interface StylizeToolHandle {
  root: HTMLElement;
  /** Sync after an external change (undo/reset/AI) — does not fire onChange. */
  setStylize(stylize: StylizeEffect): void;
  destroy(): void;
}

const KINDS: { id: StylizeKind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "tiltshift", label: "Tilt-shift" },
  { id: "duotone", label: "Duotone" },
  { id: "posterize", label: "Posterize" },
  { id: "pixelate", label: "Pixelate" },
  { id: "halftone", label: "Halftone" },
];

/**
 * One parametric effect at a time: pick a chip, then tune its amount (plus
 * the band position for tilt-shift and the two duotone colors).
 */
export function createStylizeTool(options: StylizeToolOptions): StylizeToolHandle {
  const effect: StylizeEffect = { ...options.stylize };
  const abort = new AbortController();
  const signal = abort.signal;

  const chips = new Map<StylizeKind, HTMLElement>();

  function emit(): void {
    options.onChange({ ...effect });
  }

  // ── Parameter row ──

  const amountValue = h("span", { class: "rt-dock__slider-value" }, String(effect.amount));
  const amountInput = h("input", {
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    value: effect.amount,
    "aria-label": "Effect amount",
  }) as HTMLInputElement;
  refreshRangeFill(amountInput);
  amountInput.addEventListener(
    "input",
    () => {
      effect.amount = Number(amountInput.value);
      amountValue.textContent = amountInput.value;
      refreshRangeFill(amountInput);
      emit();
    },
    { signal },
  );
  const amountGroup = h(
    "div",
    { class: "rt-dock__group rt-dock__slider" },
    h("span", { class: "rt-dock__slider-label" }, "Amount"),
    amountInput,
    amountValue,
  );

  const positionValue = h(
    "span",
    { class: "rt-dock__slider-value" },
    String(Math.round(effect.position * 100)),
  );
  const positionInput = h("input", {
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    value: Math.round(effect.position * 100),
    "aria-label": "Sharp band position",
  }) as HTMLInputElement;
  refreshRangeFill(positionInput);
  positionInput.addEventListener(
    "input",
    () => {
      effect.position = Number(positionInput.value) / 100;
      positionValue.textContent = positionInput.value;
      refreshRangeFill(positionInput);
      emit();
    },
    { signal },
  );
  const positionGroup = h(
    "div",
    { class: "rt-dock__group rt-dock__slider" },
    h("span", { class: "rt-dock__slider-label" }, "Focus"),
    positionInput,
    positionValue,
  );

  const shadowInput = h("input", {
    type: "color",
    class: "rt-stylize__color",
    value: effect.shadow,
    "aria-label": "Duotone shadow color",
  }) as HTMLInputElement;
  const highlightInput = h("input", {
    type: "color",
    class: "rt-stylize__color",
    value: effect.highlight,
    "aria-label": "Duotone highlight color",
  }) as HTMLInputElement;
  shadowInput.addEventListener(
    "input",
    () => {
      effect.shadow = shadowInput.value;
      emit();
    },
    { signal },
  );
  highlightInput.addEventListener(
    "input",
    () => {
      effect.highlight = highlightInput.value;
      emit();
    },
    { signal },
  );
  const colorGroup = h(
    "div",
    { class: "rt-dock__group" },
    h("span", { class: "rt-dock__slider-label" }, "Shadows"),
    shadowInput,
    h("span", { class: "rt-dock__slider-label" }, "Highlights"),
    highlightInput,
  );

  const paramRow = h("div", { class: "rt-dock__row" }, amountGroup, positionGroup, colorGroup);

  function syncParamVisibility(): void {
    amountGroup.style.display = effect.kind === "none" ? "none" : "";
    positionGroup.style.display = effect.kind === "tiltshift" ? "" : "none";
    colorGroup.style.display = effect.kind === "duotone" ? "" : "none";
  }

  // ── Effect chips ──

  const chipRow = h("div", { class: "rt-dock__row rt-dock__chips" });
  for (const def of KINDS) {
    const chip = h(
      "button",
      { class: `rt-dock__chip${def.id === effect.kind ? " rt-dock__chip--active" : ""}` },
      def.label,
    );
    chip.addEventListener(
      "click",
      () => {
        chips.get(effect.kind)?.classList.remove("rt-dock__chip--active");
        effect.kind = def.id;
        chips.get(effect.kind)?.classList.add("rt-dock__chip--active");
        syncParamVisibility();
        emit();
      },
      { signal },
    );
    chips.set(def.id, chip);
    chipRow.appendChild(chip);
  }

  const root = h("div", { class: "rt-adjust" }, paramRow, chipRow);
  syncParamVisibility();

  return {
    root,
    setStylize(next) {
      chips.get(effect.kind)?.classList.remove("rt-dock__chip--active");
      Object.assign(effect, next);
      chips.get(effect.kind)?.classList.add("rt-dock__chip--active");
      amountInput.value = String(effect.amount);
      amountValue.textContent = String(effect.amount);
      refreshRangeFill(amountInput);
      positionInput.value = String(Math.round(effect.position * 100));
      positionValue.textContent = String(Math.round(effect.position * 100));
      refreshRangeFill(positionInput);
      shadowInput.value = effect.shadow;
      highlightInput.value = effect.highlight;
      syncParamVisibility();
    },
    destroy() {
      abort.abort();
    },
  };
}
