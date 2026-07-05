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
import {
  flipCropX,
  flipCropY,
  rotateCropCCW,
  rotateCropCW,
  rotateOrientation,
} from "../../utils/transform";
import type { SeekQueue } from "../../utils/video";
import { captureFrame, createSeekQueue, formatDuration } from "../../utils/video";
import { h } from "../h";
import { createAdjustTool } from "./adjust-tool";
import type { AiBarHandle } from "./ai-bar";
import { createAiBar, getStoredAiKey } from "./ai-bar";
import { CanvasRenderer } from "./canvas-renderer";
import { createCropTool } from "./crop-tool";
import { createFiltersTool } from "./filters-tool";
import type { TransformOp } from "./properties-panel";
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
const EYE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';

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

  const compareBtn = h("button", {
    class: "rt-editor__icon-btn",
    title: "Hold to compare with the original",
    "aria-label": "Compare with original",
  });
  compareBtn.innerHTML = EYE_ICON;
  const resetBtn = h("button", { class: "rt-editor__text-btn", title: "Reset all edits" }, "Reset");

  const topbar = h(
    "div",
    { class: "rt-editor__topbar" },
    h(
      "div",
      { class: "rt-editor__topbar-left" },
      filenameEl,
      dimsEl,
      h("div", { class: "rt-editor__actions" }, compareBtn, resetBtn),
    ),
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
    strength: entry.edits.filterStrength,
    onChange: (filter) => {
      entry.edits.filter = filter;
      renderer.setFilter(filter);
      renderer.render();
      recordEdit();
    },
    onStrengthChange: (strength) => {
      entry.edits.filterStrength = strength;
      renderer.setFilterStrength(strength);
      renderer.render();
      recordEdit();
    },
  });

  /** Rotate/flip in display space, remapping the crop so it tracks the content. */
  function applyTransformOp(op: TransformOp): void {
    const e = entry.edits;
    if (op === "rotate-cw") {
      e.orientation = rotateOrientation(e.orientation, 1);
      e.crop = rotateCropCW(e.crop);
    } else if (op === "rotate-ccw") {
      e.orientation = rotateOrientation(e.orientation, -1);
      e.crop = rotateCropCCW(e.crop);
    } else if (op === "flip-h") {
      // A screen-space horizontal flip mirrors the source's other axis when
      // the source is rotated onto its side.
      if (e.orientation % 180 === 0) e.flipH = !e.flipH;
      else e.flipV = !e.flipV;
      e.crop = flipCropX(e.crop);
    } else {
      if (e.orientation % 180 === 0) e.flipV = !e.flipV;
      else e.flipH = !e.flipH;
      e.crop = flipCropY(e.crop);
    }
    renderer.setTransform(e.orientation, e.flipH, e.flipV);
    cropTool.setCrop(e.crop);
    renderer.render();
    recordEdit();
  }

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
    onTransform: applyTransformOp,
  });

  /** Apply a tool's side effects (crop overlay visibility, panel section). */
  function selectTool(tool: EditorTool): void {
    activeTool = tool;
    cropTool.setVisible(tool === "crop");
    transport?.setTrimEditable(tool === "trim");
    propsPanel.setActiveTool(tool);
  }

  // Toolbar (left side)
  const toolbar = createToolbar({ tools, activeTool, onToolChange: selectTool });

  // Sync initial tool state (video opens on Trim, image on Crop).
  selectTool(activeTool);

  // ── Undo / redo ──

  /** Push the current edit state into every tool UI + the renderer. */
  function syncToolsFromEdits(): void {
    suppressRecord = true;
    renderer.setAdjustments(entry.edits.adjustments);
    renderer.setRotation(entry.edits.rotation);
    renderer.setTransform(entry.edits.orientation, entry.edits.flipH, entry.edits.flipV);
    renderer.setFilter(entry.edits.filter);
    renderer.setFilterStrength(entry.edits.filterStrength);
    adjustTool.setAdjustments(entry.edits.adjustments);
    filtersTool.setFilter(entry.edits.filter);
    filtersTool.setStrength(entry.edits.filterStrength);
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

  // ── Compare (hold) + reset ──

  let comparing = false;
  function startCompare(): void {
    if (comparing) return;
    comparing = true;
    cropTool.setVisible(false);
    renderer.setAdjustments(DEFAULT_EDITS.adjustments);
    renderer.setFilter(DEFAULT_EDITS.filter);
    renderer.setRotation(DEFAULT_EDITS.rotation);
    renderer.render();
  }
  function endCompare(): void {
    if (!comparing) return;
    comparing = false;
    renderer.setAdjustments(entry.edits.adjustments);
    renderer.setFilter(entry.edits.filter);
    renderer.setRotation(entry.edits.rotation);
    renderer.render();
    cropTool.setVisible(activeTool === "crop");
  }
  compareBtn.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      compareBtn.setPointerCapture(e.pointerId);
      startCompare();
    },
    { signal },
  );
  compareBtn.addEventListener("pointerup", endCompare, { signal });
  compareBtn.addEventListener("pointercancel", endCompare, { signal });

  function resetEdits(): void {
    const defaults =
      entry.kind === "video"
        ? createDefaultVideoEdits(entry.duration)
        : structuredClone(DEFAULT_EDITS);
    Object.assign(entry.edits, defaults);
    syncToolsFromEdits();
    history?.record();
  }
  resetBtn.addEventListener("click", resetEdits, { signal });

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
  const root = h(
    "div",
    {
      class: "rt-editor-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": `Editing ${entry.file.name}`,
      tabindex: -1,
    },
    ...rootChildren,
  );

  // Button handlers
  function cancel(): void {
    Object.assign(entry.edits, editSnapshot);
    onCancel();
  }
  cancelBtn.addEventListener("click", cancel, { signal });
  doneBtn.addEventListener("click", () => onDone(), { signal });

  // ── Keyboard shortcuts + focus trap ──
  function focusables(): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => el.offsetParent !== null);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const mod = e.metaKey || e.ctrlKey;
      const inText = isTextInput(e.target);

      if (e.key === "Escape") {
        e.preventDefault();
        if (inText) (e.target as HTMLElement).blur();
        else cancel();
        return;
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        onDone();
        return;
      }
      if (mod && (e.key === "z" || e.key === "Z")) {
        if (inText) return;
        e.preventDefault();
        if (e.shiftKey) history?.redo();
        else history?.undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        if (inText) return;
        e.preventDefault();
        history?.redo();
        return;
      }
      if (mod) return; // leave other ⌘/Ctrl combos to the browser

      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) {
          e.preventDefault();
          root.focus();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!root.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }

      if (inText) return;

      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= tools.length) {
        e.preventDefault();
        const tool = tools[num - 1];
        toolbar.setActiveTool(tool);
        selectTool(tool);
        return;
      }
      if (e.key === " " && transport && (e.target as HTMLElement).tagName !== "BUTTON") {
        e.preventDefault();
        transport.togglePlay();
      }
    },
    { signal },
  );

  // Move focus into the modal once the caller has attached it. A microtask
  // runs right after the synchronous mount (and isn't throttled in hidden tabs
  // the way requestAnimationFrame is).
  queueMicrotask(() => {
    if (!signal.aborted && root.isConnected) root.focus();
  });

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
