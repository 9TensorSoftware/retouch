import { h } from "../h";

export interface RulerOptions {
  label: string;
  min: number;
  max: number;
  /** Value resolution (dragging snaps to it). */
  step: number;
  value: number;
  /** Arrow-key step; Shift multiplies it by ten. */
  keyStep: number;
  /** Tick spacing: screen px per unit. */
  pxPerUnit?: number;
  /** Units between numbered ticks. */
  labelEvery?: number;
  format: (value: number) => string;
  onInput: (value: number) => void;
  onChange?: (value: number) => void;
}

export interface RulerHandle {
  root: HTMLElement;
  readonly value: number;
  /** Move without firing callbacks. */
  set(value: number): void;
}

/**
 * A tape you drag sideways to set a value, read against a fixed center mark
 * (the straighten control). It's an ARIA slider: arrows nudge, Shift+arrows
 * nudge ten times as far, Home/End/0 jump, double-click returns to zero.
 */
export function createRuler(options: RulerOptions, signal?: AbortSignal): RulerHandle {
  const { min, max, step, format } = options;
  const ppu = options.pxPerUnit ?? 8;
  const listen = signal ? { signal } : undefined;
  let value = options.value;

  const valueEl = h("span", { class: "rt-ruler__value" });
  const ticks = h("div", { class: "rt-ruler__ticks", "aria-hidden": "true" });
  ticks.style.width = `${(max - min) * ppu + 1}px`;
  ticks.style.setProperty("--rt-ruler-unit", `${ppu}px`);
  const every = options.labelEvery ?? 15;
  for (let v = Math.ceil(min / every) * every; v <= max; v += every) {
    const mark = h(
      "span",
      { class: "rt-ruler__mark" },
      v === 0 ? "0" : `${v > 0 ? "" : "−"}${Math.abs(v)}`,
    );
    mark.style.left = `${(v - min) * ppu}px`;
    ticks.appendChild(mark);
  }
  const tape = h(
    "div",
    {
      class: "rt-ruler",
      role: "slider",
      tabindex: 0,
      "aria-label": options.label,
      "aria-valuemin": min,
      "aria-valuemax": max,
    },
    ticks,
  );
  const root = h(
    "div",
    { class: "rt-ruler-field" },
    h(
      "div",
      { class: "rt-ruler__head" },
      h("span", { class: "rt-ruler__label" }, options.label),
      valueEl,
    ),
    tape,
  );

  const snap = (v: number): number => {
    const snapped = Math.round(v / step) * step;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(4));
  };

  function paint(): void {
    ticks.style.transform = `translateX(${(min - value) * ppu}px)`;
    valueEl.textContent = format(value);
    tape.setAttribute("aria-valuenow", String(value));
    tape.setAttribute("aria-valuetext", format(value));
    root.classList.toggle("rt-ruler-field--changed", value !== 0);
  }
  paint();

  function update(next: number, done: boolean): void {
    const snapped = snap(next);
    if (snapped === value) {
      if (done) options.onChange?.(value);
      return;
    }
    value = snapped;
    paint();
    options.onInput(value);
    if (done) options.onChange?.(value);
  }

  let drag: { x: number; from: number; id: number } | null = null;
  tape.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      tape.focus({ preventScroll: true });
      drag = { x: e.clientX, from: value, id: e.pointerId };
      try {
        tape.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers can't be captured
      }
      tape.classList.add("rt-ruler--dragging");
    },
    listen,
  );
  tape.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      // Pull the tape left to read higher values at the center mark.
      update(drag.from - (e.clientX - drag.x) / ppu, false);
    },
    listen,
  );
  const end = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    tape.classList.remove("rt-ruler--dragging");
    options.onChange?.(value);
  };
  tape.addEventListener("pointerup", end, listen);
  tape.addEventListener("pointercancel", end, listen);
  tape.addEventListener("dblclick", () => update(0, true), listen);

  tape.addEventListener(
    "keydown",
    (e) => {
      const nudge = options.keyStep * (e.shiftKey ? 10 : 1);
      const keys: Record<string, number> = {
        ArrowRight: value + nudge,
        ArrowUp: value + nudge,
        ArrowLeft: value - nudge,
        ArrowDown: value - nudge,
        PageUp: value + options.keyStep * 10,
        PageDown: value - options.keyStep * 10,
        Home: min,
        End: max,
        "0": 0,
      };
      if (!(e.key in keys)) return;
      e.preventDefault();
      e.stopPropagation();
      update(keys[e.key], true);
    },
    listen,
  );

  return {
    root,
    get value() {
      return value;
    },
    set(next) {
      value = snap(next);
      paint();
    },
  };
}
