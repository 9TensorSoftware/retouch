import type { EditorTool, ImageEdits, ImageEntry, ViewHandle } from "../../types";
import { h } from "../h";
import { createAdjustTool } from "./adjust-tool";
import { CanvasRenderer } from "./canvas-renderer";
import { createCropTool } from "./crop-tool";
import { createPropertiesPanel } from "./properties-panel";
import { createToolbar } from "./toolbar";

export interface EditorOptions {
  entry: ImageEntry;
  onDone: () => void;
  onCancel: () => void;
}

export function createEditor(options: EditorOptions): ViewHandle {
  const { entry, onDone, onCancel } = options;
  const abort = new AbortController();
  const signal = abort.signal;

  // Snapshot edits so cancel can restore them
  const editSnapshot: ImageEdits = structuredClone(entry.edits);
  let activeTool: EditorTool = "crop";

  // Top bar
  const filenameEl = h("span", { class: "rt-editor__filename" }, entry.file.name);
  const dimsEl = h(
    "span",
    { class: "rt-editor__dimensions" },
    `${entry.image.naturalWidth} \u00d7 ${entry.image.naturalHeight}`,
  );
  const cancelBtn = h("button", { class: "rt-editor__btn-cancel" }, "Cancel");
  const doneBtn = h("button", { class: "rt-editor__btn-done" }, "Done");

  const topbar = h(
    "div",
    { class: "rt-editor__topbar" },
    h("div", { class: "rt-editor__topbar-left" }, filenameEl, dimsEl),
    h("div", { class: "rt-editor__topbar-right" }, cancelBtn, doneBtn),
  );

  // Canvas
  const canvasContainer = h("div", { class: "rt-editor__canvas-container" });
  const canvasArea = h("div", { class: "rt-editor__canvas-area" }, canvasContainer);
  const renderer = new CanvasRenderer(canvasContainer, entry.image, entry.edits);

  // Crop tool (DOM overlay, sits inside canvasContainer)
  const cropTool = createCropTool({
    container: canvasContainer,
    renderer,
    edits: entry.edits,
    onChange: (crop) => {
      entry.edits.crop = crop;
      renderer.render();
    },
  });

  // Adjust tool
  const adjustTool = createAdjustTool({
    adjustments: entry.edits.adjustments,
    onChange: (adj) => {
      entry.edits.adjustments = adj;
      renderer.setAdjustments(adj);
      renderer.render();
    },
  });

  // Properties panel (right side)
  const propsPanel = createPropertiesPanel({
    cropTool,
    adjustTool,
    edits: entry.edits,
    onRotationChange: (deg) => {
      entry.edits.rotation = deg;
      renderer.setRotation(deg);
      renderer.render();
    },
  });

  // Toolbar (left side)
  const toolbar = createToolbar({
    activeTool,
    onToolChange: (tool) => {
      activeTool = tool;
      cropTool.setVisible(tool === "crop");
      propsPanel.setActiveTool(tool);
    },
  });

  // Body
  const body = h(
    "div",
    { class: "rt-editor__body" },
    toolbar.root,
    canvasArea,
    propsPanel.root,
  );

  // Root overlay
  const root = h("div", { class: "rt-editor-overlay" }, topbar, body);

  // Button handlers
  cancelBtn.addEventListener("click", () => {
    // Restore snapshot
    Object.assign(entry.edits, editSnapshot);
    onCancel();
  }, { signal });

  doneBtn.addEventListener("click", () => {
    onDone();
  }, { signal });

  // Initial render
  renderer.render();

  return {
    root,
    destroy() {
      abort.abort();
      cropTool.destroy();
      adjustTool.destroy();
      propsPanel.destroy();
      toolbar.destroy();
      renderer.destroy();
      root.remove();
    },
  };
}
