import type { AspectRatioPreset, EditorTool, ImageEdits, ViewHandle } from "../../types";
import { h } from "../h";
import type { AdjustToolHandle } from "./adjust-tool";
import type { CropToolHandle } from "./crop-tool";
import type { FiltersToolHandle } from "./filters-tool";
import type { TrimToolHandle } from "./trim-tool";

export type TransformOp = "rotate-ccw" | "rotate-cw" | "flip-h" | "flip-v";

export interface PropertiesPanelOptions {
  cropTool: CropToolHandle;
  adjustTool: AdjustToolHandle;
  filtersTool: FiltersToolHandle;
  /** Present only for video entries. */
  trimTool?: TrimToolHandle;
  edits: ImageEdits;
  onRotationChange: (degrees: number) => void;
  onTransform: (op: TransformOp) => void;
}

export interface PropertiesPanelHandle extends ViewHandle {
  setActiveTool(tool: EditorTool): void;
  /** Sync the rotation slider after an external change (does not fire onRotationChange). */
  setRotation(degrees: number): void;
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

export function createPropertiesPanel(options: PropertiesPanelOptions): PropertiesPanelHandle {
  const { cropTool, adjustTool, filtersTool, trimTool, edits, onRotationChange, onTransform } =
    options;
  const abort = new AbortController();
  const signal = abort.signal;

  // ── Transform buttons ──

  const transformRow = h("div", { class: "rt-props__transform" });
  for (const def of TRANSFORM_BUTTONS) {
    const btn = h("button", {
      class: "rt-props__transform-btn",
      title: def.label,
      "aria-label": def.label,
    });
    btn.innerHTML = def.icon;
    btn.addEventListener("click", () => onTransform(def.op), { signal });
    transformRow.appendChild(btn);
  }

  // ── Crop properties ──

  const aspectBtns = new Map<AspectRatioPreset, HTMLElement>();
  const aspectGrid = h("div", { class: "rt-props__aspect-grid" });

  for (const preset of ASPECT_PRESETS) {
    const isActive = cropTool.getAspectRatio() === preset.id;
    const btn = h(
      "button",
      {
        class: `rt-props__aspect-btn${isActive ? " rt-props__aspect-btn--active" : ""}`,
      },
      preset.label,
    );

    btn.addEventListener(
      "click",
      () => {
        for (const b of aspectBtns.values()) {
          b.classList.remove("rt-props__aspect-btn--active");
        }
        btn.classList.add("rt-props__aspect-btn--active");
        cropTool.setAspectRatio(preset.id);
      },
      { signal },
    );

    aspectBtns.set(preset.id, btn);
    aspectGrid.appendChild(btn);
  }

  const rotationValue = h("span", { class: "rt-props__slider-value" }, `${edits.rotation}\u00b0`);
  const rotationInput = h("input", {
    type: "range",
    min: -45,
    max: 45,
    step: 1,
    value: edits.rotation,
  }) as HTMLInputElement;

  rotationInput.addEventListener(
    "input",
    () => {
      const deg = Number(rotationInput.value);
      rotationValue.textContent = `${deg}\u00b0`;
      onRotationChange(deg);
    },
    { signal },
  );

  const cropProps = h(
    "div",
    null,
    h("div", { class: "rt-props__title" }, "Crop"),
    h(
      "div",
      { class: "rt-props__row" },
      h("div", { class: "rt-props__label" }, "Transform"),
      transformRow,
    ),
    h(
      "div",
      { class: "rt-props__row" },
      h("div", { class: "rt-props__label" }, "Aspect Ratio"),
      aspectGrid,
    ),
    h(
      "div",
      { class: "rt-props__row" },
      h("div", { class: "rt-props__label" }, "Rotation"),
      h("div", { class: "rt-props__slider" }, rotationInput, rotationValue),
    ),
    h("div", { class: "rt-props__divider" }),
  );

  // ── Adjust properties ──
  const adjustProps = adjustTool.root;

  // ── Filters properties ──
  const filtersProps = filtersTool.root;

  // ── Trim properties (video only) ──
  const trimProps = trimTool?.root ?? null;

  // ── Panel ──
  const content = h("div");
  if (trimProps) content.appendChild(trimProps);
  content.appendChild(cropProps);
  content.appendChild(adjustProps);
  content.appendChild(filtersProps);

  // Initially show crop (the editor immediately sets the real active tool)
  adjustProps.style.display = "none";
  filtersProps.style.display = "none";
  if (trimProps) trimProps.style.display = "none";

  const root = h("div", { class: "rt-props" }, content);

  return {
    root,
    setActiveTool(tool) {
      cropProps.style.display = tool === "crop" ? "" : "none";
      adjustProps.style.display = tool === "adjust" ? "" : "none";
      filtersProps.style.display = tool === "filters" ? "" : "none";
      if (trimProps) trimProps.style.display = tool === "trim" ? "" : "none";
    },
    setRotation(degrees) {
      rotationInput.value = String(degrees);
      rotationValue.textContent = `${degrees}°`;
    },
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
