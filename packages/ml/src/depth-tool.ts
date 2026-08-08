/**
 * Preview surface for the Depth tool: an overlay canvas that shows the
 * composed bokeh in place of the plain preview and captures clicks to set
 * the focal plane. Coordinates are normalized 0–1 over the image.
 */

export interface DepthSurfaceHandle {
  /** Show a composed preview (null clears it back to the plain image). */
  setPreview(preview: HTMLCanvasElement | null): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

export function createDepthSurface(
  canvasArea: HTMLElement,
  onClick: (x: number, y: number) => void,
): DepthSurfaceHandle {
  const target = canvasArea.querySelector("canvas");
  const container = target?.parentElement;
  const overlay = document.createElement("canvas");
  overlay.className = "rt-ml-depth-overlay";
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;cursor:crosshair;touch-action:none;display:none;";
  container?.appendChild(overlay);

  let preview: HTMLCanvasElement | null = null;

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
    if (preview) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(preview, 0, 0, w, h);
    }
  }

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (overlay.style.display !== "none") redraw();
        })
      : null;
  if (container) observer?.observe(container);

  overlay.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    onClick((e.clientX - bounds.left) / bounds.width, (e.clientY - bounds.top) / bounds.height);
  });

  return {
    setPreview(next) {
      preview = next;
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
