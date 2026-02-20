import type { AspectRatioPreset, EditorTool, ImageEdits, ViewHandle } from "../../types";
import { h } from "../h";
import type { AdjustToolHandle } from "./adjust-tool";
import type { CropToolHandle } from "./crop-tool";

export interface PropertiesPanelOptions {
  cropTool: CropToolHandle;
  adjustTool: AdjustToolHandle;
  edits: ImageEdits;
  onRotationChange: (degrees: number) => void;
}

export interface PropertiesPanelHandle extends ViewHandle {
  setActiveTool(tool: EditorTool): void;
}

const ASPECT_PRESETS: { id: AspectRatioPreset; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "16:9", label: "16:9" },
  { id: "4:3", label: "4:3" },
  { id: "1:1", label: "1:1" },
  { id: "3:2", label: "3:2" },
  { id: "9:16", label: "9:16" },
];

export function createPropertiesPanel(options: PropertiesPanelOptions): PropertiesPanelHandle {
  const { cropTool, adjustTool, edits, onRotationChange } = options;
  const abort = new AbortController();
  const signal = abort.signal;

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

  // ── Panel ──
  const content = h("div");
  content.appendChild(cropProps);
  content.appendChild(adjustProps);

  // Initially show crop
  adjustProps.style.display = "none";

  const root = h("div", { class: "rt-props" }, content);

  return {
    root,
    setActiveTool(tool) {
      cropProps.style.display = tool === "crop" ? "" : "none";
      adjustProps.style.display = tool === "adjust" ? "" : "none";
    },
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
