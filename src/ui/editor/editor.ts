import type { EditorTool, MediaEntry, ViewHandle } from "../../types";
import type { SeekQueue } from "../../utils/video";
import { captureFrame, createSeekQueue, formatDuration } from "../../utils/video";
import { h } from "../h";
import { createAdjustTool } from "./adjust-tool";
import { CanvasRenderer } from "./canvas-renderer";
import { createCropTool } from "./crop-tool";
import { createFiltersTool } from "./filters-tool";
import { createPropertiesPanel } from "./properties-panel";
import { createToolbar } from "./toolbar";
import type { TransportBarHandle } from "./transport-bar";
import { createTransportBar } from "./transport-bar";
import type { TrimToolHandle } from "./trim-tool";
import { createTrimTool } from "./trim-tool";

export interface EditorOptions {
  entry: MediaEntry;
  onDone: () => void;
  onCancel: () => void;
  /** Video only: receives a full-resolution frame canvas and its timestamp. */
  onCaptureFrame?: (canvas: HTMLCanvasElement, time: number) => void;
}

export function createEditor(options: EditorOptions): ViewHandle {
  const { entry, onDone, onCancel } = options;
  const abort = new AbortController();
  const signal = abort.signal;

  // Snapshot edits so cancel can restore them
  const editSnapshot = structuredClone(entry.edits);
  const tools: EditorTool[] =
    entry.kind === "video" ? ["trim", "crop", "adjust", "filters"] : ["crop", "adjust", "filters"];
  let activeTool: EditorTool = tools[0];

  // Top bar
  const filenameEl = h("span", { class: "rt-editor__filename" }, entry.file.name);
  const dimsText =
    entry.kind === "video"
      ? `${entry.width} × ${entry.height} · ${formatDuration(entry.duration)}`
      : `${entry.image.naturalWidth} × ${entry.image.naturalHeight}`;
  const dimsEl = h("span", { class: "rt-editor__dimensions" }, dimsText);
  const cancelBtn = h("button", { class: "rt-editor__btn-cancel" }, "Cancel");
  const doneBtn = h("button", { class: "rt-editor__btn-done" }, "Done");

  const topbarRight = h("div", { class: "rt-editor__topbar-right" });
  if (entry.kind === "video" && options.onCaptureFrame) {
    const captureBtn = h("button", {
      class: "rt-editor__btn-capture",
      title: "Capture current frame as image",
    });
    const captureLabel = () => {
      captureBtn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Capture frame</span>';
    };
    captureLabel();
    let revertId = 0;
    captureBtn.addEventListener(
      "click",
      () => {
        entry.video.pause();
        const canvas = captureFrame(entry.video);
        options.onCaptureFrame?.(canvas, entry.video.currentTime);
        captureBtn.innerHTML =
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12.5l5 5L20 6.5"/></svg><span>Captured</span>';
        clearTimeout(revertId);
        revertId = window.setTimeout(captureLabel, 1400);
      },
      { signal },
    );
    topbarRight.appendChild(captureBtn);
  }
  topbarRight.append(cancelBtn, doneBtn);

  const topbar = h(
    "div",
    { class: "rt-editor__topbar" },
    h("div", { class: "rt-editor__topbar-left" }, filenameEl, dimsEl),
    topbarRight,
  );

  // Canvas
  const canvasContainer = h("div", { class: "rt-editor__canvas-container" });
  const canvasArea = h("div", { class: "rt-editor__canvas-area" }, canvasContainer);
  const renderer = new CanvasRenderer(
    canvasContainer,
    entry.kind === "video" ? entry.video : entry.image,
    entry.edits,
  );

  // Video transport (playback persists across all tools)
  let seekQueue: SeekQueue | null = null;
  let transport: TransportBarHandle | null = null;
  let trimTool: TrimToolHandle | undefined;
  if (entry.kind === "video") {
    const videoEdits = entry.edits;
    seekQueue = createSeekQueue(entry.video);
    transport = createTransportBar({
      video: entry.video,
      edits: videoEdits,
      seekQueue,
      videoUrl: entry.videoUrl,
      duration: entry.duration,
      videoWidth: entry.width,
      videoHeight: entry.height,
      onMuteChange: (mute) => {
        videoEdits.mute = mute;
      },
    });
    trimTool = createTrimTool({
      edits: videoEdits,
      duration: entry.duration,
      transport,
    });
    // Open on the first trimmed frame (the element sits at the poster frame).
    void seekQueue.seek(videoEdits.trim.start);
  }

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

  // Filters tool
  const filtersTool = createFiltersTool({
    image: entry.kind === "video" ? captureFrame(entry.video, 240) : entry.image,
    filter: entry.edits.filter,
    onChange: (filter) => {
      entry.edits.filter = filter;
      renderer.setFilter(filter);
      renderer.render();
    },
  });

  // Properties panel (right side)
  const propsPanel = createPropertiesPanel({
    cropTool,
    adjustTool,
    filtersTool,
    trimTool,
    edits: entry.edits,
    onRotationChange: (deg) => {
      entry.edits.rotation = deg;
      renderer.setRotation(deg);
      renderer.render();
    },
  });

  // Toolbar (left side)
  const toolbar = createToolbar({
    tools,
    activeTool,
    onToolChange: (tool) => {
      activeTool = tool;
      cropTool.setVisible(tool === "crop");
      transport?.setTrimEditable(tool === "trim");
      propsPanel.setActiveTool(tool);
    },
  });

  // Sync initial tool state (video opens on Trim, image on Crop).
  cropTool.setVisible(activeTool === "crop");
  transport?.setTrimEditable(activeTool === "trim");
  propsPanel.setActiveTool(activeTool);

  // Body — canvas and transport share a center column
  const centerChildren: HTMLElement[] = [canvasArea];
  if (transport) centerChildren.push(transport.root);
  const center = h("div", { class: "rt-editor__center" }, ...centerChildren);
  const body = h("div", { class: "rt-editor__body" }, toolbar.root, center, propsPanel.root);

  // Root overlay
  const root = h("div", { class: "rt-editor-overlay" }, topbar, body);

  // Button handlers
  cancelBtn.addEventListener(
    "click",
    () => {
      // Restore snapshot
      Object.assign(entry.edits, editSnapshot);
      onCancel();
    },
    { signal },
  );

  doneBtn.addEventListener(
    "click",
    () => {
      onDone();
    },
    { signal },
  );

  // Initial render
  renderer.render();

  return {
    root,
    destroy() {
      abort.abort();
      if (entry.kind === "video") entry.video.pause();
      trimTool?.destroy();
      transport?.destroy();
      seekQueue?.destroy();
      cropTool.destroy();
      adjustTool.destroy();
      filtersTool.destroy();
      propsPanel.destroy();
      toolbar.destroy();
      renderer.destroy();
      root.remove();
    },
  };
}
