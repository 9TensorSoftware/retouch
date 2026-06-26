import type { AiContext } from "../../ai/interpreter";
import { interpretCommand } from "../../ai/interpreter";
import { createDefaultVideoEdits, DEFAULT_EDITS } from "../../constants";
import type {
  AiEditOps,
  AiOptions,
  EditorTool,
  ImageEdits,
  MediaEntry,
  VideoEdits,
  ViewHandle,
} from "../../types";
import { createCanvas } from "../../utils/canvas";
import type { HistoryController } from "../../utils/history";
import { createHistory } from "../../utils/history";
import type { SeekQueue } from "../../utils/video";
import { captureFrame, createSeekQueue, formatDuration } from "../../utils/video";
import { h } from "../h";
import { createAdjustTool } from "./adjust-tool";
import type { AiBarHandle } from "./ai-bar";
import { createAiBar, getStoredAiKey } from "./ai-bar";
import { CanvasRenderer } from "./canvas-renderer";
import { createCropTool } from "./crop-tool";
import { createFiltersTool } from "./filters-tool";
import { createPropertiesPanel } from "./properties-panel";
import { createToolbar } from "./toolbar";
import type { TransportBarHandle } from "./transport-bar";
import { createTransportBar } from "./transport-bar";
import type { TrimToolHandle } from "./trim-tool";
import { createTrimTool } from "./trim-tool";

const UNDO_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1"/></svg>';
const REDO_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10h1"/></svg>';

/** True for elements that own text-editing keystrokes (so global shortcuts skip them). */
function isTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

export type EditorAiEvent =
  | { type: "start"; prompt: string }
  | { type: "applied"; ops: AiEditOps; explanation: string }
  | { type: "error"; error: Error };

export interface EditorOptions {
  entry: MediaEntry;
  onDone: () => void;
  onCancel: () => void;
  /** Video only: receives a full-resolution frame canvas and its timestamp. */
  onCaptureFrame?: (canvas: HTMLCanvasElement, time: number) => void;
  /** Enables the AI command bar when configured. */
  ai?: AiOptions;
  onAiEvent?: (event: EditorAiEvent) => void;
}

export function createEditor(options: EditorOptions): ViewHandle {
  const { entry, onDone, onCancel } = options;
  const abort = new AbortController();
  const signal = abort.signal;

  // Snapshot edits so cancel can restore them
  const editSnapshot = structuredClone(entry.edits);

  // Undo/redo plumbing. `recordEdit` is wired into every tool's onChange;
  // `suppressRecord` blocks it while we sync the UI from a restored snapshot.
  let suppressRecord = false;
  let history: HistoryController | null = null;
  const recordEdit = (): void => {
    if (!suppressRecord) history?.record();
  };

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

  const undoBtn = h("button", {
    class: "rt-editor__icon-btn",
    title: "Undo (⌘/Ctrl+Z)",
    "aria-label": "Undo",
  });
  undoBtn.innerHTML = UNDO_ICON;
  const redoBtn = h("button", {
    class: "rt-editor__icon-btn",
    title: "Redo (⌘/Ctrl+⇧Z)",
    "aria-label": "Redo",
  });
  redoBtn.innerHTML = REDO_ICON;
  const historyGroup = h("div", { class: "rt-editor__history" }, undoBtn, redoBtn);

  const topbarRight = h("div", { class: "rt-editor__topbar-right" }, historyGroup);
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
        recordEdit();
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
      recordEdit();
    },
  });

  // Adjust tool
  const adjustTool = createAdjustTool({
    adjustments: entry.edits.adjustments,
    onChange: (adj) => {
      entry.edits.adjustments = adj;
      renderer.setAdjustments(adj);
      renderer.render();
      recordEdit();
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
      recordEdit();
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
      recordEdit();
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

  // ── Undo / redo ──

  /** Push the current edit state into every tool UI + the renderer. */
  function syncToolsFromEdits(): void {
    suppressRecord = true;
    renderer.setAdjustments(entry.edits.adjustments);
    renderer.setRotation(entry.edits.rotation);
    renderer.setFilter(entry.edits.filter);
    adjustTool.setAdjustments(entry.edits.adjustments);
    filtersTool.setFilter(entry.edits.filter);
    propsPanel.setRotation(entry.edits.rotation);
    cropTool.setCrop(entry.edits.crop);
    if (entry.kind === "video") {
      transport?.setTrim(entry.edits.trim);
      transport?.setMuted(entry.edits.mute);
    }
    renderer.render();
    suppressRecord = false;
  }

  history = createHistory<ImageEdits | VideoEdits>({
    snapshot: () => structuredClone(entry.edits),
    restore: (state) => {
      entry.edits.crop = { ...state.crop };
      entry.edits.rotation = state.rotation;
      entry.edits.adjustments = { ...state.adjustments };
      entry.edits.filter = state.filter;
      if (entry.kind === "video" && "trim" in state) {
        const v = entry.edits as VideoEdits;
        v.trim = { ...state.trim };
        v.mute = state.mute;
      }
      syncToolsFromEdits();
    },
  });

  function syncHistoryButtons(): void {
    undoBtn.toggleAttribute("disabled", !history?.canUndo());
    redoBtn.toggleAttribute("disabled", !history?.canRedo());
  }
  history.onChange(syncHistoryButtons);
  syncHistoryButtons();

  undoBtn.addEventListener("click", () => history?.undo(), { signal });
  redoBtn.addEventListener("click", () => history?.redo(), { signal });
  transport?.onTrimChange(recordEdit);

  // ── AI command bar ──

  /** Apply validated AI ops through the same setters the manual tools use. */
  function applyAiOps(ops: AiEditOps): void {
    if (ops.reset) {
      const defaults =
        entry.kind === "video"
          ? createDefaultVideoEdits(entry.duration)
          : structuredClone(DEFAULT_EDITS);
      Object.assign(entry.edits, defaults);
    }
    if (ops.filter !== undefined) entry.edits.filter = ops.filter;
    if (ops.adjustments) {
      entry.edits.adjustments = { ...entry.edits.adjustments, ...ops.adjustments };
    }
    if (ops.rotation !== undefined) entry.edits.rotation = ops.rotation;
    if (ops.crop) entry.edits.crop = { ...ops.crop };
    if (entry.kind === "video") {
      const v = entry.edits as VideoEdits;
      if (ops.trim) v.trim = { ...ops.trim };
      if (ops.mute !== undefined) v.mute = ops.mute;
    }

    syncToolsFromEdits();
    if (ops.aspect) {
      // setAspectRatio recomputes the crop and records via its own onChange.
      cropTool.setAspectRatio(ops.aspect);
    } else {
      history?.record();
    }
  }

  /** Downscaled JPEG of the current frame for content-aware commands. */
  function contextFrameBase64(): string | undefined {
    if (options.ai?.sendImage === false) return undefined;
    try {
      let frame: HTMLCanvasElement;
      if (entry.kind === "video") {
        frame = captureFrame(entry.video, 512);
      } else {
        const img = entry.image;
        const scale = Math.min(512 / img.naturalWidth, 512 / img.naturalHeight, 1);
        frame = createCanvas(
          Math.max(1, Math.round(img.naturalWidth * scale)),
          Math.max(1, Math.round(img.naturalHeight * scale)),
        );
        frame.getContext("2d")?.drawImage(img, 0, 0, frame.width, frame.height);
      }
      return frame.toDataURL("image/jpeg", 0.7).split(",")[1];
    } catch {
      return undefined;
    }
  }

  let aiBar: AiBarHandle | null = null;
  const aiOptions = options.ai;
  if (aiOptions && (aiOptions.apiKey || aiOptions.complete || aiOptions.allowUserKey)) {
    aiBar = createAiBar({
      ai: aiOptions,
      onSubmit: async (prompt) => {
        options.onAiEvent?.({ type: "start", prompt });
        try {
          const context: AiContext = {
            kind: entry.kind,
            width: entry.kind === "video" ? entry.width : entry.image.naturalWidth,
            height: entry.kind === "video" ? entry.height : entry.image.naturalHeight,
            duration: entry.kind === "video" ? entry.duration : undefined,
            edits: entry.edits,
          };
          const resolved: AiOptions = {
            ...aiOptions,
            apiKey:
              aiOptions.apiKey ??
              (aiOptions.allowUserKey ? (getStoredAiKey() ?? undefined) : undefined),
          };
          const ops = await interpretCommand(resolved, prompt, context, contextFrameBase64());
          applyAiOps(ops);
          options.onAiEvent?.({ type: "applied", ops, explanation: ops.explanation });
          return ops.explanation;
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          options.onAiEvent?.({ type: "error", error });
          throw error;
        }
      },
    });
  }

  // Body — canvas and transport share a center column
  const centerChildren: HTMLElement[] = [canvasArea];
  if (transport) centerChildren.push(transport.root);
  const center = h("div", { class: "rt-editor__center" }, ...centerChildren);
  const body = h("div", { class: "rt-editor__body" }, toolbar.root, center, propsPanel.root);

  // Root overlay
  const rootChildren: HTMLElement[] = [topbar];
  if (aiBar) rootChildren.push(aiBar.root);
  rootChildren.push(body);
  const root = h("div", { class: "rt-editor-overlay" }, ...rootChildren);

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

  // ── Keyboard shortcuts ──
  document.addEventListener(
    "keydown",
    (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        if (isTextInput(e.target)) return;
        e.preventDefault();
        if (e.shiftKey) history?.redo();
        else history?.undo();
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        if (isTextInput(e.target)) return;
        e.preventDefault();
        history?.redo();
      }
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
      history?.destroy();
      aiBar?.destroy();
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
