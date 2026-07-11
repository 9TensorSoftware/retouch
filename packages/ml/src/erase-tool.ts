import type { MaskStroke } from "./inpaint";

/**
 * Brush surface for the Erase tool: a canvas overlaid on the editor's
 * preview canvas where drags paint red mask dabs. Strokes are stored
 * normalized (x, y in 0–1; radius as a fraction of height), so they map
 * straight onto the source image when geometry is neutral.
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
    "position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;cursor:crosshair;touch-action:none;display:none;";
  container?.appendChild(overlay);

  let strokes: MaskStroke[] = [];
  let brush = 0.06;
  let painting = false;

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
    ctx.fillStyle = "rgba(228, 77, 58, 0.45)";
    for (const s of strokes) {
      ctx.beginPath();
      ctx.arc(s.x * overlay.width, s.y * overlay.height, s.r * overlay.height, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (overlay.style.display !== "none") redraw();
        })
      : null;
  if (container) observer?.observe(container);

  function dab(e: PointerEvent): void {
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return;
    strokes.push({
      x: (e.clientX - bounds.left) / bounds.width,
      y: (e.clientY - bounds.top) / bounds.height,
      r: brush,
    });
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
    if (painting) dab(e);
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
