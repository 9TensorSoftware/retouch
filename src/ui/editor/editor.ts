import type { AiContext } from "../../ai/interpreter";
import { interpretCommand } from "../../ai/interpreter";
import {
  createDefaultCurves,
  createDefaultHsl,
  createDefaultVideoEdits,
  DEFAULT_ADJUSTMENTS,
  DEFAULT_EDITS,
} from "../../constants";
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
import { curvesAreIdentity } from "../../utils/curves";
import type { HistoryController } from "../../utils/history";
import { createHistory } from "../../utils/history";
import { hslIsNeutral } from "../../utils/hsl";
import { masksAreNeutral } from "../../utils/masks";
import { clamp } from "../../utils/math";
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
import type { AiChatHandle } from "./ai-chat";
import { createAiChat, getStoredAiKey } from "./ai-chat";
import { CanvasRenderer } from "./canvas-renderer";
import type { TransformOp } from "./context-dock";
import { createContextDock } from "./context-dock";
import { createCropTool } from "./crop-tool";
import { createCurvesTool } from "./curves-tool";
import { createFiltersTool } from "./filters-tool";
import { createHslTool } from "./hsl-tool";
import { createMasksOverlay } from "./masks-overlay";
import { createMasksTool } from "./masks-tool";
import type { ToolContext, ToolPaneHandle } from "./tool-registry";
import { getCustomTools } from "./tool-registry";
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
const HISTORY_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.8 8.8 0 005.6 6.1L3.5 8.2"/><path d="M3.5 3.5v4.7h4.7"/><path d="M12 7.5V12l3.2 1.9"/></svg>';

/** Human label for the change between two history snapshots. */
function describeStep(prev: ImageEdits | VideoEdits, next: ImageEdits | VideoEdits): string {
  const parts: string[] = [];
  if (next.filter !== prev.filter) {
    parts.push(next.filter === "none" ? "Remove filter" : `Filter: ${next.filter}`);
  }
  if (next.filterStrength !== prev.filterStrength) parts.push("Filter intensity");
  const prevAdj = prev.adjustments as unknown as Record<string, number>;
  const nextAdj = next.adjustments as unknown as Record<string, number>;
  const changed = Object.keys(nextAdj).filter((k) => nextAdj[k] !== prevAdj[k]);
  if (changed.length === 1) parts.push(changed[0][0].toUpperCase() + changed[0].slice(1));
  else if (changed.length > 1) parts.push("Adjustments");
  const transformed =
    next.orientation !== prev.orientation || next.flipH !== prev.flipH || next.flipV !== prev.flipV;
  if (next.orientation !== prev.orientation) parts.push("Rotate 90°");
  if (next.flipH !== prev.flipH || next.flipV !== prev.flipV) parts.push("Flip");
  if (next.rotation !== prev.rotation) parts.push("Straighten");
  if (next.keystoneV !== prev.keystoneV || next.keystoneH !== prev.keystoneH) {
    parts.push("Perspective");
  }
  if (JSON.stringify(next.curves) !== JSON.stringify(prev.curves)) parts.push("Curves");
  if (JSON.stringify(next.hsl) !== JSON.stringify(prev.hsl)) parts.push("Color mix");
  if (JSON.stringify(next.masks) !== JSON.stringify(prev.masks)) parts.push("Masks");
  const pc = prev.crop;
  const nc = next.crop;
  const cropChanged =
    pc.x !== nc.x || pc.y !== nc.y || pc.width !== nc.width || pc.height !== nc.height;
  // A 90° turn/flip remaps the crop as a side effect — don't double-report it.
  if (cropChanged && !transformed) parts.push("Crop");
  if ("trim" in next && "trim" in prev) {
    if (next.trim.start !== prev.trim.start || next.trim.end !== prev.trim.end) parts.push("Trim");
    if (next.mute !== prev.mute) parts.push(next.mute ? "Mute" : "Unmute");
    if (next.speed !== prev.speed) parts.push(`Speed ${next.speed}×`);
  }
  if (parts.length === 0) return "Edit";
  if (parts.length <= 2) return parts.join(" · ");
  return `${parts[0]} · ${parts[1]} +${parts.length - 2}`;
}

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
  /** Feature groups to mount, in tab order (defaults to all applicable). */
  tools?: EditorTool[];
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
  let history: HistoryController<ImageEdits | VideoEdits> | null = null;
  const recordEdit = (): void => {
    if (!suppressRecord) history?.record();
  };

  // Feature groups: built-ins for this media kind plus registered custom
  // tools, optionally filtered/ordered by the `tools` option.
  const customTools = getCustomTools().filter((t) => !t.kinds || t.kinds.includes(entry.kind));
  const builtinIds: EditorTool[] =
    entry.kind === "video"
      ? ["trim", "crop", "transform", "adjust", "curves", "hsl", "masks", "filters"]
      : ["crop", "transform", "adjust", "curves", "hsl", "masks", "filters"];
  const allIds: EditorTool[] = [...builtinIds, ...customTools.map((t) => t.id)];
  const tools: EditorTool[] = options.tools
    ? options.tools.filter((id) => allIds.includes(id))
    : allIds;
  if (tools.length === 0) tools.push(builtinIds[0]);
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
  const historyBtn = h("button", {
    class: "rt-editor__icon-btn",
    title: "Edit history",
    "aria-label": "Edit history",
    "aria-haspopup": "true",
  });
  historyBtn.innerHTML = HISTORY_ICON;
  const historyMenu = h("div", { class: "rt-history-menu" });
  const historyWrap = h("div", { class: "rt-history" }, historyBtn, historyMenu);
  const historyGroup = h("div", { class: "rt-editor__history" }, undoBtn, redoBtn, historyWrap);

  const compareBtn = h("button", {
    class: "rt-editor__icon-btn",
    title: "Hold to compare with the original",
    "aria-label": "Compare with original",
  });
  compareBtn.innerHTML = EYE_ICON;
  const resetBtn = h("button", { class: "rt-editor__text-btn", title: "Reset all edits" }, "Reset");

  const divider = () => h("div", { class: "rt-editor__divider" });
  const topbarRight = h(
    "div",
    { class: "rt-editor__topbar-right" },
    historyGroup,
    compareBtn,
    resetBtn,
  );
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
  topbarRight.append(divider(), doneBtn);

  const topbar = h(
    "div",
    { class: "rt-editor__topbar" },
    h("div", { class: "rt-editor__topbar-left" }, cancelBtn),
    h("div", { class: "rt-editor__topbar-title" }, filenameEl, dimsEl),
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
      onSpeedChange: (speed) => {
        videoEdits.speed = speed;
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

  // Crop tool (DOM overlay, sits inside canvasContainer). Commit-style: the
  // marquee is a pending selection; nothing changes until Apply.
  const cropTool = createCropTool({
    container: canvasContainer,
    renderer,
    onChange: () => syncCropButtons(),
  });

  /** True when a crop is committed (the preview shows less than the source). */
  function hasCommittedCrop(): boolean {
    const c = entry.edits.crop;
    return c.x > 1e-6 || c.y > 1e-6 || c.width < 1 - 1e-6 || c.height < 1 - 1e-6;
  }

  function syncCropButtons(): void {
    dock.setCropApplyEnabled(!cropTool.isSelectionFull());
    dock.setCropResetEnabled(hasCommittedCrop());
  }

  /** Compose the pending selection into the committed crop. */
  function applyCrop(): void {
    if (cropTool.isSelectionFull()) return;
    const sel = cropTool.getSelection();
    const c = entry.edits.crop;
    entry.edits.crop = {
      x: clamp(c.x + sel.x * c.width, 0, 1),
      y: clamp(c.y + sel.y * c.height, 0, 1),
      width: clamp(sel.width * c.width, 0.01, 1),
      height: clamp(sel.height * c.height, 0.01, 1),
    };
    renderer.setCrop(entry.edits.crop);
    renderer.render();
    cropTool.resetSelection();
    cropTool.refresh();
    dock.setAspect("free");
    syncCropButtons();
    recordEdit();
  }

  /** Bring the discarded area back (the crop is non-destructive). */
  function resetCrop(): void {
    if (!hasCommittedCrop()) return;
    entry.edits.crop = { x: 0, y: 0, width: 1, height: 1 };
    renderer.setCrop(entry.edits.crop);
    renderer.render();
    cropTool.resetSelection();
    cropTool.refresh();
    dock.setAspect("free");
    syncCropButtons();
    recordEdit();
  }

  // Adjust tool (with the white-balance eyedropper)
  const adjustTool = createAdjustTool({
    adjustments: entry.edits.adjustments,
    onChange: (adj) => {
      entry.edits.adjustments = adj;
      renderer.setAdjustments(adj);
      renderer.render();
      recordEdit();
    },
    onWhiteBalancePick: () => startWhiteBalancePick(),
  });

  /**
   * One-shot eyedropper: sample the clicked pixel from the rendered canvas
   * and nudge temperature/tint so that point reads neutral (inverting the
   * same coefficients adjustmentColorMatrix applies).
   */
  function startWhiteBalancePick(): void {
    canvasArea.classList.add("rt-editor__canvas-area--picking");
    const cleanup = () => {
      canvasArea.classList.remove("rt-editor__canvas-area--picking");
      canvasArea.removeEventListener("pointerdown", onPick, true);
      document.removeEventListener("keydown", onEsc, true);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        cleanup();
      }
    };
    const onPick = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      const canvas = renderer.getCanvasElement();
      const rect = canvas.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx || rect.width === 0) return;
      const px = ctx.getImageData(
        Math.min(
          canvas.width - 1,
          Math.round(((e.clientX - rect.left) / rect.width) * canvas.width),
        ),
        Math.min(
          canvas.height - 1,
          Math.round(((e.clientY - rect.top) / rect.height) * canvas.height),
        ),
        1,
        1,
      ).data;
      const [r, g, b] = px;
      // Deltas that would equalize the sampled channels under our temp/tint model
      const dTemp = clamp(((b - r) / Math.max(1, 0.16 * (r + b))) * 100, -100, 100);
      const mean = (r + b) / 2;
      const dTint = clamp(((g - mean) / Math.max(1, 0.12 * g + 0.08 * mean)) * 100, -100, 100);
      entry.edits.adjustments = {
        ...entry.edits.adjustments,
        temperature: Math.round(clamp(entry.edits.adjustments.temperature + dTemp, -100, 100)),
        tint: Math.round(clamp(entry.edits.adjustments.tint + dTint, -100, 100)),
      };
      adjustTool.setAdjustments(entry.edits.adjustments);
      renderer.setAdjustments(entry.edits.adjustments);
      renderer.render();
      recordEdit();
    };
    canvasArea.addEventListener("pointerdown", onPick, { capture: true, once: false });
    document.addEventListener("keydown", onEsc, true);
  }

  // HSL mixer (per-hue-band shifts)
  const hslTool = createHslTool({
    hsl: entry.edits.hsl,
    onChange: (hsl) => {
      entry.edits.hsl = hsl;
      renderer.setHsl(hsl);
      renderer.render();
      recordEdit();
    },
  });

  // Selective masks: dock pane + on-canvas gizmo share the edit state.
  const masksTool = createMasksTool({
    masks: entry.edits.masks,
    onChange: (masks) => {
      entry.edits.masks = masks;
      renderer.setMasks(masks);
      renderer.render();
      masksOverlay.update(masks, masksTool.getSelectedId());
      recordEdit();
    },
    onSelectionChange: (id) => {
      masksOverlay.update(entry.edits.masks, id);
    },
  });
  const masksOverlay = createMasksOverlay({
    container: canvasContainer,
    renderer,
    onGeometryChange: (mask) => {
      const target = entry.edits.masks.find((m) => m.id === mask.id);
      if (!target) return;
      Object.assign(target, mask);
      renderer.setMasks(entry.edits.masks);
      renderer.render();
      recordEdit();
    },
  });
  masksOverlay.setVisible(false);

  // Curves tool (tone curves over a live input histogram)
  const curvesTool = createCurvesTool({
    curves: entry.edits.curves,
    getHistogram: () => renderer.computeHistogram(),
    onChange: (curves) => {
      entry.edits.curves = curves;
      renderer.setCurves(curves);
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

  /** Mutate orientation/flips in display space, remapping the crop so it tracks content. */
  function transformStep(op: TransformOp): void {
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
  }

  function applyTransformOp(op: TransformOp): void {
    transformStep(op);
    renderer.setCrop(entry.edits.crop);
    renderer.setTransform(entry.edits.orientation, entry.edits.flipH, entry.edits.flipV);
    renderer.render();
    cropTool.resetSelection();
    cropTool.refresh();
    syncCropButtons();
    recordEdit();
  }

  // Custom feature groups mount against the shared edit model: they mutate
  // `edits`, then render() pushes the state everywhere and record() makes it
  // undoable — same lifecycle the built-ins use.
  const toolCtx: ToolContext = {
    kind: entry.kind,
    edits: entry.edits,
    render: () => syncToolsFromEdits(),
    record: recordEdit,
    canvasArea,
  };
  const customHandles = new Map<EditorTool, ToolPaneHandle>();
  const customPanes: Array<{ id: EditorTool; root: HTMLElement }> = [];
  for (const plugin of customTools) {
    if (!tools.includes(plugin.id)) continue;
    const handle = plugin.mount(toolCtx);
    customHandles.set(plugin.id, handle);
    customPanes.push({ id: plugin.id, root: handle.root });
  }

  // Contextual controls strip (below the canvas)
  const dock = createContextDock({
    customPanes,
    cropTool,
    adjustTool,
    curvesTool,
    hslTool,
    masksTool,
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
    onApplyCrop: applyCrop,
    onResetCrop: resetCrop,
    // NaN marks the axis that didn't change (each slider reports only its own).
    onKeystoneChange: (vertical, horizontal) => {
      if (!Number.isNaN(vertical)) entry.edits.keystoneV = vertical;
      if (!Number.isNaN(horizontal)) entry.edits.keystoneH = horizontal;
      renderer.setKeystone(entry.edits.keystoneV, entry.edits.keystoneH);
      renderer.render();
      recordEdit();
    },
  });

  /** Apply a tool's side effects (crop overlay visibility, dock pane). */
  function selectTool(tool: EditorTool): void {
    if (tool !== activeTool) customHandles.get(activeTool)?.onDeactivate?.();
    activeTool = tool;
    transport?.setTrimEditable(tool === "trim");
    dock.setActiveTool(tool);
    customHandles.get(tool)?.onActivate?.();
    renderer.render();
    if (tool === "curves") curvesTool.refreshHistogram();
    masksOverlay.setVisible(tool === "masks");
    if (tool === "masks") masksOverlay.update(entry.edits.masks, masksTool.getSelectedId());
    // The committed crop stays applied in every tool — entering Crop just
    // overlays a fresh selection marquee, so the image never resizes.
    cropTool.setVisible(tool === "crop");
    if (tool === "crop") {
      cropTool.refresh();
      syncCropButtons();
    }
  }

  // Tool tabs (bottom)
  const toolbar = createToolbar({ tools, activeTool, onToolChange: selectTool });

  // Sync initial tool state (video opens on Trim, image on Crop).
  selectTool(activeTool);

  // ── Undo / redo ──

  /** Push the current edit state into every tool UI + the renderer. */
  function syncToolsFromEdits(): void {
    suppressRecord = true;
    renderer.setAdjustments(entry.edits.adjustments);
    renderer.setRotation(entry.edits.rotation);
    renderer.setKeystone(entry.edits.keystoneV, entry.edits.keystoneH);
    renderer.setTransform(entry.edits.orientation, entry.edits.flipH, entry.edits.flipV);
    renderer.setFilter(entry.edits.filter);
    renderer.setFilterStrength(entry.edits.filterStrength);
    renderer.setCurves(entry.edits.curves);
    renderer.setHsl(entry.edits.hsl);
    renderer.setMasks(entry.edits.masks);
    adjustTool.setAdjustments(entry.edits.adjustments);
    curvesTool.setCurves(entry.edits.curves);
    hslTool.setHsl(entry.edits.hsl);
    masksTool.setMasks(entry.edits.masks);
    filtersTool.setFilter(entry.edits.filter);
    filtersTool.setStrength(entry.edits.filterStrength);
    dock.setRotation(entry.edits.rotation);
    dock.setKeystone(entry.edits.keystoneV, entry.edits.keystoneH);
    renderer.setCrop(entry.edits.crop);
    if (entry.kind === "video") {
      transport?.setTrim(entry.edits.trim);
      transport?.setMuted(entry.edits.mute);
      transport?.setSpeed(entry.edits.speed);
    }
    for (const handle of customHandles.values()) handle.sync?.();
    renderer.render();
    cropTool.resetSelection();
    cropTool.refresh();
    dock.setAspect("free");
    syncCropButtons();
    suppressRecord = false;
  }

  history = createHistory<ImageEdits | VideoEdits>({
    snapshot: () => structuredClone(entry.edits),
    restore: (state) => {
      entry.edits.crop = { ...state.crop };
      entry.edits.rotation = state.rotation;
      entry.edits.keystoneV = state.keystoneV;
      entry.edits.keystoneH = state.keystoneH;
      entry.edits.orientation = state.orientation;
      entry.edits.flipH = state.flipH;
      entry.edits.flipV = state.flipV;
      entry.edits.adjustments = { ...state.adjustments };
      entry.edits.curves = structuredClone(state.curves);
      entry.edits.hsl = structuredClone(state.hsl);
      entry.edits.masks = structuredClone(state.masks);
      entry.edits.filter = state.filter;
      entry.edits.filterStrength = state.filterStrength;
      if (entry.kind === "video" && "trim" in state) {
        const v = entry.edits as VideoEdits;
        v.trim = { ...state.trim };
        v.mute = state.mute;
        v.speed = state.speed;
      }
      syncToolsFromEdits();
    },
  });

  /** Orange dot per feature group while its edits are away from neutral. */
  function updateToolDots(): void {
    const e = entry.edits;
    toolbar.setTouched("crop", hasCommittedCrop());
    toolbar.setTouched(
      "transform",
      e.rotation !== 0 ||
        e.keystoneV !== 0 ||
        e.keystoneH !== 0 ||
        e.orientation !== 0 ||
        e.flipH ||
        e.flipV,
    );
    const adj = e.adjustments as unknown as Record<string, number>;
    const defaults = DEFAULT_ADJUSTMENTS as unknown as Record<string, number>;
    toolbar.setTouched(
      "adjust",
      Object.keys(adj).some((k) => adj[k] !== defaults[k]),
    );
    toolbar.setTouched("filters", e.filter !== "none");
    toolbar.setTouched("curves", !curvesAreIdentity(e.curves));
    toolbar.setTouched("hsl", !hslIsNeutral(e.hsl));
    toolbar.setTouched("masks", !masksAreNeutral(e.masks));
    if (entry.kind === "video") {
      const v = entry.edits;
      toolbar.setTouched(
        "trim",
        v.trim.start > 1e-4 || v.trim.end < entry.duration - 1e-4 || v.mute || v.speed !== 1,
      );
    }
  }

  function syncHistoryButtons(): void {
    undoBtn.toggleAttribute("disabled", !history?.canUndo());
    redoBtn.toggleAttribute("disabled", !history?.canRedo());
    updateToolDots();
  }
  history.onChange(syncHistoryButtons);
  syncHistoryButtons();

  undoBtn.addEventListener("click", () => history?.undo(), { signal });
  redoBtn.addEventListener("click", () => history?.redo(), { signal });
  transport?.onTrimChange(recordEdit);

  // ── History timeline (hover the clock, jump to any state) ──

  function buildHistoryMenu(): void {
    if (!history) return;
    history.flush();
    historyMenu.innerHTML = "";
    const card = h("div", { class: "rt-history-menu__card" });
    const snaps = history.entries();
    const cursor = history.cursor();
    for (let i = snaps.length - 1; i >= 0; i--) {
      const label = i === 0 ? "Original" : describeStep(snaps[i - 1], snaps[i]);
      const item = h(
        "button",
        { class: `rt-history-menu__item${i === cursor ? " rt-history-menu__item--current" : ""}` },
        label,
      );
      item.addEventListener(
        "click",
        () => {
          history?.jumpTo(i);
          buildHistoryMenu();
        },
        { signal },
      );
      card.appendChild(item);
    }
    historyMenu.appendChild(card);
  }
  historyWrap.addEventListener(
    "pointerenter",
    () => {
      buildHistoryMenu();
      historyWrap.classList.add("rt-history--open");
    },
    { signal },
  );
  historyWrap.addEventListener(
    "pointerleave",
    () => historyWrap.classList.remove("rt-history--open"),
    { signal },
  );
  historyBtn.addEventListener(
    "click",
    () => {
      buildHistoryMenu();
      historyWrap.classList.toggle("rt-history--open");
    },
    { signal },
  );

  // ── Compare (hold) + reset ──

  let comparing = false;
  function startCompare(): void {
    if (comparing) return;
    comparing = true;
    cropTool.setVisible(false);
    renderer.setAdjustments(DEFAULT_EDITS.adjustments);
    renderer.setFilter(DEFAULT_EDITS.filter);
    renderer.setRotation(DEFAULT_EDITS.rotation);
    renderer.setKeystone(0, 0);
    renderer.setCurves(createDefaultCurves());
    renderer.setHsl(createDefaultHsl());
    renderer.setMasks([]);
    renderer.setCropApplied(false);
    masksOverlay.setVisible(false);
    renderer.render();
  }
  function endCompare(): void {
    if (!comparing) return;
    comparing = false;
    renderer.setAdjustments(entry.edits.adjustments);
    renderer.setFilter(entry.edits.filter);
    renderer.setRotation(entry.edits.rotation);
    renderer.setKeystone(entry.edits.keystoneV, entry.edits.keystoneH);
    renderer.setCurves(entry.edits.curves);
    renderer.setHsl(entry.edits.hsl);
    renderer.setMasks(entry.edits.masks);
    renderer.setCropApplied(true);
    masksOverlay.setVisible(activeTool === "masks");
    renderer.render();
    cropTool.setVisible(activeTool === "crop");
    if (activeTool === "crop") cropTool.refresh();
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
    // Coarse transforms first — they remap the crop, and an explicit AI crop
    // (below) is expressed in the final display space.
    if (ops.orientation !== undefined) {
      const turns = ((((ops.orientation - entry.edits.orientation) / 90) % 4) + 4) % 4;
      for (let i = 0; i < turns; i++) transformStep("rotate-cw");
    }
    if (ops.flipH) transformStep("flip-h");
    if (ops.flipV) transformStep("flip-v");

    if (ops.filter !== undefined) entry.edits.filter = ops.filter;
    if (ops.filterStrength !== undefined) entry.edits.filterStrength = ops.filterStrength;
    if (ops.adjustments) {
      entry.edits.adjustments = { ...entry.edits.adjustments, ...ops.adjustments };
    }
    if (ops.hsl) {
      for (const [band, shift] of Object.entries(ops.hsl)) {
        entry.edits.hsl[band as keyof typeof entry.edits.hsl] = {
          ...entry.edits.hsl[band as keyof typeof entry.edits.hsl],
          ...shift,
        };
      }
    }
    if (ops.rotation !== undefined) entry.edits.rotation = ops.rotation;
    if (ops.keystoneV !== undefined) entry.edits.keystoneV = ops.keystoneV;
    if (ops.keystoneH !== undefined) entry.edits.keystoneH = ops.keystoneH;
    if (ops.crop) entry.edits.crop = { ...ops.crop };
    if (entry.kind === "video") {
      const v = entry.edits as VideoEdits;
      if (ops.trim) v.trim = { ...ops.trim };
      if (ops.mute !== undefined) v.mute = ops.mute;
      if (ops.speed !== undefined) v.speed = ops.speed;
    }

    syncToolsFromEdits();
    if (ops.aspect) {
      // Aspect shapes a selection over the current frame; commit it (records).
      cropTool.setAspectRatio(ops.aspect);
      applyCrop();
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

  let aiChat: AiChatHandle | null = null;
  const aiOptions = options.ai;
  if (aiOptions && (aiOptions.apiKey || aiOptions.complete || aiOptions.allowUserKey)) {
    aiChat = createAiChat({
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
    // Anchored bottom-left of the stage; expands into a vertical chat panel.
    canvasArea.appendChild(aiChat.root);
  }

  // Feature-group tabs live in a left rail; the stage and the control tray
  // (transport + contextual dock) share the center column.
  const trayChildren: HTMLElement[] = [];
  if (transport) trayChildren.push(transport.root);
  trayChildren.push(dock.root);
  const tray = h("div", { class: "rt-editor__tray" }, ...trayChildren);
  const center = h("div", { class: "rt-editor__center" }, canvasArea, tray);
  const body = h("div", { class: "rt-editor__body" }, toolbar.root, center);
  const rootChildren: HTMLElement[] = [topbar, body];
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
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        aiChat?.open();
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

      if (e.key === "Enter" && activeTool === "crop") {
        e.preventDefault();
        applyCrop();
        return;
      }

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

  // Refit the canvas when the stage resizes (window resize, panel changes) —
  // otherwise the fit scale is stale and the image renders at the wrong size.
  let resizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    // Coalesce via microtask, not rAF — rAF never fires in hidden/background
    // tabs, which would leave the canvas at a stale size until user input.
    let pending = false;
    resizeObserver = new ResizeObserver(() => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (signal.aborted) return;
        renderer.render();
        if (activeTool === "crop") cropTool.refresh();
        if (activeTool === "masks") masksOverlay.refresh();
      });
    });
    resizeObserver.observe(canvasArea);
  }

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
      resizeObserver?.disconnect();
      aiChat?.destroy();
      for (const handle of customHandles.values()) handle.destroy?.();
      trimTool?.destroy();
      transport?.destroy();
      seekQueue?.destroy();
      cropTool.destroy();
      adjustTool.destroy();
      curvesTool.destroy();
      hslTool.destroy();
      masksTool.destroy();
      masksOverlay.destroy();
      filtersTool.destroy();
      dock.destroy();
      toolbar.destroy();
      renderer.destroy();
      root.remove();
    },
  };
}
