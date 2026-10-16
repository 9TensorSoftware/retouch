import { REMOVE_RGB, rgba } from "./colors";
import type { MaskStroke } from "./inpaint";

/**
 * Brush surface for the Erase tool: a canvas overlaid on the editor's
 * preview canvas where drags paint red mask dabs, under a ring the size of
 * the brush. Strokes are stored normalized (x, y in 0–1; radius as a
 * fraction of height), so they map straight onto the source image when
 * geometry is neutral.
 */

export interface EraseSurfaceHandle {
  getStrokes(): MaskStroke[];
  hasStrokes(): boolean;
  clear(): void;
  setBrush(sizeFraction: number): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

export function createEraseSurface(
  canvasArea: HTMLElement,
  onStrokesChange: () => void,
): EraseSurfaceHandle {
  const target = canvasArea.querySelector("canvas");
  const container = target?.parentElement;
  const overlay = document.createElement("canvas");
  overlay.className = "rt-ml-erase-overlay";
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;cursor:none;touch-action:none;display:none;";
  container?.appendChild(overlay);

  let strokes: MaskStroke[] = [];
  let brush = 0.06;
  let painting = false;
  /** Pointer position (normalized) while it's over the photo, for the ring. */
  let hover: { x: number; y: number } | null = null;

  function syncSize(): void {
    const w = Math.max(1, Math.round(overlay.clientWidth));
    const h = Math.max(1, Math.round(overlay.clientHeight));
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
  }

  function redraw(): void {
    syncSize();
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.fillStyle = rgba(REMOVE_RGB, 0.45);
    for (const s of strokes) {
      ctx.beginPath();
      ctx.arc(s.x * overlay.width, s.y * overlay.height, s.r * overlay.height, 0, Math.PI * 2);
      ctx.fill();
    }
    if (hover) drawRing(ctx, hover.x * overlay.width, hover.y * overlay.height);
  }

  /** The brush ring: a dark halo under a light ring, so it reads on any photo. */
  function drawRing(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // The editor may be magnifying the stage; keep the ring's lines thin.
    const zoom = overlay.getBoundingClientRect().width / Math.max(1, overlay.clientWidth) || 1;
    const radius = brush * overlay.height;
    ctx.save();
    for (const [width, color] of [
      [3.5, "rgba(0,0,0,0.45)"],
      [1.5, "#fff"],
    ] as const) {
      ctx.lineWidth = width / zoom;
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, 2 / zoom, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function positionOf(e: PointerEvent): { x: number; y: number } | null {
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return null;
    return {
      x: (e.clientX - bounds.left) / bounds.width,
      y: (e.clientY - bounds.top) / bounds.height,
    };
  }

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (overlay.style.display !== "none") redraw();
        })
      : null;
  if (container) observer?.observe(container);

  function dab(e: PointerEvent): void {
    const at = positionOf(e);
    if (!at) return;
    strokes.push({ ...at, r: brush });
    hover = at;
    redraw();
    onStrokesChange();
  }

  overlay.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    painting = true;
    try {
      overlay.setPointerCapture(e.pointerId);
    } catch {
      // synthetic pointers may not support capture
    }
    dab(e);
  });
  overlay.addEventListener("pointermove", (e) => {
    if (painting) {
      dab(e);
      return;
    }
    hover = positionOf(e);
    redraw();
  });
  overlay.addEventListener("pointerleave", () => {
    hover = null;
    redraw();
  });
  const stop = () => {
    painting = false;
  };
  overlay.addEventListener("pointerup", stop);
  overlay.addEventListener("pointercancel", stop);

  return {
    getStrokes: () => [...strokes],
    hasStrokes: () => strokes.length > 0,
    clear() {
      strokes = [];
      redraw();
      onStrokesChange();
    },
    setBrush(sizeFraction) {
      brush = sizeFraction;
      if (hover) redraw();
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
