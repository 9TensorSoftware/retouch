import type { EditMask, ImageEdits, Retouch, ToolContext } from "@9tensor/retouch";
import { type CutoutOptions, removeBackground } from "./cutout";
import { type DetectFacesOptions, type Detection, detectFaces } from "./detect";
import { createEraseSurface } from "./erase-tool";
import { type InpaintOptions, inpaintStrokes } from "./inpaint";
import { type UpscaleOptions, upscaleImage } from "./upscale";

export interface MlToolsOptions {
  cutout?: CutoutOptions | false;
  upscale?: UpscaleOptions | false;
  erase?: InpaintOptions | false;
  detect?: DetectFacesOptions | false;
}

const CUTOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a9 9 0 109 9" stroke-dasharray="3 3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4"/></svg>';

const DETECT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="10" cy="11" r="2.4"/><path d="M14.5 15.5c-.9-1.4-2.6-2.3-4.5-2.3s-3.6.9-4.5 2.3" transform="translate(1.5 -1)"/></svg>';

const ERASE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 4l6 6-9 9H7l-4-4 11-11z"/><path d="M9 9l6 6M3 21h18"/></svg>';

const UPSCALE_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 15l-4 4M8 19H5v-3M15 9l4-4M16 5h3v3"/></svg>';

interface RunPaneParts {
  root: HTMLElement;
  status: HTMLElement;
  button: HTMLButtonElement;
}

function buildRunPane(hint: string, action: string): RunPaneParts {
  const root = document.createElement("div");
  root.className = "rt-dock__row";
  const status = document.createElement("span");
  status.className = "rt-dock__slider-label";
  status.textContent = hint;
  const button = document.createElement("button");
  button.className = "rt-dock__chip";
  button.textContent = action;
  root.appendChild(status);
  root.appendChild(button);
  return { root, status, button };
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
    ctx.strokeStyle = "rgba(94, 210, 120, 0.95)";
    ctx.lineWidth = 2;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(94, 210, 120, 0.95)";
    for (const b of boxes) {
      ctx.strokeRect(b.x * w, b.y * h, b.w * w, b.h * h);
      ctx.fillText(`${Math.round(b.score * 100)}%`, b.x * w + 3, b.y * h - 4);
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
              onDownloadProgress: (p) => {
                const pct = p.total > 0 ? ` ${Math.round((p.loaded / p.total) * 100)}%` : "";
                status.textContent = `Downloading model…${pct}`;
                cutoutOptions.onDownloadProgress?.(p);
              },
            });
            status.textContent = "Compositing…";
            const blob = await encodeCanvas(result, "image/png");
            const name = resultFileName(ctx.entry.file.name, "cutout", "image/png");
            const before = retouch.getMedia().length;
            await retouch.addFiles([new File([blob], name, { type: "image/png" })]);
            status.textContent =
              retouch.getMedia().length > before
                ? "Done — cutout added to the gallery"
                : "The result was rejected — likely over the size limit";
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
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const root = document.createElement("div");
        root.className = "rt-dock__row";
        const status = document.createElement("span");
        status.className = "rt-dock__slider-label";

        const sizeLabel = document.createElement("span");
        sizeLabel.className = "rt-dock__slider-label";
        sizeLabel.textContent = "Brush";
        const sizeInput = document.createElement("input");
        sizeInput.type = "range";
        sizeInput.min = "2";
        sizeInput.max = "20";
        sizeInput.value = "6";
        sizeInput.setAttribute("aria-label", "Brush size");

        const clearBtn = document.createElement("button");
        clearBtn.className = "rt-dock__chip";
        clearBtn.textContent = "Clear";
        const runBtn = document.createElement("button");
        runBtn.className = "rt-dock__chip";
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
              onDownloadProgress: (p) => {
                const pct = p.total > 0 ? ` ${Math.round((p.loaded / p.total) * 100)}%` : "";
                status.textContent = `Downloading model…${pct}`;
                eraseOptions.onDownloadProgress?.(p);
              },
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

  if (options.detect !== false) {
    const detectOptions = options.detect ?? {};
    ctor.registerTool({
      id: "detect",
      label: "Detect",
      icon: DETECT_ICON,
      kinds: ["image"],
      mount(ctx: ToolContext) {
        const root = document.createElement("div");
        root.className = "rt-dock__row";
        const status = document.createElement("span");
        status.className = "rt-dock__slider-label";
        status.textContent = "Find faces on-device, then mask, pixelate, or crop to them";

        const findBtn = document.createElement("button");
        findBtn.className = "rt-dock__chip";
        findBtn.textContent = "Find faces";
        const maskBtn = document.createElement("button");
        maskBtn.className = "rt-dock__chip";
        maskBtn.textContent = "Add masks";
        const pixelateBtn = document.createElement("button");
        pixelateBtn.className = "rt-dock__chip";
        pixelateBtn.textContent = "Pixelate";
        const cropBtn = document.createElement("button");
        cropBtn.className = "rt-dock__chip";
        cropBtn.textContent = "Crop to faces";

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
              onDownloadProgress: (p) => {
                const pct = p.total > 0 ? ` ${Math.round((p.loaded / p.total) * 100)}%` : "";
                status.textContent = `Downloading model…${pct}`;
                detectOptions.onDownloadProgress?.(p);
              },
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
              onDownloadProgress: (p) => {
                const pct = p.total > 0 ? ` ${Math.round((p.loaded / p.total) * 100)}%` : "";
                status.textContent = `Downloading model…${pct}`;
                upscaleOptions.onDownloadProgress?.(p);
              },
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
            status.textContent =
              retouch.getMedia().length > before
                ? "Done — upscaled image added to the gallery"
                : "The result was rejected — likely over the size limit";
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
}
