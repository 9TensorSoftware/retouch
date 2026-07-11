import type { Retouch, ToolContext } from "@9tensor/retouch";
import { type CutoutOptions, removeBackground } from "./cutout";
import { type UpscaleOptions, upscaleImage } from "./upscale";

export interface MlToolsOptions {
  cutout?: CutoutOptions | false;
  upscale?: UpscaleOptions | false;
}

const CUTOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a9 9 0 109 9" stroke-dasharray="3 3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4"/></svg>';

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
