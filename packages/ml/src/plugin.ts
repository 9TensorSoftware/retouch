import type { ImageEdits, Retouch, ToolContext } from "@9tensor/retouch";
import { type CutoutOptions, removeBackground } from "./cutout";
import { createEraseSurface } from "./erase-tool";
import { type InpaintOptions, inpaintStrokes } from "./inpaint";
import { type UpscaleOptions, upscaleImage } from "./upscale";

export interface MlToolsOptions {
  cutout?: CutoutOptions | false;
  upscale?: UpscaleOptions | false;
  erase?: InpaintOptions | false;
}

const CUTOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a9 9 0 109 9" stroke-dasharray="3 3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4"/></svg>';

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
