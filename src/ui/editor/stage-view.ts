import { h } from "../h";
import { ICON_MINUS, ICON_PLUS } from "../icons";
import type { CanvasRenderer } from "./canvas-renderer";

export interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

/** Highest magnification, as on-screen size over source pixels (8 = 800%). */
const MAX_MAGNIFICATION = 8;
/** One zoom step (buttons and keys). */
const STEP = 1.25;
/** Quiet time before re-rendering sharp at the new zoom. */
const SETTLE_MS = 160;

/**
 * The pan that keeps the point under `cursor` still while zoom goes from
 * `from` to `to`. Points are offsets from the transform origin, in screen px.
 */
export function zoomAround(pan: Point, cursor: Point, from: number, to: number): Point {
  const k = to / from;
  return { x: cursor.x - (cursor.x - pan.x) * k, y: cursor.y - (cursor.y - pan.y) * k };
}

/**
 * Content may slide until its edge meets the viewport's edge, plus a little
 * slack; along an axis where it fits, it stays centered.
 */
export function clampPan(pan: Point, content: Size, viewport: Size, slack = 48): Point {
  const clamp = (p: number, c: number, v: number): number => {
    if (c <= v) return 0;
    const limit = (c - v) / 2 + slack;
    return Math.max(-limit, Math.min(limit, p));
  };
  return {
    x: clamp(pan.x, content.width, viewport.width),
    y: clamp(pan.y, content.height, viewport.height),
  };
}

export interface StageViewOptions {
  /** The stage: zoom and pan gestures land here, and it clips the canvas. */
  area: HTMLElement;
  /** What gets panned and scaled: the renderer's container, overlays included. */
  target: HTMLElement;
  renderer: CanvasRenderer;
  /** Space + drag pans. Off for video, where Space plays. */
  spacePan: boolean;
  /** After every view change, so overlays and readouts can re-measure. */
  onChange: () => void;
  signal: AbortSignal;
}

export interface StageView {
  /** The floating zoom controls. */
  root: HTMLElement;
  /** Zoom by a factor, keeping `around` (offset from the stage center) still. */
  zoomBy(factor: number, around?: Point): void;
  fitToScreen(): void;
  actualPixels(): void;
  /** Turn zooming off and back to fit, e.g. while comparing side by side. */
  setEnabled(enabled: boolean): void;
  /** + / - zoom, 0 fits. True when the key was handled. */
  handleKey(e: KeyboardEvent): boolean;
}

/**
 * Zoom and pan for the editor stage. Changes apply instantly as a CSS
 * transform on the canvas container, then the renderer redraws sharp at the
 * new size once input settles; past the preview's own resolution the CSS
 * scale simply stays. Pan with the wheel or trackpad, middle-drag, or
 * Space-drag; zoom with ⌘/Ctrl + wheel (trackpad pinch), the keys, or the
 * controls.
 */
export function createStageView(options: StageViewOptions): StageView {
  const { area, target, renderer, signal } = options;
  let zoom = 1;
  let pan: Point = { x: 0, y: 0 };
  let enabled = true;
  let settleTimer = 0;

  const outBtn = h("button", {
    type: "button",
    class: "rt-zoom__btn",
    "aria-label": "Zoom out",
    title: "Zoom out (−)",
  });
  outBtn.innerHTML = ICON_MINUS;
  const inBtn = h("button", {
    type: "button",
    class: "rt-zoom__btn",
    "aria-label": "Zoom in",
    title: "Zoom in (+)",
  });
  inBtn.innerHTML = ICON_PLUS;
  const value = h("span", { class: "rt-zoom__value" });
  const fitBtn = h(
    "button",
    { type: "button", class: "rt-zoom__text", title: "Fit to screen (0)" },
    "Fit",
  );
  const actualBtn = h(
    "button",
    { type: "button", class: "rt-zoom__text", title: "Actual pixels" },
    "1:1",
  );
  const root = h(
    "div",
    { class: "rt-zoom", role: "group", "aria-label": "Zoom" },
    outBtn,
    value,
    inBtn,
    h("span", { class: "rt-zoom__sep" }),
    fitBtn,
    actualBtn,
  );

  function maxZoom(): number {
    const { fit } = renderer.getViewScales();
    return Math.max(1, MAX_MAGNIFICATION / fit);
  }

  /** Where `e` is, relative to the canvas container's untransformed center. */
  function offsetOf(e: { clientX: number; clientY: number }): Point {
    const frame = (target.parentElement ?? area).getBoundingClientRect();
    return {
      x: e.clientX - (frame.left + frame.width / 2),
      y: e.clientY - (frame.top + frame.height / 2),
    };
  }

  /** Write the transform for the current zoom/pan against the canvas as drawn. */
  function apply(): void {
    const { fit, draw } = renderer.getViewScales();
    const raw = draw > 0 ? (fit * zoom) / draw : 1;
    const css = Math.abs(raw - 1) < 1e-3 ? 1 : raw;
    const rect = renderer.getImageRect();
    pan = clampPan(
      pan,
      { width: rect.width * css, height: rect.height * css },
      { width: area.clientWidth, height: area.clientHeight },
    );
    const identity = css === 1 && pan.x === 0 && pan.y === 0;
    target.style.transform = identity ? "" : `translate(${pan.x}px, ${pan.y}px) scale(${css})`;
    // Overlay chrome (crop frame, gizmos) divides by this to keep its size.
    target.style.setProperty("--rt-view-scale", String(css));
    renderer.setScreenScale(css);
    value.textContent = `${Math.round(fit * zoom * 100)}%`;
    outBtn.disabled = zoom <= 1;
    inBtn.disabled = zoom >= maxZoom() - 1e-6;
    area.classList.toggle("rt-stage--zoomed", zoom > 1);
    options.onChange();
  }

  /** Redraw sharp once input pauses (the render itself re-applies via onRender). */
  function settle(): void {
    clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      if (signal.aborted) return;
      renderer.setViewZoom(zoom);
      renderer.render();
    }, SETTLE_MS);
  }

  function setZoom(next: number, around: Point = { x: 0, y: 0 }): void {
    if (!enabled) return;
    const clamped = Math.min(maxZoom(), Math.max(1, next));
    if (clamped === zoom) return;
    pan = clamped === 1 ? { x: 0, y: 0 } : zoomAround(pan, around, zoom, clamped);
    zoom = clamped;
    apply();
    settle();
  }

  const fitToScreen = (): void => {
    pan = { x: 0, y: 0 };
    const wasZoomed = zoom !== 1;
    zoom = 1;
    apply();
    if (wasZoomed) settle();
  };
  const actualPixels = (): void => setZoom(1 / renderer.getViewScales().fit);

  outBtn.addEventListener("click", () => setZoom(zoom / STEP), { signal });
  inBtn.addEventListener("click", () => setZoom(zoom * STEP), { signal });
  fitBtn.addEventListener("click", fitToScreen, { signal });
  actualBtn.addEventListener("click", actualPixels, { signal });

  renderer.onRender(apply);
  signal.addEventListener("abort", () => {
    clearTimeout(settleTimer);
    renderer.onRender(null);
  });

  // ── Wheel: ⌘/Ctrl (and trackpad pinch) zooms at the cursor; otherwise pans ──

  area.addEventListener(
    "wheel",
    (e) => {
      if (!enabled || (e.target as Element).closest(".rt-ai")) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const perUnit = e.deltaMode === 1 ? 0.05 : 0.0025;
        setZoom(zoom * Math.exp(-e.deltaY * perUnit), offsetOf(e));
      } else if (zoom > 1) {
        e.preventDefault();
        pan = { x: pan.x - e.deltaX, y: pan.y - e.deltaY };
        apply();
      }
    },
    { passive: false, signal },
  );

  // ── Drag to pan: middle button, or Space held (images) ──

  let spaceHeld = false;
  let drag: { x: number; y: number; from: Point; id: number } | null = null;

  area.addEventListener(
    "pointerdown",
    (e) => {
      if (!enabled || zoom <= 1) return;
      if (e.button !== 1 && !(spaceHeld && e.button === 0)) return;
      // Captured here first, so crop handles and brushes never see the drag.
      e.preventDefault();
      e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, from: { ...pan }, id: e.pointerId };
      try {
        area.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers may not support capture
      }
      area.classList.add("rt-stage--panning");
    },
    { capture: true, signal },
  );
  area.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      pan = { x: drag.from.x + e.clientX - drag.x, y: drag.from.y + e.clientY - drag.y };
      apply();
    },
    { signal },
  );
  const endDrag = (e: PointerEvent): void => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    area.classList.remove("rt-stage--panning");
  };
  area.addEventListener("pointerup", endDrag, { signal });
  area.addEventListener("pointercancel", endDrag, { signal });

  if (options.spacePan) {
    const typing = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName));
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== " " || typing(e.target)) return;
        spaceHeld = true;
        area.classList.add("rt-stage--grab");
      },
      { signal },
    );
    document.addEventListener(
      "keyup",
      (e) => {
        if (e.key !== " ") return;
        spaceHeld = false;
        area.classList.remove("rt-stage--grab");
      },
      { signal },
    );
  }

  return {
    root,
    zoomBy: (factor, around) => setZoom(zoom * factor, around),
    fitToScreen,
    actualPixels,
    setEnabled(next) {
      if (!next) fitToScreen();
      enabled = next;
      root.hidden = !next;
    },
    handleKey(e) {
      if (!enabled) return false;
      if (e.key === "+" || e.key === "=") setZoom(zoom * STEP);
      else if (e.key === "-" || e.key === "_") setZoom(zoom / STEP);
      else if (e.key === "0") fitToScreen();
      else return false;
      return true;
    },
  };
}
