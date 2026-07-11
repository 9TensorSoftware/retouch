import type { CanvasRenderer } from "./canvas-renderer";

export interface LiquifyOverlayOptions {
  container: HTMLElement;
  renderer: CanvasRenderer;
  /** Current brush: size as a fraction of frame height, strength 0–100. */
  getBrush(): { size: number; strength: number };
  /**
   * A stroke segment: normalized position, normalized movement, brush in
   * frame-height units, and the frame aspect for a round on-screen brush.
   */
  onStroke(x: number, y: number, dx: number, dy: number, radius: number, aspect: number): void;
  /** Pointer released — record the accumulated stroke as one history step. */
  onCommit(): void;
}

export interface LiquifyOverlayHandle {
  root: HTMLElement;
  setVisible(visible: boolean): void;
  destroy(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Full-canvas pointer surface for the liquify brush: shows a circle cursor
 * sized to the brush and streams drag segments as displacement pushes.
 * Stroke segments coalesce per animation frame so the remap cost never
 * outruns pointer events.
 */
export function createLiquifyOverlay(options: LiquifyOverlayOptions): LiquifyOverlayHandle {
  const { container, renderer, getBrush, onStroke, onCommit } = options;
  const abort = new AbortController();
  const signal = abort.signal;

  const root = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  root.setAttribute("class", "rt-liquify-overlay");
  const cursor = document.createElementNS(SVG_NS, "circle");
  cursor.setAttribute("class", "rt-liquify-overlay__cursor");
  cursor.setAttribute("r", "40");
  cursor.style.display = "none";
  root.appendChild(cursor);
  container.appendChild(root);

  let dragging = false;
  let last: { x: number; y: number } | null = null;
  /** Movement accumulated since the last applied frame, in overlay px. */
  let pending: { x: number; y: number; dx: number; dy: number } | null = null;
  let rafId = 0;

  function rect() {
    return renderer.getImageRect();
  }

  function toLocal(e: PointerEvent): { x: number; y: number } {
    const bounds = root.getBoundingClientRect();
    return { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
  }

  function updateCursor(x: number, y: number): void {
    const r = rect();
    cursor.setAttribute("cx", String(x));
    cursor.setAttribute("cy", String(y));
    cursor.setAttribute("r", String(Math.max(6, getBrush().size * r.height)));
    cursor.style.display = "";
  }

  function flush(): void {
    rafId = 0;
    const move = pending;
    pending = null;
    if (!move) return;
    const r = rect();
    if (r.width <= 0 || r.height <= 0) return;
    onStroke(
      (move.x - r.x) / r.width,
      (move.y - r.y) / r.height,
      move.dx / r.width,
      move.dy / r.height,
      getBrush().size,
      r.width / r.height,
    );
  }

  root.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      dragging = true;
      last = toLocal(e);
      try {
        root.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers may not support capture
      }
    },
    { signal },
  );
  root.addEventListener(
    "pointermove",
    (e) => {
      const p = toLocal(e);
      updateCursor(p.x, p.y);
      if (!dragging || !last) return;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      last = p;
      if (dx === 0 && dy === 0) return;
      if (pending) {
        pending.x = p.x;
        pending.y = p.y;
        pending.dx += dx;
        pending.dy += dy;
      } else {
        pending = { x: p.x, y: p.y, dx, dy };
      }
      if (!rafId) rafId = requestAnimationFrame(flush);
    },
    { signal },
  );
  const finish = () => {
    if (!dragging) return;
    dragging = false;
    last = null;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    flush();
    onCommit();
  };
  root.addEventListener("pointerup", finish, { signal });
  root.addEventListener("pointercancel", finish, { signal });
  root.addEventListener(
    "pointerleave",
    () => {
      cursor.style.display = "none";
    },
    { signal },
  );

  return {
    root: root as unknown as HTMLElement,
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
      if (!visible) cursor.style.display = "none";
    },
    destroy() {
      if (rafId) cancelAnimationFrame(rafId);
      abort.abort();
      root.remove();
    },
  };
}
