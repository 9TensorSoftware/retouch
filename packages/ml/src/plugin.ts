import {
  type EditMask,
  type ImageEdits,
  type Retouch,
  refreshRangeFill,
  type ToolContext,
} from "@retouchjs/core";
import { KEEP_RGB, ON_KEEP, rgba } from "./colors";
import { applyMatteAlpha, type CutoutOptions, removeBackground } from "./cutout";
import { type DenoiseOptions, denoiseImage } from "./denoise";
import { composeBokeh, type DepthOptions, depthAt, estimateDepth, prepareBokeh } from "./depth";
import { createDepthSurface } from "./depth-tool";
import {
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
import { dilateMask, type InpaintOptions, inpaintMask, inpaintStrokes } from "./inpaint";
import type { FetchProgress } from "./model-cache";
import { decodeSamClicks, encodeSamImage, type SamOptions, type SamPoint } from "./sam";
import { createSelectSurface } from "./select-tool";
import { type UpscaleOptions, upscaleImage } from "./upscale";

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

interface RunPaneParts {
  root: HTMLElement;
  status: HTMLElement;
  button: HTMLButtonElement;
}

function buildRunPane(hint: string, action: string): RunPaneParts {
  const root = document.createElement("div");
  root.className = "rt-dock__row";
  const status = buildStatus(hint);
  const button = document.createElement("button");
  button.className = "rt-dock__chip rt-dock__chip--primary";
  button.textContent = action;
  root.appendChild(status);
  root.appendChild(button);
  return { root, status, button };
}

/** Status line: announced politely so model progress reaches screen readers. */
function buildStatus(text = ""): HTMLElement {
  const status = document.createElement("span");
  status.className = "rt-dock__slider-label rt-dock__status";
  status.setAttribute("aria-live", "polite");
  status.textContent = text;
  return status;
}

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

// Guards runs across editor remounts: a pane's local busy flag dies with
// the pane, but the underlying run keeps going.
const activeRuns = new Set<string>();

/**
 * Download-progress → status text. The last progress event (and the single
 * event a cache hit emits) flips to "Processing" — the model is running,
 * not downloading, and on WASM that phase can take a while.
 */
function downloadStatus(
  status: HTMLElement,
  forward?: (progress: FetchProgress) => void,
): (progress: FetchProgress) => void {
  return (p) => {
    if (p.total > 0 && p.loaded >= p.total) {
      status.textContent = "Processing on-device… (first run can take a while)";
    } else {
      const pct = p.total > 0 ? ` ${Math.round((p.loaded / p.total) * 100)}%` : "";
      status.textContent = `Downloading model…${pct}`;
    }
    forward?.(p);
  };
}

/** Show a just-added gallery entry in the editor so the result is visible. */
function openLatestResult(retouch: Retouch): void {
  const media = retouch.getMedia();
  const latest = media[media.length - 1];
  if (!latest) return;
  retouch.closeEditor(true);
  retouch.openEditor(latest.id);
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

/**
 * Register the ML feature groups on the editor. Call once, before opening
 * the editor. The instance is needed so results (new images) can land in
 * the gallery. Pass `false` per tool to skip it.
 */
export function installMlTools(retouch: Retouch, options: MlToolsOptions = {}): void {
  const ctor = retouch.constructor as typeof Retouch;

  if (options.cutout !== false) {
    const cutoutOptions = options.cutout ?? {};
    ctor.registerTool({
      id: "cutout",
      label: "Cutout",
      icon: CUTOUT_ICON,
      group: "ai",
      description: "Remove the background",
      badge: "25 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const hint = "On-device background removal — the result is added as a new image";
        const { root, status, button } = buildRunPane(hint, "Remove background");
        let busy = false;
        button.addEventListener("click", async () => {
          if (busy || activeRuns.has("cutout") || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("cutout");
          button.disabled = true;
          try {
            status.textContent = "Preparing model…";
            const result = await removeBackground(ctx.entry.image, {
              ...cutoutOptions,
              onDownloadProgress: downloadStatus(status, cutoutOptions.onDownloadProgress),
            });
            status.textContent = "Compositing…";
            const blob = await encodeCanvas(result, "image/png");
            const name = resultFileName(ctx.entry.file.name, "cutout", "image/png");
            const before = retouch.getMedia().length;
            await retouch.addFiles([new File([blob], name, { type: "image/png" })]);
            const added = retouch.getMedia().length > before;
            status.textContent = added
              ? "Done — cutout added to the gallery"
              : "The result was rejected — likely over the size limit";
            if (added && options.openResults !== false) openLatestResult(retouch);
          } catch (error) {
            status.textContent = "Cutout failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("cutout");
            button.disabled = false;
          }
        });
        return { root };
      },
    });
  }

  if (options.erase !== false) {
    const eraseOptions = options.erase ?? {};
    ctor.registerTool({
      id: "erase",
      label: "Erase",
      icon: ERASE_ICON,
      group: "ai",
      description: "Paint over things to remove them",
      badge: "208 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const root = document.createElement("div");
        root.className = "rt-dock__row";
        const status = buildStatus();

        const sizeLabel = document.createElement("span");
        sizeLabel.className = "rt-dock__slider-label";
        sizeLabel.textContent = "Brush";
        const sizeInput = document.createElement("input");
        sizeInput.type = "range";
        sizeInput.min = "2";
        sizeInput.max = "20";
        sizeInput.value = "6";
        sizeInput.setAttribute("aria-label", "Brush size");
        const sizeValue = document.createElement("span");
        sizeValue.className = "rt-dock__slider-value";
        sizeValue.textContent = sizeInput.value;
        refreshRangeFill(sizeInput);

        const clearBtn = document.createElement("button");
        clearBtn.className = "rt-dock__chip";
        clearBtn.textContent = "Clear";
        const runBtn = document.createElement("button");
        runBtn.className = "rt-dock__chip rt-dock__chip--primary";
        runBtn.textContent = "Erase";

        const surface = createEraseSurface(ctx.canvasArea, () => {
          const has = surface.hasStrokes();
          runBtn.disabled = !has || !geometryIsNeutral(ctx.edits as ImageEdits);
          clearBtn.disabled = !has;
        });
        surface.setBrush(0.06);

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          status.textContent = neutral
            ? "Paint over what to remove, then hit Erase — replaces this image"
            : "Erase needs the un-transformed image — reset crop/transform/liquify first";
          runBtn.disabled = !surface.hasStrokes() || !neutral;
          clearBtn.disabled = !surface.hasStrokes();
        }
        syncState();

        sizeInput.addEventListener("input", () => {
          sizeValue.textContent = sizeInput.value;
          refreshRangeFill(sizeInput);
          surface.setBrush(Number(sizeInput.value) / 100);
        });
        clearBtn.addEventListener("click", () => surface.clear());

        let busy = false;
        runBtn.addEventListener("click", async () => {
          if (busy || activeRuns.has("erase") || ctx.entry.kind !== "image") return;
          if (!surface.hasStrokes() || !geometryIsNeutral(ctx.edits as ImageEdits)) return;
          busy = true;
          activeRuns.add("erase");
          runBtn.disabled = true;
          clearBtn.disabled = true;
          try {
            status.textContent = "Preparing model…";
            const result = await inpaintStrokes(ctx.entry.image, surface.getStrokes(), {
              ...eraseOptions,
              onDownloadProgress: downloadStatus(status, eraseOptions.onDownloadProgress),
            });
            status.textContent = "Compositing…";
            const type = ctx.entry.file.type === "image/jpeg" ? "image/jpeg" : "image/png";
            const blob = await encodeCanvas(result, type);
            // In place: the entry keeps its identity, the pixels change.
            // replaceImageSource remounts the editor, which rebuilds this pane.
            await retouch.replaceImageSource(
              ctx.entry.id,
              new File([blob], ctx.entry.file.name, { type }),
            );
          } catch (error) {
            status.textContent = "Erase failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("erase");
            clearBtn.disabled = !surface.hasStrokes();
            runBtn.disabled = !surface.hasStrokes() || !geometryIsNeutral(ctx.edits as ImageEdits);
          }
        });

        const sizeGroup = document.createElement("div");
        sizeGroup.className = "rt-dock__group rt-dock__slider";
        sizeGroup.appendChild(sizeLabel);
        sizeGroup.appendChild(sizeInput);
        sizeGroup.appendChild(sizeValue);

        root.appendChild(status);
        root.appendChild(sizeGroup);
        root.appendChild(clearBtn);
        root.appendChild(runBtn);
        return {
          root,
          onActivate() {
            surface.setVisible(true);
            syncState();
          },
          onDeactivate() {
            surface.setVisible(false);
          },
          sync() {
            syncState();
          },
          destroy() {
            surface.destroy();
          },
        };
      },
    });
  }

  if (options.select !== false) {
    const selectOptions = options.select ?? {};
    ctor.registerTool({
      id: "select",
      label: "Select",
      icon: SELECT_ICON,
      group: "ai",
      description: "Click an object to select it",
      badge: "38 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const root = document.createElement("div");
        root.className = "rt-dock__row";
        const status = buildStatus();

        const addBtn = document.createElement("button");
        addBtn.className = "rt-dock__chip rt-dock__chip--active";
        addBtn.textContent = "+ Add";
        addBtn.setAttribute("aria-pressed", "true");
        const subBtn = document.createElement("button");
        subBtn.className = "rt-dock__chip";
        subBtn.textContent = "− Subtract";
        subBtn.setAttribute("aria-pressed", "false");
        const cutBtn = document.createElement("button");
        cutBtn.className = "rt-dock__chip";
        cutBtn.textContent = "Cut out";
        const eraseBtn = document.createElement("button");
        eraseBtn.className = "rt-dock__chip";
        eraseBtn.textContent = "Erase object";
        const clearBtn = document.createElement("button");
        clearBtn.className = "rt-dock__chip";
        clearBtn.textContent = "Clear";

        let subtractMode = false;
        let points: SamPoint[] = [];
        let mask: HTMLCanvasElement | null = null;
        let busy = false;

        function setMode(subtract: boolean): void {
          subtractMode = subtract;
          addBtn.classList.toggle("rt-dock__chip--active", !subtract);
          addBtn.setAttribute("aria-pressed", String(!subtract));
          subBtn.classList.toggle("rt-dock__chip--active", subtract);
          subBtn.setAttribute("aria-pressed", String(subtract));
        }
        addBtn.addEventListener("click", () => setMode(false));
        subBtn.addEventListener("click", () => setMode(true));

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          if (!neutral) {
            status.textContent =
              "Select needs the un-transformed image — reset crop/transform/liquify first";
          } else if (busy) {
            // status text is being driven by the run
          } else if (mask) {
            status.textContent = "Selection ready — click to refine, or pick an action";
          } else {
            status.textContent = "Click an object to select it (shift-click removes)";
          }
          const usable = neutral && mask !== null && !busy;
          cutBtn.disabled = !usable;
          eraseBtn.disabled = !usable;
          clearBtn.disabled = points.length === 0 || busy;
        }

        function clearSelection(): void {
          points = [];
          mask = null;
          surface.setPoints(points);
          surface.setMask(null);
          syncState();
        }

        const surface = createSelectSurface(ctx.canvasArea, (x, y, shiftKey) => {
          if (busy || activeRuns.has("select") || ctx.entry.kind !== "image") return;
          if (!geometryIsNeutral(ctx.edits as ImageEdits)) return;
          points.push({ x, y, label: shiftKey || subtractMode ? 0 : 1 });
          surface.setPoints(points);
          void refine();
        });

        async function refine(): Promise<void> {
          if (ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("select");
          syncState();
          try {
            status.textContent = "Preparing model…";
            const embeddings = await encodeSamImage(ctx.entry.image, {
              ...selectOptions,
              onDownloadProgress: downloadStatus(status, selectOptions.onDownloadProgress),
            });
            status.textContent = "Segmenting…";
            const result = await decodeSamClicks(embeddings, points, selectOptions);
            mask = result.mask;
            surface.setMask(mask);
          } catch (error) {
            status.textContent = "Select failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("select");
            syncState();
          }
        }

        clearBtn.addEventListener("click", () => {
          if (!busy) clearSelection();
        });

        cutBtn.addEventListener("click", async () => {
          if (cutBtn.disabled || busy || !mask || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("select");
          syncState();
          try {
            status.textContent = "Compositing…";
            const image = ctx.entry.image;
            const out = document.createElement("canvas");
            out.width = image.naturalWidth;
            out.height = image.naturalHeight;
            const outCtx = out.getContext("2d");
            if (!outCtx) throw new Error("[Retouch ML] Failed to create canvas context");
            outCtx.drawImage(image, 0, 0);
            const outImage = outCtx.getImageData(0, 0, out.width, out.height);
            const maskCtx = mask.getContext("2d");
            if (!maskCtx) throw new Error("[Retouch ML] Failed to read the mask");
            applyMatteAlpha(outImage.data, maskCtx.getImageData(0, 0, out.width, out.height).data);
            outCtx.putImageData(outImage, 0, 0);
            const blob = await encodeCanvas(out, "image/png");
            const name = resultFileName(ctx.entry.file.name, "cutout", "image/png");
            const before = retouch.getMedia().length;
            await retouch.addFiles([new File([blob], name, { type: "image/png" })]);
            const added = retouch.getMedia().length > before;
            status.textContent = added
              ? "Done — cutout added to the gallery"
              : "The result was rejected — likely over the size limit";
            if (added) {
              clearSelection();
              if (options.openResults !== false) openLatestResult(retouch);
            }
          } catch (error) {
            status.textContent = "Cut out failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("select");
            syncState();
          }
        });

        eraseBtn.addEventListener("click", async () => {
          if (eraseBtn.disabled || busy || !mask || ctx.entry.kind !== "image") return;
          if (activeRuns.has("erase")) return;
          busy = true;
          activeRuns.add("select");
          activeRuns.add("erase");
          syncState();
          try {
            status.textContent = "Preparing model…";
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
            // The inpaint model honors a self-hosted `erase` URL when set.
            const eraseModel = options.erase !== false ? options.erase : undefined;
            const result = await inpaintMask(image, dilatedCanvas, {
              ...selectOptions,
              modelUrl: eraseModel?.modelUrl,
              onDownloadProgress: downloadStatus(status, selectOptions.onDownloadProgress),
            });
            status.textContent = "Compositing…";
            const type = ctx.entry.file.type === "image/jpeg" ? "image/jpeg" : "image/png";
            const blob = await encodeCanvas(result, type);
            // In place — replaceImageSource remounts the editor and this pane.
            await retouch.replaceImageSource(
              ctx.entry.id,
              new File([blob], ctx.entry.file.name, { type }),
            );
          } catch (error) {
            status.textContent = "Erase failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("select");
            activeRuns.delete("erase");
            syncState();
          }
        });

        syncState();
        root.appendChild(status);
        root.appendChild(addBtn);
        root.appendChild(subBtn);
        root.appendChild(cutBtn);
        root.appendChild(eraseBtn);
        root.appendChild(clearBtn);
        return {
          root,
          onActivate() {
            surface.setVisible(true);
            syncState();
          },
          onDeactivate() {
            surface.setVisible(false);
          },
          sync() {
            syncState();
          },
          destroy() {
            surface.destroy();
          },
        };
      },
    });
  }

  if (options.depth !== false) {
    const depthOptions = options.depth ?? {};
    ctor.registerTool({
      id: "depth",
      label: "Depth",
      icon: DEPTH_ICON,
      group: "ai",
      description: "Blur the background by distance",
      badge: "27 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const root = document.createElement("div");
        root.className = "rt-dock__row";
        const status = buildStatus();

        const analyzeBtn = document.createElement("button");
        analyzeBtn.className = "rt-dock__chip";
        analyzeBtn.textContent = "Analyze depth";
        const apertureLabel = document.createElement("span");
        apertureLabel.className = "rt-dock__slider-label";
        apertureLabel.textContent = "Aperture";
        const apertureInput = document.createElement("input");
        apertureInput.type = "range";
        apertureInput.min = "10";
        apertureInput.max = "100";
        apertureInput.value = "60";
        apertureInput.setAttribute("aria-label", "Aperture strength");
        const apertureValue = document.createElement("span");
        apertureValue.className = "rt-dock__slider-value";
        apertureValue.textContent = apertureInput.value;
        refreshRangeFill(apertureInput);
        const applyBtn = document.createElement("button");
        applyBtn.className = "rt-dock__chip rt-dock__chip--primary";
        applyBtn.textContent = "Apply";
        const clearBtn = document.createElement("button");
        clearBtn.className = "rt-dock__chip";
        clearBtn.textContent = "Clear";

        let prep: ReturnType<typeof prepareBokeh> | null = null;
        let depthMapRef: Awaited<ReturnType<typeof estimateDepth>> | null = null;
        let focus = 0.75;
        let busy = false;

        function syncState(): void {
          const neutral = geometryIsNeutral(ctx.edits as ImageEdits);
          if (!neutral) {
            status.textContent =
              "Depth needs the un-transformed image — reset crop/transform/liquify first";
          } else if (busy) {
            // run drives the status
          } else if (prep) {
            status.textContent = "Click to focus, tune Aperture, then Apply";
          } else {
            status.textContent = "Analyze the photo, then click what should stay sharp";
          }
          analyzeBtn.disabled = busy || !neutral;
          applyBtn.disabled = busy || !prep || !neutral;
          clearBtn.disabled = busy || !prep;
          apertureInput.disabled = !prep;
        }

        function recompose(): void {
          if (!prep) return;
          surface.setPreview(composeBokeh(prep, focus, Number(apertureInput.value) / 100));
        }

        const surface = createDepthSurface(ctx.canvasArea, (x, y) => {
          if (!prep || !depthMapRef || busy) return;
          focus = depthAt(depthMapRef, x, y);
          recompose();
          status.textContent = "Focus set — tune Aperture, then Apply";
        });

        analyzeBtn.addEventListener("click", async () => {
          if (busy || activeRuns.has("depth") || ctx.entry.kind !== "image") return;
          if (!geometryIsNeutral(ctx.edits as ImageEdits)) return;
          busy = true;
          activeRuns.add("depth");
          syncState();
          try {
            status.textContent = "Preparing model…";
            depthMapRef = await estimateDepth(ctx.entry.image, {
              ...depthOptions,
              onDownloadProgress: downloadStatus(status, depthOptions.onDownloadProgress),
            });
            status.textContent = "Preparing preview…";
            await new Promise((r) => setTimeout(r, 0));
            prep = prepareBokeh(ctx.entry.image, depthMapRef, 1280);
            recompose();
          } catch (error) {
            status.textContent = "Depth analysis failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("depth");
            syncState();
          }
        });

        apertureInput.addEventListener("input", () => {
          apertureValue.textContent = apertureInput.value;
          refreshRangeFill(apertureInput);
          recompose();
        });

        clearBtn.addEventListener("click", () => {
          if (busy) return;
          prep = null;
          surface.setPreview(null);
          syncState();
        });

        applyBtn.addEventListener("click", async () => {
          if (applyBtn.disabled || busy || !depthMapRef || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("depth");
          syncState();
          try {
            status.textContent = "Rendering at full resolution…";
            await new Promise((r) => setTimeout(r, 0));
            const image = ctx.entry.image;
            const fullPrep = prepareBokeh(
              image,
              depthMapRef,
              Math.max(image.naturalWidth, image.naturalHeight),
            );
            const result = composeBokeh(fullPrep, focus, Number(apertureInput.value) / 100);
            const type = ctx.entry.file.type === "image/jpeg" ? "image/jpeg" : "image/png";
            const blob = await encodeCanvas(result, type);
            // In place — replaceImageSource remounts the editor and this pane.
            await retouch.replaceImageSource(
              ctx.entry.id,
              new File([blob], ctx.entry.file.name, { type }),
            );
          } catch (error) {
            status.textContent = "Apply failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("depth");
            syncState();
          }
        });

        syncState();
        const apertureGroup = document.createElement("div");
        apertureGroup.className = "rt-dock__group rt-dock__slider";
        apertureGroup.appendChild(apertureLabel);
        apertureGroup.appendChild(apertureInput);
        apertureGroup.appendChild(apertureValue);

        root.appendChild(status);
        root.appendChild(analyzeBtn);
        root.appendChild(apertureGroup);
        root.appendChild(applyBtn);
        root.appendChild(clearBtn);
        return {
          root,
          onActivate() {
            surface.setVisible(true);
            syncState();
          },
          onDeactivate() {
            surface.setVisible(false);
          },
          sync() {
            syncState();
          },
          destroy() {
            surface.destroy();
          },
        };
      },
    });
  }

  if (options.detect !== false) {
    const detectOptions = options.detect ?? {};
    ctor.registerTool({
      id: "detect",
      label: "Detect",
      icon: DETECT_ICON,
      group: "ai",
      description: "Find faces and objects",
      badge: "5 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const root = document.createElement("div");
        root.className = "rt-dock__row";
        const status = buildStatus();
        status.textContent = "Find faces or objects on-device, then mask, pixelate, or crop";

        const findBtn = document.createElement("button");
        findBtn.className = "rt-dock__chip";
        findBtn.textContent = "Find faces";
        const objectsBtn = document.createElement("button");
        objectsBtn.className = "rt-dock__chip";
        objectsBtn.textContent = "Find objects";
        const maskBtn = document.createElement("button");
        maskBtn.className = "rt-dock__chip";
        maskBtn.textContent = "Add masks";
        const pixelateBtn = document.createElement("button");
        pixelateBtn.className = "rt-dock__chip";
        pixelateBtn.textContent = "Pixelate";
        const cropBtn = document.createElement("button");
        cropBtn.className = "rt-dock__chip";
        cropBtn.textContent = "Crop to boxes";

        const overlay = createBoxOverlay(ctx.canvasArea);
        let faces: Detection[] = [];

        function syncActions(): void {
          const usable = faces.length > 0 && geometryIsNeutral(ctx.edits as ImageEdits);
          maskBtn.disabled = !usable;
          pixelateBtn.disabled = !usable;
          cropBtn.disabled = !usable;
        }
        syncActions();

        findBtn.addEventListener("click", async () => {
          if (activeRuns.has("detect") || ctx.entry.kind !== "image") return;
          activeRuns.add("detect");
          findBtn.disabled = true;
          try {
            status.textContent = "Detecting…";
            faces = await detectFaces(ctx.entry.image, {
              ...detectOptions,
              onDownloadProgress: downloadStatus(status, detectOptions.onDownloadProgress),
            });
            overlay.draw(faces);
            status.textContent =
              faces.length === 0
                ? "No faces found"
                : `${faces.length} face${faces.length > 1 ? "s" : ""} found`;
            if (faces.length > 0 && !geometryIsNeutral(ctx.edits as ImageEdits)) {
              status.textContent += " — reset crop/transform to use the actions";
            }
          } catch (error) {
            status.textContent = "Detection failed — check the console for details";
            console.error(error);
          } finally {
            activeRuns.delete("detect");
            findBtn.disabled = false;
            syncActions();
          }
        });

        objectsBtn.addEventListener("click", async () => {
          if (activeRuns.has("detect") || ctx.entry.kind !== "image") return;
          activeRuns.add("detect");
          objectsBtn.disabled = true;
          try {
            status.textContent = "Detecting…";
            const objectOptions = detectOptions.objects ?? {};
            faces = await detectObjects(ctx.entry.image, {
              ...objectOptions,
              onDownloadProgress: downloadStatus(status, objectOptions.onDownloadProgress),
            });
            overlay.draw(faces);
            const labels = [...new Set(faces.map((f) => f.label).filter(Boolean))];
            status.textContent =
              faces.length === 0
                ? "No objects found"
                : `${faces.length} object${faces.length > 1 ? "s" : ""}: ${labels.slice(0, 4).join(", ")}${labels.length > 4 ? "…" : ""}`;
            if (faces.length > 0 && !geometryIsNeutral(ctx.edits as ImageEdits)) {
              status.textContent += " — reset crop/transform to use the actions";
            }
          } catch (error) {
            status.textContent = "Detection failed — check the console for details";
            console.error(error);
          } finally {
            activeRuns.delete("detect");
            objectsBtn.disabled = false;
            syncActions();
          }
        });

        maskBtn.addEventListener("click", () => {
          if (maskBtn.disabled) return;
          for (const f of faces) {
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
          status.textContent = `Added ${faces.length} radial mask${faces.length > 1 ? "s" : ""} — tune them in the Masks tab`;
        });

        pixelateBtn.addEventListener("click", async () => {
          if (pixelateBtn.disabled || activeRuns.has("detect") || ctx.entry.kind !== "image")
            return;
          activeRuns.add("detect");
          pixelateBtn.disabled = true;
          try {
            status.textContent = "Pixelating…";
            const canvas = document.createElement("canvas");
            canvas.width = ctx.entry.image.naturalWidth;
            canvas.height = ctx.entry.image.naturalHeight;
            const cctx = canvas.getContext("2d");
            if (!cctx) throw new Error("[Retouch ML] Failed to create canvas context");
            cctx.drawImage(ctx.entry.image, 0, 0);
            for (const f of faces) pixelateRegion(canvas, f);
            const type = ctx.entry.file.type === "image/jpeg" ? "image/jpeg" : "image/png";
            const blob = await encodeCanvas(canvas, type);
            await retouch.replaceImageSource(
              ctx.entry.id,
              new File([blob], ctx.entry.file.name, { type }),
            );
          } catch (error) {
            status.textContent = "Pixelate failed — check the console for details";
            console.error(error);
          } finally {
            activeRuns.delete("detect");
            syncActions();
          }
        });

        cropBtn.addEventListener("click", () => {
          if (cropBtn.disabled) return;
          let x0 = 1;
          let y0 = 1;
          let x1 = 0;
          let y1 = 0;
          for (const f of faces) {
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
          faces = [];
          syncActions();
          status.textContent = "Cropped to the detected faces — undo to revert";
        });

        root.appendChild(status);
        root.appendChild(findBtn);
        root.appendChild(objectsBtn);
        root.appendChild(maskBtn);
        root.appendChild(pixelateBtn);
        root.appendChild(cropBtn);
        return {
          root,
          onActivate() {
            overlay.setVisible(true);
          },
          onDeactivate() {
            overlay.setVisible(false);
          },
          sync() {
            syncActions();
          },
          destroy() {
            overlay.destroy();
          },
        };
      },
    });
  }

  if (options.upscale !== false) {
    const upscaleOptions = options.upscale ?? {};
    ctor.registerTool({
      id: "upscale",
      label: "Upscale",
      icon: UPSCALE_ICON,
      group: "ai",
      description: "Four times the resolution",
      badge: "67 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const hint = "On-device 4× super-resolution — the result is added as a new image";
        const { root, status, button } = buildRunPane(hint, "Upscale 4×");
        let busy = false;
        button.addEventListener("click", async () => {
          if (busy || activeRuns.has("upscale") || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("upscale");
          button.disabled = true;
          try {
            status.textContent = "Preparing model…";
            const result = await upscaleImage(ctx.entry.image, {
              ...upscaleOptions,
              onDownloadProgress: downloadStatus(status, upscaleOptions.onDownloadProgress),
              onTileProgress: (done, total) => {
                status.textContent = `Upscaling… tile ${done}/${total}`;
                upscaleOptions.onTileProgress?.(done, total);
              },
            });
            status.textContent = "Encoding…";
            // JPEG only for JPEG sources: everything else keeps alpha via PNG.
            const type = ctx.entry.file.type === "image/jpeg" ? "image/jpeg" : "image/png";
            const blob = await encodeCanvas(result, type);
            const name = resultFileName(ctx.entry.file.name, "upscaled", type);
            const before = retouch.getMedia().length;
            await retouch.addFiles([new File([blob], name, { type })]);
            const added = retouch.getMedia().length > before;
            status.textContent = added
              ? "Done — upscaled image added to the gallery"
              : "The result was rejected — likely over the size limit";
            if (added && options.openResults !== false) openLatestResult(retouch);
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            status.textContent = message.includes("input limit")
              ? `Image is too large to upscale (${upscaleOptions.maxInputDim ?? 2048}px max edge)`
              : "Upscale failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("upscale");
            button.disabled = false;
          }
        });
        return { root };
      },
    });
  }

  if (options.denoise !== false) {
    const denoiseOptions = options.denoise ?? {};
    ctor.registerTool({
      id: "denoise",
      label: "Denoise",
      icon: DENOISE_ICON,
      group: "ai",
      description: "Clean up sensor noise",
      badge: "77 MB",
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const hint = "On-device noise removal — replaces this image in place";
        const { root, status, button } = buildRunPane(hint, "Remove noise");
        let busy = false;
        button.addEventListener("click", async () => {
          if (busy || activeRuns.has("denoise") || ctx.entry.kind !== "image") return;
          busy = true;
          activeRuns.add("denoise");
          button.disabled = true;
          try {
            status.textContent = "Preparing model…";
            const result = await denoiseImage(ctx.entry.image, {
              ...denoiseOptions,
              onDownloadProgress: downloadStatus(status, denoiseOptions.onDownloadProgress),
              onTileProgress: (done, total) => {
                status.textContent = `Denoising… tile ${done}/${total}`;
                denoiseOptions.onTileProgress?.(done, total);
              },
            });
            status.textContent = "Encoding…";
            const type = ctx.entry.file.type === "image/jpeg" ? "image/jpeg" : "image/png";
            const blob = await encodeCanvas(result, type);
            // In place — replaceImageSource remounts the editor and this pane.
            // Pixels map 1:1, so existing crop/mask edits stay valid.
            await retouch.replaceImageSource(
              ctx.entry.id,
              new File([blob], ctx.entry.file.name, { type }),
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : "";
            status.textContent = message.includes("input limit")
              ? `Image is too large to denoise (${denoiseOptions.maxInputDim ?? 2048}px max edge)`
              : "Denoise failed — check the console for details";
            console.error(error);
          } finally {
            busy = false;
            activeRuns.delete("denoise");
            button.disabled = false;
          }
        });
        return { root };
      },
    });
  }
}
