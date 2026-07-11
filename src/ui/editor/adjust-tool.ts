import type { Adjustments } from "../../types";
import { h } from "../h";

export interface AdjustToolOptions {
  adjustments: Adjustments;
  onChange: (adjustments: Adjustments) => void;
  /** Starts the white-balance eyedropper (click a neutral area on the canvas). */
  onWhiteBalancePick?: () => void;
}

export interface AdjustToolHandle {
  root: HTMLElement;
  getAdjustments(): Adjustments;
  /** Sync the UI after an external change (does not fire onChange). */
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

const DEFS: SliderDef[] = [
  { key: "exposure", label: "Exposure", min: -100, max: 100, neutral: 0 },
  { key: "brightness", label: "Brightness", min: 0, max: 200, neutral: 100 },
  { key: "contrast", label: "Contrast", min: 0, max: 200, neutral: 100 },
  { key: "temperature", label: "Temperature", min: -100, max: 100, neutral: 0 },
  { key: "tint", label: "Tint", min: -100, max: 100, neutral: 0 },
  { key: "hue", label: "Hue", min: -180, max: 180, neutral: 0 },
  { key: "saturation", label: "Saturation", min: 0, max: 200, neutral: 100 },
  { key: "vibrance", label: "Vibrance", min: -100, max: 100, neutral: 0 },
  { key: "sharpen", label: "Sharpen", min: 0, max: 100, neutral: 0 },
  { key: "blur", label: "Blur", min: 0, max: 100, neutral: 0 },
  { key: "grain", label: "Grain", min: 0, max: 100, neutral: 0 },
  { key: "vignette", label: "Vignette", min: 0, max: 100, neutral: 0 },
];

/** Signed offset from neutral: "0", "+12", "-45". */
function formatValue(value: number, neutral: number): string {
  const diff = value - neutral;
  if (diff === 0) return "0";
  return diff > 0 ? `+${diff}` : `${diff}`;
}

/**
 * One slider + a horizontal chip per adjustment (the Pintura/Apple Photos
 * finetune pattern). Selecting a chip retargets the slider; a dot on the chip
 * marks values away from neutral. Double-click a chip or the slider label to
 * reset that adjustment.
 */
export function createAdjustTool(options: AdjustToolOptions): AdjustToolHandle {
  const adj: Adjustments = { ...options.adjustments };
  const abort = new AbortController();
  const signal = abort.signal;

  let selected: SliderDef = DEFS[0];
  const chips = new Map<keyof Adjustments, HTMLElement>();

  // ── Slider row (retargeted by the chips) ──

  const label = h(
    "span",
    { class: "rt-dock__slider-label", title: "Double-click to reset" },
    selected.label,
  );
  const valueEl = h(
    "span",
    { class: "rt-dock__slider-value" },
    formatValue(adj[selected.key], selected.neutral),
  );
  const input = h("input", {
    type: "range",
    min: selected.min,
    max: selected.max,
    step: 1,
    value: adj[selected.key],
    "aria-label": selected.label,
  }) as HTMLInputElement;

  function syncChipDot(key: keyof Adjustments): void {
    const def = DEFS.find((d) => d.key === key);
    chips.get(key)?.classList.toggle("rt-dock__chip--touched", adj[key] !== def?.neutral);
  }

  function setValue(value: number): void {
    adj[selected.key] = value;
    input.value = String(value);
    valueEl.textContent = formatValue(value, selected.neutral);
    syncChipDot(selected.key);
    options.onChange({ ...adj });
  }

  input.addEventListener("input", () => setValue(Number(input.value)), { signal });
  label.addEventListener("dblclick", () => setValue(selected.neutral), { signal });

  const sliderRow = h("div", { class: "rt-dock__row rt-dock__slider" }, label, input, valueEl);
  if (options.onWhiteBalancePick) {
    const wbBtn = h("button", {
      class: "rt-dock__icon-btn rt-adjust__wb",
      title: "White balance: click a neutral gray/white area in the image",
      "aria-label": "White balance eyedropper",
    });
    wbBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13.6 4.4l6 6M15.5 8.5L6.2 17.8a2 2 0 01-.9.5l-2.8.7.7-2.8a2 2 0 01.5-.9l9.3-9.3a2.1 2.1 0 013 3z"/></svg>';
    wbBtn.addEventListener("click", () => options.onWhiteBalancePick?.(), { signal });
    sliderRow.appendChild(wbBtn);
  }

  // ── Chip row ──

  function select(def: SliderDef): void {
    chips.get(selected.key)?.classList.remove("rt-dock__chip--active");
    selected = def;
    chips.get(def.key)?.classList.add("rt-dock__chip--active");
    label.textContent = def.label;
    input.min = String(def.min);
    input.max = String(def.max);
    input.value = String(adj[def.key]);
    input.setAttribute("aria-label", def.label);
    valueEl.textContent = formatValue(adj[def.key], def.neutral);
  }

  const chipRow = h("div", { class: "rt-dock__row rt-dock__chips" });
  for (const def of DEFS) {
    const chip = h(
      "button",
      {
        class: `rt-dock__chip${def === selected ? " rt-dock__chip--active" : ""}`,
        title: `${def.label} — double-click to reset`,
      },
      def.label,
    );
    chip.addEventListener("click", () => select(def), { signal });
    chip.addEventListener(
      "dblclick",
      () => {
        select(def);
        setValue(def.neutral);
      },
      { signal },
    );
    chips.set(def.key, chip);
    chipRow.appendChild(chip);
  }

  for (const def of DEFS) syncChipDot(def.key);

  const root = h("div", { class: "rt-adjust" }, sliderRow, chipRow);

  return {
    root,
    getAdjustments: () => ({ ...adj }),
    setAdjustments(next) {
      for (const def of DEFS) {
        adj[def.key] = next[def.key];
        syncChipDot(def.key);
      }
      input.value = String(adj[selected.key]);
      valueEl.textContent = formatValue(adj[selected.key], selected.neutral);
    },
    destroy() {
      abort.abort();
    },
  };
}
