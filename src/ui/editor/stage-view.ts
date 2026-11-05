import { h, keycap } from "../h";
import { ICON_MINUS, ICON_PLUS } from "../icons";
import { keyTip } from "../key-tip";
import { motionOK } from "../motion";
import { isTouchFirst } from "../platform";
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
/** The same for a wheel, whose notches come further apart than a pinch's events. */
const WHEEL_SETTLE_MS = 320;
/** Most notches one wheel event counts for, however fast it spins. */
const MAX_WHEEL_NOTCHES = 2;
/** How quickly a notch's zoom eases in (time constant, ms). */
const GLIDE_MS = 40;
/** Zoom per pixel of continuous scroll or pinch. */
const ZOOM_PER_PX = 0.0025;
/** Double-tap zooms in by this much (and a double-tap when zoomed fits). */
const TAP_ZOOM = 2.5;
/** Two taps this close in time (ms) and space (px) make a double-tap. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;

/** Touches on these zoom and pan the photo; everything else on the stage has its own gestures. */
const BACKGROUND =
  ".rt-editor__canvas-area, .rt-editor__canvas-pane, .rt-editor__pane-content, .rt-editor__canvas-container, .canvas-container, .lower-canvas, .upper-canvas, .rt-compare-pane canvas";

/** The wheel's legacy field: notches × 120, or -3 × deltaY on a trackpad. Not in every browser. */
function wheelDeltaYOf(e: WheelEvent): number | undefined {
  return (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
}

/** Where a mouse drag pans once zoomed in: as for touch, plus a crop frame with nowhere to go. */
const MOUSE_PAN = `${BACKGROUND}, .rt-crop__selection--full, .rt-crop__selection--full :not(.rt-crop__handle)`;
/** A press has to travel this far (px) to be a pan; less stays a click. */
const PAN_START_PX = 4;
/** How long the hint about panning over a drawing tool stays up. */
const PAN_HINT_MS = 4000;

/**
 * Whether a wheel event looks like continuous scrolling (a trackpad, or a
 * smooth-scrolling mouse) and not a wheel turning notch by notch. Browsers
 * don't say, so this reads the signature: only there does wheelDeltaY track
 * deltaY. It sets the zoom's speed, so a wrong guess costs little.
 */
export function isContinuousScroll(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return false;
  const legacy = wheelDeltaYOf(e);
  return legacy !== undefined && Math.abs(legacy + 3 * e.deltaY) < 1;
}

/**
 * How many notches a wheel turned, up positive. deltaY can't say on its own:
 * one notch is 4 px or more on a Mac, depending on speed, and 100 elsewhere.
 */
export function wheelNotches(e: WheelEvent): number {
  if (e.deltaMode !== 0) return -e.deltaY / 3;
  const legacy = wheelDeltaYOf(e);
  return legacy ? legacy / 120 : -e.deltaY / 100;
}

/**
 * Zoom and pan for a pinch: the zoom scales with the spread of the two
 * fingers, and the photo point that started under their midpoint stays
 * under it as they move. Points are offsets from the stage center.
 */
export function pinchView(
  start: { zoom: number; pan: Point; mid: Point; distance: number },
  mid: Point,
  distance: number,
  maxZoom: number,
): { zoom: number; pan: Point } {
  const zoom = Math.min(maxZoom, Math.max(1, (start.zoom * distance) / start.distance));
  const at = zoomAround(start.pan, start.mid, start.zoom, zoom);
  return { zoom, pan: { x: at.x + mid.x - start.mid.x, y: at.y + mid.y - start.mid.y } };
}

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

/** What the stage needs from whatever draws the photo. */
export type StageRenderer = Pick<
  CanvasRenderer,
  "getViewScales" | "getImageRect" | "setViewZoom" | "setScreenScale" | "onRender" | "render"
>;

export interface StageViewOptions {
  /** The stage: zoom and pan gestures land here, and it clips the canvas. */
  area: HTMLElement;
  /** What gets panned and scaled: the renderer's container, overlays included. */
  target: HTMLElement;
  renderer: StageRenderer;
  /** Space + drag pans. Off for video, where Space plays. */
  spacePan: boolean;
  /** After every view change, so overlays and readouts can re-measure. */
  onChange: () => void;
  /** After someone zooms or moves this view, and not when it's redrawn or told to. */
  onView?: () => void;
  /** What the photo may slide within, when that isn't the whole stage. */
  viewport?: () => HTMLElement;
  /** Gestures starting on these belong to something else on the stage. */
  ignore?: string;
  signal: AbortSignal;
}

/** Where a view is, in terms another photo can take up: its zoom over fit, and its pan as a share of the photo on screen. */
export interface ViewState {
  zoom: number;
  x: number;
  y: number;
}

export interface StageView {
  /** The floating zoom controls. */
  root: HTMLElement;
  /** Zoom by a factor, keeping `around` (offset from the stage center) still. */
  zoomBy(factor: number, around?: Point): void;
  fitToScreen(): void;
  actualPixels(): void;
  getView(): ViewState;
  /** Go where another view is, as far as this photo can. */
  setView(view: ViewState): void;
  /** + / - zoom, 0 fits. True when the key was handled. */
  handleKey(e: KeyboardEvent): boolean;
}

/**
 * Zoom and pan for the editor stage. Changes apply instantly as a CSS
 * transform on the canvas container, then the renderer redraws sharp at the
 * new size once input settles; past the preview's own resolution the CSS
 * scale simply stays. Zoom with the wheel, a trackpad's scroll or pinch, the
 * keys, or the controls; pan by dragging the photo, where the tool leaves that
 * free, or with a sideways scroll, middle-drag, or Space-drag. On touch: pinch to zoom, two fingers to pan, one finger on the
 * photo to pan once zoomed in, and double-tap to zoom in or back to fit.
 */
export function createStageView(options: StageViewOptions): StageView {
  const { area, target, renderer, signal } = options;
  let zoom = 1;
  let pan: Point = { x: 0, y: 0 };
  let settleTimer = 0;
  /** In setView: this view is following, so it's nothing for onView to pass on. */
  let following = false;

  const outBtn = h("button", {
    type: "button",
    class: "rt-zoom__btn",
    "aria-label": "Zoom out",
    "aria-keyshortcuts": "-",
  });
  outBtn.innerHTML = ICON_MINUS;
  const inBtn = h("button", {
    type: "button",
    class: "rt-zoom__btn",
    "aria-label": "Zoom in",
    "aria-keyshortcuts": "+",
  });
  inBtn.innerHTML = ICON_PLUS;
  const value = h("span", { class: "rt-zoom__value" });
  const fitBtn = h(
    "button",
    {
      type: "button",
      class: "rt-zoom__text",
      "aria-label": "Fit to screen",
      "aria-keyshortcuts": "0",
    },
    "Fit",
  );
  const actualBtn = h(
    "button",
    { type: "button", class: "rt-zoom__text rt-zoom__actual", title: "Actual pixels" },
    "1:1",
  );
  const hint = h(
    "div",
    { class: "rt-zoom__hint", role: "status", hidden: true },
    ...(options.spacePan
      ? ["Hold ", keycap("Space"), " and drag to move"]
      : ["Drag with the middle button to move"]),
  );
  const root = h(
    "div",
    { class: "rt-zoom", role: "group", "aria-label": "Zoom" },
    hint,
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

  function ignored(e: Event): boolean {
    return !!options.ignore && !!(e.target as Element).closest(options.ignore);
  }

  /** The photo's size on screen at the current zoom. */
  function shownSize(): Size {
    const { fit, draw } = renderer.getViewScales();
    const rect = renderer.getImageRect();
    const css = draw > 0 ? (fit * zoom) / draw : 1;
    return { width: rect.width * css, height: rect.height * css };
  }

  /** Write the transform for the current zoom/pan against the canvas as drawn. */
  function apply(redrawn = false): void {
    // A bigger stage or a tighter crop can leave the zoom past the limit for the new fit.
    zoom = Math.min(zoom, maxZoom());
    const { fit, draw } = renderer.getViewScales();
    const raw = draw > 0 ? (fit * zoom) / draw : 1;
    const css = Math.abs(raw - 1) < 1e-3 ? 1 : raw;
    const rect = renderer.getImageRect();
    const frame = options.viewport?.() ?? area;
    pan = clampPan(
      pan,
      { width: rect.width * css, height: rect.height * css },
      { width: frame.clientWidth, height: frame.clientHeight },
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
    if (!redrawn && !following) options.onView?.();
  }

  /**
   * Redraw sharp once input pauses, when the canvas needs another size (the
   * render itself re-applies via onRender).
   */
  function settle(delay = SETTLE_MS): void {
    clearTimeout(settleTimer);
    // Until then the stage only rescales what's already painted, on its own layer.
    target.style.willChange = "transform";
    settleTimer = window.setTimeout(() => {
      if (signal.aborted) return;
      target.style.willChange = "";
      if (renderer.setViewZoom(zoom)) renderer.render();
      offerPanHint();
    }, delay);
  }

  let hinted = false;
  let hintTimer = 0;

  function hideHint(): void {
    clearTimeout(hintTimer);
    hint.hidden = true;
  }

  /**
   * Once per photo: if a tool covers the stage (a brush, say), a drag is the
   * tool's, so say how to move around. Small things in the way (a divider, a
   * gizmo's dot) leave plenty of photo to drag.
   */
  function offerPanHint(): void {
    if (hinted || zoom <= 1 || isTouchFirst()) return;
    const box = area.getBoundingClientRect();
    const over = document.elementFromPoint?.(box.left + box.width / 2, box.top + box.height / 2);
    if (!over || !area.contains(over) || over.matches(MOUSE_PAN)) return;
    if (over.getBoundingClientRect().width < box.width / 2) return;
    hinted = true;
    hint.hidden = false;
    hintTimer = window.setTimeout(hideHint, PAN_HINT_MS);
  }

  function setZoom(next: number, around: Point = { x: 0, y: 0 }, delay = SETTLE_MS): void {
    const clamped = Math.min(maxZoom(), Math.max(1, next));
    if (clamped === zoom) return;
    pan = clamped === 1 ? { x: 0, y: 0 } : zoomAround(pan, around, zoom, clamped);
    zoom = clamped;
    apply();
    settle(delay);
  }

  /** A notch's zoom, eased in over a few frames, so turning the wheel doesn't jump. */
  let glide: { to: number; around: Point; last: number; frame: number } | null = null;

  function stopGlide(): void {
    if (glide) cancelAnimationFrame(glide.frame);
    glide = null;
  }

  function glideStep(now: number): void {
    if (!glide) return;
    const eased = 1 - Math.exp(-Math.max(0, now - glide.last) / GLIDE_MS);
    glide.last = now;
    const { to, around } = glide;
    const next = zoom * (to / zoom) ** eased;
    if (Math.abs(next / to - 1) < 0.005) {
      glide = null;
      setZoom(to, around, WHEEL_SETTLE_MS);
    } else {
      setZoom(next, around, WHEEL_SETTLE_MS);
      glide.frame = requestAnimationFrame(glideStep);
    }
  }

  function glideZoom(factor: number, around: Point): void {
    const to = Math.min(maxZoom(), Math.max(1, (glide?.to ?? zoom) * factor));
    if (glide) {
      glide.to = to;
      glide.around = around;
    } else if (!motionOK()) {
      setZoom(to, around, WHEEL_SETTLE_MS);
    } else {
      glide = {
        to,
        around,
        last: performance.now(),
        frame: requestAnimationFrame(glideStep),
      };
    }
  }

  const fitToScreen = (): void => {
    stopGlide();
    pan = { x: 0, y: 0 };
    const wasZoomed = zoom !== 1;
    zoom = 1;
    apply();
    if (wasZoomed) settle();
  };
  const actualPixels = (): void => setZoom(1 / renderer.getViewScales().fit);

  keyTip(outBtn, "Zoom out", "−", signal);
  keyTip(inBtn, "Zoom in", "+", signal);
  keyTip(fitBtn, "Fit to screen", "0", signal);
  outBtn.addEventListener("click", () => setZoom(zoom / STEP), { signal });
  inBtn.addEventListener("click", () => setZoom(zoom * STEP), { signal });
  fitBtn.addEventListener("click", fitToScreen, { signal });
  actualBtn.addEventListener("click", actualPixels, { signal });

  renderer.onRender(() => apply(true));
  signal.addEventListener("abort", () => {
    clearTimeout(settleTimer);
    clearTimeout(hintTimer);
    stopGlide();
    renderer.onRender(null);
  });

  // ── Wheel: up and down zoom at the cursor; sideways pans when zoomed ──

  area.addEventListener(
    "wheel",
    (e) => {
      if ((e.target as Element).closest(".rt-ai") || ignored(e)) return;
      e.preventDefault();
      if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        if (zoom > 1) {
          pan = { x: pan.x - e.deltaX, y: pan.y };
          apply();
        }
      } else if (e.ctrlKey || e.metaKey || isContinuousScroll(e)) {
        const perUnit = e.deltaMode === 1 ? 0.05 : ZOOM_PER_PX;
        setZoom(zoom * Math.exp(-e.deltaY * perUnit), offsetOf(e), WHEEL_SETTLE_MS);
      } else {
        const notches = Math.max(-MAX_WHEEL_NOTCHES, Math.min(MAX_WHEEL_NOTCHES, wheelNotches(e)));
        glideZoom(STEP ** notches, offsetOf(e));
      }
    },
    { passive: false, signal },
  );

  // ── Drag to pan: on the photo where the tool leaves it free, or middle button, or Space held ──

  let spaceHeld = false;
  let drag: { x: number; y: number; from: Point; id: number; moved: boolean } | null = null;

  function startPanning(id: number): void {
    hideHint();
    try {
      area.setPointerCapture(id);
    } catch {
      // synthetic pointers may not support capture
    }
    area.classList.add("rt-stage--panning");
  }

  area.addEventListener(
    "pointerdown",
    (e) => {
      if (zoom <= 1 || ignored(e)) return;
      const from = { x: e.clientX, y: e.clientY, from: { ...pan }, id: e.pointerId };
      if (e.button === 1 || (spaceHeld && e.button === 0)) {
        // Captured here first, so crop handles and brushes never see the drag.
        e.preventDefault();
        e.stopPropagation();
        drag = { ...from, moved: true };
        startPanning(e.pointerId);
        return;
      }
      const over = e.target as Element;
      if (e.button !== 0 || e.ctrlKey || e.pointerType === "touch" || !over.matches(MOUSE_PAN)) {
        return;
      }
      if (area.classList.contains("rt-editor__canvas-area--picking")) return;
      // Tools don't listen on the background, but a crop frame would start moving.
      if (!over.matches(BACKGROUND)) e.stopPropagation();
      drag = { ...from, moved: false };
    },
    { capture: true, signal },
  );
  area.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < PAN_START_PX) return;
        drag.moved = true;
        startPanning(e.pointerId);
      }
      pan = { x: drag.from.x + dx, y: drag.from.y + dy };
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
  // The browser's own drag, of a text selection say, would cancel the pointer and end the pan.
  area.addEventListener(
    "dragstart",
    (e) => {
      const node = e.target as Node;
      const el = node instanceof Element ? node : node.parentElement;
      if (!el?.closest(".rt-ai")) e.preventDefault();
    },
    { capture: true, signal },
  );

  // ── Touch: pinch, two-finger pan, one-finger pan when zoomed, double-tap ──

  /** Touch points down on the stage, by pointer id. */
  const touches = new Map<number, Point>();
  /** Fingers that took part in a pinch: nothing else hears them until they lift. */
  const held = new Set<number>();
  let pinch: { zoom: number; pan: Point; mid: Point; distance: number } | null = null;
  let touchPan: { id: number; x: number; y: number; from: Point; moved: boolean } | null = null;
  let press: { id: number; t: number; x: number; y: number; background: boolean } | null = null;
  let lastTap: { t: number; x: number; y: number } | null = null;

  function spread(): { mid: Point; distance: number } {
    const [a, b] = [...touches.values()];
    return {
      mid: offsetOf({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }),
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    };
  }

  area.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch" || ignored(e)) return;
      if ((e.target as Element).closest(".rt-ai, .rt-zoom")) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size >= 2) {
        // Another finger: a pinch. Tools never hear this finger, and stop hearing the first.
        e.preventDefault();
        e.stopPropagation();
        for (const id of touches.keys()) held.add(id);
        touchPan = null;
        press = null;
        if (touches.size === 2) pinch = { zoom, pan: { ...pan }, ...spread() };
        return;
      }
      const background = (e.target as Element).matches(BACKGROUND);
      press = { id: e.pointerId, t: e.timeStamp, x: e.clientX, y: e.clientY, background };
      if (background && zoom > 1) {
        touchPan = { id: e.pointerId, x: e.clientX, y: e.clientY, from: { ...pan }, moved: false };
      }
    },
    { capture: true, signal },
  );

  // On the window, in the capture phase: a pinch has to outrank the tools'
  // own move handlers, wherever the fingers wander.
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && touches.size >= 2) {
        e.stopPropagation();
        const { mid, distance } = spread();
        ({ zoom, pan } = pinchView(pinch, mid, distance, maxZoom()));
        apply();
        settle();
      } else if (held.has(e.pointerId)) {
        e.stopPropagation();
      } else if (touchPan && e.pointerId === touchPan.id) {
        const dx = e.clientX - touchPan.x;
        const dy = e.clientY - touchPan.y;
        if (!touchPan.moved && Math.hypot(dx, dy) < 6) return;
        touchPan.moved = true;
        e.stopPropagation();
        pan = { x: touchPan.from.x + dx, y: touchPan.from.y + dy };
        apply();
      }
    },
    { capture: true, signal },
  );

  const lift = (e: PointerEvent): void => {
    if (!touches.has(e.pointerId)) return;
    touches.delete(e.pointerId);
    held.delete(e.pointerId);
    if (touches.size < 2) pinch = null;
    if (touchPan?.id === e.pointerId) touchPan = null;
    // A quick, still tap on the photo; two in a row zoom in, or back to fit.
    const tap =
      press?.id === e.pointerId &&
      press.background &&
      e.type === "pointerup" &&
      e.timeStamp - press.t < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10;
    if (press?.id === e.pointerId) press = null;
    if (!tap) return;
    if (
      lastTap &&
      e.timeStamp - lastTap.t < DOUBLE_TAP_MS &&
      Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_TAP_PX
    ) {
      lastTap = null;
      if (zoom > 1) fitToScreen();
      else setZoom(zoom * TAP_ZOOM, offsetOf(e));
    } else {
      lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  };
  window.addEventListener("pointerup", lift, { capture: true, signal });
  window.addEventListener("pointercancel", lift, { capture: true, signal });

  if (options.spacePan) {
    const typing = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key !== " " || typing(e.target)) return;
        // Choosing a tool leaves its button focused: with the pointer on the zoomed
        // stage, Space is for panning, not for pressing that button again.
        if (e.target instanceof HTMLButtonElement) {
          if (zoom <= 1 || !area.matches(":hover")) return;
          e.preventDefault();
        }
        spaceHeld = true;
        area.classList.add("rt-stage--grab");
      },
      { signal },
    );
    document.addEventListener(
      "keyup",
      (e) => {
        if (e.key !== " ") return;
        if (spaceHeld && e.target instanceof HTMLButtonElement) e.preventDefault();
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
    getView() {
      const shown = shownSize();
      return {
        zoom,
        x: shown.width > 0 ? pan.x / shown.width : 0,
        y: shown.height > 0 ? pan.y / shown.height : 0,
      };
    },
    setView(view) {
      stopGlide();
      const next = Math.min(maxZoom(), Math.max(1, view.zoom));
      const rezoomed = next !== zoom;
      zoom = next;
      const shown = shownSize();
      pan = { x: view.x * shown.width, y: view.y * shown.height };
      following = true;
      apply();
      following = false;
      if (rezoomed) settle();
    },
    handleKey(e) {
      if (e.key === "+" || e.key === "=") setZoom(zoom * STEP);
      else if (e.key === "-" || e.key === "_") setZoom(zoom / STEP);
      else if (e.key === "0") fitToScreen();
      else return false;
      return true;
    },
  };
}
