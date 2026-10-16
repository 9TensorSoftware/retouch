import { ASPECT_RATIOS } from "../../constants";
import type { AspectRatioPreset, EditorTool, ImageEdits, ViewHandle } from "../../types";
import { h } from "../h";
import { ICON_FLIP_H, ICON_FLIP_V, ICON_ROTATE_CCW, ICON_ROTATE_CW } from "../icons";
import type { AdjustToolHandle } from "./adjust-tool";
import { createSection } from "./controls";
import type { CropToolHandle } from "./crop-tool";
import type { CurvesToolHandle } from "./curves-tool";
import type { FiltersToolHandle } from "./filters-tool";
import type { HslToolHandle } from "./hsl-tool";
import type { LiquifyToolHandle } from "./liquify-tool";
import type { MasksToolHandle } from "./masks-tool";
import { createRuler } from "./ruler";
import { createSlider, signed } from "./slider";
import type { StylizeToolHandle } from "./stylize-tool";
import type { TrimToolHandle } from "./trim-tool";

export type TransformOp = "rotate-ccw" | "rotate-cw" | "flip-h" | "flip-v";

export interface ContextDockOptions {
  cropTool: CropToolHandle;
  adjustTool: AdjustToolHandle;
  curvesTool: CurvesToolHandle;
  hslTool: HslToolHandle;
  liquifyTool: LiquifyToolHandle;
  masksTool: MasksToolHandle;
  stylizeTool: StylizeToolHandle;
  filtersTool: FiltersToolHandle;
  /** Present only for video entries. */
  trimTool?: TrimToolHandle;
  /** Panes contributed by registered custom tools. */
  customPanes?: Array<{ id: EditorTool; root: HTMLElement }>;
  edits: ImageEdits;
  onRotationChange: (degrees: number) => void;
  onTransform: (op: TransformOp) => void;
  /** Perspective (keystone) correction changed. */
  onKeystoneChange: (vertical: number, horizontal: number) => void;
  /** Lens correction changed. */
  onLensChange: (distortion: number, devignette: number) => void;
  /** Content-aware width changed (images only; omit to hide the slider). */
  onSeamWidthChange?: (percent: number) => void;
}

export interface ContextDockHandle extends ViewHandle {
  setActiveTool(tool: EditorTool): void;
  /** Sync the straighten controls after an external change (does not fire onRotationChange). */
  setRotation(degrees: number): void;
  /** Reflect the crop tool's aspect preset in the tiles. */
  setAspect(preset: AspectRatioPreset): void;
  /** Sync the keystone sliders after an external change (does not fire onKeystoneChange). */
  setKeystone(vertical: number, horizontal: number): void;
  /** Sync the lens sliders after an external change (does not fire onLensChange). */
  setLens(distortion: number, devignette: number): void;
  /** Sync the content-aware width slider; label shows busy state while carving. */
  setSeamWidth(percent: number, busy?: boolean): void;
}

const ASPECT_PRESETS: { id: AspectRatioPreset; label: string }[] = [
  { id: "free", label: "Free" },
  { id: "1:1", label: "Square" },
  { id: "4:3", label: "4:3" },
  { id: "3:2", label: "3:2" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
];

const TRANSFORM_BUTTONS: { op: TransformOp; label: string; icon: string }[] = [
  { op: "rotate-ccw", label: "Rotate left", icon: ICON_ROTATE_CCW },
  { op: "rotate-cw", label: "Rotate right", icon: ICON_ROTATE_CW },
  { op: "flip-h", label: "Flip horizontal", icon: ICON_FLIP_H },
  { op: "flip-v", label: "Flip vertical", icon: ICON_FLIP_V },
];

/**
 * The tool panes shown in the inspector, one per tool; only the active
 * tool's pane is visible.
 */
export function createContextDock(options: ContextDockOptions): ContextDockHandle {
  const {
    cropTool,
    adjustTool,
    curvesTool,
    hslTool,
    liquifyTool,
    masksTool,
    stylizeTool,
    filtersTool,
    trimTool,
    edits,
    onRotationChange,
    onTransform,
  } = options;
  const abort = new AbortController();
  const signal = abort.signal;

  // Rotate/flip buttons, built once per pane that offers them.
  function transformButtons(): HTMLElement {
    const group = h("div", { class: "rt-dock__group rt-transform-btns" });
    for (const def of TRANSFORM_BUTTONS) {
      const btn = h("button", {
        type: "button",
        class: "rt-dock__icon-btn",
        title: def.label,
        "aria-label": def.label,
      });
      btn.innerHTML = def.icon;
      btn.addEventListener("click", () => onTransform(def.op), { signal });
      group.appendChild(btn);
    }
    return group;
  }

  // ── Crop pane: aspect tiles · straighten ruler · rotate/flip ──

  const aspectBtns = new Map<AspectRatioPreset, HTMLButtonElement>();
  const aspectGrid = h("div", { class: "rt-aspects", role: "group", "aria-label": "Aspect ratio" });
  function setActiveAspect(preset: AspectRatioPreset): void {
    for (const [id, b] of aspectBtns) b.setAttribute("aria-pressed", String(id === preset));
  }
  for (const preset of ASPECT_PRESETS) {
    // The glyph is the shape itself, scaled into a 22 px box.
    const ratio = ASPECT_RATIOS[preset.id];
    const glyph = h("span", { class: "rt-aspect__glyph", "aria-hidden": "true" });
    const r = ratio ?? 1.2;
    glyph.style.width = `${r >= 1 ? 22 : Math.round(22 * r)}px`;
    glyph.style.height = `${r >= 1 ? Math.round(22 / r) : 22}px`;
    const btn = h(
      "button",
      { type: "button", class: `rt-aspect${ratio === null ? " rt-aspect--free" : ""}` },
      glyph,
      h("span", { class: "rt-aspect__label" }, preset.label),
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
    aspectGrid.appendChild(btn);
  }
  setActiveAspect(cropTool.getAspectRatio());

  const formatDegrees = (v: number): string => `${signed(v, 1)}°`;
  const ruler = createRuler(
    {
      label: "Straighten",
      min: -45,
      max: 45,
      step: 0.1,
      keyStep: 0.1,
      value: edits.rotation,
      format: formatDegrees,
      onInput: (v) => {
        straighten.set(v);
        onRotationChange(v);
      },
    },
    signal,
  );

  const cropPane = h(
    "div",
    { class: "rt-dock__pane rt-crop-pane" },
    aspectGrid,
    ruler.root,
    transformButtons(),
    h(
      "p",
      { class: "rt-dock__hint rt-crop-pane__note" },
      "Drag the frame's edges and corners on the photo. The crop applies when you switch tools",
      h("span", { class: "rt-keys" }, ", press Enter or Done."),
      h("span", { class: "rt-touch" }, " or tap Done."),
    ),
  );

  // ── Transform pane: turns and straighten · perspective · lens ──

  function slider(
    label: string,
    min: number,
    max: number,
    value: number,
    onInput: (v: number) => void,
    extra: { step?: number; format?: (v: number) => string; neutral?: number } = {},
  ) {
    return createSlider({ label, min, max, value, onInput, ...extra }, signal);
  }

  const straighten = slider(
    "Straighten",
    -45,
    45,
    edits.rotation,
    (v) => {
      ruler.set(v);
      onRotationChange(v);
    },
    { step: 0.1, format: formatDegrees },
  );
  const keystoneVSlider = slider("Vertical", -100, 100, edits.keystoneV, (v) =>
    options.onKeystoneChange(v, Number.NaN),
  );
  const keystoneHSlider = slider("Horizontal", -100, 100, edits.keystoneH, (v) =>
    options.onKeystoneChange(Number.NaN, v),
  );
  const lensDistortionSlider = slider("Distortion", -100, 100, edits.lensDistortion, (v) =>
    options.onLensChange(v, Number.NaN),
  );
  const lensDevignetteSlider = slider("Devignette", 0, 100, edits.lensDevignette, (v) =>
    options.onLensChange(Number.NaN, v),
  );
  const seamSlider = slider(
    "Width",
    50,
    100,
    edits.seamWidth,
    (v) => options.onSeamWidthChange?.(v),
    { neutral: 100, format: (v) => `${v}%` },
  );

  const rotateSection = createSection({ title: "Rotate" }, transformButtons(), straighten.root);
  const perspectiveSection = createSection(
    { title: "Perspective" },
    keystoneVSlider.root,
    keystoneHSlider.root,
  );
  const lensSection = createSection(
    { title: "Lens" },
    lensDistortionSlider.root,
    lensDevignetteSlider.root,
  );
  const seamSection = createSection({ title: "Content-aware width" }, seamSlider.root);
  const transformPane = h(
    "div",
    { class: "rt-dock__pane rt-transform-pane" },
    rotateSection.root,
    perspectiveSection.root,
    lensSection.root,
    ...(options.onSeamWidthChange ? [seamSection.root] : []),
  );

  // ── Tool panes ──

  const adjustPane = h("div", { class: "rt-dock__pane" }, adjustTool.root);
  const curvesPane = h("div", { class: "rt-dock__pane" }, curvesTool.root);
  const hslPane = h("div", { class: "rt-dock__pane" }, hslTool.root);
  const liquifyPane = h("div", { class: "rt-dock__pane" }, liquifyTool.root);
  const masksPane = h("div", { class: "rt-dock__pane" }, masksTool.root);
  const stylizePane = h("div", { class: "rt-dock__pane" }, stylizeTool.root);
  const filtersPane = h("div", { class: "rt-dock__pane" }, filtersTool.root);
  const trimPane = trimTool ? h("div", { class: "rt-dock__pane" }, trimTool.root) : null;

  const root = h(
    "div",
    { class: "rt-dock" },
    cropPane,
    transformPane,
    liquifyPane,
    curvesPane,
    hslPane,
    masksPane,
    stylizePane,
    adjustPane,
    filtersPane,
  );
  if (trimPane) root.appendChild(trimPane);

  const panes: Partial<Record<EditorTool, HTMLElement>> = {
    crop: cropPane,
    transform: transformPane,
    liquify: liquifyPane,
    curves: curvesPane,
    hsl: hslPane,
    masks: masksPane,
    stylize: stylizePane,
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
      ruler.set(degrees);
    },
    setKeystone(vertical, horizontal) {
      keystoneVSlider.set(vertical);
      keystoneHSlider.set(horizontal);
    },
    setLens(distortion, devignette) {
      lensDistortionSlider.set(distortion);
      lensDevignetteSlider.set(devignette);
    },
    setSeamWidth(percent, busy) {
      seamSlider.set(percent);
      seamSlider.setLabel(busy ? "Carving…" : "Width", "Content-aware width");
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
