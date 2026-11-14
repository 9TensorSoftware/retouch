import type {
  EditMask,
  EditorToolPlugin,
  ImageEdits,
  ObjectLayer,
  Retouch,
  ToolContext,
  ToolPaneHandle,
  ToolTask,
  UiButton,
  UiModelState,
  UiStatus,
  UiTiles,
  VideoEdits,
} from "@9tensor/retouch";
import { composeBokeh, prepareBokeh, renderBokeh, suggestFocus } from "./bokeh";
import { KEEP_RGB, rgba } from "./colors";
import {
  applyMatteAlpha,
  type CutoutOptions,
  DEFAULT_CUTOUT_MODEL_URL,
  removeBackground,
} from "./cutout";
import {
  DEFAULT_DENOISE_DATA_URL,
  DEFAULT_DENOISE_MODEL_URL,
  type DenoiseOptions,
  denoiseImage,
} from "./denoise";
import { DEFAULT_DEPTH_MODEL_URL, type DepthOptions, depthAt, estimateDepth } from "./depth";
import { createDepthSurface } from "./depth-tool";
import {
  DEFAULT_FACE_MODEL_URL,
  DEFAULT_OBJECT_MODEL_URL,
  type DetectFacesOptions,
  type Detection,
  type DetectObjectsOptions,
  detectFaces,
  detectObjects,
} from "./detect";
import { createEraseSurface } from "./erase-tool";
import { boxQuad, cropAround, detectionColors, detectionName, keepFindings } from "./findings";
import {
  CUTOUT_ICON,
  DENOISE_ICON,
  DEPTH_ICON,
  DETECT_ICON,
  ERASE_ICON,
  SELECT_ICON,
  TEXT_ICON,
  TRACK_ICON,
  UPSCALE_ICON,
} from "./icons";
import {
  DEFAULT_INPAINT_MODEL_URL,
  dilateMask,
  type InpaintOptions,
  inpaintMask,
  inpaintStrokes,
} from "./inpaint";
import {
  downloadModel,
  isModelCached,
  isModelSaved,
  modelDownload,
  modelDownloadFailed,
  stopModelDownload,
  watchModelDownloads,
} from "./model-cache";
import {
  DEFAULT_TEXT_DETECTOR_URL,
  DEFAULT_TEXT_DICTIONARY_URL,
  DEFAULT_TEXT_RECOGNIZER_URL,
  linesToText,
  type OcrOptions,
  recognizeText,
  type TextLine,
} from "./ocr";
import {
  candidateMask,
  DEFAULT_SAM_DECODER_URL,
  DEFAULT_SAM_ENCODER_URL,
  decodeSamCandidates,
  encodeSamImage,
  type SamCandidates,
  type SamEmbeddings,
  type SamOptions,
  type SamPoint,
} from "./sam";
import {
  createSelectionHistory,
  createSelectSurface,
  distinctShapes,
  shapeContains,
  shapeLabels,
  shapeThumbnail,
} from "./select-tool";
import { type TrackedVideo, type TrackVideoOptions, trackVideo } from "./track";
import { createTrackOverlay, firstShown, trackBounds, trackColor, trackName } from "./track-tool";
import { DEFAULT_UPSCALE_MODEL_URL, type UpscaleOptions, upscaleImage } from "./upscale";

export interface MlToolsOptions {
  cutout?: CutoutOptions | false;
  upscale?: UpscaleOptions | false;
  erase?: InpaintOptions | false;
  detect?: (DetectFacesOptions & { objects?: DetectObjectsOptions }) | false;
  select?: SamOptions | false;
  depth?: DepthOptions | false;
  denoise?: DenoiseOptions | false;
  /** Read text: find the lines in a photo, then copy or pixelate them. */
  text?: OcrOptions | false;
  /** Track: follow each object through a video, then trim or crop to one. */
  track?: Omit<TrackVideoOptions, "start" | "end" | "labels" | "signal" | "onFrame"> | false;
  /**
   * Open gallery results (upscale, Select's cut-out) in the editor when they finish,
   * so the outcome is visible immediately. Defaults to true.
   */
  openResults?: boolean;
}

// ── Models: what each tool downloads, and how that's said ────────────────

interface ModelSpec {
  /** The card's Model fact. */
  name: string;
  /** Every file a run downloads; all must be saved to skip the download. */
  urls: string[];
  /** The default files' total size in MB; null for self-hosted models. */
  mb: number | null;
}

/** Self-hosted URLs make the size unknown; the defaults' sizes are known. */
function spec(
  name: string,
  mb: number,
  files: Array<[custom: string | undefined, fallback: string]>,
): ModelSpec {
  const urls = files.map(([custom, fallback]) => custom ?? fallback);
  const custom = files.some(([url]) => url !== undefined);
  return { name, urls, mb: custom ? null : mb };
}

function runsWith(): string {
  return typeof navigator !== "undefined" && "gpu" in navigator ? "WebGPU" : "WebAssembly";
}

interface ModelStatus {
  root: HTMLElement;
  /** On this device, so the pane's actions can run. */
  ready(): boolean;
  destroy(): void;
}

/** Whose model strip it is: the tool it's in, and what the header calls its download. */
interface ModelOwner {
  tool: string;
  label: string;
}

/**
 * The model's state, leading a pane: Download with its size, then the
 * download's progress and time left, then Ready. The download is shared, so
 * every pane showing this model (and one reopened mid-download) shows the
 * same. `onChange` fires as the state moves on, to turn the actions on.
 */
function modelStatus(
  ctx: ToolContext,
  model: ModelSpec,
  owner: ModelOwner,
  onChange: () => void,
  name?: string,
): ModelStatus {
  const strip = ctx.ui.model({
    bytes: model.mb === null ? null : model.mb * 1e6,
    name,
    about: {
      text: "It runs on this device, so your photo isn't uploaded. It downloads once; after that it's saved in this browser.",
      facts: [
        ["Model", model.name],
        ...(model.mb === null ? [] : [["Size", `${model.mb} MB`] as const]),
        ["Saved", "Not yet"],
        ["Runs with", runsWith()],
      ],
    },
    onDownload: () => void download(),
  });
  // Until the cache has been asked, a model not known to be saved stays unsaid.
  let checked = false;
  let last: UiModelState | null = null;
  // The pane reads ready() as it builds; it hears of changes after that.
  let building = true;
  function update(): void {
    const progress = modelDownload(model.urls);
    if (progress) strip.progress(progress.loaded, progress.total);
    else if (isModelSaved(model.urls)) strip.set("ready");
    else if (modelDownloadFailed(model.urls)) strip.set("failed");
    else if (checked) strip.set("missing");
    strip.setFact("Saved", strip.state === "ready" ? "In this browser" : "Not yet");
    if (strip.state === last) return;
    last = strip.state;
    if (!building) onChange();
  }
  /** Download it as a task: the header shows it, with Stop, whichever tool is open. */
  async function download(): Promise<void> {
    const called = name ?? owner.label;
    const task = await ctx.tasks.start({
      tool: owner.tool,
      action: `Download ${called}`,
      working: `Downloading ${called}`,
      download: true,
    });
    if (!task) return;
    const size = model.mb === null ? 0 : model.mb * 1e6;
    const unwatch = watchModelDownloads(() => {
      const progress = modelDownload(model.urls);
      if (progress) task.bytes(progress.loaded, progress.total || size);
    });
    task.signal.addEventListener("abort", () => stopModelDownload(model.urls));
    try {
      await downloadModel(model.urls);
      task.done(`${called} is ready`);
    } catch (error) {
      if (!task.signal.aborted) {
        task.failed(`${called} didn't download`);
        console.error(error);
      }
    } finally {
      unwatch();
      update();
    }
  }

  const stop = watchModelDownloads(update);
  update();
  building = false;
  void isModelCached(model.urls).then(() => {
    checked = true;
    update();
  });
  return { root: strip.root, ready: () => strip.state === "ready", destroy: stop };
}

/** "tap" → "Tap". */
function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function errorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  return message ? `${fallback}: ${message.replace(/^\[Retouch ML\]\s*/, "")}` : fallback;
}

// ── Canvas helpers ────────────────────────────────────────────────────────

/**
 * Erase strokes map 1:1 onto the source only while no geometric edit
 * remaps the preview — anything else would paint the fill in the wrong
 * place.
 */
function geometryIsNeutral(edits: ImageEdits): boolean {
  const c = edits.crop;
  return c.x === 0 && c.y === 0 && c.width === 1 && c.height === 1 && turnsAreNeutral(edits);
}

/** No turn, flip or warp: what's on screen is the source, cropped at most. */
function turnsAreNeutral(edits: ImageEdits): boolean {
  return (
    edits.rotation === 0 &&
    edits.orientation === 0 &&
    !edits.flipH &&
    !edits.flipV &&
    edits.keystoneV === 0 &&
    edits.keystoneH === 0 &&
    edits.lensDistortion === 0 &&
    edits.seamWidth === 100 &&
    (edits.liquify === null ||
      (edits.liquify.dx.every((v) => v === 0) && edits.liquify.dy.every((v) => v === 0)))
  );
}

const NEEDS_FRAME =
  "This works on the uncropped, unturned photo. Reset Crop, Transform and Liquify first.";

/**
 * A "Hide boxes" button for a tool's object layer. The layer shows while the
 * tool is active, unless it's been hidden.
 */
function layerSwitch(
  ctx: ToolContext,
  layer: Pick<ObjectLayer, "setVisible">,
): { button: UiButton; setActive(active: boolean): void } {
  let active = false;
  let shown = true;
  const button = ctx.ui.button({
    label: "Hide boxes",
    onClick: () => {
      shown = !shown;
      button.setLabel(shown ? "Hide boxes" : "Show boxes");
      layer.setVisible(active && shown);
    },
  });
  return {
    button,
    setActive(next) {
      active = next;
      layer.setVisible(active && shown);
    },
  };
}

/** Mosaic-pixelate a normalized box region of the canvas, in place. */
function pixelateRegion(canvas: HTMLCanvasElement, box: Detection): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // Expand a little so hairlines don't give the face away.
  const grow = 0.15;
  const x = Math.max(0, Math.round((box.x - box.w * grow) * canvas.width));
  const y = Math.max(0, Math.round((box.y - box.h * grow) * canvas.height));
  const w = Math.min(canvas.width - x, Math.round(box.w * (1 + 2 * grow) * canvas.width));
  const h = Math.min(canvas.height - y, Math.round(box.h * (1 + 2 * grow) * canvas.height));
  if (w < 2 || h < 2) return;
  const blocks = 10;
  const small = document.createElement("canvas");
  small.width = Math.max(2, Math.min(blocks, w));
  small.height = Math.max(2, Math.min(blocks, h));
  const sctx = small.getContext("2d");
  if (!sctx) return;
  sctx.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
  ctx.imageSmoothingEnabled = true;
}

const extensionFor = (type: string): string => (type === "image/png" ? ".png" : ".jpg");

/** Blob → File matching the entry's family: PNG stays PNG, photos go JPEG. */
function resultFileName(sourceName: string, suffix: string, type: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "");
  return `${base}-${suffix}${extensionFor(type)}`;
}

function encodeCanvas(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("[Retouch ML] Failed to encode result"))),
      type,
      0.95,
    );
  });
}

/** Thrown between tiles once a run is stopped, to skip the rest. */
function stopped(): DOMException {
  return new DOMException("Stopped", "AbortError");
}

/**
 * Show a task on a pane's status line as it goes, and how it ended.
 * `onChange` hears each change, so the pane can turn its buttons back on.
 */
function follow(task: ToolTask, status: UiStatus, onChange: (task: ToolTask) => void): void {
  const paint = (): void => {
    if (task.state === "running") {
      status.working(task.label, {
        detail: task.detail || undefined,
        progress: task.progress ?? undefined,
      });
    } else if (task.state === "done") status.done(task.label, task.detail || undefined);
    else if (task.state === "failed") status.failed(task.label);
    else status.clear();
    onChange(task);
  };
  const unwatch = task.watch(() => {
    paint();
    if (task.state !== "running") unwatch();
  });
  paint();
}

/**
 * Tasks outlive panes: one that changes the photo remounts the editor, and
 * the tool's new pane picks the task up from there, to the end.
 */
function resume(
  ctx: ToolContext,
  tool: string,
  status: UiStatus,
  onChange: (task: ToolTask) => void,
): void {
  const task = ctx.tasks.running(tool);
  if (task) follow(task, status, onChange);
}

/** A run that splits into tiles: how far along, as a percentage and a bar. */
function tileProgress(done: number, total: number): { detail: string; progress: number } {
  return { detail: `${Math.round((done / total) * 100)}%`, progress: done / total };
}

/** Each video's last tracking, kept while the entry lives: reopening the tool shows it again. */
const trackResults = new WeakMap<object, TrackedVideo>();

/** Each photo's last Detect run, as it was left. */
const detectResults = keepFindings<{ found: Detection[]; noun: string }>();
/** Each photo's last Read text run. */
const textResults = keepFindings<TextLine[]>();

type Follow = "all" | "people" | "vehicles" | "animals";

/** The COCO classes each Track choice follows; everything for "all". */
const FOLLOW: Record<Follow, readonly string[] | undefined> = {
  all: undefined,
  people: ["person"],
  vehicles: ["bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat"],
  animals: ["bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe"],
};

/**
 * Register the ML feature groups on the editor. Call once, before opening
 * the editor. The instance is needed so results (new images) can land in
 * the gallery. Pass `false` per tool to skip it.
 */
export function installMlTools(retouch: Retouch, options: MlToolsOptions = {}): void {
  const ctor = retouch.constructor as typeof Retouch;
  const openResults = options.openResults !== false;

  /** The entry's own format: JPEG stays JPEG, everything else keeps alpha as PNG. */
  const typeOf = (ctx: ToolContext): string =>
    ctx.entry.file.type === "image/jpeg" ? "image/jpeg" : "image/png";

  /**
   * Wipe the result in, then replace this photo's pixels with it: one undo
   * step, named `history` (the editor remounts on the same tool, and the
   * tool's new pane picks `task` up), then `task` is done, said as `done`.
   * Resolves false if the task was stopped first, leaving the photo as it
   * was. `type` overrides the entry's own format, as a cutout needs PNG's alpha.
   */
  async function replacePhoto(
    ctx: ToolContext,
    result: HTMLCanvasElement,
    task: ToolTask,
    { history, done, type = typeOf(ctx) }: { history: string; done: string; type?: string },
  ): Promise<boolean> {
    if (task.signal.aborted) return false;
    const [blob, putBack] = await Promise.all([encodeCanvas(result, type), ctx.reveal(result)]);
    if (task.signal.aborted) {
      putBack();
      return false;
    }
    const own = ctx.entry.file.name;
    const name =
      type === ctx.entry.file.type ? own : `${own.replace(/\.[^.]+$/, "")}${extensionFor(type)}`;
    await retouch.replaceImageSource(ctx.entry.id, new File([blob], name, { type }), {
      label: history,
    });
    task.done(done);
    return true;
  }

  /**
   * Add a result to the gallery, as the end of `task`. With openResults it
   * wipes in and the editor moves to it; otherwise the status says it's
   * there, with a button to open it.
   */
  async function addToGallery(
    ctx: ToolContext,
    result: HTMLCanvasElement,
    suffix: string,
    type: string,
    task: ToolTask,
    status: UiStatus,
  ): Promise<void> {
    if (task.signal.aborted) return;
    task.working("Adding it to your gallery…");
    const reveal = openResults ? ctx.reveal(result) : Promise.resolve(() => {});
    const [blob, putBack] = await Promise.all([encodeCanvas(result, type), reveal]);
    if (task.signal.aborted) {
      putBack();
      return;
    }
    const name = resultFileName(ctx.entry.file.name, suffix, type);
    const before = retouch.getMedia().length;
    await retouch.addFiles([new File([blob], name, { type })]);
    const media = retouch.getMedia();
    const added = media.length > before ? media[media.length - 1] : undefined;
    if (!added) {
      putBack();
      task.failed("The gallery turned it down, most likely over its size limit.");
      return;
    }
    task.done("Added to your gallery");
    if (openResults) {
      retouch.closeEditor(true);
      retouch.openEditor(added.id);
      return;
    }
    const open = ctx.ui.button({
      label: "Open it",
      variant: "primary",
      onClick: () => {
        retouch.closeEditor(true);
        retouch.openEditor(added.id);
      },
    });
    const row = ctx.ui.row(open.root);
    row.classList.add("rt-ml-opened");
    // Another result replaces the last one's button rather than adding a second.
    const last = status.root.nextElementSibling;
    if (last?.classList.contains("rt-ml-opened")) last.remove();
    status.root.after(row);
  }

  /** Take back "Added to your gallery" and its Open it, once the result is old news. */
  function clearOutcome(status: UiStatus): void {
    status.clear();
    const after = status.root.nextElementSibling;
    if (after?.classList.contains("rt-ml-opened")) after.remove();
  }

  /**
   * A one-button tool (cutout, upscale, denoise): the model, the run button,
   * and how the run goes. `run` does the work and reports tiles; `finish`
   * commits the result.
   */
  function oneShot(
    ctx: ToolContext,
    def: {
      id: string;
      /** The tool's name, for its download in the header. */
      label: string;
      model: ModelSpec;
      action: string;
      working: string;
      changes?: "photo" | "view";
      run(hooks: { tile: (done: number, total: number) => void }): Promise<HTMLCanvasElement>;
      /** Commit the result, and say the task is done. */
      finish(result: HTMLCanvasElement, task: ToolTask, status: UiStatus): Promise<unknown>;
      failure(error: unknown): string;
    },
  ): ToolPaneHandle {
    const status = ctx.ui.status();
    const busy = (): boolean => ctx.tasks.running(def.id) !== null;
    const button = ctx.ui.button({
      label: def.action,
      variant: "ai",
      onClick: () => void start(),
    });
    const model = modelStatus(ctx, def.model, { tool: def.id, label: def.label }, () =>
      syncState(),
    );

    function syncState(): void {
      button.setDisabled(busy() || !model.ready());
    }

    async function start(): Promise<void> {
      if (busy() || !model.ready() || ctx.entry.kind !== "image") return;
      const task = await ctx.tasks.start({
        tool: def.id,
        action: def.action,
        working: def.working,
        changes: def.changes,
      });
      if (!task) return;
      clearOutcome(status);
      follow(task, status, syncState);
      try {
        const result = await def.run({
          tile: (done, total) => {
            if (task.signal.aborted) throw stopped();
            task.working(def.working, tileProgress(done, total));
          },
        });
        if (task.signal.aborted) return;
        await def.finish(result, task, status);
      } catch (error) {
        if (task.signal.aborted) return;
        task.failed(def.failure(error));
        console.error(error);
      }
    }

    const card = ctx.ui.card({});
    card.body.append(model.root, button.root, status.root);
    resume(ctx, def.id, status, syncState);
    syncState();
    return { root: card.root, destroy: model.destroy };
  }

  /**
   * Register an AI tool. Its line in the AI tools menu gives the download's
   * size until the model is on this device, then says Ready.
   */
  function registerAi(
    model: ModelSpec,
    plugin: Omit<EditorToolPlugin, "group" | "badge" | "ready">,
  ): void {
    void isModelCached(model.urls);
    ctor.registerTool({
      ...plugin,
      group: "ai",
      badge: model.mb === null ? undefined : `${model.mb} MB`,
      ready: () => isModelSaved(model.urls),
    });
  }

  // ── Cutout ──

  if (options.cutout !== false) {
    const cutoutOptions = options.cutout ?? {};
    const model = spec("MODNet", 26, [[cutoutOptions.modelUrl, DEFAULT_CUTOUT_MODEL_URL]]);
    registerAi(model, {
      id: "cutout",
      label: "Cutout",
      icon: CUTOUT_ICON,
      description: "Remove the background",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        return oneShot(ctx, {
          id: "cutout",
          label: "Cutout",
          model,
          action: "Remove the background",
          working: "Removing the background…",
          changes: "photo",
          run: () =>
            ctx.entry.kind === "image"
              ? removeBackground(ctx.entry.image, cutoutOptions)
              : Promise.reject(new Error("Cutout needs an image")),
          // In place, as PNG so the cleared background stays clear.
          finish: (result, task) =>
            replacePhoto(ctx, result, task, {
              history: "Remove background",
              done: "Background removed",
              type: "image/png",
            }),
          failure: (error) => errorText(error, "Cutout failed"),
        });
      },
    });
  }

  // ── Erase ──

  if (options.erase !== false) {
    const eraseOptions = options.erase ?? {};
    const model = spec("LaMa", 208, [[eraseOptions.modelUrl, DEFAULT_INPAINT_MODEL_URL]]);
    registerAi(model, {
      id: "erase",
      label: "Erase",
      icon: ERASE_ICON,
      description: "Paint over things to remove them",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const note = ctx.ui.note("");
        const status = ctx.ui.status();
        const busy = (): boolean => ctx.tasks.running("erase") !== null;

        const brush = ctx.ui.slider({
          label: "Brush",
          min: 2,
          max: 20,
          value: 6,
          neutral: 6,
          fillFrom: 2,
          format: (v) => `${v}%`,
          onInput: (v) => surface.setBrush(v / 100),
        });
        const clear = ctx.ui.button({ label: "Clear", onClick: () => surface.clear() });
        const run = ctx.ui.button({
          label: "Erase",
          variant: "ai",
          onClick: () => void start(),
        });
        const surface = createEraseSurface(ctx.canvasArea, () => syncState());
        surface.setBrush(0.06);
        const strip = modelStatus(ctx, model, { tool: "erase", label: "Erase" }, () => syncState());

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          const strokes = surface.hasStrokes();
          const working = busy();
          if (!working) {
            note.set(!neutral ? NEEDS_FRAME : strokes ? "" : "Paint over what should go.");
          }
          run.setDisabled(working || !strokes || !neutral || !strip.ready());
          clear.setDisabled(working || !strokes);
        }

        async function start(): Promise<void> {
          if (busy() || !strip.ready() || ctx.entry.kind !== "image") return;
          if (!surface.hasStrokes() || !geometryIsNeutral(ctx.edits as ImageEdits)) return;
          const strokes = surface.getStrokes();
          const task = await ctx.tasks.start({
            tool: "erase",
            action: "Erase",
            working: "Erasing…",
            changes: "photo",
          });
          if (!task || ctx.entry.kind !== "image") return;
          follow(task, status, syncState);
          try {
            const result = await inpaintStrokes(ctx.entry.image, strokes, eraseOptions);
            // In place: the entry keeps its identity, the pixels change, and
            // the editor remounts (rebuilding this pane).
            await replacePhoto(ctx, result, task, { history: "Erase", done: "Erased" });
          } catch (error) {
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Erase failed"));
            console.error(error);
          }
        }

        const card = ctx.ui.card({});
        card.body.append(
          strip.root,
          brush.root,
          ctx.ui.row(clear.root, run.root),
          status.root,
          note.root,
        );
        resume(ctx, "erase", status, syncState);
        syncState();
        return {
          root: card.root,
          onActivate() {
            surface.setVisible(true);
            syncState();
          },
          onDeactivate() {
            surface.setVisible(false);
          },
          sync: syncState,
          destroy() {
            strip.destroy();
            surface.destroy();
          },
        };
      },
    });
  }

  // ── Select ──

  if (options.select !== false) {
    const selectOptions = options.select ?? {};
    const model = spec("SlimSAM", 40, [
      [selectOptions.encoderUrl, DEFAULT_SAM_ENCODER_URL],
      [selectOptions.decoderUrl, DEFAULT_SAM_DECODER_URL],
    ]);
    const eraseModel = options.erase !== false ? options.erase : undefined;
    const fillModel = spec("LaMa", 208, [[eraseModel?.modelUrl, DEFAULT_INPAINT_MODEL_URL]]);
    const apple = /Mac|iP(hone|ad|od)/.test(navigator.platform);
    const undoKeys = apple ? "⌘Z" : "Ctrl+Z";
    registerAi(model, {
      id: "select",
      label: "Select",
      icon: SELECT_ICON,
      description: "Point at a thing in the photo to pick it out",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        // What to do next, in a few words.
        const guide = ctx.ui.note("");
        // Cutting out and erasing: under way, done, or why not.
        const outcome = ctx.ui.status();

        // Phones and tablets tap; there's no pointing at things first.
        const touch = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
        const click = touch ? "tap" : "click";
        const history = createSelectionHistory();
        let embeddings: SamEmbeddings | null = null;
        let embeddedImage: unknown = null;
        let reading: Promise<SamEmbeddings | null> | null = null;
        /** The model's shapes for the current clicks, and the ones worth offering. */
        let found: SamCandidates | null = null;
        let shapes: number[] = [];
        /** Cutting out or erasing: clicks wait. */
        const isBusy = (): boolean => ctx.tasks.running("select") !== null;
        let active = false;

        // ── The selection: its shapes as pictures, what to do with it, and fixing it ──
        const shapeRow = ctx.ui.row();
        let shownFor: SamCandidates | null = null;
        let tiles: UiTiles<string> | null = null;
        const cut = ctx.ui.button({
          label: "Cut out",
          variant: "primary",
          title: "A new image of just this",
          onClick: () => void cutOut(),
        });
        const eraseIt = ctx.ui.button({
          label: "Erase it",
          title: `Take it out of this photo (${undoKeys} brings it back)`,
          onClick: () => void eraseObject(),
        });
        const undo = ctx.ui.button({
          label: "Undo",
          title: `Undo (${undoKeys})`,
          onClick: () => void undoStep(),
        });
        const deselect = ctx.ui.button({
          label: "Deselect",
          title: touch ? "Deselect" : "Deselect (Esc)",
          onClick: () => clearSelection(),
        });
        // Erasing needs a model of its own; until it's here, it offers its download.
        const eraser = modelStatus(
          ctx,
          fillModel,
          { tool: "select", label: "Erase" },
          () => syncState(),
          "Erase",
        );
        const eraserRow = document.createElement("div");
        eraserRow.append(eraser.root);
        const selection = ctx.ui.section(
          "Selection",
          shapeRow,
          ctx.ui.row(cut.root, eraseIt.root),
          eraserRow,
          ctx.ui.row(undo.root, deselect.root),
        );

        const strip = modelStatus(ctx, model, { tool: "select", label: "Select" }, () => {
          syncState();
          if (active && strip.ready()) void ready();
        });

        const neutral = (): boolean => geometryIsNeutral(ctx.edits as ImageEdits);
        const photo = (): HTMLImageElement | null =>
          ctx.entry.kind === "image" ? ctx.entry.image : null;
        const isReady = (): boolean => embeddings !== null && embeddedImage === photo();
        const hasSelection = (): boolean => found !== null && history.current.points.length > 0;

        /** The shape on show: the one picked, else the model's favourite. */
        function chosen(): number | null {
          if (!found || shapes.length === 0) return null;
          const pick = history.current.shape;
          if (pick !== null && shapes.includes(pick)) return pick;
          return shapes.includes(found.order[0]) ? found.order[0] : shapes[0];
        }

        function syncState(): void {
          // An erase (or undoing one) swaps the photo: the old selection goes with it.
          if (!isBusy() && embeddedImage !== null && embeddedImage !== photo()) {
            photoChanged();
            return;
          }
          const armed = isReady() || reading !== null || strip.ready();
          const some = hasSelection();
          // Once the photo is read the section stays put, so a click or a
          // Deselect never rearranges the panel; only the pictures come and go.
          selection.hidden = !isReady();
          shapeRow.hidden = !some;
          cut.setDisabled(!some || isBusy());
          eraseIt.setDisabled(!some || isBusy() || !eraser.ready());
          // Once it's ready, Erase it being on says as much.
          eraserRow.hidden = eraser.ready();
          undo.setDisabled(!history.canUndo || isBusy());
          deselect.setDisabled(history.current.points.length === 0 || isBusy());
          surface.setCursor(!armed || !neutral() ? "idle" : isBusy() || reading ? "busy" : "new");
          if (isBusy()) return;
          if (!neutral()) guide.set(NEEDS_FRAME);
          else if (!armed) guide.set("");
          else if (reading) guide.set("Reading the photo…");
          else if (!some) guide.set(`${capital(click)} something in the photo.`);
          else guide.set(touch ? "" : "Esc deselects.");
        }

        /** Download (if needed) and read the photo, so clicks only decode. */
        function ready(): Promise<SamEmbeddings | null> {
          if (isReady()) return Promise.resolve(embeddings);
          if (ctx.entry.kind !== "image" || !neutral() || !strip.ready()) {
            return Promise.resolve(null);
          }
          if (reading) return reading;
          const image = ctx.entry.image;
          reading = (async () => {
            try {
              const read = await encodeSamImage(image, selectOptions);
              embeddings = read;
              embeddedImage = image;
              return read;
            } catch (error) {
              guide.set(errorText(error, "Select couldn't start"));
              console.error(error);
              return null;
            } finally {
              reading = null;
              syncState();
            }
          })();
          syncState();
          return reading;
        }

        // One decode at a time: hovering and clicking share the model.
        let queue: Promise<unknown> = Promise.resolve();
        const remembered = new Map<string, SamCandidates>();
        const keyOf = (points: SamPoint[]): string =>
          points.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.label}`).join(";");

        function decode(points: SamPoint[]): Promise<SamCandidates | null> {
          const key = keyOf(points);
          const known = remembered.get(key);
          if (known) return Promise.resolve(known);
          const run = queue.then(async () => {
            const read = await ready();
            if (!read) return null;
            const result = await decodeSamCandidates(read, points, selectOptions);
            remembered.set(key, result);
            if (remembered.size > 24) remembered.delete(remembered.keys().next().value as string);
            return result;
          });
          queue = run.catch(() => {});
          return run;
        }

        /** Show the selection history is on now. */
        async function show(): Promise<void> {
          clearOutcome(outcome);
          const { points } = history.current;
          if (points.length === 0) {
            found = null;
            shapes = [];
            shownFor = null;
            tiles = null;
            shapeRow.replaceChildren();
            paint();
            return;
          }
          try {
            const result = await decode(points);
            if (history.current.points !== points || !result) return;
            found = result;
            // One click can mean a part or the whole: offer each shape.
            shapes = distinctShapes(result);
            paint();
          } catch (error) {
            guide.set(errorText(error, "Select failed"));
            console.error(error);
          }
        }

        function paint(): void {
          const index = chosen();
          surface.setSelection(index === null ? null : found, index ?? 0);
          if (found && found !== shownFor && ctx.entry.kind === "image") {
            shownFor = found;
            const labels = shapeLabels(shapes.length);
            const image = ctx.entry.image;
            const result = found;
            tiles = ctx.ui.tiles<string>({
              label: "Shape",
              options: shapes.map((shape, i) => ({
                value: String(shape),
                label: labels[i],
                preview: shapeThumbnail(image, result, shape),
              })),
              value: index === null ? null : String(index),
              columns: 3,
              onChange: (value) => {
                history.set({ points: history.current.points, shape: Number(value) });
                paint();
              },
            });
            shapeRow.replaceChildren(tiles.root);
          }
          tiles?.set(index === null ? null : String(index));
          syncState();
        }

        // Pointing outlines what a click would select.
        let hoverAt: { x: number; y: number } | null = null;
        let hovering = false;
        async function hoverLoop(): Promise<void> {
          if (hovering) return;
          hovering = true;
          try {
            let done: { x: number; y: number } | null = null;
            while (hoverAt && hoverAt !== done) {
              const spot: { x: number; y: number } = hoverAt;
              done = spot;
              const result = await decode([{ x: spot.x, y: spot.y, label: 1 }]);
              if (hoverAt !== spot || !result) continue;
              surface.setHover(result, result.order[0]);
            }
          } catch {
            // A missed outline is fine; the click still works.
          } finally {
            hovering = false;
          }
        }

        function onHover(x: number, y: number): void {
          if (isBusy() || !isReady() || !neutral()) return;
          // Over what's already selected, there's nothing new to show.
          const index = chosen();
          if (found && index !== null && shapeContains(found, index, x, y)) {
            hoverAt = null;
            surface.setHover(null);
            return;
          }
          hoverAt = { x, y };
          void hoverLoop();
        }

        function onClick(x: number, y: number): void {
          if (isBusy() || ctx.entry.kind !== "image" || !neutral()) return;
          if (!isReady() && !reading && !strip.ready()) {
            guide.set("Download it first.");
            return;
          }
          // One point, one choice of shapes: a click selects anew, never adds.
          const next = [{ x, y, label: 1 as const }];
          hoverAt = null;
          surface.setHover(null);
          history.set({ points: next, shape: null });
          void show();
        }

        const surface = createSelectSurface(ctx.canvasArea, {
          onHover,
          onHoverEnd: () => {
            hoverAt = null;
            surface.setHover(null);
          },
          onClick,
        });

        async function undoStep(): Promise<void> {
          if (isBusy() || !history.undo()) return;
          await show();
          syncState();
        }

        async function redoStep(): Promise<void> {
          if (isBusy() || !history.redo()) return;
          await show();
          syncState();
        }

        /** Back to nothing selected, as one step Undo takes back. */
        function clearSelection(): void {
          if (isBusy() || history.current.points.length === 0) return;
          history.set({ points: [], shape: null });
          void show();
        }

        // While Select is open, Esc deselects and ⌘Z steps through the
        // selection, before the editor's own: Esc would close it, ⌘Z undo an edit.
        const keys = new AbortController();
        document.addEventListener(
          "keydown",
          (e) => {
            if (!active || isBusy()) return;
            const over = e.target instanceof Element ? e.target : null;
            if (over?.closest('input, textarea, select, [contenteditable], [role="alertdialog"]')) {
              return;
            }
            const mod = e.metaKey || e.ctrlKey;
            const z = e.key === "z" || e.key === "Z";
            let take = false;
            if (e.key === "Escape" && history.current.points.length > 0) {
              take = true;
              clearSelection();
            } else if (mod && z && !e.shiftKey && history.canUndo) {
              take = true;
              void undoStep();
            } else if (mod && ((z && e.shiftKey) || e.key === "y") && history.canRedo) {
              take = true;
              void redoStep();
            }
            if (!take) return;
            e.preventDefault();
            e.stopPropagation();
          },
          { capture: true, signal: keys.signal },
        );

        /** The selection as a full-size mask, for cutting out and erasing. */
        function selectionMask(): HTMLCanvasElement | null {
          const index = chosen();
          return found && index !== null ? candidateMask(found, index) : null;
        }

        async function cutOut(): Promise<void> {
          const mask = selectionMask();
          if (isBusy() || !mask || ctx.entry.kind !== "image") return;
          const task = await ctx.tasks.start({
            tool: "select",
            action: "Cut out",
            working: "Cutting out…",
            changes: openResults ? "view" : undefined,
          });
          if (!task || ctx.entry.kind !== "image") return;
          follow(task, outcome, syncState);
          try {
            const image = ctx.entry.image;
            const out = document.createElement("canvas");
            out.width = image.naturalWidth;
            out.height = image.naturalHeight;
            const outCtx = out.getContext("2d");
            if (!outCtx) throw new Error("[Retouch ML] Failed to create canvas context");
            outCtx.drawImage(image, 0, 0);
            const pixels = outCtx.getImageData(0, 0, out.width, out.height);
            const maskCtx = mask.getContext("2d");
            if (!maskCtx) throw new Error("[Retouch ML] Failed to read the mask");
            applyMatteAlpha(pixels.data, maskCtx.getImageData(0, 0, out.width, out.height).data);
            outCtx.putImageData(pixels, 0, 0);
            await addToGallery(ctx, out, "cutout", "image/png", task, outcome);
          } catch (error) {
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Cut out failed"));
            console.error(error);
          }
        }

        async function eraseObject(): Promise<void> {
          const mask = selectionMask();
          if (isBusy() || !mask || ctx.entry.kind !== "image" || !eraser.ready()) return;
          const task = await ctx.tasks.start({
            tool: "select",
            action: "Erase it",
            working: "Erasing…",
            changes: "photo",
          });
          if (!task || ctx.entry.kind !== "image") return;
          follow(task, outcome, syncState);
          try {
            const image = ctx.entry.image;
            const maskCtx = mask.getContext("2d");
            if (!maskCtx) throw new Error("[Retouch ML] Failed to read the mask");
            // Dilate so the fill covers the object's soft edge, not just its
            // core — segmentation hugs the object tighter than its anti-aliased
            // and compressed boundary actually extends.
            const radius = Math.max(6, Math.round(0.012 * Math.max(mask.width, mask.height)));
            const dilated = dilateMask(
              maskCtx.getImageData(0, 0, mask.width, mask.height).data,
              mask.width,
              mask.height,
              radius,
            );
            const dilatedCanvas = document.createElement("canvas");
            dilatedCanvas.width = mask.width;
            dilatedCanvas.height = mask.height;
            dilatedCanvas
              .getContext("2d")
              ?.putImageData(new ImageData(dilated, mask.width, mask.height), 0, 0);
            const result = await inpaintMask(image, dilatedCanvas, {
              ...selectOptions,
              // The inpaint model honors a self-hosted `erase` URL when set.
              modelUrl: eraseModel?.modelUrl,
            });
            await replacePhoto(ctx, result, task, { history: "Erase selection", done: "Erased" });
          } catch (error) {
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Erase failed"));
            console.error(error);
          }
        }

        /** New pixels under the selection (an erase, an undo): it no longer fits them. */
        function photoChanged(): void {
          if (embeddedImage === null || embeddedImage === photo()) return;
          embeddings = null;
          embeddedImage = null;
          history.reset();
          found = null;
          shapes = [];
          remembered.clear();
          surface.setHover(null);
          void show();
          if (active && strip.ready()) void ready();
        }

        const card = ctx.ui.card({});
        card.body.append(strip.root, guide.root, outcome.root);
        const root = document.createElement("div");
        root.className = "rt-ml-select";
        root.append(card.root, selection);
        resume(ctx, "select", outcome, syncState);
        syncState();
        return {
          root,
          onActivate() {
            active = true;
            surface.setVisible(true);
            photoChanged();
            if (strip.ready()) void ready();
            syncState();
          },
          onDeactivate() {
            active = false;
            hoverAt = null;
            surface.setVisible(false);
          },
          sync() {
            photoChanged();
            syncState();
          },
          destroy() {
            keys.abort();
            strip.destroy();
            eraser.destroy();
            surface.destroy();
          },
        };
      },
    });
  }

  // ── Depth ──

  if (options.depth !== false) {
    const depthOptions = options.depth ?? {};
    const model = spec("Depth Anything V2", 27, [[depthOptions.modelUrl, DEFAULT_DEPTH_MODEL_URL]]);
    registerAi(model, {
      id: "depth",
      label: "Depth",
      icon: DEPTH_ICON,
      description: "Blur the background by distance",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const note = ctx.ui.note("");
        const status = ctx.ui.status();

        let prep: ReturnType<typeof prepareBokeh> | null = null;
        let depthMap: Awaited<ReturnType<typeof estimateDepth>> | null = null;
        let focus = 0.5;
        const isBusy = (): boolean => ctx.tasks.running("depth") !== null;

        const analyze = ctx.ui.button({
          label: "Measure depth",
          variant: "ai",
          onClick: () => void measure(),
        });
        const aperture = ctx.ui.slider({
          label: "Aperture",
          ariaLabel: "Aperture strength",
          min: 10,
          max: 100,
          value: 60,
          neutral: 60,
          fillFrom: 10,
          format: (v) => `${v}%`,
          onInput: () => recompose(),
        });
        const apply = ctx.ui.button({
          label: "Apply",
          variant: "primary",
          onClick: () => void applyBlur(),
        });
        const clear = ctx.ui.button({ label: "Clear", onClick: () => clearPreview() });
        const tune = ctx.ui.row(apply.root, clear.root);

        const strip = modelStatus(ctx, model, { tool: "depth", label: "Depth" }, () => syncState());

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          analyze.setDisabled(isBusy() || !neutral || !strip.ready());
          analyze.root.hidden = prep !== null;
          aperture.root.hidden = prep === null;
          tune.hidden = prep === null;
          apply.setDisabled(isBusy() || !prep || !neutral);
          clear.setDisabled(isBusy() || !prep);
          if (isBusy()) return;
          if (!neutral) note.set(NEEDS_FRAME);
          else if (prep) note.set("Click what should stay sharp, tune Aperture, then Apply.");
          else note.set("");
        }

        function recompose(): void {
          if (prep) surface.setPreview(composeBokeh(prep, focus, aperture.value / 100));
        }

        function clearPreview(): void {
          if (isBusy()) return;
          prep = null;
          surface.setPreview(null);
          status.clear();
          syncState();
        }

        const surface = createDepthSurface(ctx.canvasArea, (x, y) => {
          if (!prep || !depthMap || isBusy()) return;
          focus = depthAt(depthMap, x, y);
          recompose();
        });

        async function measure(): Promise<void> {
          if (isBusy() || !strip.ready() || ctx.entry.kind !== "image") return;
          if (!geometryIsNeutral(ctx.edits as ImageEdits)) return;
          const task = await ctx.tasks.start({
            tool: "depth",
            action: "Measure depth",
            working: "Measuring the depth…",
          });
          if (!task || ctx.entry.kind !== "image") return;
          follow(task, status, syncState);
          note.set("");
          try {
            const image = ctx.entry.image;
            const map = await estimateDepth(image, depthOptions);
            if (task.signal.aborted) return;
            await new Promise((r) => setTimeout(r, 0));
            depthMap = map;
            prep = prepareBokeh(image, map, 1280);
            focus = suggestFocus(map);
            recompose();
            task.done("Depth measured");
          } catch (error) {
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Measuring depth failed"));
            console.error(error);
          }
        }

        async function applyBlur(): Promise<void> {
          const map = depthMap;
          if (isBusy() || !map || ctx.entry.kind !== "image") return;
          const task = await ctx.tasks.start({
            tool: "depth",
            action: "Apply the blur",
            working: "Blurring the background…",
            changes: "photo",
          });
          if (!task || ctx.entry.kind !== "image") return;
          follow(task, status, syncState);
          try {
            await new Promise((r) => setTimeout(r, 0));
            const image = ctx.entry.image;
            prep ??= prepareBokeh(image, map, 1280);
            await replacePhoto(
              ctx,
              renderBokeh(prep, image, map, focus, aperture.value / 100),
              task,
              { history: "Depth blur", done: "Background blurred" },
            );
          } catch (error) {
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Apply failed"));
            console.error(error);
          }
        }

        const card = ctx.ui.card({});
        card.body.append(strip.root, analyze.root, status.root, aperture.root, tune, note.root);
        resume(ctx, "depth", status, syncState);
        syncState();
        return {
          root: card.root,
          onActivate() {
            surface.setVisible(true);
            syncState();
          },
          onDeactivate() {
            surface.setVisible(false);
          },
          sync: syncState,
          destroy() {
            strip.destroy();
            surface.destroy();
          },
        };
      },
    });
  }

  // ── Detect ──

  if (options.detect !== false) {
    const detectOptions = options.detect ?? {};
    const objectOptions = detectOptions.objects ?? {};
    // One download for both: faces and objects are a click apart.
    const model = spec("UltraFace (faces) and YOLOX-nano (objects)", 4.9, [
      [detectOptions.modelUrl, DEFAULT_FACE_MODEL_URL],
      [objectOptions.modelUrl, DEFAULT_OBJECT_MODEL_URL],
    ]);
    registerAi(model, {
      id: "detect",
      label: "Detect",
      icon: DETECT_ICON,
      description: "Find faces and objects",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        if (ctx.entry.kind !== "image")
          return { root: ctx.ui.note("Detect works on photos.").root };
        // Narrowed once, so closures keep the image's fields.
        const entry = ctx.entry;
        const note = ctx.ui.note("");
        const status = ctx.ui.status();
        const kept = detectResults.get(entry);
        let found: Detection[] = kept?.found ?? [];
        let noun = kept?.noun ?? "object";
        const isBusy = (): boolean => ctx.tasks.running("detect") !== null;

        const objects = ctx.objects({
          label: "What was found",
          onSelect: (id) => {
            const picked = id === null ? null : found[Number(id)];
            note.set(
              picked
                ? `${detectionName(picked)}, ${Math.round(picked.score * 100)}%. Click it again to let go.`
                : summary(),
            );
            syncState();
          },
        });
        const boxes = layerSwitch(ctx, objects);

        const strip = modelStatus(ctx, model, { tool: "detect", label: "Detect" }, () =>
          syncState(),
        );

        const findFaces = ctx.ui.button({
          label: "Find faces",
          variant: "ai",
          onClick: () => void find("faces"),
        });
        const findObjects = ctx.ui.button({
          label: "Find objects",
          variant: "ai",
          onClick: () => void find("objects"),
        });
        const addMasks = ctx.ui.button({ label: "Add masks", onClick: () => maskThem() });
        const pixelate = ctx.ui.button({ label: "Pixelate", onClick: () => void pixelateThem() });
        const cropTo = ctx.ui.button({ label: "Crop to them", onClick: () => cropToThem() });
        const actions = ctx.ui.row(addMasks.root, pixelate.root, cropTo.root, boxes.button.root);

        /** What the actions work on: the pick, or everything. */
        function targets(): Detection[] {
          const id = objects.selected;
          return id === null ? found : [found[Number(id)]];
        }

        /** What the run found: "3 objects: dog, person". */
        function foundLine(): string {
          if (found.length === 0) return `No ${noun}s found`;
          const labels = [...new Set(found.map((f) => f.label).filter(Boolean))];
          const what = labels.length
            ? `: ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? "…" : ""}`
            : "";
          return `${found.length} ${noun}${found.length > 1 ? "s" : ""}${what}`;
        }

        /** What to do with what was found, or why the boxes or actions are held back. */
        function summary(): string {
          const edits = ctx.edits as ImageEdits;
          if (found.length === 0) return "";
          if (!turnsAreNeutral(edits)) {
            return "Boxes show on the unturned photo. Reset Transform to see them.";
          }
          if (!geometryIsNeutral(edits)) return NEEDS_FRAME;
          return "Pick one to act on it alone.";
        }

        function showFound(animate: boolean): void {
          objects.select(null);
          const colors = detectionColors(found);
          objects.show(
            found.map((f, i) => ({
              id: String(i),
              quad: boxQuad(f),
              color: colors[i],
              tag: detectionName(f),
            })),
            { animate },
          );
          objects.setItems(
            found.map((f, i) => ({
              value: String(i),
              label: detectionName(f),
              color: colors[i],
              span: [0, f.score] as const,
              detail: `${Math.round(f.score * 100)}%`,
            })),
          );
          objects.list.hidden = found.length === 0;
        }

        let framing = "";
        function syncState(): void {
          const edits = ctx.edits as ImageEdits;
          const neutral = geometryIsNeutral(edits);
          // Boxes are in the source frame: they line up through a crop, not a turn.
          objects.setFrame(turnsAreNeutral(edits) ? edits.crop : null);
          const now = JSON.stringify([edits.crop, neutral]);
          if (now !== framing) {
            framing = now;
            note.set(summary());
          }
          const one = objects.selected !== null;
          findFaces.setDisabled(isBusy() || !strip.ready());
          findObjects.setDisabled(isBusy() || !strip.ready());
          actions.hidden = found.length === 0;
          addMasks.setLabel(one ? "Add mask" : "Add masks");
          cropTo.setLabel(one ? "Crop to it" : "Crop to them");
          for (const b of [addMasks, pixelate, cropTo])
            b.setDisabled(isBusy() || !neutral || found.length === 0);
        }

        async function find(kind: "faces" | "objects"): Promise<void> {
          if (isBusy() || !strip.ready()) return;
          const task = await ctx.tasks.start({
            tool: "detect",
            action: kind === "faces" ? "Find faces" : "Find objects",
            working: kind === "faces" ? "Looking for faces…" : "Looking for objects…",
          });
          if (!task) return;
          follow(task, status, afterTask);
          note.set("");
          try {
            const results =
              kind === "faces"
                ? await detectFaces(entry.image, detectOptions)
                : await detectObjects(entry.image, objectOptions);
            if (task.signal.aborted) return;
            found = [...results].sort((a, b) => b.score - a.score);
            noun = kind === "faces" ? "face" : "object";
            detectResults.set(entry, { found, noun });
            showFound(true);
            task.done(foundLine());
            note.set(summary());
          } catch (error) {
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Detection failed"));
            console.error(error);
          }
        }

        /**
         * A task moved on. Once it's over, what was found is shown: a pane
         * mounted mid-run hasn't seen it yet, and a stopped run leaves the
         * last finds in place.
         */
        function afterTask(task: ToolTask): void {
          if (task.state !== "running") {
            const latest = detectResults.get(entry);
            if (latest && latest.found !== found) {
              found = latest.found;
              noun = latest.noun;
              showFound(false);
            }
            if (task.state === "stopped" && latest) status.done(foundLine());
          }
          syncState();
        }

        function maskThem(): void {
          const those = targets();
          for (const f of those) {
            const mask: EditMask = {
              id:
                typeof crypto !== "undefined" && "randomUUID" in crypto
                  ? crypto.randomUUID()
                  : `face-${Date.now()}-${Math.round(f.x * 1e4)}`,
              kind: "radial",
              x0: f.x + f.w / 2,
              y0: f.y + f.h / 2,
              x1: f.x + f.w / 2 + (f.w / 2) * 1.3,
              y1: f.y + f.h / 2 + (f.h / 2) * 1.5,
              invert: false,
              adjust: {
                exposure: 0,
                brightness: 0,
                contrast: 0,
                saturation: 0,
                temperature: 0,
                tint: 0,
              },
            };
            ctx.edits.masks.push(mask);
          }
          ctx.render();
          ctx.record();
          note.set(
            `Added ${those.length} radial mask${those.length > 1 ? "s" : ""}. Tune them in Masks.`,
          );
        }

        async function pixelateThem(): Promise<void> {
          if (isBusy()) return;
          const task = await ctx.tasks.start({
            tool: "detect",
            action: "Pixelate",
            working: "Pixelating…",
            changes: "photo",
          });
          if (!task) return;
          follow(task, status, afterTask);
          try {
            const canvas = document.createElement("canvas");
            canvas.width = entry.image.naturalWidth;
            canvas.height = entry.image.naturalHeight;
            const cctx = canvas.getContext("2d");
            if (!cctx) throw new Error("[Retouch ML] Failed to create canvas context");
            cctx.drawImage(entry.image, 0, 0);
            for (const f of targets()) pixelateRegion(canvas, f);
            // A mosaic moves nothing: the layer stays with the new pixels.
            detectResults.carry(entry, { found, noun });
            const replaced = await replacePhoto(ctx, canvas, task, {
              history: "Pixelate",
              done: "Pixelated",
            });
            if (!replaced) detectResults.drop(entry);
          } catch (error) {
            detectResults.drop(entry);
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Pixelate failed"));
            console.error(error);
          }
        }

        function cropToThem(): void {
          const crop = cropAround(targets());
          if (!crop) return;
          ctx.edits.crop = crop;
          ctx.render();
          ctx.record();
          syncState();
          note.set("Cropped to what was found. Undo to go back.");
        }

        const card = ctx.ui.card({});
        card.body.append(
          strip.root,
          ctx.ui.row(findFaces.root, findObjects.root),
          status.root,
          objects.list,
          actions,
          note.root,
        );
        showFound(false);
        // Reopened, or after a pixelate: what was found is still here.
        if (kept) status.done(foundLine());
        resume(ctx, "detect", status, afterTask);
        syncState();
        return {
          root: card.root,
          onActivate() {
            boxes.setActive(true);
          },
          onDeactivate() {
            boxes.setActive(false);
          },
          sync: syncState,
          destroy() {
            strip.destroy();
            objects.destroy();
          },
        };
      },
    });
  }

  // ── Track ──

  if (options.track !== false) {
    const trackOptions = options.track ?? {};
    const model = spec("YOLOX-nano", 3.7, [[trackOptions.modelUrl, DEFAULT_OBJECT_MODEL_URL]]);
    registerAi(model, {
      id: "track",
      label: "Track",
      icon: TRACK_ICON,
      description: "Follow each object through the video",
      kinds: ["video"],
      mount(ctx: ToolContext) {
        if (ctx.entry.kind !== "video") return { root: ctx.ui.note("Track works on videos.").root };
        // Narrowed once, so closures keep the video's fields.
        const entry = ctx.entry;
        const edits = ctx.edits as VideoEdits;
        let result = trackResults.get(entry) ?? null;
        let picked: number | null = null;
        let following: Follow = "all";
        const isBusy = (): boolean => ctx.tasks.running("track") !== null;
        /** The framing a Trim or Crop to it left, while its note is up. */
        let applied: string | null = null;
        const framing = () => JSON.stringify([edits.trim, edits.crop]);

        const note = ctx.ui.note("");
        const status = ctx.ui.status();
        const followChoice = ctx.ui.choice<Follow>({
          label: "What to follow",
          options: [
            { value: "all", label: "Everything" },
            { value: "people", label: "People" },
            { value: "vehicles", label: "Vehicles" },
            { value: "animals", label: "Animals" },
          ],
          value: following,
          onChange: (value) => {
            following = value;
          },
        });
        const run = ctx.ui.button({
          label: "Track objects",
          variant: "ai",
          onClick: () => void start(),
        });
        const stop = ctx.ui.button({
          label: "Stop",
          onClick: () => ctx.tasks.running("track")?.stop(),
        });
        const strip = modelStatus(ctx, model, { tool: "track", label: "Track" }, () => syncState());

        const objects = ctx.objects({
          label: "Tracks",
          onSelect: (id, from) => pick(id === null ? null : Number(id), from === "list"),
        });
        const overlay = createTrackOverlay(objects, entry.video, (time, ids) => {
          objects.setTime(time / entry.duration);
          objects.setCurrent(ids.map(String));
        });
        const boxes = layerSwitch(ctx, objects);
        const trimTo = ctx.ui.button({ label: "Trim to it", onClick: () => trimToPicked() });
        const cropTo = ctx.ui.button({ label: "Crop to it", onClick: () => cropToPicked() });
        const save = ctx.ui.button({ label: "Save tracks", onClick: () => saveTracks() });
        const actions = ctx.ui.row(trimTo.root, cropTo.root, save.root, boxes.button.root);

        const at = (seconds: number) => `${seconds.toFixed(1)} s`;
        const trackOf = (id: number | null) => result?.tracks.find((t) => t.id === id) ?? null;

        /** What the run found: "4 tracks". */
        function foundLine(): string {
          const count = result?.tracks.length ?? 0;
          return count === 0
            ? "Nothing to follow in this part of the video"
            : `${count} ${count === 1 ? "track" : "tracks"}`;
        }

        /** What to do with the tracks, or why the boxes can't show. */
        function summary(): string {
          if (!result || result.tracks.length === 0) return "";
          if (!turnsAreNeutral(edits)) {
            return "Boxes show on the unturned video. Reset Transform to see them.";
          }
          return "Pick one to trim or crop to it.";
        }

        function syncState(): void {
          // Undo took a Trim or Crop to it back: its note goes with it.
          if (applied !== null && applied !== framing()) {
            applied = null;
            note.set(summary());
          }
          const turned = !turnsAreNeutral(edits);
          // Boxes are in the source frame: they line up through a crop, not a turn.
          objects.setFrame(turned ? null : edits.crop);
          run.setDisabled(isBusy() || !strip.ready());
          stop.root.hidden = !isBusy();
          actions.hidden = !result || result.tracks.length === 0;
          trimTo.setDisabled(isBusy() || picked === null);
          cropTo.setDisabled(isBusy() || picked === null || turned);
          save.setDisabled(isBusy());
        }

        function showResult(): void {
          overlay.show(result);
          objects.select(null);
          picked = null;
          const tracks = [...(result?.tracks ?? [])].sort(
            // Longest-lived first: the ones it followed all the way.
            (a, b) => b.lastSeen - b.firstSeen - (a.lastSeen - a.firstSeen) || a.id - b.id,
          );
          objects.setItems(
            tracks.map((t) => ({
              value: String(t.id),
              label: trackName(t),
              color: trackColor(t.id),
              span: [
                t.firstSeen / entry.duration,
                Math.max(t.lastSeen, t.firstSeen + 0.1) / entry.duration,
              ] as const,
              detail: at(t.lastSeen - t.firstSeen),
            })),
          );
          objects.list.hidden = tracks.length === 0;
          if (result) {
            status.done(foundLine());
            note.set(summary());
          }
          syncState();
        }

        function pick(id: number | null, jump: boolean): void {
          picked = id;
          const track = trackOf(id);
          if (result && track) {
            if (jump) {
              // Jump to where it's first on screen, within the trim.
              const time = firstShown(result, track.id) ?? track.firstSeen;
              entry.video.currentTime = Math.min(Math.max(time, edits.trim.start), edits.trim.end);
            }
            note.set(`${trackName(track)}: ${at(track.firstSeen)} to ${at(track.lastSeen)}.`);
          } else note.set(summary());
          syncState();
        }

        async function start(): Promise<void> {
          if (isBusy() || !strip.ready()) return;
          const task = await ctx.tasks.start({
            tool: "track",
            action: "Track objects",
            working: "Following each object…",
          });
          if (!task) return;
          follow(task, status, syncState);
          note.set("");
          // Its own element: the editor's keeps playing while this one seeks.
          const probe = document.createElement("video");
          probe.muted = true;
          probe.playsInline = true;
          probe.preload = "auto";
          probe.src = entry.videoUrl;
          const { start: from, end: to } = edits.trim;
          try {
            const tracked = await trackVideo(probe, {
              ...trackOptions,
              start: from,
              end: to,
              labels: FOLLOW[following],
              minSize: trackOptions.minSize ?? 0.04,
              signal: task.signal,
              onFrame: (frame, progress) => {
                task.working("Following each object…", {
                  detail: `${at(frame.time - from)} of ${at(to - from)}`,
                  progress,
                });
              },
            });
            result = tracked;
            trackResults.set(entry, tracked);
            task.done(foundLine());
            showResult();
          } catch (error) {
            if (task.signal.aborted) {
              if (result) status.done(foundLine());
              note.set("Stopped.");
            } else {
              task.failed(errorText(error, "Tracking failed"));
              console.error(error);
            }
          } finally {
            probe.removeAttribute("src");
            probe.load();
            syncState();
          }
        }

        function trimToPicked(): void {
          const track = trackOf(picked);
          if (!track) return;
          // A beat either side, so it doesn't start or end mid-step.
          const start = Math.max(0, track.firstSeen - 0.25);
          const end = Math.min(entry.duration, Math.max(track.lastSeen + 0.25, start + 0.5));
          edits.trim = { start, end };
          applied = framing();
          ctx.render();
          ctx.record();
          entry.video.currentTime = start;
          note.set(`Trimmed to ${trackName(track)}. Undo to go back.`);
        }

        function cropToPicked(): void {
          const track = trackOf(picked);
          const bounds = result && track ? trackBounds(result, track.id) : null;
          if (!track || !bounds) return;
          edits.crop = bounds;
          applied = framing();
          ctx.render();
          ctx.record();
          syncState();
          note.set(`Cropped to where ${trackName(track)} goes. Undo to go back.`);
        }

        function saveTracks(): void {
          if (!result) return;
          const blob = new Blob([JSON.stringify(result)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${entry.file.name.replace(/\.[^.]+$/, "")}-tracks.json`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        const card = ctx.ui.card({});
        card.body.append(
          strip.root,
          followChoice.root,
          ctx.ui.row(run.root, stop.root),
          status.root,
          objects.list,
          actions,
          note.root,
        );
        showResult();
        resume(ctx, "track", status, syncState);
        return {
          root: card.root,
          onActivate() {
            overlay.setVisible(true);
            boxes.setActive(true);
          },
          onDeactivate() {
            overlay.setVisible(false);
            boxes.setActive(false);
          },
          sync: syncState,
          destroy() {
            strip.destroy();
            overlay.destroy();
            objects.destroy();
          },
        };
      },
    });
  }

  // ── Read text ──

  if (options.text !== false) {
    const textOptions = options.text ?? {};
    const model = spec("PP-OCRv4 + PP-OCRv5 Latin", 13, [
      [textOptions.detectorUrl, DEFAULT_TEXT_DETECTOR_URL],
      [textOptions.recognizerUrl, DEFAULT_TEXT_RECOGNIZER_URL],
      [textOptions.dictionaryUrl, DEFAULT_TEXT_DICTIONARY_URL],
    ]);
    registerAi(model, {
      id: "text",
      label: "Read text",
      icon: TEXT_ICON,
      description: "Find the text in a photo and copy it",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        if (ctx.entry.kind !== "image")
          return { root: ctx.ui.note("Read text works on photos.").root };
        const entry = ctx.entry;
        const note = ctx.ui.note("");
        const status = ctx.ui.status();
        const output = ctx.ui.output({ label: "Text in the photo" });
        let found: TextLine[] = textResults.get(entry) ?? [];
        const isBusy = (): boolean => ctx.tasks.running("text") !== null;

        const objects = ctx.objects({
          label: "Lines of text",
          onSelect: (id) => {
            const picked = id === null ? null : found[Number(id)];
            note.set(picked ? picked.text : summary());
            syncState();
          },
        });
        const boxes = layerSwitch(ctx, objects);

        const run = ctx.ui.button({
          label: "Read the text",
          variant: "ai",
          onClick: () => void read(),
        });
        const copy = ctx.ui.button({ label: "Copy text", onClick: () => void copyText() });
        const pixelate = ctx.ui.button({ label: "Pixelate it", onClick: () => void hideText() });
        const actions = ctx.ui.row(copy.root, pixelate.root, boxes.button.root);
        const strip = modelStatus(ctx, model, { tool: "text", label: "Read text" }, () =>
          syncState(),
        );

        /** What the actions work on: the picked line, or all of them. */
        function targets(): TextLine[] {
          const id = objects.selected;
          return id === null ? found : [found[Number(id)]];
        }

        /** What the run found: "5 lines". */
        function foundLine(): string {
          if (found.length === 0) return "No text found";
          return `${found.length} line${found.length > 1 ? "s" : ""} of text`;
        }

        /** Why the boxes or Pixelate are held back, if they are. */
        function summary(): string {
          const edits = ctx.edits as ImageEdits;
          if (found.length === 0) return "";
          if (!turnsAreNeutral(edits)) {
            return "Boxes show on the unturned photo. Reset Transform to see them.";
          }
          if (!geometryIsNeutral(edits)) return NEEDS_FRAME;
          return "";
        }

        function showFound(animate: boolean): void {
          objects.select(null);
          objects.show(
            found.map((line, i) => ({
              id: String(i),
              quad: line.quad,
              color: rgba(KEEP_RGB, 1),
            })),
            { animate },
          );
          output.set(linesToText(found));
        }

        let framing = "";
        function syncState(): void {
          const edits = ctx.edits as ImageEdits;
          const neutral = geometryIsNeutral(edits);
          objects.setFrame(turnsAreNeutral(edits) ? edits.crop : null);
          const now = JSON.stringify([edits.crop, neutral]);
          if (now !== framing) {
            framing = now;
            note.set(summary());
          }
          const one = objects.selected !== null;
          run.setDisabled(isBusy() || !strip.ready());
          actions.hidden = found.length === 0;
          copy.setLabel(one ? "Copy line" : "Copy text");
          copy.setDisabled(isBusy());
          pixelate.setDisabled(isBusy() || !neutral);
        }

        async function read(): Promise<void> {
          if (isBusy() || !strip.ready()) return;
          const task = await ctx.tasks.start({
            tool: "text",
            action: "Read the text",
            working: "Reading…",
          });
          if (!task) return;
          follow(task, status, afterTask);
          note.set("");
          try {
            const lines = await recognizeText(entry.image, textOptions);
            if (task.signal.aborted) return;
            found = lines;
            textResults.set(entry, found);
            showFound(true);
            task.done(foundLine());
            note.set(summary());
          } catch (error) {
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Reading failed"));
            console.error(error);
          }
        }

        /** As Detect's: once a task is over, show what was read, and keep the last reading through a stop. */
        function afterTask(task: ToolTask): void {
          if (task.state !== "running") {
            const latest = textResults.get(entry);
            if (latest && latest !== found) {
              found = latest;
              showFound(false);
            }
            if (task.state === "stopped" && latest) status.done(foundLine());
          }
          syncState();
        }

        async function copyText(): Promise<void> {
          try {
            await navigator.clipboard.writeText(linesToText(targets()));
            note.set("Copied.");
          } catch {
            note.set("Couldn't reach the clipboard. Select the text and copy it instead.");
          }
        }

        async function hideText(): Promise<void> {
          if (isBusy()) return;
          const task = await ctx.tasks.start({
            tool: "text",
            action: "Pixelate it",
            working: "Pixelating…",
            changes: "photo",
          });
          if (!task) return;
          follow(task, status, afterTask);
          try {
            const canvas = document.createElement("canvas");
            canvas.width = entry.image.naturalWidth;
            canvas.height = entry.image.naturalHeight;
            const cctx = canvas.getContext("2d");
            if (!cctx) throw new Error("[Retouch ML] Failed to create canvas context");
            cctx.drawImage(entry.image, 0, 0);
            for (const line of targets()) pixelateRegion(canvas, line);
            // A mosaic moves nothing: the layer stays with the new pixels.
            textResults.carry(entry, found);
            const replaced = await replacePhoto(ctx, canvas, task, {
              history: "Pixelate text",
              done: "Pixelated",
            });
            if (!replaced) textResults.drop(entry);
          } catch (error) {
            textResults.drop(entry);
            if (task.signal.aborted) return;
            task.failed(errorText(error, "Pixelate failed"));
            console.error(error);
          }
        }

        const card = ctx.ui.card({});
        card.body.append(strip.root, run.root, status.root, output.root, actions, note.root);
        showFound(false);
        // Reopened, or after a pixelate: what was read is still here.
        if (textResults.get(entry)) status.done(foundLine());
        resume(ctx, "text", status, afterTask);
        syncState();
        return {
          root: card.root,
          onActivate() {
            boxes.setActive(true);
          },
          onDeactivate() {
            boxes.setActive(false);
          },
          sync: syncState,
          destroy() {
            strip.destroy();
            objects.destroy();
          },
        };
      },
    });
  }

  // ── Upscale ──

  if (options.upscale !== false) {
    const upscaleOptions = options.upscale ?? {};
    const model = spec("Real-ESRGAN ×4", 67, [
      [upscaleOptions.modelUrl, DEFAULT_UPSCALE_MODEL_URL],
    ]);
    const maxEdge = upscaleOptions.maxInputDim ?? 2048;
    registerAi(model, {
      id: "upscale",
      label: "Upscale",
      icon: UPSCALE_ICON,
      description: "Four times the resolution",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        return oneShot(ctx, {
          id: "upscale",
          label: "Upscale",
          model,
          action: "Upscale 4×",
          working: "Upscaling…",
          // Opening the result leaves this photo behind.
          changes: openResults ? "view" : undefined,
          run: ({ tile }) =>
            ctx.entry.kind === "image"
              ? upscaleImage(ctx.entry.image, {
                  ...upscaleOptions,
                  onTileProgress: (done, total) => {
                    tile(done, total);
                    upscaleOptions.onTileProgress?.(done, total);
                  },
                })
              : Promise.reject(new Error("Upscale needs an image")),
          finish: (result, task, status) =>
            addToGallery(ctx, result, "upscaled", typeOf(ctx), task, status),
          failure: (error) => {
            const message = error instanceof Error ? error.message : "";
            return message.includes("input limit")
              ? `This photo is too large to upscale (${maxEdge} px on the long edge at most).`
              : errorText(error, "Upscale failed");
          },
        });
      },
    });
  }

  // ── Denoise ──

  if (options.denoise !== false) {
    const denoiseOptions = options.denoise ?? {};
    const model = spec("SCUNet", 77, [
      [denoiseOptions.modelUrl, DEFAULT_DENOISE_MODEL_URL],
      ...(denoiseOptions.modelUrl && !denoiseOptions.externalDataUrl
        ? []
        : [
            [denoiseOptions.externalDataUrl, DEFAULT_DENOISE_DATA_URL] as [
              string | undefined,
              string,
            ],
          ]),
    ]);
    const maxEdge = denoiseOptions.maxInputDim ?? 2048;
    registerAi(model, {
      id: "denoise",
      label: "Denoise",
      icon: DENOISE_ICON,
      description: "Clean up sensor noise",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        return oneShot(ctx, {
          id: "denoise",
          label: "Denoise",
          model,
          action: "Remove the noise",
          working: "Removing the noise…",
          changes: "photo",
          run: ({ tile }) =>
            ctx.entry.kind === "image"
              ? denoiseImage(ctx.entry.image, {
                  ...denoiseOptions,
                  onTileProgress: (done, total) => {
                    tile(done, total);
                    denoiseOptions.onTileProgress?.(done, total);
                  },
                })
              : Promise.reject(new Error("Denoise needs an image")),
          // In place: pixels map 1:1, so crop and mask edits stay valid.
          finish: (result, task) =>
            replacePhoto(ctx, result, task, { history: "Denoise", done: "Noise removed" }),
          failure: (error) => {
            const message = error instanceof Error ? error.message : "";
            return message.includes("input limit")
              ? `This photo is too large to denoise (${maxEdge} px on the long edge at most).`
              : errorText(error, "Denoise failed");
          },
        });
      },
    });
  }
}
