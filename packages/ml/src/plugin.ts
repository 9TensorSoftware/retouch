import type {
  EditMask,
  ImageEdits,
  Retouch,
  ToolContext,
  UiCard,
  UiNote,
  UiStep,
  UiSteps,
} from "@9tensor/retouch";
import { composeBokeh, prepareBokeh, renderBokeh, suggestFocus } from "./bokeh";
import { KEEP_RGB, ON_KEEP, rgba } from "./colors";
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
import {
  CUTOUT_ICON,
  DENOISE_ICON,
  DEPTH_ICON,
  DETECT_ICON,
  ERASE_ICON,
  SELECT_ICON,
  UPSCALE_ICON,
} from "./icons";
import {
  DEFAULT_INPAINT_MODEL_URL,
  dilateMask,
  type InpaintOptions,
  inpaintMask,
  inpaintStrokes,
} from "./inpaint";
import { type FetchProgress, isModelCached } from "./model-cache";
import {
  DEFAULT_SAM_DECODER_URL,
  DEFAULT_SAM_ENCODER_URL,
  decodeSamClicks,
  encodeSamImage,
  type SamEmbeddings,
  type SamOptions,
  type SamPoint,
} from "./sam";
import { createSelectSurface, isRepeatClick } from "./select-tool";
import { DEFAULT_UPSCALE_MODEL_URL, type UpscaleOptions, upscaleImage } from "./upscale";

export interface MlToolsOptions {
  cutout?: CutoutOptions | false;
  upscale?: UpscaleOptions | false;
  erase?: InpaintOptions | false;
  detect?: (DetectFacesOptions & { objects?: DetectObjectsOptions }) | false;
  select?: SamOptions | false;
  depth?: DepthOptions | false;
  denoise?: DenoiseOptions | false;
  /**
   * Open gallery results (cutout, upscale) in the editor when they finish,
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

function formatMb(bytes: number): string {
  const mb = bytes / 1e6;
  return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}

function downloadFact(model: ModelSpec, cached: boolean): string {
  if (cached) return "Saved on this device";
  return model.mb === null ? "Once, then saved" : `${model.mb} MB, once, then saved`;
}

/** The run button names the download until the model is saved: nobody starts one blind. */
/** The run button names the download until the model is saved: "Erase · 208 MB". */
function actionLabel(action: string, model: ModelSpec, cached: boolean): string {
  if (cached) return action;
  if (model.mb !== null) return `${action} · ${model.mb} MB`;
  return `Download and ${action[0].toLowerCase()}${action.slice(1)}`;
}

function runsOn(): string {
  const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
  return gpu ? "This device · WebGPU" : "This device · WebAssembly";
}

/**
 * A model-backed pane's card: what the tool does, then the model, its
 * download and where it runs. `onCached` fires once the cache check
 * resolves (and again after each run), so labels can drop the size.
 */
function modelCard(
  ctx: ToolContext,
  model: ModelSpec,
  description: string,
  onCached: (cached: boolean) => void,
): { card: UiCard; refresh(): Promise<boolean>; cached(): boolean } {
  let cached = false;
  const card = ctx.ui.card({
    description,
    facts: [
      ["Model", model.name],
      ["Download", downloadFact(model, false)],
      ["Runs on", runsOn()],
    ],
  });
  async function refresh(): Promise<boolean> {
    cached = await isModelCached(model.urls);
    card.setFact("Download", downloadFact(model, cached));
    onCached(cached);
    return cached;
  }
  void refresh();
  return { card, refresh, cached: () => cached };
}

/**
 * Feed download progress into step 0. A completed file (or the single
 * event a cache hit sends) hands over to the run step.
 */
function trackDownload(
  steps: UiSteps,
  forward?: (progress: FetchProgress) => void,
): (progress: FetchProgress) => void {
  return (p) => {
    if (p.total > 0 && p.loaded >= p.total) {
      steps.set(0, "done", { detail: formatMb(p.total) });
      steps.set(1, "active");
    } else {
      steps.set(0, "active", {
        detail: p.total > 0 ? `${formatMb(p.loaded)} of ${formatMb(p.total)}` : formatMb(p.loaded),
        progress: p.total > 0 ? p.loaded / p.total : undefined,
      });
    }
    forward?.(p);
  };
}

/** Start a run's steps: the download is done already when the model is saved. */
function beginSteps(steps: UiSteps, cached: boolean): void {
  steps.reset();
  if (cached) {
    steps.set(0, "done", { detail: "Saved" });
    steps.set(1, "active");
  } else {
    steps.set(0, "active", { detail: "Starting…", progress: 0 });
  }
}

/** Mark whichever step was running as failed. */
function failSteps(steps: UiSteps): void {
  const failed = steps.root.querySelector('[data-state="active"]');
  const index = failed ? [...steps.root.querySelectorAll(".rt-step")].indexOf(failed) : 1;
  steps.set(Math.max(0, index), "failed");
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
  return (
    c.x === 0 &&
    c.y === 0 &&
    c.width === 1 &&
    c.height === 1 &&
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

/** Non-interactive overlay that outlines detected boxes over the preview. */
function createBoxOverlay(canvasArea: HTMLElement): {
  draw(boxes: Detection[]): void;
  setVisible(visible: boolean): void;
  destroy(): void;
} {
  const container = canvasArea.querySelector("canvas")?.parentElement;
  const overlay = document.createElement("canvas");
  overlay.className = "rt-ml-detect-overlay";
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;pointer-events:none;display:none;";
  container?.appendChild(overlay);
  let boxes: Detection[] = [];

  function redraw(): void {
    const w = Math.max(1, Math.round(overlay.clientWidth));
    const h = Math.max(1, Math.round(overlay.clientHeight));
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = rgba(KEEP_RGB, 0.95);
    ctx.lineWidth = 2;
    ctx.font = "600 11px system-ui, sans-serif";
    for (const b of boxes) {
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      const tag = b.label
        ? `${b.label} ${Math.round(b.score * 100)}%`
        : `${Math.round(b.score * 100)}%`;
      // Label chip: measured rounded pill in the box color, ink text on top.
      const chipH = 17;
      const padX = 6;
      const chipW = ctx.measureText(tag).width + padX * 2;
      const cx = Math.max(0, b.x * w - 1);
      const cy = Math.max(0, b.y * h - chipH - 3);
      ctx.fillStyle = rgba(KEEP_RGB, 0.95);
      ctx.beginPath();
      ctx.roundRect(cx, cy, chipW, chipH, 4);
      ctx.fill();
      ctx.fillStyle = ON_KEEP;
      ctx.fillText(tag, cx + padX, cy + 12.5);
    }
  }

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (overlay.style.display !== "none") redraw();
        })
      : null;
  if (container) observer?.observe(container);

  return {
    draw(next) {
      boxes = next;
      redraw();
    },
    setVisible(visible) {
      overlay.style.display = visible ? "" : "none";
      if (visible) redraw();
    },
    destroy() {
      observer?.disconnect();
      overlay.remove();
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

/** Blob → File matching the entry's family: PNG stays PNG, photos go JPEG. */
function resultFileName(sourceName: string, suffix: string, type: string): string {
  const base = sourceName.replace(/\.[^.]+$/, "");
  return `${base}-${suffix}.${type === "image/png" ? "png" : "jpg"}`;
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

// Guards runs across editor remounts: a pane's local busy flag dies with
// the pane, but the underlying run keeps going.
const activeRuns = new Set<string>();

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

  /** Wipe the result in, then replace this photo's pixels with it (the editor remounts). */
  async function replacePhoto(ctx: ToolContext, result: HTMLCanvasElement): Promise<void> {
    const type = typeOf(ctx);
    const [blob] = await Promise.all([encodeCanvas(result, type), ctx.reveal(result)]);
    await retouch.replaceImageSource(ctx.entry.id, new File([blob], ctx.entry.file.name, { type }));
  }

  /**
   * Add a result to the gallery. With openResults it wipes in and the editor
   * moves to it; otherwise the last step offers a link to it.
   */
  async function addToGallery(
    ctx: ToolContext,
    result: HTMLCanvasElement,
    suffix: string,
    type: string,
    note: UiNote,
    steps?: UiSteps,
  ): Promise<void> {
    const reveal = openResults ? ctx.reveal(result) : Promise.resolve(() => {});
    const blob = await encodeCanvas(result, type);
    const name = resultFileName(ctx.entry.file.name, suffix, type);
    const before = retouch.getMedia().length;
    await retouch.addFiles([new File([blob], name, { type })]);
    const media = retouch.getMedia();
    const added = media.length > before ? media[media.length - 1] : undefined;
    const putBack = await reveal;
    if (!added) {
      putBack();
      steps?.set(2, "failed", { detail: "not added" });
      note.set("The gallery turned the result down, most likely over its size limit.");
      return;
    }
    steps?.set(2, "done", { detail: "Added" });
    if (openResults) {
      retouch.closeEditor(true);
      retouch.openEditor(added.id);
      return;
    }
    note.set(`${name} is in your gallery.`);
    const open = ctx.ui.button({
      label: "Open it",
      onClick: () => {
        retouch.closeEditor(true);
        retouch.openEditor(added.id);
      },
    });
    note.root.after(ctx.ui.row(open.root));
  }

  /**
   * A one-button tool (cutout, upscale, denoise): card, run button, steps.
   * `run` does the work and reports tiles; `finish` commits the result.
   */
  function oneShot(
    ctx: ToolContext,
    def: {
      id: string;
      model: ModelSpec;
      description: string;
      action: string;
      steps: [UiStep, UiStep, UiStep];
      run(hooks: {
        download: (p: FetchProgress) => void;
        tile: (done: number, total: number) => void;
      }): Promise<HTMLCanvasElement>;
      finish(result: HTMLCanvasElement, steps: UiSteps, note: UiNote): Promise<void>;
      failure(error: unknown): string;
    },
  ) {
    const note = ctx.ui.note("");
    const steps = ctx.ui.steps({ label: "Progress", steps: def.steps });
    steps.root.hidden = true;
    let busy = false;
    const button = ctx.ui.button({
      label: actionLabel(def.action, def.model, false),
      variant: "ai",
      onClick: () => void start(),
    });
    const { card, refresh, cached } = modelCard(ctx, def.model, def.description, (isCached) =>
      button.setLabel(actionLabel(def.action, def.model, isCached)),
    );

    async function start(): Promise<void> {
      if (busy || activeRuns.has(def.id) || ctx.entry.kind !== "image") return;
      busy = true;
      activeRuns.add(def.id);
      button.setDisabled(true);
      note.set("");
      steps.root.hidden = false;
      beginSteps(steps, cached());
      try {
        const result = await def.run({
          download: trackDownload(steps),
          tile: (done, total) =>
            steps.set(1, "active", { detail: `tile ${done} of ${total}`, progress: done / total }),
        });
        steps.set(0, "done", { detail: cached() ? "Saved" : undefined });
        steps.set(1, "done");
        steps.set(2, "active");
        await def.finish(result, steps, note);
      } catch (error) {
        failSteps(steps);
        note.set(def.failure(error));
        console.error(error);
      } finally {
        busy = false;
        activeRuns.delete(def.id);
        button.setDisabled(false);
        void refresh();
      }
    }

    card.body.append(button.root, steps.root, note.root);
    return { root: card.root };
  }

  // ── Cutout ──

  if (options.cutout !== false) {
    const cutoutOptions = options.cutout ?? {};
    const model = spec("MODNet", 25, [[cutoutOptions.modelUrl, DEFAULT_CUTOUT_MODEL_URL]]);
    ctor.registerTool({
      id: "cutout",
      label: "Cutout",
      icon: CUTOUT_ICON,
      group: "ai",
      description: "Remove the background",
      badge: "25 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        return oneShot(ctx, {
          id: "cutout",
          model,
          description:
            "Finds the subject and cuts it out. The cutout lands in your gallery as a new image; this photo stays as it is.",
          action: "Remove the background",
          steps: [
            { label: "Download the model", detail: model.mb ? `${model.mb} MB` : "" },
            { label: "Find the subject", detail: "on this device" },
            { label: "Add to your gallery", detail: "new image" },
          ],
          run: ({ download }) =>
            ctx.entry.kind === "image"
              ? removeBackground(ctx.entry.image, {
                  ...cutoutOptions,
                  onDownloadProgress: (p) => {
                    download(p);
                    cutoutOptions.onDownloadProgress?.(p);
                  },
                })
              : Promise.reject(new Error("Cutout needs an image")),
          finish: (result, steps, note) =>
            addToGallery(ctx, result, "cutout", "image/png", note, steps),
          failure: (error) => errorText(error, "Cutout failed"),
        });
      },
    });
  }

  // ── Erase ──

  if (options.erase !== false) {
    const eraseOptions = options.erase ?? {};
    const model = spec("LaMa", 208, [[eraseOptions.modelUrl, DEFAULT_INPAINT_MODEL_URL]]);
    ctor.registerTool({
      id: "erase",
      label: "Erase",
      icon: ERASE_ICON,
      group: "ai",
      description: "Paint over things to remove them",
      badge: "208 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const note = ctx.ui.note("");
        const steps = ctx.ui.steps({
          label: "Progress",
          steps: [
            { label: "Download the model", detail: model.mb ? `${model.mb} MB` : "" },
            { label: "Fill it in", detail: "on this device" },
            { label: "Replace this photo", detail: "Reset all undoes it" },
          ],
        });
        steps.root.hidden = true;
        let busy = false;

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
          label: actionLabel("Erase", model, false),
          variant: "ai",
          onClick: () => void start(),
        });
        const { card, refresh, cached } = modelCard(
          ctx,
          model,
          "Paint over what should go, then Erase fills it in from its surroundings. It replaces this photo's pixels; Reset all brings the original back.",
          (isCached) => run.setLabel(actionLabel("Erase", model, isCached)),
        );

        const surface = createEraseSurface(ctx.canvasArea, () => syncState());
        surface.setBrush(0.06);

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          if (!busy) note.set(neutral ? "" : NEEDS_FRAME);
          run.setDisabled(busy || !surface.hasStrokes() || !neutral);
          clear.setDisabled(busy || !surface.hasStrokes());
        }

        async function start(): Promise<void> {
          if (busy || activeRuns.has("erase") || ctx.entry.kind !== "image") return;
          if (!surface.hasStrokes() || !geometryIsNeutral(ctx.edits as ImageEdits)) return;
          busy = true;
          activeRuns.add("erase");
          syncState();
          steps.root.hidden = false;
          beginSteps(steps, cached());
          try {
            const result = await inpaintStrokes(ctx.entry.image, surface.getStrokes(), {
              ...eraseOptions,
              onDownloadProgress: trackDownload(steps, eraseOptions.onDownloadProgress),
            });
            steps.set(1, "done");
            steps.set(2, "active");
            // In place: the entry keeps its identity, the pixels change, and
            // the editor remounts (rebuilding this pane).
            await replacePhoto(ctx, result);
          } catch (error) {
            failSteps(steps);
            note.set(errorText(error, "Erase failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("erase");
            syncState();
            void refresh();
          }
        }

        card.body.append(brush.root, ctx.ui.row(clear.root, run.root), steps.root, note.root);
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
            surface.destroy();
          },
        };
      },
    });
  }

  // ── Select ──

  if (options.select !== false) {
    const selectOptions = options.select ?? {};
    const model = spec("SlimSAM", 38, [
      [selectOptions.encoderUrl, DEFAULT_SAM_ENCODER_URL],
      [selectOptions.decoderUrl, DEFAULT_SAM_DECODER_URL],
    ]);
    const eraseModel = options.erase !== false ? options.erase : undefined;
    const fillModel = spec("LaMa", 208, [[eraseModel?.modelUrl, DEFAULT_INPAINT_MODEL_URL]]);
    ctor.registerTool({
      id: "select",
      label: "Select",
      icon: SELECT_ICON,
      group: "ai",
      description: "Click an object to select it",
      badge: "38 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const note = ctx.ui.note("");
        const steps = ctx.ui.steps({
          label: "Getting ready",
          steps: [
            { label: "Download the model", detail: model.mb ? `${model.mb} MB` : "" },
            { label: "Read the photo", detail: "on this device" },
          ],
        });
        steps.root.hidden = true;

        let points: SamPoint[] = [];
        /** Which candidate shape to show for these clicks (see decodeSamClicks). */
        let pick = 0;
        let mask: HTMLCanvasElement | null = null;
        let embeddings: SamEmbeddings | null = null;
        let busy = false;

        // Clicking the photo would start a 38 MB download; until the model
        // is saved, that waits behind an explicit button.
        const prepare = ctx.ui.button({
          label: actionLabel("Start selecting", model, false),
          variant: "ai",
          onClick: () => void ready(),
        });
        const mode = ctx.ui.choice({
          label: "Click mode",
          options: [
            { value: "add", label: "Add" },
            { value: "subtract", label: "Subtract" },
          ],
          value: "add",
          onChange: () => {},
        });
        const cut = ctx.ui.button({ label: "Cut out", onClick: () => void cutOut() });
        const eraseIt = ctx.ui.button({
          label: actionLabel("Erase it", fillModel, false),
          onClick: () => void eraseObject(),
        });
        const clear = ctx.ui.button({ label: "Clear", onClick: () => clearSelection() });
        const actions = ctx.ui.row(mode.root);
        const results = ctx.ui.row(cut.root, eraseIt.root, clear.root);

        const { card, refresh, cached } = modelCard(
          ctx,
          model,
          "Click an object to select it; click again to add to it, or switch to Subtract. Cut it out as a new image, or erase it from this photo.",
          () => syncState(),
        );
        void isModelCached(fillModel.urls).then((saved) =>
          eraseIt.setLabel(actionLabel("Erase it", fillModel, saved)),
        );

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          const armed = embeddings !== null || cached();
          prepare.root.hidden = armed;
          prepare.setLabel(actionLabel("Start selecting", model, cached()));
          prepare.setDisabled(busy || !neutral);
          actions.hidden = !armed;
          results.hidden = !armed;
          const usable = neutral && mask !== null && !busy;
          cut.setDisabled(!usable);
          eraseIt.setDisabled(!usable);
          clear.setDisabled(points.length === 0 || busy);
          if (busy) return;
          if (!neutral) note.set(NEEDS_FRAME);
          else if (!armed) note.set("");
          else if (mask) note.set("Selected. Click the same spot again for another shape.");
          else note.set("Click an object in the photo.");
        }

        function clearSelection(): void {
          if (busy) return;
          points = [];
          pick = 0;
          mask = null;
          surface.setPoints(points);
          surface.setMask(null);
          syncState();
        }

        /** Download (if needed) and encode the photo, so clicks only decode. */
        async function ready(): Promise<SamEmbeddings | null> {
          if (embeddings) return embeddings;
          if (ctx.entry.kind !== "image") return null;
          busy = true;
          activeRuns.add("select");
          syncState();
          steps.root.hidden = false;
          beginSteps(steps, cached());
          note.set("");
          try {
            embeddings = await encodeSamImage(ctx.entry.image, {
              ...selectOptions,
              onDownloadProgress: trackDownload(steps, selectOptions.onDownloadProgress),
            });
            steps.set(0, "done", { detail: cached() ? "Saved" : undefined });
            steps.set(1, "done");
            return embeddings;
          } catch (error) {
            failSteps(steps);
            note.set(errorText(error, "Select couldn't start"));
            console.error(error);
            return null;
          } finally {
            busy = false;
            activeRuns.delete("select");
            void refresh();
            syncState();
          }
        }

        const surface = createSelectSurface(ctx.canvasArea, (x, y, shiftKey) => {
          if (busy || activeRuns.has("select") || ctx.entry.kind !== "image") return;
          if (!geometryIsNeutral(ctx.edits as ImageEdits)) return;
          if (!embeddings && !cached()) {
            note.set(`Start selecting first: it downloads the model (${model.mb ?? "?"} MB) once.`);
            return;
          }
          const label = shiftKey || mode.value === "subtract" ? 0 : 1;
          // The same spot again means "not that one": step to the next shape.
          if (isRepeatClick(points, x, y, label)) pick++;
          else {
            points.push({ x, y, label });
            pick = 0;
          }
          surface.setPoints(points);
          void refine();
        });

        async function refine(): Promise<void> {
          const ready_ = await ready();
          if (!ready_) return;
          busy = true;
          activeRuns.add("select");
          note.set("Selecting…");
          try {
            const result = await decodeSamClicks(ready_, points, selectOptions, pick);
            mask = result.mask;
            surface.setMask(mask);
          } catch (error) {
            note.set(errorText(error, "Select failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("select");
            syncState();
          }
        }

        async function cutOut(): Promise<void> {
          if (busy || !mask || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("select");
          syncState();
          note.set("Cutting out…");
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
            await addToGallery(ctx, out, "cutout", "image/png", note);
          } catch (error) {
            note.set(errorText(error, "Cut out failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("select");
            syncState();
          }
        }

        async function eraseObject(): Promise<void> {
          if (busy || !mask || ctx.entry.kind !== "image" || activeRuns.has("erase")) return;
          busy = true;
          activeRuns.add("select");
          activeRuns.add("erase");
          syncState();
          note.set("Erasing… (the first time downloads the fill model)");
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
              onDownloadProgress: (p) => {
                if (p.total > 0 && p.loaded < p.total) {
                  note.set(
                    `Downloading the fill model… ${formatMb(p.loaded)} of ${formatMb(p.total)}`,
                  );
                } else note.set("Erasing…");
                selectOptions.onDownloadProgress?.(p);
              },
            });
            await replacePhoto(ctx, result);
          } catch (error) {
            note.set(errorText(error, "Erase failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("select");
            activeRuns.delete("erase");
            syncState();
          }
        }

        card.body.append(prepare.root, actions, results, steps.root, note.root);
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
    ctor.registerTool({
      id: "depth",
      label: "Depth",
      icon: DEPTH_ICON,
      group: "ai",
      description: "Blur the background by distance",
      badge: "27 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const note = ctx.ui.note("");
        const steps = ctx.ui.steps({
          label: "Progress",
          steps: [
            { label: "Download the model", detail: model.mb ? `${model.mb} MB` : "" },
            { label: "Measure the depth", detail: "on this device" },
            { label: "Click what stays sharp" },
          ],
        });
        steps.root.hidden = true;

        let prep: ReturnType<typeof prepareBokeh> | null = null;
        let depthMap: Awaited<ReturnType<typeof estimateDepth>> | null = null;
        let focus = 0.5;
        let busy = false;

        const analyze = ctx.ui.button({
          label: actionLabel("Measure depth", model, false),
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

        const { card, refresh, cached } = modelCard(
          ctx,
          model,
          "Measures how far away everything is, then blurs the background like a wide aperture. Click what should stay sharp; Apply replaces this photo's pixels.",
          (isCached) => analyze.setLabel(actionLabel("Measure depth", model, isCached)),
        );

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          analyze.setDisabled(busy || !neutral);
          analyze.root.hidden = prep !== null;
          aperture.root.hidden = prep === null;
          tune.hidden = prep === null;
          apply.setDisabled(busy || !prep || !neutral);
          clear.setDisabled(busy || !prep);
          if (busy) return;
          if (!neutral) note.set(NEEDS_FRAME);
          else if (prep) note.set("Click what should stay sharp, tune Aperture, then Apply.");
          else note.set("");
        }

        function recompose(): void {
          if (prep) surface.setPreview(composeBokeh(prep, focus, aperture.value / 100));
        }

        function clearPreview(): void {
          if (busy) return;
          prep = null;
          surface.setPreview(null);
          steps.root.hidden = true;
          syncState();
        }

        const surface = createDepthSurface(ctx.canvasArea, (x, y) => {
          if (!prep || !depthMap || busy) return;
          focus = depthAt(depthMap, x, y);
          recompose();
          steps.set(2, "done", { detail: "focus set" });
        });

        async function measure(): Promise<void> {
          if (busy || activeRuns.has("depth") || ctx.entry.kind !== "image") return;
          if (!geometryIsNeutral(ctx.edits as ImageEdits)) return;
          busy = true;
          activeRuns.add("depth");
          syncState();
          steps.root.hidden = false;
          beginSteps(steps, cached());
          note.set("");
          try {
            depthMap = await estimateDepth(ctx.entry.image, {
              ...depthOptions,
              onDownloadProgress: trackDownload(steps, depthOptions.onDownloadProgress),
            });
            await new Promise((r) => setTimeout(r, 0));
            prep = prepareBokeh(ctx.entry.image, depthMap, 1280);
            focus = suggestFocus(depthMap);
            recompose();
            steps.set(0, "done", { detail: cached() ? "Saved" : undefined });
            steps.set(1, "done");
            steps.set(2, "active");
          } catch (error) {
            failSteps(steps);
            note.set(errorText(error, "Measuring depth failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("depth");
            syncState();
            void refresh();
          }
        }

        async function applyBlur(): Promise<void> {
          if (busy || !depthMap || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("depth");
          syncState();
          note.set("Rendering at full resolution…");
          try {
            await new Promise((r) => setTimeout(r, 0));
            const image = ctx.entry.image;
            prep ??= prepareBokeh(image, depthMap, 1280);
            await replacePhoto(
              ctx,
              renderBokeh(prep, image, depthMap, focus, aperture.value / 100),
            );
          } catch (error) {
            note.set(errorText(error, "Apply failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("depth");
            syncState();
          }
        }

        card.body.append(analyze.root, aperture.root, tune, steps.root, note.root);
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
    const faceModel = spec("UltraFace", 1.2, [[detectOptions.modelUrl, DEFAULT_FACE_MODEL_URL]]);
    const objectModel = spec("YOLOX-nano", 3.5, [
      [objectOptions.modelUrl, DEFAULT_OBJECT_MODEL_URL],
    ]);
    ctor.registerTool({
      id: "detect",
      label: "Detect",
      icon: DETECT_ICON,
      group: "ai",
      description: "Find faces and objects",
      badge: "5 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const note = ctx.ui.note("");
        const overlay = createBoxOverlay(ctx.canvasArea);
        let found: Detection[] = [];
        let busy = false;

        const card = ctx.ui.card({
          description:
            "Finds faces or objects, then adds a mask over each, pixelates them for privacy, or crops to them.",
          facts: [
            ["Models", "UltraFace (faces) · YOLOX-nano (objects)"],
            [
              "Download",
              faceModel.mb !== null && objectModel.mb !== null
                ? `${faceModel.mb} MB and ${objectModel.mb} MB, once, then saved`
                : "Once, then saved",
            ],
            ["Runs on", runsOn()],
          ],
        });
        void Promise.all([isModelCached(faceModel.urls), isModelCached(objectModel.urls)]).then(
          ([faces, objects]) => {
            if (faces && objects) card.setFact("Download", "Saved on this device");
          },
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
        const actions = ctx.ui.row(addMasks.root, pixelate.root, cropTo.root);

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          findFaces.setDisabled(busy);
          findObjects.setDisabled(busy);
          actions.hidden = found.length === 0;
          for (const b of [addMasks, pixelate, cropTo])
            b.setDisabled(busy || !neutral || found.length === 0);
        }

        async function find(kind: "faces" | "objects"): Promise<void> {
          if (busy || activeRuns.has("detect") || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("detect");
          syncState();
          note.set("Looking…");
          try {
            const progress = (p: FetchProgress): void => {
              if (p.total > 0 && p.loaded < p.total) {
                note.set(`Downloading the model… ${formatMb(p.loaded)} of ${formatMb(p.total)}`);
              } else note.set("Looking…");
            };
            if (kind === "faces") {
              found = await detectFaces(ctx.entry.image, {
                ...detectOptions,
                onDownloadProgress: (p) => {
                  progress(p);
                  detectOptions.onDownloadProgress?.(p);
                },
              });
            } else {
              found = await detectObjects(ctx.entry.image, {
                ...objectOptions,
                onDownloadProgress: (p) => {
                  progress(p);
                  objectOptions.onDownloadProgress?.(p);
                },
              });
            }
            overlay.draw(found);
            const noun = kind === "faces" ? "face" : "object";
            if (found.length === 0) {
              note.set(`No ${noun}s found.`);
            } else {
              const labels = [...new Set(found.map((f) => f.label).filter(Boolean))];
              const what = labels.length
                ? `: ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? "…" : ""}`
                : ".";
              note.set(`${found.length} ${noun}${found.length > 1 ? "s" : ""} found${what}`);
              if (!geometryIsNeutral(ctx.edits as ImageEdits)) note.set(NEEDS_FRAME);
            }
          } catch (error) {
            note.set(errorText(error, "Detection failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("detect");
            syncState();
          }
        }

        function maskThem(): void {
          for (const f of found) {
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
            `Added ${found.length} radial mask${found.length > 1 ? "s" : ""}. Tune them in Masks.`,
          );
        }

        async function pixelateThem(): Promise<void> {
          if (busy || activeRuns.has("detect") || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("detect");
          syncState();
          note.set("Pixelating…");
          try {
            const canvas = document.createElement("canvas");
            canvas.width = ctx.entry.image.naturalWidth;
            canvas.height = ctx.entry.image.naturalHeight;
            const cctx = canvas.getContext("2d");
            if (!cctx) throw new Error("[Retouch ML] Failed to create canvas context");
            cctx.drawImage(ctx.entry.image, 0, 0);
            for (const f of found) pixelateRegion(canvas, f);
            await replacePhoto(ctx, canvas);
          } catch (error) {
            note.set(errorText(error, "Pixelate failed"));
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("detect");
            syncState();
          }
        }

        function cropToThem(): void {
          let x0 = 1;
          let y0 = 1;
          let x1 = 0;
          let y1 = 0;
          for (const f of found) {
            x0 = Math.min(x0, f.x);
            y0 = Math.min(y0, f.y);
            x1 = Math.max(x1, f.x + f.w);
            y1 = Math.max(y1, f.y + f.h);
          }
          // Faces sit high in a good crop — more margin below than above.
          const mx = (x1 - x0) * 0.35;
          const cx0 = Math.max(0, x0 - mx);
          const cx1 = Math.min(1, x1 + mx);
          const cy0 = Math.max(0, y0 - (y1 - y0) * 0.4);
          const cy1 = Math.min(1, y1 + (y1 - y0) * 0.8);
          ctx.edits.crop = { x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0 };
          ctx.render();
          ctx.record();
          overlay.draw([]);
          found = [];
          syncState();
          note.set("Cropped to what was found. Undo to go back.");
        }

        card.body.append(ctx.ui.row(findFaces.root, findObjects.root), actions, note.root);
        syncState();
        return {
          root: card.root,
          onActivate() {
            overlay.setVisible(true);
          },
          onDeactivate() {
            overlay.setVisible(false);
          },
          sync: syncState,
          destroy() {
            overlay.destroy();
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
    ctor.registerTool({
      id: "upscale",
      label: "Upscale",
      icon: UPSCALE_ICON,
      group: "ai",
      description: "Four times the resolution",
      badge: "67 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        return oneShot(ctx, {
          id: "upscale",
          model,
          description: `Rebuilds the photo at four times the resolution (from up to ${maxEdge} px on the long edge). The result lands in your gallery as a new image.`,
          action: "Upscale 4×",
          steps: [
            { label: "Download the model", detail: model.mb ? `${model.mb} MB` : "" },
            { label: "Upscale", detail: "on this device" },
            { label: "Add to your gallery", detail: "new image" },
          ],
          run: ({ download, tile }) =>
            ctx.entry.kind === "image"
              ? upscaleImage(ctx.entry.image, {
                  ...upscaleOptions,
                  onDownloadProgress: (p) => {
                    download(p);
                    upscaleOptions.onDownloadProgress?.(p);
                  },
                  onTileProgress: (done, total) => {
                    tile(done, total);
                    upscaleOptions.onTileProgress?.(done, total);
                  },
                })
              : Promise.reject(new Error("Upscale needs an image")),
          finish: (result, steps, note) =>
            addToGallery(ctx, result, "upscaled", typeOf(ctx), note, steps),
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
    ctor.registerTool({
      id: "denoise",
      label: "Denoise",
      icon: DENOISE_ICON,
      group: "ai",
      description: "Clean up sensor noise",
      badge: "77 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        return oneShot(ctx, {
          id: "denoise",
          model,
          description:
            "Cleans up sensor noise while keeping detail. It replaces this photo's pixels; Reset all brings the original back.",
          action: "Remove the noise",
          steps: [
            { label: "Download the model", detail: model.mb ? `${model.mb} MB` : "" },
            { label: "Clean it up", detail: "on this device" },
            { label: "Replace this photo", detail: "Reset all undoes it" },
          ],
          run: ({ download, tile }) =>
            ctx.entry.kind === "image"
              ? denoiseImage(ctx.entry.image, {
                  ...denoiseOptions,
                  onDownloadProgress: (p) => {
                    download(p);
                    denoiseOptions.onDownloadProgress?.(p);
                  },
                  onTileProgress: (done, total) => {
                    tile(done, total);
                    denoiseOptions.onTileProgress?.(done, total);
                  },
                })
              : Promise.reject(new Error("Denoise needs an image")),
          // In place: pixels map 1:1, so crop and mask edits stay valid.
          finish: (result) => replacePhoto(ctx, result),
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
