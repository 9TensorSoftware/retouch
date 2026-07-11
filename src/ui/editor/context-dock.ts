import type { AspectRatioPreset, EditorTool, ImageEdits, ViewHandle } from "../../types";
import { h } from "../h";
import type { AdjustToolHandle } from "./adjust-tool";
import type { CropToolHandle } from "./crop-tool";
import type { FiltersToolHandle } from "./filters-tool";
import type { TrimToolHandle } from "./trim-tool";

export type TransformOp = "rotate-ccw" | "rotate-cw" | "flip-h" | "flip-v";

export interface ContextDockOptions {
  cropTool: CropToolHandle;
  adjustTool: AdjustToolHandle;
  filtersTool: FiltersToolHandle;
  /** Present only for video entries. */
  trimTool?: TrimToolHandle;
  /** Panes contributed by registered custom tools. */
  customPanes?: Array<{ id: EditorTool; root: HTMLElement }>;
  edits: ImageEdits;
  onRotationChange: (degrees: number) => void;
  onTransform: (op: TransformOp) => void;
  /** Commit the pending crop selection. */
  onApplyCrop: () => void;
  /** Restore the full original frame. */
  onResetCrop: () => void;
  /** Perspective (keystone) correction changed. */
  onKeystoneChange: (vertical: number, horizontal: number) => void;
}

export interface ContextDockHandle extends ViewHandle {
  setActiveTool(tool: EditorTool): void;
  /** Sync the straighten slider after an external change (does not fire onRotationChange). */
  setRotation(degrees: number): void;
  /** Enable/disable the Apply-crop button (enabled while a selection is pending). */
  setCropApplyEnabled(enabled: boolean): void;
  /** Enable/disable Reset-crop (enabled while a crop is committed). */
  setCropResetEnabled(enabled: boolean): void;
  /** Reflect the crop tool's aspect preset in the chips. */
  setAspect(preset: AspectRatioPreset): void;
  /** Sync the keystone sliders after an external change (does not fire onKeystoneChange). */
  setKeystone(vertical: number, horizontal: number): void;
}

const ASPECT_PRESETS: { id: AspectRatioPreset; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "16:9", label: "16:9" },
  { id: "4:3", label: "4:3" },
  { id: "1:1", label: "1:1" },
  { id: "3:2", label: "3:2" },
  { id: "9:16", label: "9:16" },
];

const TRANSFORM_BUTTONS: { op: TransformOp; label: string; icon: string }[] = [
  {
    op: "rotate-ccw",
    label: "Rotate left",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 10a8 8 0 108-8"/><path d="M4 3v7h7"/></svg>',
  },
  {
    op: "rotate-cw",
    label: "Rotate right",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 10a8 8 0 10-8-8"/><path d="M20 3v7h-7"/></svg>',
  },
  {
    op: "flip-h",
    label: "Flip horizontal",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 2v20M8 7H4v10h4zM16 7h4v10h-4z"/></svg>',
  },
  {
    op: "flip-v",
    label: "Flip vertical",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12h20M7 8V4h10v4zM7 16v4h10v-4z"/></svg>',
  },
];

/**
 * Contextual controls strip below the canvas (Pintura-style): one horizontal
 * pane per tool, only the active tool's pane visible.
 */
export function createContextDock(options: ContextDockOptions): ContextDockHandle {
  const { cropTool, adjustTool, filtersTool, trimTool, edits, onRotationChange, onTransform } =
    options;
  const abort = new AbortController();
  const signal = abort.signal;

  // ── Crop pane: transforms · aspect chips · straighten ──

  const transformGroup = h("div", { class: "rt-dock__group" });
  for (const def of TRANSFORM_BUTTONS) {
    const btn = h("button", {
      class: "rt-dock__icon-btn",
      title: def.label,
      "aria-label": def.label,
    });
    btn.innerHTML = def.icon;
    btn.addEventListener("click", () => onTransform(def.op), { signal });
    transformGroup.appendChild(btn);
  }

  const aspectBtns = new Map<AspectRatioPreset, HTMLElement>();
  const aspectGroup = h("div", { class: "rt-dock__group" });
  function setActiveAspect(preset: AspectRatioPreset): void {
    for (const [id, b] of aspectBtns) {
      b.classList.toggle("rt-dock__chip--active", id === preset);
    }
  }
  for (const preset of ASPECT_PRESETS) {
    const isActive = cropTool.getAspectRatio() === preset.id;
    const btn = h(
      "button",
      { class: `rt-dock__chip${isActive ? " rt-dock__chip--active" : ""}` },
      preset.label,
    );
    btn.addEventListener(
      "click",
      () => {
        setActiveAspect(preset.id);
        cropTool.setAspectRatio(preset.id);
      },
      { signal },
    );
    aspectBtns.set(preset.id, btn);
    aspectGroup.appendChild(btn);
  }

  // Commit / restore — the selection only takes effect on Apply.
  const applyBtn = h(
    "button",
    { class: "rt-dock__chip rt-dock__chip--primary", disabled: "" },
    "Apply crop",
  );
  applyBtn.addEventListener("click", () => options.onApplyCrop(), { signal });
  const resetCropBtn = h("button", { class: "rt-dock__chip", disabled: "" }, "Reset crop");
  resetCropBtn.addEventListener("click", () => options.onResetCrop(), { signal });
  const commitGroup = h("div", { class: "rt-dock__group" }, applyBtn, resetCropBtn);

  /** Inline labeled slider with double-click-to-reset. */
  function makeSlider(
    label: string,
    min: number,
    max: number,
    value: number,
    format: (v: number) => string,
    onInput: (v: number) => void,
  ) {
    const valueEl = h("span", { class: "rt-dock__slider-value" }, format(value));
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
        valueEl.textContent = format(Number(input.value));
        onInput(Number(input.value));
      },
      { signal },
    );
    const labelEl = h(
      "span",
      { class: "rt-dock__slider-label", title: "Double-click to reset" },
      label,
    );
    labelEl.addEventListener(
      "dblclick",
      () => {
        input.value = "0";
        valueEl.textContent = format(0);
        onInput(0);
      },
      { signal },
    );
    const group = h("div", { class: "rt-dock__group rt-dock__slider" }, labelEl, input, valueEl);
    const set = (v: number): void => {
      input.value = String(v);
      valueEl.textContent = format(v);
    };
    return { group, set };
  }

  const straighten = makeSlider(
    "Straighten",
    -45,
    45,
    edits.rotation,
    (v) => `${v}°`,
    (v) => onRotationChange(v),
  );
  const keystoneVSlider = makeSlider("Vertical", -100, 100, edits.keystoneV, String, (v) =>
    options.onKeystoneChange(v, Number.NaN),
  );
  const keystoneHSlider = makeSlider("Horizontal", -100, 100, edits.keystoneH, String, (v) =>
    options.onKeystoneChange(Number.NaN, v),
  );

  const divider = () => h("div", { class: "rt-dock__divider" });
  const cropPane = h(
    "div",
    { class: "rt-dock__pane rt-crop-pane" },
    h(
      "div",
      { class: "rt-dock__row" },
      commitGroup,
      divider(),
      aspectGroup,
      divider(),
      transformGroup,
    ),
    h(
      "div",
      { class: "rt-dock__row" },
      straighten.group,
      divider(),
      h("span", { class: "rt-dock__slider-label rt-dock__row-title" }, "Perspective"),
      keystoneVSlider.group,
      keystoneHSlider.group,
    ),
  );

  // ── Tool panes ──

  const adjustPane = h("div", { class: "rt-dock__pane" }, adjustTool.root);
  const filtersPane = h("div", { class: "rt-dock__pane" }, filtersTool.root);
  const trimPane = trimTool ? h("div", { class: "rt-dock__pane" }, trimTool.root) : null;

  const root = h("div", { class: "rt-dock" }, cropPane, adjustPane, filtersPane);
  if (trimPane) root.appendChild(trimPane);

  const panes: Partial<Record<EditorTool, HTMLElement>> = {
    crop: cropPane,
    adjust: adjustPane,
    filters: filtersPane,
    ...(trimPane ? { trim: trimPane } : {}),
  };

  for (const custom of options.customPanes ?? []) {
    const pane = h("div", { class: "rt-dock__pane" }, custom.root);
    root.appendChild(pane);
    panes[custom.id] = pane;
  }

  return {
    root,
    setActiveTool(tool) {
      for (const [id, pane] of Object.entries(panes)) {
        if (pane) pane.style.display = id === tool ? "" : "none";
      }
    },
    setRotation(degrees) {
      straighten.set(degrees);
    },
    setKeystone(vertical, horizontal) {
      keystoneVSlider.set(vertical);
      keystoneHSlider.set(horizontal);
    },
    setCropApplyEnabled(enabled) {
      applyBtn.toggleAttribute("disabled", !enabled);
    },
    setCropResetEnabled(enabled) {
      resetCropBtn.toggleAttribute("disabled", !enabled);
    },
    setAspect(preset) {
      setActiveAspect(preset);
    },
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
