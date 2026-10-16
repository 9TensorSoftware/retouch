import { h } from "../h";
import { refreshRangeFill } from "../range-fill";

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  /** Defaults to 1. */
  step?: number;
  value: number;
  /**
   * The resting value: the track fills outward from it, a dot marks the
   * slider while it's elsewhere, and double-click returns to it. Defaults to
   * 0 when the range spans zero, otherwise `min`.
   */
  neutral?: number;
  /** Where the fill starts, when that isn't `neutral` (an intensity resting at 100% fills from 0). */
  fillFrom?: number;
  /**
   * A track that shows what the slider does (a CSS image, e.g. a blue-to-amber
   * gradient for temperature). Replaces the fill.
   */
  track?: string;
  /** Readout text. Defaults to the number, signed when the range spans zero. */
  format?: (value: number) => string;
  /**
   * Reads a typed value back: the inverse of `format`. Defaults to the first
   * number in the text, so units and signs are fine.
   */
  parse?: (text: string) => number | null;
  /** Accessible name, when the visible label alone is ambiguous. */
  ariaLabel?: string;
  /** Fires continuously while the value changes. */
  onInput: (value: number) => void;
  /** Fires once per gesture: release, a typed value, a key press, a reset. */
  onChange?: (value: number) => void;
}

export interface SliderHandle {
  root: HTMLElement;
  input: HTMLInputElement;
  readonly value: number;
  /** Move the slider without firing callbacks (undo/redo sync). */
  set(value: number): void;
  setLabel(label: string, ariaLabel?: string): void;
  setTrack(track: string | null): void;
  setDisabled(disabled: boolean): void;
  /** A control on the label's line, after the value (e.g. an eyedropper). */
  addAccessory(el: HTMLElement): void;
}

let sliderId = 0;

/**
 * Signed when the range spans zero (with a true minus sign), at the step's
 * precision: "+12", "−45", "0".
 */
export function defaultFormat(min: number, step: number): (value: number) => string {
  const decimals = decimalsOf(step);
  return (value) => signed(value, decimals, min < 0);
}

/** "+1.5", "−1.5", "0.0" (never "−0"); positives lose the "+" when `sign` is false. */
export function signed(value: number, decimals = 0, sign = true): string {
  const text = Math.abs(value).toFixed(decimals);
  if (Number(text) === 0) return text;
  if (value < 0) return `−${text}`;
  return sign ? `+${text}` : text;
}

function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/**
 * Read a typed value: tolerant of signs, units and the typographic minus
 * ("−12", "+35", "1.5°", "80%"). Null when there's no number in it.
 */
export function parseTyped(text: string): number | null {
  const match = text.replace(/[−–]/g, "-").match(/[-+]?\d*[.,]?\d+/);
  if (!match) return null;
  const value = Number(match[0].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Clamp to the range and snap to the step grid (anchored at `min`). */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step;
  const clamped = Math.min(max, Math.max(min, snapped));
  return Number(clamped.toFixed(decimalsOf(step)));
}

/**
 * The editor's slider: a label with a changed-dot, a filled (or semantic)
 * track, and a value you can type into. Double-click the label or the track
 * to return to neutral. Keyboard: the track takes the arrow keys; the value
 * field takes typing, ↑/↓ (Shift for ×10), Enter, and Escape to revert.
 */
export function createSlider(options: SliderOptions, signal?: AbortSignal): SliderHandle {
  const { min, max, onInput, onChange } = options;
  const step = options.step ?? 1;
  const neutral = options.neutral ?? (min < 0 && max > 0 ? 0 : min);
  const fillFrom = options.fillFrom ?? neutral;
  const format = options.format ?? defaultFormat(min, step);
  const parse = options.parse ?? parseTyped;
  const listen = signal ? { signal } : undefined;
  const id = `rt-slider-${++sliderId}`;

  const dot = h("span", { class: "rt-slider__dot", "aria-hidden": "true" });
  const labelText = document.createTextNode(options.label);
  const labelEl = h(
    "label",
    { class: "rt-dock__slider-label rt-slider__label", for: id, title: "Double-click to reset" },
    labelText,
    dot,
  );
  const input = h("input", {
    id,
    class: "rt-slider__range",
    type: "range",
    min,
    max,
    step,
    value: options.value,
  }) as HTMLInputElement;
  const field = h("input", {
    class: "rt-dock__slider-value rt-slider__value",
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    spellcheck: "false",
  }) as HTMLInputElement;
  const root = h(
    "div",
    { class: "rt-dock__group rt-dock__slider rt-slider" },
    labelEl,
    input,
    field,
  );

  function name(label: string, ariaLabel?: string): void {
    input.setAttribute("aria-label", ariaLabel ?? label);
    field.setAttribute("aria-label", `${ariaLabel ?? label} value`);
  }
  name(options.label, options.ariaLabel);

  function setTrack(track: string | null): void {
    root.classList.toggle("rt-slider--track", !!track);
    if (track) input.style.setProperty("--rt-slider-track", track);
    else input.style.removeProperty("--rt-slider-track");
  }
  setTrack(options.track ?? null);

  /** Reflect the input's value everywhere it shows. */
  function paint(): void {
    const value = Number(input.value);
    const text = format(value);
    if (document.activeElement !== field) field.value = text;
    input.setAttribute("aria-valuetext", text);
    root.classList.toggle("rt-slider--changed", value !== neutral);
    refreshRangeFill(input, fillFrom);
  }
  paint();

  /** Set from the UI: paint, then report like a drag would. */
  function commit(value: number): void {
    const next = snapToStep(value, min, max, step);
    const changed = next !== Number(input.value);
    input.value = String(next);
    field.value = format(next);
    paint();
    if (!changed) return;
    onInput(next);
    onChange?.(next);
  }

  input.addEventListener(
    "input",
    () => {
      paint();
      onInput(Number(input.value));
    },
    listen,
  );
  input.addEventListener("change", () => onChange?.(Number(input.value)), listen);

  const reset = (): void => commit(neutral);
  labelEl.addEventListener("dblclick", reset, listen);
  input.addEventListener("dblclick", reset, listen);

  /** Take what was typed, or put the current value back if it isn't a number. */
  function commitField(): void {
    const typed = parse(field.value);
    if (typed === null) field.value = format(Number(input.value));
    else commit(typed);
  }

  field.addEventListener("focus", () => field.select(), listen);
  field.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitField();
        field.select();
      } else if (e.key === "Escape") {
        // Revert; the editor's Escape handling then just leaves the field.
        field.value = format(Number(input.value));
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const delta = (e.key === "ArrowUp" ? step : -step) * (e.shiftKey ? 10 : 1);
        commit(Number(input.value) + delta);
        field.value = format(Number(input.value));
        field.select();
      }
    },
    listen,
  );
  field.addEventListener("blur", commitField, listen);

  return {
    root,
    input,
    get value() {
      return Number(input.value);
    },
    set(value) {
      input.value = String(value);
      field.value = format(Number(input.value));
      paint();
    },
    setLabel(label, ariaLabel) {
      labelText.textContent = label;
      name(label, ariaLabel);
    },
    setTrack,
    setDisabled(disabled) {
      input.disabled = disabled;
      field.disabled = disabled;
      root.classList.toggle("rt-slider--disabled", disabled);
    },
    addAccessory(el) {
      root.appendChild(el);
    },
  };
}
