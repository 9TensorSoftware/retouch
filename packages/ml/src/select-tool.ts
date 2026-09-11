import { KEEP_RGB, REMOVE_RGB, rgba } from "./colors";
import type { SamPoint } from "./sam";

/**
 * Click surface for the Select tool: a canvas overlaid on the editor's
 * preview where clicks drop segmentation prompts. Renders the current mask
 * as a tinted region plus the prompt points (green = keep, red = remove).
 */

export interface SelectSurfaceHandle {
  setMask(mask: HTMLCanvasElement | null): void;
  setPoints(points: SamPoint[]): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

export function createSelectSurface(
  canvasArea: HTMLElement,
  onClick: (x: number, y: number, shiftKey: boolean) => void,
): SelectSurfaceHandle {
  const target = canvasArea.querySelector("canvas");
  const container = target?.parentElement;
  const overlay = document.createElement("canvas");
  overlay.className = "rt-ml-select-overlay";
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;cursor:crosshair;touch-action:none;display:none;";
  container?.appendChild(overlay);

  let mask: HTMLCanvasElement | null = null;
  let points: SamPoint[] = [];

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
    if (mask) {
      // Tint the selected region: scale the binary mask, then keep only its
      // bright area filled with the accent color.
      const tint = document.createElement("canvas");
      tint.width = w;
      tint.height = h;
      const tctx = tint.getContext("2d");
      if (tctx) {
        tctx.drawImage(mask, 0, 0, w, h);
        const image = tctx.getImageData(0, 0, w, h);
        const d = image.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] > 127) {
            d[i] = KEEP_RGB[0];
            d[i + 1] = KEEP_RGB[1];
            d[i + 2] = KEEP_RGB[2];
            d[i + 3] = 110;
          } else {
            d[i + 3] = 0;
          }
        }
        tctx.putImageData(image, 0, 0);
        ctx.drawImage(tint, 0, 0);
      }
    }
    for (const p of points) {
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.label === 1 ? rgba(KEEP_RGB, 0.95) : rgba(REMOVE_RGB, 0.95);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
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
    onClick(
      (e.clientX - bounds.left) / bounds.width,
      (e.clientY - bounds.top) / bounds.height,
      e.shiftKey,
    );
  });

  return {
    setMask(next) {
      mask = next;
      redraw();
    },
    setPoints(next) {
      points = [...next];
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
