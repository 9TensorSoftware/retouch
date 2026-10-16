import type { AiContext } from "../../ai/interpreter";
import { interpretCommand } from "../../ai/interpreter";
import {
  createDefaultCurves,
  createDefaultHsl,
  createDefaultStylize,
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
import { framingIsNeutral } from "../../utils/edits";
import type { HistoryController } from "../../utils/history";
import { createHistory } from "../../utils/history";
import { hslIsNeutral } from "../../utils/hsl";
import { applyBrushStroke, createWarpField, liquifyIsNeutral } from "../../utils/liquify";
import { masksAreNeutral } from "../../utils/masks";
import { clamp } from "../../utils/math";
import { carveWidthAsync } from "../../utils/seam";
import { stylizeIsNeutral } from "../../utils/stylize";
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
import {
  ICON_CAMERA,
  ICON_CHECK,
  ICON_EYE,
  ICON_HISTORY,
  ICON_POSTER,
  ICON_REDO,
  ICON_UNDO,
} from "../icons";
import { createAdjustTool } from "./adjust-tool";
import type { AiChatHandle } from "./ai-chat";
import { createAiChat, getStoredAiKey } from "./ai-chat";
import { CanvasRenderer } from "./canvas-renderer";
import { listChanges } from "./changes";
import { createCompareSplit } from "./compare-split";
import type { TransformOp } from "./context-dock";
import { createContextDock } from "./context-dock";
import { createCropTool } from "./crop-tool";
import { createCurvesTool } from "./curves-tool";
import { createFiltersTool } from "./filters-tool";
import { createHslTool } from "./hsl-tool";
import { createLiquifyOverlay } from "./liquify-overlay";
import { createLiquifyTool } from "./liquify-tool";
import { createMasksOverlay } from "./masks-overlay";
import { createMasksTool } from "./masks-tool";
import { createPreviewBase, renderLook, renderLookToCanvas } from "./preview";
import { createStageView } from "./stage-view";
import { createStylizeTool } from "./stylize-tool";
import type { ToolContext, ToolPaneHandle } from "./tool-registry";
import { getCustomTools, resolveToolDef } from "./tool-registry";
import { createToolUi } from "./tool-ui";
import { createToolbar } from "./toolbar";
import type { TransportBarHandle } from "./transport-bar";
import { createTransportBar } from "./transport-bar";
import type { TrimToolHandle } from "./trim-tool";
import { createTrimTool } from "./trim-tool";

const UNDO_ICON = ICON_UNDO;
const REDO_ICON = ICON_REDO;
const EYE_ICON = ICON_EYE;
const HISTORY_ICON = ICON_HISTORY;

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
  if (next.lensDistortion !== prev.lensDistortion || next.lensDevignette !== prev.lensDevignette) {
    parts.push("Lens");
  }
  if (next.seamWidth !== prev.seamWidth) parts.push("Content-aware scale");
  if (JSON.stringify(next.liquify) !== JSON.stringify(prev.liquify)) parts.push("Liquify");
  if (JSON.stringify(next.curves) !== JSON.stringify(prev.curves)) parts.push("Curves");
  if (JSON.stringify(next.hsl) !== JSON.stringify(prev.hsl)) parts.push("Color mix");
  if (JSON.stringify(next.masks) !== JSON.stringify(prev.masks)) parts.push("Masks");
  if (JSON.stringify(next.stylize) !== JSON.stringify(prev.stylize)) parts.push("Stylize");
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
    if (next.deflicker !== prev.deflicker) {
      parts.push(next.deflicker ? "Deflicker on" : "Deflicker off");
    }
  }
  if (parts.length === 0) return "Edit";
  if (parts.length <= 2) return parts.join(" · ");
  return `${parts[0]} · ${parts[1]} +${parts.length - 2}`;
}

/**
 * True for fields that own text-editing keystrokes, so global shortcuts skip
 * them; a focused slider or checkbox still lets shortcuts through.
 */
function isTextInput(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el instanceof HTMLInputElement) return !/^(range|checkbox|radio|button|color)$/.test(el.type);
  return el.tagName === "TEXTAREA" || el.isContentEditable;
}

/** Any focused form field: Escape leaves it before it cancels the editor. */
function isFormField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export type EditorAiEvent =
  | { type: "start"; prompt: string }
  | { type: "applied"; ops: AiEditOps; explanation: string }
  | { type: "error"; error: Error };

export interface EditorOptions {
  entry: MediaEntry;
  onDone: () => void;
  /** True when the entry has a stashed pristine original (committed image). */
  hasOriginal?: () => boolean;
  /**
   * True when that original still lines up with the current pixels (what
   * was baked in moved nothing), so Compare can show it across the divider.
   */
  originalAligned?: () => boolean;
  /** Restore the pristine original (Reset on a committed image). */
  onRestoreOriginal?: () => void;
  onCancel: () => void;
  /** Video only: receives a full-resolution frame canvas and its timestamp. */
  onCaptureFrame?: (canvas: HTMLCanvasElement, time: number) => void;
  /** Enables the AI command bar when configured. */
  ai?: AiOptions;
  onAiEvent?: (event: EditorAiEvent) => void;
  /** Feature groups to mount, in tab order (defaults to all applicable). */
  tools?: EditorTool[];
  /** Video only: export the trimmed range as a GIF (downloads on resolve). */
  onExportGif?: (loop: "forward" | "reverse" | "boomerang") => Promise<void>;
  /** Video only: use the current frame as the gallery poster. */
  onSetPoster?: () => Promise<void>;
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
      ? [
          "trim",
          "crop",
          "transform",
          "liquify",
          "adjust",
          "curves",
          "hsl",
          "masks",
          "stylize",
          "filters",
        ]
      : ["crop", "transform", "liquify", "adjust", "curves", "hsl", "masks", "stylize", "filters"];
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
    class: "rt-editor__compare-btn",
    title: "Hold to compare with the original",
    "aria-label": "Compare with original",
  });
  compareBtn.innerHTML = `${EYE_ICON}<span>Compare</span>`;
  const resetBtn = h(
    "button",
    { class: "rt-editor__text-btn", title: "Reset all edits" },
    "Reset all",
  );

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
      captureBtn.innerHTML = `${ICON_CAMERA}<span>Capture frame</span>`;
    };
    captureLabel();
    let revertId = 0;
    captureBtn.addEventListener(
      "click",
      () => {
        entry.video.pause();
        const canvas = captureFrame(entry.video);
        options.onCaptureFrame?.(canvas, entry.video.currentTime);
        captureBtn.innerHTML = `${ICON_CHECK}<span>Captured</span>`;
        clearTimeout(revertId);
        revertId = window.setTimeout(captureLabel, 1400);
      },
      { signal },
    );
    topbarRight.appendChild(captureBtn);
  }
  if (entry.kind === "video" && options.onSetPoster) {
    const posterBtn = h("button", {
      class: "rt-editor__btn-capture",
      title: "Use the current frame as the gallery poster",
    });
    const posterLabel = () => {
      posterBtn.innerHTML = `${ICON_POSTER}<span>Set poster</span>`;
    };
    posterLabel();
    let posterRevert = 0;
    posterBtn.addEventListener(
      "click",
      () => {
        entry.video.pause();
        void options.onSetPoster?.().then(() => {
          posterBtn.innerHTML = `${ICON_CHECK}<span>Poster set</span>`;
          clearTimeout(posterRevert);
          posterRevert = window.setTimeout(posterLabel, 1400);
        });
      },
      { signal },
    );
    topbarRight.appendChild(posterBtn);
  }
  // Done sits outside the action group so a crowded bar (narrow screens,
  // video's extra buttons) squeezes the actions, never the exit.
  const topbar = h(
    "div",
    { class: "rt-editor__topbar" },
    h("div", { class: "rt-editor__topbar-left" }, cancelBtn),
    h("div", { class: "rt-editor__topbar-title" }, filenameEl, dimsEl),
    topbarRight,
    h("div", { class: "rt-editor__topbar-end" }, divider(), doneBtn),
  );

  // Canvas — the container sits in a pane so a compare pane can flex in
  // beside it. The renderer measures the pane's content area, so the
  // header bar never eats into the canvas fit.
  const canvasContainer = h("div", { class: "rt-editor__canvas-container" });
  const editedHeader = h("div", { class: "rt-compare-header" }, "Edited");
  editedHeader.style.display = "none";
  const paneContent = h("div", { class: "rt-editor__pane-content" }, canvasContainer);
  const canvasPane = h("div", { class: "rt-editor__canvas-pane" }, editedHeader, paneContent);
  const canvasArea = h("div", { class: "rt-editor__canvas-area" }, canvasPane);
  const renderer = new CanvasRenderer(
    canvasContainer,
    entry.kind === "video" ? entry.video : entry.image,
    entry.edits,
  );
  const compareSplit = createCompareSplit({ container: canvasContainer, renderer, signal });
  // Declared up here: the first tool selection (below) already reads it.
  let compareMode: "off" | "split" | "side" = "off";

  // Inspector header: the active tool's name (and what it does, for tools
  // that say), over a live histogram for the tone and look tools.
  const inspectorTitle = h("h2", { class: "rt-inspector__title" });
  const inspectorDesc = h("p", { class: "rt-inspector__desc" });
  // Resets the active tool's edits; shown while that tool has any.
  const headReset = h("button", { type: "button", class: "rt-inspector__reset" }, "Reset");
  headReset.hidden = true;
  const histCanvas = h("canvas", { class: "rt-inspector__hist", "aria-hidden": "true" });
  const histProbe = document.createElement("canvas");
  let histTimer = 0;

  function histogramShown(): boolean {
    // Curves draws its own (input) histogram behind the curve.
    if (entry.kind !== "image" || activeTool === "curves") return false;
    const group = resolveToolDef(activeTool).group;
    return group === "tone" || group === "looks";
  }

  /**
   * On every paint, copy the frame into a small probe right away (before the
   * compare divider covers part of it), then redraw the RGB histogram once
   * paints pause.
   */
  function scheduleHistogram(): void {
    if (!histogramShown()) return;
    const source = renderer.getCanvasElement();
    if (!source.width || !source.height) return;
    histProbe.width = 128;
    histProbe.height = Math.max(1, Math.round((128 * source.height) / source.width));
    histProbe
      .getContext("2d", { willReadFrequently: true })
      ?.drawImage(source, 0, 0, histProbe.width, histProbe.height);
    clearTimeout(histTimer);
    histTimer = window.setTimeout(drawHistogram, 60);
  }
  renderer.onPaint(scheduleHistogram);
  signal.addEventListener("abort", () => clearTimeout(histTimer));

  function drawHistogram(): void {
    const width = histCanvas.clientWidth;
    const height = histCanvas.clientHeight;
    const probe = histProbe.getContext("2d", { willReadFrequently: true });
    const ctx = histCanvas.getContext("2d");
    if (!probe || !ctx || !width || !height || !histProbe.width) return;
    const data = probe.getImageData(0, 0, histProbe.width, histProbe.height).data;
    const bins = 64;
    const channels = [new Uint32Array(bins), new Uint32Array(bins), new Uint32Array(bins)];
    for (let i = 0; i < data.length; i += 4) {
      channels[0][data[i] >> 2]++;
      channels[1][data[i + 1] >> 2]++;
      channels[2][data[i + 2] >> 2]++;
    }
    let peak = 1;
    for (const bin of channels) for (const n of bin) peak = Math.max(peak, n);
    const ratio = window.devicePixelRatio || 1;
    histCanvas.width = Math.round(width * ratio);
    histCanvas.height = Math.round(height * ratio);
    const w = histCanvas.width;
    const hgt = histCanvas.height;
    ctx.clearRect(0, 0, w, hgt);
    // Canvas can't read CSS variables; these read well on the darkroom panel.
    const colors = [
      "rgba(255, 96, 76, 0.6)",
      "rgba(96, 216, 132, 0.55)",
      "rgba(88, 144, 255, 0.65)",
    ];
    ctx.globalCompositeOperation = "lighter";
    channels.forEach((bin, c) => {
      ctx.beginPath();
      ctx.moveTo(0, hgt);
      for (let i = 0; i < bins; i++) {
        ctx.lineTo((i / (bins - 1)) * w, hgt - Math.sqrt(bin[i] / peak) * hgt * 0.94);
      }
      ctx.lineTo(w, hgt);
      ctx.closePath();
      ctx.fillStyle = colors[c];
      ctx.fill();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  function updateInspector(tool: EditorTool): void {
    const def = resolveToolDef(tool);
    inspectorTitle.textContent = def.label;
    inspectorDesc.textContent = def.description ?? "";
    inspectorDesc.hidden = !def.description;
    // Drawn on the next paint (selectTool re-renders), never from a canvas
    // a resize has just cleared.
    histCanvas.hidden = !histogramShown();
    syncHeadReset();
  }

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
      onDeflickerChange: (deflicker) => {
        videoEdits.deflicker = deflicker;
        recordEdit();
      },
      onExportGif: options.onExportGif,
    });
    // Open on the first trimmed frame (the element sits at the poster frame).
    void seekQueue.seek(videoEdits.trim.start);
  }

  // Crop tool (DOM overlay, sits inside canvasContainer). Commit-style: the
  // marquee is a pending selection, committed by Apply, Enter, Done, or
  // switching to another tool. Only Cancel throws it away.
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
    syncHeadReset();
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

  // Liquify: dock pane holds the brush params, the overlay paints pushes.
  const liquifyTool = createLiquifyTool({
    onBrushChange: () => liquifyOverlay.refreshCursor(),
  });
  const liquifyOverlay = createLiquifyOverlay({
    container: canvasContainer,
    renderer,
    getBrush: () => liquifyTool.getBrush(),
    onStroke: (x, y, dx, dy, radius, aspect) => {
      if (!entry.edits.liquify) entry.edits.liquify = createWarpField();
      applyBrushStroke(
        entry.edits.liquify,
        x,
        y,
        dx,
        dy,
        radius,
        liquifyTool.getBrush().strength,
        aspect,
      );
      renderer.setLiquify(entry.edits.liquify);
      renderer.render();
    },
    onCommit: () => recordEdit(),
  });
  liquifyOverlay.setVisible(false);

  // Preview tiles (filters, effects, plugin looks) draw from one small copy.
  const previewBase = createPreviewBase(
    entry.kind === "video" ? captureFrame(entry.video, 240) : entry.image,
  );

  // Stylize effects
  const stylizeTool = createStylizeTool({
    base: previewBase,
    stylize: entry.edits.stylize,
    onChange: (stylize) => {
      entry.edits.stylize = stylize;
      renderer.setStylize(stylize);
      renderer.render();
      recordEdit();
    },
  });

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
    base: previewBase,
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

  // ── Content-aware scale (images only): carve in a worker, debounced ──

  let carveTimer = 0;
  let carveToken = 0;
  let lastCarvedWidth = entry.edits.seamWidth;
  let carvedCanvas: HTMLCanvasElement | null = null;

  async function recomputeCarve(): Promise<void> {
    if (entry.kind !== "image") return;
    const token = ++carveToken;
    if (entry.edits.seamWidth >= 100) {
      carvedCanvas = null;
      renderer.setCarvedSource(null);
      renderer.render();
      cropTool.refresh();
      dock.setSeamWidth(100, false);
      return;
    }
    dock.setSeamWidth(entry.edits.seamWidth, true);
    const img = entry.image;
    // Carving is O(seams × pixels): work on a capped-width copy.
    const preScale = Math.min(1, 1000 / img.naturalWidth);
    const cw = Math.max(2, Math.round(img.naturalWidth * preScale));
    const ch = Math.max(2, Math.round(img.naturalHeight * preScale));
    const work = createCanvas(cw, ch);
    const workCtx = work.getContext("2d");
    if (!workCtx) return;
    workCtx.drawImage(img, 0, 0, cw, ch);
    try {
      const result = await carveWidthAsync(
        workCtx.getImageData(0, 0, cw, ch).data,
        cw,
        ch,
        Math.round((cw * entry.edits.seamWidth) / 100),
      );
      if (token !== carveToken || signal.aborted) return;
      const carved = createCanvas(result.width, result.height);
      carved
        .getContext("2d")
        ?.putImageData(new ImageData(result.data, result.width, result.height), 0, 0);
      carvedCanvas = carved;
      renderer.setCarvedSource(carved);
      renderer.render();
      cropTool.refresh();
    } catch {
      // keep the previous carve on worker failure
    } finally {
      if (token === carveToken) dock.setSeamWidth(entry.edits.seamWidth, false);
    }
  }

  function scheduleCarveIfNeeded(): void {
    if (entry.kind !== "image" || entry.edits.seamWidth === lastCarvedWidth) return;
    lastCarvedWidth = entry.edits.seamWidth;
    clearTimeout(carveTimer);
    carveTimer = window.setTimeout(() => void recomputeCarve(), 350);
  }

  // Custom feature groups mount against the shared edit model: they mutate
  // `edits`, then render() pushes the state everywhere and record() makes it
  // undoable — same lifecycle the built-ins use.
  const toolCtx: ToolContext = {
    kind: entry.kind,
    entry,
    edits: entry.edits,
    render: () => syncToolsFromEdits(),
    record: recordEdit,
    canvasArea,
    ui: createToolUi(signal),
    preview: (patch = {}) => {
      const e = entry.edits;
      return renderLook(previewBase, {
        adjustments: e.adjustments,
        filter: e.filter,
        filterStrength: e.filterStrength,
        curves: e.curves,
        hsl: e.hsl,
        stylize: e.stylize,
        ...patch,
      });
    },
    reveal: (result) => revealResult(result),
  };

  /**
   * ctx.reveal: wipe `result` in over the stage, drawn with the photo's
   * current look, so the editor that remounts with it shows the same
   * picture the wipe ended on.
   */
  async function revealResult(result: HTMLCanvasElement | HTMLImageElement): Promise<() => void> {
    const stage = renderer.getCanvasElement();
    if (entry.kind !== "image" || !framingIsNeutral(entry.edits) || !stage.width) return () => {};
    const base = createCanvas(stage.width, stage.height);
    base.getContext("2d")?.drawImage(result, 0, 0, base.width, base.height);
    const e = entry.edits;
    const layer = renderLookToCanvas(base, {
      adjustments: e.adjustments,
      filter: e.filter,
      filterStrength: e.filterStrength,
      curves: e.curves,
      hsl: e.hsl,
      masks: e.masks,
      stylize: e.stylize,
    });
    layer.classList.add("rt-reveal__layer");
    const edge = h("div", { class: "rt-reveal__edge" });
    const wrap = h("div", { class: "rt-reveal", "aria-hidden": "true" }, layer, edge);
    canvasContainer.appendChild(wrap);
    const remove = (): void => wrap.remove();
    const still =
      typeof layer.animate !== "function" ||
      (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (still) {
      edge.remove();
      return remove;
    }
    const timing: KeyframeAnimationOptions = {
      duration: 900,
      easing: "cubic-bezier(0.65, 0, 0.35, 1)",
      fill: "both",
    };
    const wipe = layer.animate(
      [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }],
      timing,
    );
    edge.animate([{ left: "0%" }, { left: "100%", opacity: 0 }], timing);
    await wipe.finished.catch(() => {});
    edge.remove();
    return remove;
  }
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
    liquifyTool,
    masksTool,
    stylizeTool,
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
    // NaN marks the axis that didn't change (each slider reports only its own).
    onKeystoneChange: (vertical, horizontal) => {
      if (!Number.isNaN(vertical)) entry.edits.keystoneV = vertical;
      if (!Number.isNaN(horizontal)) entry.edits.keystoneH = horizontal;
      renderer.setKeystone(entry.edits.keystoneV, entry.edits.keystoneH);
      renderer.render();
      recordEdit();
    },
    onLensChange: (distortion, devignette) => {
      if (!Number.isNaN(distortion)) entry.edits.lensDistortion = distortion;
      if (!Number.isNaN(devignette)) entry.edits.lensDevignette = devignette;
      renderer.setLens(entry.edits.lensDistortion, entry.edits.lensDevignette);
      renderer.render();
      recordEdit();
    },
    onSeamWidthChange:
      entry.kind === "image"
        ? (percent) => {
            entry.edits.seamWidth = percent;
            recordEdit();
            scheduleCarveIfNeeded();
          }
        : undefined,
  });

  /** Apply a tool's side effects (crop overlay visibility, inspector pane). */
  function selectTool(tool: EditorTool): void {
    // A marquee left behind is still the user's crop, not a draft to discard.
    if (activeTool === "crop" && tool !== "crop") applyCrop();
    if (tool !== activeTool) customHandles.get(activeTool)?.onDeactivate?.();
    activeTool = tool;
    transport?.setTrimEditable(tool === "trim");
    dock.setActiveTool(tool);
    updateInspector(tool);
    customHandles.get(tool)?.onActivate?.();
    renderer.render();
    if (tool === "curves") curvesTool.refreshHistogram();
    masksOverlay.setVisible(tool === "masks");
    if (tool === "masks") masksOverlay.update(entry.edits.masks, masksTool.getSelectedId());
    liquifyOverlay.setVisible(tool === "liquify");
    // The committed crop stays applied in every tool — entering Crop just
    // overlays a fresh selection marquee, so the image never resizes.
    cropTool.setVisible(tool === "crop");
    if (tool === "crop") {
      cropTool.refresh();
      syncCropButtons();
    }
    syncSplitVisibility();
  }

  // Tool rail (left)
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
    renderer.setLens(entry.edits.lensDistortion, entry.edits.lensDevignette);
    renderer.setTransform(entry.edits.orientation, entry.edits.flipH, entry.edits.flipV);
    renderer.setFilter(entry.edits.filter);
    renderer.setFilterStrength(entry.edits.filterStrength);
    renderer.setCurves(entry.edits.curves);
    renderer.setHsl(entry.edits.hsl);
    renderer.setMasks(entry.edits.masks);
    renderer.setStylize(entry.edits.stylize);
    renderer.setLiquify(entry.edits.liquify);
    adjustTool.setAdjustments(entry.edits.adjustments);
    curvesTool.setCurves(entry.edits.curves);
    hslTool.setHsl(entry.edits.hsl);
    masksTool.setMasks(entry.edits.masks);
    stylizeTool.setStylize(entry.edits.stylize);
    filtersTool.setFilter(entry.edits.filter);
    filtersTool.setStrength(entry.edits.filterStrength);
    dock.setRotation(entry.edits.rotation);
    dock.setKeystone(entry.edits.keystoneV, entry.edits.keystoneH);
    dock.setLens(entry.edits.lensDistortion, entry.edits.lensDevignette);
    dock.setSeamWidth(entry.edits.seamWidth);
    scheduleCarveIfNeeded();
    renderer.setCrop(entry.edits.crop);
    if (entry.kind === "video") {
      transport?.setTrim(entry.edits.trim);
      transport?.setMuted(entry.edits.mute);
      transport?.setSpeed(entry.edits.speed);
      trimTool?.setDeflicker(entry.edits.deflicker);
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
      entry.edits.lensDistortion = state.lensDistortion;
      entry.edits.lensDevignette = state.lensDevignette;
      entry.edits.seamWidth = state.seamWidth;
      entry.edits.liquify = state.liquify ? structuredClone(state.liquify) : null;
      entry.edits.orientation = state.orientation;
      entry.edits.flipH = state.flipH;
      entry.edits.flipV = state.flipV;
      entry.edits.adjustments = { ...state.adjustments };
      entry.edits.curves = structuredClone(state.curves);
      entry.edits.hsl = structuredClone(state.hsl);
      entry.edits.masks = structuredClone(state.masks);
      entry.edits.stylize = { ...state.stylize };
      entry.edits.filter = state.filter;
      entry.edits.filterStrength = state.filterStrength;
      if (entry.kind === "video" && "trim" in state) {
        const v = entry.edits as VideoEdits;
        v.trim = { ...state.trim };
        v.mute = state.mute;
        v.speed = state.speed;
        v.deflicker = state.deflicker;
      }
      syncToolsFromEdits();
    },
  });

  /** Whether a feature group's edits are away from neutral (its rail dot). */
  function toolTouched(tool: EditorTool): boolean {
    const e = entry.edits;
    switch (tool) {
      case "crop":
        return hasCommittedCrop();
      case "transform":
        return (
          e.rotation !== 0 ||
          e.keystoneV !== 0 ||
          e.keystoneH !== 0 ||
          e.lensDistortion !== 0 ||
          e.lensDevignette !== 0 ||
          e.seamWidth !== 100 ||
          e.orientation !== 0 ||
          e.flipH ||
          e.flipV
        );
      case "adjust": {
        const adj = e.adjustments as unknown as Record<string, number>;
        const defaults = DEFAULT_ADJUSTMENTS as unknown as Record<string, number>;
        return Object.keys(adj).some((k) => adj[k] !== defaults[k]);
      }
      case "filters":
        return e.filter !== "none";
      case "curves":
        return !curvesAreIdentity(e.curves);
      case "hsl":
        return !hslIsNeutral(e.hsl);
      case "liquify":
        return !liquifyIsNeutral(e.liquify);
      case "masks":
        return !masksAreNeutral(e.masks);
      case "stylize":
        return !stylizeIsNeutral(e.stylize);
      case "trim": {
        if (entry.kind !== "video") return false;
        const v = entry.edits;
        return (
          v.trim.start > 1e-4 ||
          v.trim.end < entry.duration - 1e-4 ||
          v.mute ||
          v.speed !== 1 ||
          v.deflicker
        );
      }
      default:
        return false;
    }
  }

  /** Orange dot per feature group while its edits are away from neutral. */
  function updateToolDots(): void {
    for (const tool of tools) toolbar.setTouched(tool, toolTouched(tool));
    syncHeadReset();
  }

  /** Undo the coarse turns and flips, remapping the crop back with them. */
  function resetOrientation(): void {
    const e = entry.edits;
    for (let turns = 0; e.orientation !== 0 && turns < 4; turns++) transformStep("rotate-ccw");
    if (e.flipH) transformStep("flip-h");
    if (e.flipV) transformStep("flip-v");
  }

  /**
   * What the inspector's Reset clears, per tool: the pane's own controls.
   * A function, not a table, so the first tool selection (which runs before
   * this point in setup) can already call it.
   */
  function toolReset(tool: EditorTool): { touched: () => boolean; reset: () => void } | null {
    const e = entry.edits;
    switch (tool) {
      case "crop":
        return {
          touched: () =>
            hasCommittedCrop() ||
            !cropTool.isSelectionFull() ||
            e.rotation !== 0 ||
            e.orientation !== 0 ||
            e.flipH ||
            e.flipV,
          reset: () => {
            resetOrientation();
            e.crop = { x: 0, y: 0, width: 1, height: 1 };
            e.rotation = 0;
          },
        };
      case "transform":
        return {
          touched: () => toolTouched("transform"),
          reset: () => {
            resetOrientation();
            Object.assign(e, {
              rotation: 0,
              keystoneV: 0,
              keystoneH: 0,
              lensDistortion: 0,
              lensDevignette: 0,
              seamWidth: 100,
            });
          },
        };
      case "adjust":
        return {
          touched: () => toolTouched("adjust"),
          reset: () => {
            e.adjustments = { ...DEFAULT_ADJUSTMENTS };
          },
        };
      case "curves":
        return {
          touched: () => toolTouched("curves"),
          reset: () => {
            e.curves = createDefaultCurves();
          },
        };
      case "hsl":
        return {
          touched: () => toolTouched("hsl"),
          reset: () => {
            e.hsl = createDefaultHsl();
          },
        };
      case "masks":
        return {
          touched: () => e.masks.length > 0,
          reset: () => {
            e.masks = [];
          },
        };
      case "liquify":
        return {
          touched: () => toolTouched("liquify"),
          reset: () => {
            e.liquify = null;
          },
        };
      case "stylize":
        return {
          touched: () => toolTouched("stylize"),
          reset: () => {
            e.stylize = createDefaultStylize();
          },
        };
      case "filters":
        return {
          touched: () => toolTouched("filters") || e.filterStrength !== 100,
          reset: () => {
            e.filter = "none";
            e.filterStrength = 100;
          },
        };
      default:
        return null;
    }
  }

  function syncHeadReset(): void {
    const def = toolReset(activeTool);
    headReset.hidden = !def?.touched();
    headReset.setAttribute("aria-label", `Reset ${resolveToolDef(activeTool).label}`);
  }

  headReset.addEventListener(
    "click",
    () => {
      const def = toolReset(activeTool);
      if (!def) return;
      def.reset();
      syncToolsFromEdits();
      history?.record();
      // Focus would otherwise fall to the body once the button hides.
      inspectorTitle.setAttribute("tabindex", "-1");
      inspectorTitle.focus();
    },
    { signal },
  );

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
    renderer.setLens(0, 0);
    renderer.setCarvedSource(null);
    renderer.setCurves(createDefaultCurves());
    renderer.setHsl(createDefaultHsl());
    renderer.setMasks([]);
    renderer.setStylize(createDefaultStylize());
    renderer.setLiquify(null);
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
    renderer.setLens(entry.edits.lensDistortion, entry.edits.lensDevignette);
    renderer.setCarvedSource(carvedCanvas);
    renderer.setCurves(entry.edits.curves);
    renderer.setHsl(entry.edits.hsl);
    renderer.setMasks(entry.edits.masks);
    renderer.setStylize(entry.edits.stylize);
    renderer.setLiquify(entry.edits.liquify);
    renderer.setCropApplied(true);
    masksOverlay.setVisible(activeTool === "masks");
    renderer.render();
    cropTool.setVisible(activeTool === "crop");
    if (activeTool === "crop") cropTool.refresh();
  }
  // ── Compare (images): the eye toggles a before/after divider on the
  // photo. When the before can't line up with the after (a committed image
  // whose crop or turn was baked in), it shows the original side by side
  // instead. Videos keep the momentary hold-compare. ──

  let beforePane: HTMLElement | null = null;

  /**
   * What the divider's left side draws: the source itself (null), or a
   * committed image's pristine original when it has the same shape.
   */
  function splitBefore(): { aligned: boolean; image: HTMLImageElement | null } {
    if (entry.kind !== "image") return { aligned: false, image: null };
    const original = options.hasOriginal?.() ? entry.original?.image : undefined;
    if (!original) return { aligned: true, image: null };
    const shape = (img: HTMLImageElement): number =>
      img.naturalWidth / Math.max(1, img.naturalHeight);
    const aligned =
      (options.originalAligned?.() ?? false) &&
      Math.abs(shape(original) - shape(entry.image)) < 0.005 &&
      !carvedCanvas;
    return { aligned, image: aligned ? original : null };
  }

  /** The crop tool shows the whole frame and its marquee; the divider waits. */
  function syncSplitVisibility(): void {
    compareSplit.setVisible(compareMode === "split" && activeTool !== "crop");
  }

  function buildBeforePane(): HTMLElement {
    const content = h("div", { class: "rt-editor__pane-content" });
    if (entry.kind === "image") {
      const source = entry.original?.image ?? entry.image;
      const canvas = document.createElement("canvas");
      const cap = Math.min(1, 1600 / Math.max(source.naturalWidth, source.naturalHeight, 1));
      canvas.width = Math.max(1, Math.round(source.naturalWidth * cap));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * cap));
      canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
      content.appendChild(canvas);
    }
    return h(
      "div",
      { class: "rt-editor__canvas-pane rt-compare-pane" },
      h("div", { class: "rt-compare-header" }, "Original"),
      content,
    );
  }

  function setSideBySide(on: boolean): void {
    // Side by side always shows both at fit; zoom comes back with the single view.
    stageView.setEnabled(!on);
    if (on) {
      beforePane = buildBeforePane();
      canvasArea.insertBefore(beforePane, canvasPane);
      canvasArea.classList.add("rt-editor__canvas-area--split");
      editedHeader.style.display = "";
    } else {
      beforePane?.remove();
      beforePane = null;
      canvasArea.classList.remove("rt-editor__canvas-area--split");
      editedHeader.style.display = "none";
    }
    renderer.render();
    cropTool.refresh();
    if (activeTool === "masks") masksOverlay.refresh();
  }

  function setCompare(on: boolean): void {
    if (entry.kind !== "image" || on === (compareMode !== "off")) return;
    if (on) {
      const before = splitBefore();
      compareMode = before.aligned ? "split" : "side";
      if (compareMode === "split") renderer.setBeforeSource(before.image);
      else setSideBySide(true);
    } else {
      if (compareMode === "side") setSideBySide(false);
      compareMode = "off";
      renderer.setBeforeSource(null);
    }
    syncSplitVisibility();
    compareBtn.classList.toggle("rt-editor__compare-btn--active", on);
    compareBtn.setAttribute("aria-pressed", String(on));
  }

  if (entry.kind === "image") {
    compareBtn.title = "Compare before and after (\\)";
    compareBtn.setAttribute("aria-label", "Compare before and after");
    compareBtn.setAttribute("aria-pressed", "false");
    compareBtn.setAttribute("aria-keyshortcuts", "\\");
    compareBtn.addEventListener("click", () => setCompare(compareMode === "off"), { signal });
  } else {
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
  }

  function resetEdits(): void {
    // Committed images reset all the way back to the pristine original.
    if (entry.kind === "image" && options.hasOriginal?.()) {
      options.onRestoreOriginal?.();
      return;
    }
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
    if (ops.stylize) {
      entry.edits.stylize = {
        ...entry.edits.stylize,
        kind: ops.stylize.kind,
        ...(ops.stylize.amount !== undefined ? { amount: ops.stylize.amount } : {}),
      };
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
    if (ops.lensDistortion !== undefined) entry.edits.lensDistortion = ops.lensDistortion;
    if (ops.lensDevignette !== undefined) entry.edits.lensDevignette = ops.lensDevignette;
    if (ops.seamWidth !== undefined && entry.kind === "image") {
      entry.edits.seamWidth = ops.seamWidth;
      scheduleCarveIfNeeded();
    }
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
      suggestions:
        entry.kind === "video"
          ? [
              "Brighter and warmer",
              "Black and white",
              "Trim the first second",
              "Play at half speed",
            ]
          : [
              "Warmer light",
              "More contrast",
              "Moody and cinematic",
              "Black and white",
              "Straighten the horizon",
              "Crop to a square",
            ],
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
          const before = structuredClone(entry.edits);
          const stepBefore = history?.cursor() ?? -1;
          applyAiOps(ops);
          // One history step per command, so its card can take exactly it back.
          history?.flush();
          const step = history?.cursor() ?? -1;
          options.onAiEvent?.({ type: "applied", ops, explanation: ops.explanation });
          const changes = listChanges(before, entry.edits);
          return {
            explanation: ops.explanation,
            changes,
            undo:
              changes.length > 0 && step !== stepBefore
                ? () => {
                    if (!history || history.cursor() !== step) return false;
                    history.undo();
                    return true;
                  }
                : undefined,
          };
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

  // Floating panels on the stage: the tool rail on the left, the inspector
  // (the active tool's controls) on the right, and the canvas in between,
  // with the video transport under it.
  const center = h(
    "div",
    { class: "rt-editor__center" },
    canvasArea,
    ...(transport ? [transport.root] : []),
  );
  const inspector = h(
    "aside",
    { class: "rt-editor__inspector", "aria-label": "Tool controls" },
    h(
      "div",
      { class: "rt-inspector__head" },
      h("div", { class: "rt-inspector__titles" }, inspectorTitle, inspectorDesc),
      headReset,
    ),
    histCanvas,
    h("div", { class: "rt-inspector__body" }, dock.root),
  );
  const body = h("div", { class: "rt-editor__body" }, toolbar.root, center, inspector);
  const rootChildren: HTMLElement[] = [topbar, body];

  // Zoom and pan. Every render re-applies the view, so overlays follow both
  // edits and zooming.
  const stageView = createStageView({
    area: canvasArea,
    target: canvasContainer,
    renderer,
    spacePan: entry.kind === "image",
    onChange: () => {
      if (activeTool === "crop") cropTool.refresh();
      if (activeTool === "masks") masksOverlay.refresh();
    },
    signal,
  });
  canvasArea.appendChild(stageView.root);
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
  /** Done keeps what's on screen, including a crop marquee nobody applied. */
  function finish(): void {
    applyCrop();
    onDone();
  }
  cancelBtn.addEventListener("click", cancel, { signal });
  doneBtn.addEventListener("click", finish, { signal });

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
        if (isFormField(e.target)) (e.target as HTMLElement).blur();
        else cancel();
        return;
      }
      if (mod && e.key === "Enter") {
        e.preventDefault();
        finish();
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

      if (e.altKey) return;
      if (e.key === "\\" && entry.kind === "image") {
        e.preventDefault();
        setCompare(compareMode === "off");
        return;
      }
      if (activeTool === "liquify" && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        liquifyTool.nudgeSize(e.key === "]" ? 1 : -1);
        return;
      }
      if (stageView.handleKey(e)) {
        e.preventDefault();
        return;
      }
      if ((e.key === "i" || e.key === "I") && toolbar.openAiMenu()) {
        e.preventDefault();
        return;
      }
      // Tools by letter (C crop, A adjust, …) or by rail position (1–9).
      const num = Number(e.key);
      const tool =
        e.key.length === 1 && Number.isNaN(num)
          ? toolbar.toolForKey(e.key)
          : Number.isInteger(num) && num >= 1
            ? toolbar.order[num - 1]
            : undefined;
      if (tool) {
        e.preventDefault();
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
      clearTimeout(carveTimer);
      carveToken++;
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
      liquifyTool.destroy();
      liquifyOverlay.destroy();
      stylizeTool.destroy();
      filtersTool.destroy();
      dock.destroy();
      toolbar.destroy();
      renderer.destroy();
      root.remove();
    },
  };
}
