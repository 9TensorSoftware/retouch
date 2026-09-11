import type { EditMask, LocalAdjust, MaskKind } from "../../types";
import { createDefaultLocalAdjust } from "../../utils/masks";
import { h } from "../h";
import { refreshRangeFill } from "../range-fill";

export interface MasksToolOptions {
  masks: EditMask[];
  /** Fires with the full cloned mask list on any change. */
  onChange: (masks: EditMask[]) => void;
  /** Fires when the selected mask changes (null = none). */
  onSelectionChange: (id: string | null) => void;
}

export interface MasksToolHandle {
  root: HTMLElement;
  getSelectedId(): string | null;
  /** Sync after an external change (undo/reset) — does not fire onChange. */
  setMasks(masks: EditMask[]): void;
  destroy(): void;
}

const ADJ_DEFS: { key: keyof LocalAdjust; label: string }[] = [
  { key: "exposure", label: "Exposure" },
  { key: "brightness", label: "Brightness" },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation" },
  { key: "temperature", label: "Temperature" },
  { key: "tint", label: "Tint" },
];

let maskCounter = 0;

/**
 * Selective-adjustment masks: add linear/radial masks, pick one, then dial
 * local adjustments that apply only inside its gradient. Geometry is edited
 * by dragging the handles on the canvas.
 */
export function createMasksTool(options: MasksToolOptions): MasksToolHandle {
  let masks: EditMask[] = structuredClone(options.masks);
  let selectedId: string | null = masks[0]?.id ?? null;
  let adjKey: keyof LocalAdjust = "exposure";
  const abort = new AbortController();
  const signal = abort.signal;

  const selected = (): EditMask | undefined => masks.find((m) => m.id === selectedId);

  function emit(): void {
    options.onChange(structuredClone(masks));
  }

  function format(v: number): string {
    if (v === 0) return "0";
    return v > 0 ? `+${v}` : `${v}`;
  }

  // ── Row 2: retargeted slider ──

  const label = h(
    "span",
    { class: "rt-dock__slider-label", title: "Double-click to reset" },
    "Exposure",
  );
  const valueEl = h("span", { class: "rt-dock__slider-value" }, "0");
  const input = h("input", {
    type: "range",
    min: -100,
    max: 100,
    step: 1,
    value: 0,
    "aria-label": "Mask exposure",
  }) as HTMLInputElement;
  refreshRangeFill(input);
  input.addEventListener(
    "input",
    () => {
      const mask = selected();
      if (!mask) return;
      mask.adjust[adjKey] = Number(input.value);
      valueEl.textContent = format(mask.adjust[adjKey]);
      refreshRangeFill(input);
      syncAdjDots();
      emit();
    },
    { signal },
  );
  label.addEventListener(
    "dblclick",
    () => {
      const mask = selected();
      if (!mask) return;
      mask.adjust[adjKey] = 0;
      syncSlider();
      syncAdjDots();
      emit();
    },
    { signal },
  );
  const sliderRow = h("div", { class: "rt-dock__row rt-dock__slider" }, label, input, valueEl);

  // ── Row 3: adjustment chips ──

  const adjChips = new Map<keyof LocalAdjust, HTMLElement>();
  const adjRow = h("div", { class: "rt-dock__row rt-dock__chips" });
  for (const def of ADJ_DEFS) {
    const chip = h(
      "button",
      { class: `rt-dock__chip${def.key === adjKey ? " rt-dock__chip--active" : ""}` },
      def.label,
    );
    chip.addEventListener(
      "click",
      () => {
        adjChips.get(adjKey)?.classList.remove("rt-dock__chip--active");
        adjKey = def.key;
        adjChips.get(adjKey)?.classList.add("rt-dock__chip--active");
        label.textContent = def.label;
        input.setAttribute("aria-label", `Mask ${def.label.toLowerCase()}`);
        syncSlider();
      },
      { signal },
    );
    adjChips.set(def.key, chip);
    adjRow.appendChild(chip);
  }

  function syncSlider(): void {
    const mask = selected();
    const value = mask ? mask.adjust[adjKey] : 0;
    input.value = String(value);
    valueEl.textContent = format(value);
    refreshRangeFill(input);
    input.toggleAttribute("disabled", !mask);
  }

  function syncAdjDots(): void {
    const mask = selected();
    for (const def of ADJ_DEFS) {
      adjChips
        .get(def.key)
        ?.classList.toggle("rt-dock__chip--touched", !!mask && mask.adjust[def.key] !== 0);
    }
  }

  // ── Row 1: mask management ──

  const maskChipWrap = h("div", { class: "rt-dock__group" });
  const invertBtn = h(
    "button",
    { class: "rt-dock__chip", title: "Apply outside the shape" },
    "Invert",
  );
  const deleteBtn = h("button", { class: "rt-dock__chip", title: "Delete this mask" }, "Delete");

  function select(id: string | null): void {
    selectedId = id;
    renderMaskChips();
    syncSlider();
    syncAdjDots();
    syncMaskButtons();
    options.onSelectionChange(id);
  }

  function addMask(kind: MaskKind): void {
    maskCounter++;
    const mask: EditMask = {
      id: `mask-${maskCounter}-${Math.floor(performance.now() % 100000)}`,
      kind,
      // Sensible starting geometry: linear fades from the top third; radial
      // sits centered at ~half size.
      x0: kind === "linear" ? 0.5 : 0.5,
      y0: kind === "linear" ? 0.1 : 0.5,
      x1: kind === "linear" ? 0.5 : 0.78,
      y1: kind === "linear" ? 0.6 : 0.72,
      invert: false,
      adjust: createDefaultLocalAdjust(),
    };
    masks.push(mask);
    select(mask.id);
    emit();
  }

  const addLinear = h("button", { class: "rt-dock__chip rt-dock__chip--primary" }, "＋ Linear");
  addLinear.addEventListener("click", () => addMask("linear"), { signal });
  const addRadial = h("button", { class: "rt-dock__chip rt-dock__chip--primary" }, "＋ Radial");
  addRadial.addEventListener("click", () => addMask("radial"), { signal });

  invertBtn.addEventListener(
    "click",
    () => {
      const mask = selected();
      if (!mask) return;
      mask.invert = !mask.invert;
      syncMaskButtons();
      emit();
    },
    { signal },
  );
  deleteBtn.addEventListener(
    "click",
    () => {
      if (!selectedId) return;
      masks = masks.filter((m) => m.id !== selectedId);
      select(masks[0]?.id ?? null);
      emit();
    },
    { signal },
  );

  function renderMaskChips(): void {
    maskChipWrap.innerHTML = "";
    masks.forEach((mask, index) => {
      const touched = Object.values(mask.adjust).some((v) => v !== 0);
      const chip = h(
        "button",
        {
          class: `rt-dock__chip${mask.id === selectedId ? " rt-dock__chip--active" : ""}${touched ? " rt-dock__chip--touched" : ""}`,
        },
        `${mask.kind === "linear" ? "Linear" : "Radial"} ${index + 1}`,
      );
      chip.addEventListener("click", () => select(mask.id), { signal });
      maskChipWrap.appendChild(chip);
    });
    if (masks.length === 0) {
      maskChipWrap.appendChild(h("span", { class: "rt-dock__hint" }, "Add a mask to start"));
    }
  }

  function syncMaskButtons(): void {
    const mask = selected();
    invertBtn.toggleAttribute("disabled", !mask);
    invertBtn.classList.toggle("rt-dock__chip--active", !!mask?.invert);
    deleteBtn.toggleAttribute("disabled", !mask);
  }

  const divider = () => h("div", { class: "rt-dock__divider" });
  const mgmtRow = h(
    "div",
    { class: "rt-dock__row" },
    addLinear,
    addRadial,
    divider(),
    maskChipWrap,
    divider(),
    invertBtn,
    deleteBtn,
  );

  const root = h("div", { class: "rt-masks rt-dock__stack" }, mgmtRow, sliderRow, adjRow);

  renderMaskChips();
  syncSlider();
  syncAdjDots();
  syncMaskButtons();

  return {
    root,
    getSelectedId: () => selectedId,
    setMasks(next) {
      masks = structuredClone(next);
      if (!masks.some((m) => m.id === selectedId)) selectedId = masks[0]?.id ?? null;
      renderMaskChips();
      syncSlider();
      syncAdjDots();
      syncMaskButtons();
      options.onSelectionChange(selectedId);
    },
    destroy() {
      abort.abort();
    },
  };
}
