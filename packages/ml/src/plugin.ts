import type { Retouch, ToolContext } from "@9tensor/retouch";
import { type CutoutOptions, removeBackground } from "./cutout";

export interface MlToolsOptions extends CutoutOptions {}

const CUTOUT_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3a9 9 0 109 9" stroke-dasharray="3 3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4"/></svg>';

/**
 * Register the ML feature groups on the editor. Call once, before opening
 * the editor. The instance is needed so results (new images) can land in
 * the gallery.
 */
export function installMlTools(retouch: Retouch, options: MlToolsOptions = {}): void {
  const ctor = retouch.constructor as typeof Retouch;
  ctor.registerTool({
    id: "cutout",
    label: "Cutout",
    icon: CUTOUT_ICON,
    kinds: ["image"],
    mount(ctx: ToolContext) {
      const root = document.createElement("div");
      root.className = "rt-dock__row";

      const status = document.createElement("span");
      status.className = "rt-dock__slider-label";
      status.textContent = "On-device background removal — the result is added as a new image";

      const run = document.createElement("button");
      run.className = "rt-dock__chip";
      run.textContent = "Remove background";

      let busy = false;
      run.addEventListener("click", async () => {
        if (busy) return;
        const entry = ctx.entry;
        if (entry.kind !== "image") return;
        busy = true;
        run.disabled = true;
        try {
          status.textContent = "Preparing model…";
          const result = await removeBackground(entry.image, {
            ...options,
            onDownloadProgress: (p) => {
              const pct = p.total > 0 ? ` ${Math.round((p.loaded / p.total) * 100)}%` : "";
              status.textContent = `Downloading model…${pct}`;
              options.onDownloadProgress?.(p);
            },
          });
          status.textContent = "Compositing…";
          const blob = await new Promise<Blob | null>((resolve) =>
            result.toBlob(resolve, "image/png"),
          );
          if (!blob) throw new Error("[Retouch ML] Failed to encode cutout");
          const base = entry.file.name.replace(/\.[^.]+$/, "");
          await retouch.addFiles([new File([blob], `${base}-cutout.png`, { type: "image/png" })]);
          status.textContent = "Done — cutout added to the gallery";
        } catch (error) {
          status.textContent = "Cutout failed — check the console for details";
          console.error(error);
        } finally {
          busy = false;
          run.disabled = false;
        }
      });

      root.appendChild(status);
      root.appendChild(run);
      return { root };
    },
  });
}
