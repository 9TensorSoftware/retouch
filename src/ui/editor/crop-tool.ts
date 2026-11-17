import { ASPECT_RATIOS } from "../../constants";
import type { AspectRatioPreset, CropRect, CropShape } from "../../types";
import {
  areaOf,
  boundsOf,
  type CropShapeMode,
  containsPoint,
  frameOutline,
  isDrawnMode,
  shapeOutline,
} from "../../utils/crop-shape";
import { clamp } from "../../utils/math";
import { type AxisLock, createAxisLock, type DragAxis } from "./axis-lock";
import type { CanvasRenderer } from "./canvas-renderer";

export interface CropToolOptions {
  container: HTMLElement;
  renderer: CanvasRenderer;
  /** Fires whenever the pending crop changes (drag, aspect preset, shape, outline). */
  onChange: (selection: CropRect) => void;
}

/** The pending shape's settings: round corners (rectangle only), soft edge, and which side is kept. */
export interface CropShapeOptions {
  /** Corner rounding, 0–100 of half the short side. */
  radius: number;
  /** Soft edge, 0–100. */
  feather: number;
  /** Keep what's outside the shape. */
  invert: boolean;
}

export interface CropToolHandle {
  root: HTMLElement;
  /** Pending frame in visible-image space (0–1). Full frame = nothing to apply. */
  getSelection(): CropRect;
  /** True when the frame covers the whole visible photo. */
  isSelectionFull(): boolean;
  /** Something proposed that Cancel would take back: a frame, a shape, a point placed. */
  hasPending(): boolean;
  /** A crop ready for Apply. An outline needs three points. */
  canApply(): boolean;
  /**
   * The pending crop as a shape over the visible photo, or null when it's a
   * plain rectangle (the frame alone says it).
   */
  getShape(): CropShape | null;
  getShapeMode(): CropShapeMode;
  /** Draw with another shape. A frame shape starts on the whole photo; an outline starts empty. */
  setShapeMode(mode: CropShapeMode): void;
  getShapeOptions(): CropShapeOptions;
  setShapeOptions(options: Partial<CropShapeOptions>): void;
  /** Take back the last point of an outline still being placed; false when there's none. */
  removeLastPoint(): boolean;
  /** Back to a plain frame over the whole photo (after apply/undo/transform). */
  resetSelection(): void;
  /** Recompute overlay pixel positions from the renderer's current rect. */
  refresh(): void;
  setAspectRatio(preset: AspectRatioPreset): void;
  getAspectRatio(): AspectRatioPreset;
  setVisible(visible: boolean): void;
  destroy(): void;
}

type HandlePosition = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

const MIN_SIZE = 0.05; // Minimum selection size in normalized coords
const EPS = 1e-4;
const SVG_NS = "http://www.w3.org/2000/svg";
/** A hand-drawn line takes a point every this many screen px. */
const LASSO_STEP_PX = 2;
/** A hand-drawn outline smaller than this (screen px²) was a slip, not a shape. */
const LASSO_MIN_AREA_PX = 100;
/** A click this close to the first point closes the outline. */
const CLOSE_PX = 10;
/** A second click this close to the last point (a double-click) closes it too. */
const REPEAT_PX = 4;
/** Shapes drawn as figures: they start square, as they're drawn. */
const FIGURES = new Set<CropShapeMode>(["star", "heart", "hexagon", "triangle"]);

/**
 * Commit-style crop. It never edits the committed crop directly: the user
 * proposes one over the (already cropped) preview — a frame, a shape in a
 * frame, or an outline drawn by hand or point by point — and the editor
 * composes it into the edit state when they hit Apply.
 */
export function createCropTool(options: CropToolOptions): CropToolHandle {
  const { container, renderer, onChange } = options;
  const sel: CropRect = { x: 0, y: 0, width: 1, height: 1 };
  let aspectRatio: AspectRatioPreset = "free";
  let mode: CropShapeMode = "rect";
  const shapeOptions: CropShapeOptions = { radius: 0, feather: 0, invert: false };
  /** An outline drawn on the photo, x, y pairs over the visible frame. */
  let path: number[] = [];
  /** Whether the outline is finished: a hand-drawn line let go, or a point outline joined up. */
  let closed = false;
  /** Where the pointer is while points are being placed: the next side runs there. */
  let hover: { x: number; y: number } | null = null;
  const abort = new AbortController();
  const signal = abort.signal;

  // Root overlay
  const root = document.createElement("div");
  root.className = "rt-crop";

  // 4 mask regions (the part that will be discarded on Apply)
  const maskTop = createMask();
  const maskRight = createMask();
  const maskBottom = createMask();
  const maskLeft = createMask();

  // A shape's dimming and outline: what's outside it goes, as the masks show for a frame.
  const shapeLayer = document.createElementNS(SVG_NS, "svg");
  shapeLayer.setAttribute("class", "rt-crop__shape");
  shapeLayer.setAttribute("aria-hidden", "true");
  const scrim = document.createElementNS(SVG_NS, "path");
  scrim.setAttribute("class", "rt-crop__scrim");
  const outline = document.createElementNS(SVG_NS, "path");
  outline.setAttribute("class", "rt-crop__outline");
  const nextSide = document.createElementNS(SVG_NS, "path");
  nextSide.setAttribute("class", "rt-crop__outline rt-crop__outline--next");
  const vertices = document.createElementNS(SVG_NS, "g");
  shapeLayer.append(scrim, outline, nextSide, vertices);

  // Where an outline is drawn: over the photo, taking the pointer.
  const drawLayer = document.createElement("div");
  drawLayer.className = "rt-crop__draw";

  // Selection box
  const selection = document.createElement("div");
  selection.className = "rt-crop__selection";

  // Rule of thirds grid
  const grid = document.createElement("div");
  grid.className = "rt-crop__grid";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "rt-crop__grid-cell";
    grid.appendChild(cell);
  }
  selection.appendChild(grid);

  // 8 handles
  const handles: Record<HandlePosition, HTMLElement> = {} as Record<HandlePosition, HTMLElement>;
  for (const pos of ["nw", "ne", "sw", "se", "n", "s", "w", "e"] as HandlePosition[]) {
    const handle = document.createElement("div");
    handle.className = `rt-crop__handle rt-crop__handle--${pos}`;
    handle.dataset.handle = pos;
    selection.appendChild(handle);
    handles[pos] = handle;
  }

  root.appendChild(maskTop);
  root.appendChild(maskRight);
  root.appendChild(maskBottom);
  root.appendChild(maskLeft);
  root.appendChild(drawLayer);
  root.appendChild(shapeLayer);
  root.appendChild(selection);
  container.appendChild(root);

  // ── State ──

  const boxFull = (): boolean =>
    sel.x < EPS && sel.y < EPS && sel.width > 1 - EPS && sel.height > 1 - EPS;

  /** A plain rectangle: the frame alone is the crop, no shape to cut. */
  const plainFrame = (): boolean =>
    mode === "rect" && shapeOptions.radius === 0 && shapeOptions.feather === 0;

  function canApply(): boolean {
    if (isDrawnMode(mode)) return path.length >= 6;
    // A rectangle punched out of the whole photo would leave nothing.
    if (mode === "rect" && shapeOptions.radius === 0 && shapeOptions.invert) return !boxFull();
    return plainFrame() ? !boxFull() : true;
  }

  function hasPending(): boolean {
    return isDrawnMode(mode) ? path.length > 0 : canApply();
  }

  /** The pending outline over the visible frame, or null when there's none to cut. */
  function pendingOutline(): number[] | null {
    if (isDrawnMode(mode)) {
      if (path.length < 6) return null;
      return shapeOutline({ points: path, smooth: mode === "lasso" });
    }
    if (plainFrame() && !shapeOptions.invert) return null;
    const img = renderer.getImageRect();
    const aspect = img.height > 0 ? img.width / img.height : 1;
    return frameOutline(mode, sel, aspect, mode === "rect" ? shapeOptions.radius : 0);
  }

  // ── Layout ──

  function updateLayout(): void {
    const imgRect = renderer.getImageRect();
    const drawn = isDrawnMode(mode);
    root.classList.toggle("rt-crop--drawn", drawn);
    root.classList.toggle("rt-crop--shaped", !plainFrame() || shapeOptions.invert);

    const sx = imgRect.x + sel.x * imgRect.width;
    const sy = imgRect.y + sel.y * imgRect.height;
    const sw = sel.width * imgRect.width;
    const sh = sel.height * imgRect.height;

    selection.style.display = drawn ? "none" : "";
    selection.style.left = `${sx}px`;
    selection.style.top = `${sy}px`;
    selection.style.width = `${sw}px`;
    selection.style.height = `${sh}px`;
    // With no room to move, a drag on the frame is free to pan the zoomed stage.
    selection.classList.toggle("rt-crop__selection--full", sel.width > 0.999 && sel.height > 0.999);

    drawLayer.style.display = drawn ? "" : "none";
    drawLayer.style.left = `${imgRect.x}px`;
    drawLayer.style.top = `${imgRect.y}px`;
    drawLayer.style.width = `${imgRect.width}px`;
    drawLayer.style.height = `${imgRect.height}px`;

    const cw = container.clientWidth || imgRect.width;
    const ch = container.clientHeight || imgRect.height;

    // A plain frame dims with the four masks; a shape draws its own.
    const masked = !drawn && plainFrame() && !shapeOptions.invert;
    for (const mask of [maskTop, maskRight, maskBottom, maskLeft]) {
      mask.style.display = masked ? "" : "none";
    }

    maskTop.style.left = "0";
    maskTop.style.top = "0";
    maskTop.style.width = `${cw}px`;
    maskTop.style.height = `${sy}px`;

    maskBottom.style.left = "0";
    maskBottom.style.top = `${sy + sh}px`;
    maskBottom.style.width = `${cw}px`;
    maskBottom.style.height = `${Math.max(0, ch - sy - sh)}px`;

    maskLeft.style.left = "0";
    maskLeft.style.top = `${sy}px`;
    maskLeft.style.width = `${sx}px`;
    maskLeft.style.height = `${sh}px`;

    maskRight.style.left = `${sx + sw}px`;
    maskRight.style.top = `${sy}px`;
    maskRight.style.width = `${Math.max(0, cw - sx - sw)}px`;
    maskRight.style.height = `${sh}px`;

    layoutShape(imgRect, cw, ch);
  }

  /** The shape's dimming, outline, next side and point handles, in container px. */
  function layoutShape(img: CropRect, cw: number, ch: number): void {
    shapeLayer.setAttribute("width", String(cw));
    shapeLayer.setAttribute("height", String(ch));
    shapeLayer.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
    const px = (x: number, y: number): string =>
      `${round(img.x + x * img.width)} ${round(img.y + y * img.height)}`;
    const trace = (points: number[], close: boolean): string => {
      let d = "";
      for (let i = 0; i < points.length; i += 2) {
        d += `${i === 0 ? "M" : "L"}${px(points[i], points[i + 1])}`;
      }
      return close && d ? `${d}Z` : d;
    };

    const drawn = isDrawnMode(mode);
    const open = drawn && !closed;
    const shape = open ? null : pendingOutline();
    if (shape) {
      const line = trace(shape, true);
      outline.setAttribute("d", line);
      scrim.setAttribute("d", shapeOptions.invert ? line : `M0 0H${cw}V${ch}H0Z${line}`);
    } else {
      // Points still being placed: the line so far, nothing dimmed yet.
      outline.setAttribute("d", open ? trace(path, false) : "");
      scrim.setAttribute("d", "");
    }

    const last = path.length - 2;
    nextSide.setAttribute(
      "d",
      mode === "polygon" && open && hover && last >= 0
        ? `M${px(path[last], path[last + 1])}L${px(hover.x, hover.y)}`
        : "",
    );

    // A point outline keeps a handle on each point; the first joins it up.
    const count = mode === "polygon" ? path.length / 2 : 0;
    while (vertices.childNodes.length > count) vertices.lastChild?.remove();
    while (vertices.childNodes.length < count) {
      const dot = document.createElementNS(SVG_NS, "circle");
      dot.setAttribute("class", "rt-crop__vertex");
      dot.setAttribute("data-index", String(vertices.childNodes.length));
      vertices.appendChild(dot);
    }
    vertices.childNodes.forEach((node, i) => {
      const dot = node as SVGCircleElement;
      dot.setAttribute("cx", String(round(img.x + path[i * 2] * img.width)));
      dot.setAttribute("cy", String(round(img.y + path[i * 2 + 1] * img.height)));
      dot.classList.toggle("rt-crop__vertex--close", i === 0 && open && count >= 3);
    });
  }

  function changed(): void {
    updateLayout();
    onChange({ ...sel });
  }

  // ── Drag interaction ──

  // One pointer drives a drag: other fingers (a pinch, a stray touch) are ignored.
  // Moves and corners can go either way, so they lock to the direction they
  // set off in until the pointer leaves it; an edge handle only has one way to go.
  let dragging: {
    id: number;
    type: "move" | HandlePosition;
    startX: number;
    startY: number;
    startSel: CropRect;
    lock: AxisLock | null;
  } | null = null;

  /** A drag on an outline: drawing one by hand, moving it whole, or moving one point. */
  let tracing: {
    id: number;
    type: "draw" | "move" | "vertex";
    index: number;
    start: { x: number; y: number };
    startPath: number[];
  } | null = null;

  // The cursor a drag starts with stays until it ends: the pointer soon
  // leaves a 12px handle, and what it passes over has cursors of its own.
  const html = document.documentElement;
  function holdCursor(from: Element): void {
    html.style.setProperty("--rt-drag-cursor", getComputedStyle(from).cursor);
    html.classList.add("rt-drag-cursor");
  }
  function releaseCursor(): void {
    html.classList.remove("rt-drag-cursor");
    html.style.removeProperty("--rt-drag-cursor");
  }
  signal.addEventListener("abort", releaseCursor);

  /** Where `e` is over the visible photo, 0–1 each way (beyond it past the edges). */
  function toFrame(e: MouseEvent): { x: number; y: number } {
    // Screen px back to layout px: the stage may be magnifying the canvas.
    const bounds = root.getBoundingClientRect();
    const zoom = renderer.getScreenScale();
    const img = renderer.getImageRect();
    return {
      x: ((e.clientX - bounds.left) / zoom - img.x) / (img.width || 1),
      y: ((e.clientY - bounds.top) / zoom - img.y) / (img.height || 1),
    };
  }

  /** The distance between two frame points, in screen px. */
  function screenDistance(a: { x: number; y: number }, bx: number, by: number): number {
    const img = renderer.getImageRect();
    const zoom = renderer.getScreenScale();
    return Math.hypot((a.x - bx) * img.width * zoom, (a.y - by) * img.height * zoom);
  }

  const inside = (p: { x: number; y: number }) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) });

  selection.addEventListener(
    "pointerdown",
    (e) => {
      if ((e.target as HTMLElement).dataset.handle) return;
      e.preventDefault();
      updateLayout(); // re-anchor in case the canvas moved since the last layout
      holdCursor(selection);
      dragging = {
        id: e.pointerId,
        type: "move",
        startX: e.clientX,
        startY: e.clientY,
        startSel: { ...sel },
        lock: createAxisLock(),
      };
    },
    { signal },
  );

  for (const [pos, handle] of Object.entries(handles)) {
    handle.addEventListener(
      "pointerdown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        updateLayout();
        holdCursor(handle);
        dragging = {
          id: e.pointerId,
          type: pos as HandlePosition,
          startX: e.clientX,
          startY: e.clientY,
          startSel: { ...sel },
          lock: pos.length === 2 ? createAxisLock() : null,
        };
      },
      { signal },
    );
  }

  // An outline: a press inside a finished one moves it; otherwise a hand-drawn
  // line starts over, and a point outline takes a point.
  drawLayer.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0 || tracing) return;
      e.preventDefault();
      const at = toFrame(e);
      if (closed && containsPoint(pendingOutline() ?? [], at.x, at.y)) {
        holdCursor(drawLayer);
        tracing = { id: e.pointerId, type: "move", index: -1, start: at, startPath: path.slice() };
        return;
      }
      const p = inside(at);
      if (mode === "lasso") {
        path = [p.x, p.y];
        closed = false;
        tracing = { id: e.pointerId, type: "draw", index: -1, start: p, startPath: [] };
        changed();
        return;
      }
      if (closed) return; // a finished point outline takes no more points
      const n = path.length / 2;
      const nearLast = n >= 3 && screenDistance(p, path[n * 2 - 2], path[n * 2 - 1]) <= REPEAT_PX;
      const nearFirst = n >= 3 && screenDistance(p, path[0], path[1]) <= CLOSE_PX;
      if (nearLast || nearFirst) closed = true;
      else path.push(p.x, p.y);
      changed();
    },
    { signal },
  );

  // A point's handle moves it; the first one, while the outline is open, joins it up.
  vertices.addEventListener(
    "pointerdown",
    (e) => {
      const index = Number.parseInt((e.target as Element).getAttribute("data-index") ?? "", 10);
      if (Number.isNaN(index) || e.button !== 0 || tracing) return;
      e.preventDefault();
      e.stopPropagation();
      if (!closed && index === 0 && path.length >= 6) {
        closed = true;
        changed();
        return;
      }
      holdCursor(e.target as Element);
      tracing = {
        id: e.pointerId,
        type: "vertex",
        index,
        start: toFrame(e),
        startPath: path.slice(),
      };
    },
    { signal },
  );

  document.addEventListener(
    "pointermove",
    (e) => {
      if (tracing && e.pointerId === tracing.id) {
        e.preventDefault();
        traceMove(e);
        return;
      }
      if (mode === "polygon" && !closed && path.length > 0 && !dragging) {
        hover = container.contains(e.target as Node) ? inside(toFrame(e)) : null;
        updateLayout();
      }
      if (!dragging || e.pointerId !== dragging.id) return;
      e.preventDefault();

      const imgRect = renderer.getImageRect();
      if (imgRect.width === 0 || imgRect.height === 0) return;

      // Pointer deltas are screen px; the stage may be magnifying the canvas.
      let px = e.clientX - dragging.startX;
      let py = e.clientY - dragging.startY;
      if (dragging.lock) ({ dx: px, dy: py } = dragging.lock.apply(px, py));
      const zoom = renderer.getScreenScale();
      const dx = px / (imgRect.width * zoom);
      const dy = py / (imgRect.height * zoom);
      const ss = dragging.startSel;

      if (dragging.type === "move") {
        sel.x = clamp(ss.x + dx, 0, 1 - ss.width);
        sel.y = clamp(ss.y + dy, 0, 1 - ss.height);
      } else {
        handleResize(dragging.type, ss, dx, dy, dragging.lock?.axis ?? null);
      }

      changed();
    },
    { signal },
  );

  function traceMove(e: PointerEvent): void {
    if (!tracing) return;
    const at = toFrame(e);
    if (tracing.type === "draw") {
      const p = inside(at);
      const n = path.length;
      if (screenDistance(p, path[n - 2], path[n - 1]) < LASSO_STEP_PX) return;
      path.push(p.x, p.y);
    } else if (tracing.type === "vertex") {
      const p = inside(at);
      path[tracing.index * 2] = p.x;
      path[tracing.index * 2 + 1] = p.y;
    } else {
      // The whole outline moves, as far as the photo's edges allow.
      const b = boundsOf(tracing.startPath);
      const dx = clamp(at.x - tracing.start.x, -b.x, 1 - b.x - b.width);
      const dy = clamp(at.y - tracing.start.y, -b.y, 1 - b.y - b.height);
      path = tracing.startPath.map((v, i) => v + (i % 2 === 0 ? dx : dy));
    }
    changed();
  }

  const endDrag = (e: PointerEvent): void => {
    if (tracing && e.pointerId === tracing.id) {
      const done = tracing;
      tracing = null;
      releaseCursor();
      if (done.type === "draw") finishLasso();
      return;
    }
    if (!dragging || e.pointerId !== dragging.id) return;
    dragging = null;
    releaseCursor();
  };
  document.addEventListener("pointerup", endDrag, { signal });
  document.addEventListener("pointercancel", endDrag, { signal });

  /** A hand-drawn line let go closes into an outline, unless it was too small to mean one. */
  function finishLasso(): void {
    const img = renderer.getImageRect();
    const zoom = renderer.getScreenScale();
    const area = areaOf(path) * img.width * img.height * zoom * zoom;
    if (path.length < 6 || area < LASSO_MIN_AREA_PX) path = [];
    closed = path.length > 0;
    changed();
  }

  /**
   * Resize from a handle. The opposite corner or edge stays put. With an
   * aspect preset, one axis sets the size and the other follows: an edge
   * handle's own axis (the frame grows evenly across the other), a corner's
   * locked axis, or for a diagonal pull whichever axis changed more.
   */
  function handleResize(
    pos: HandlePosition,
    ss: CropRect,
    dx: number,
    dy: number,
    axis: DragAxis | null,
  ): void {
    const west = pos.includes("w");
    const east = pos.includes("e");
    const north = pos.includes("n");
    const south = pos.includes("s");
    const right = ss.x + ss.width;
    const bottom = ss.y + ss.height;

    // Each dragged edge follows the pointer.
    let left = west ? clamp(ss.x + dx, 0, right - MIN_SIZE) : ss.x;
    let top = north ? clamp(ss.y + dy, 0, bottom - MIN_SIZE) : ss.y;
    let w = (east ? clamp(right + dx, ss.x + MIN_SIZE, 1) : right) - left;
    let h = (south ? clamp(bottom + dy, ss.y + MIN_SIZE, 1) : bottom) - top;

    const ratio = ASPECT_RATIOS[aspectRatio];
    if (ratio !== null && ratio !== undefined) {
      const imgRect = renderer.getImageRect();
      // Normalized width per unit of normalized height.
      const k = ratio / (imgRect.width / imgRect.height);
      const corner = (west || east) && (north || south);
      const byHeight = corner
        ? axis === "y" ||
          (axis !== "x" && Math.abs(h - ss.height) / ss.height > Math.abs(w - ss.width) / ss.width)
        : north || south;
      if (byHeight) w = h * k;
      else h = w / k;

      // Never below the minimum, then never past the photo from the anchor.
      const grow = Math.max(1, MIN_SIZE / w, MIN_SIZE / h);
      w *= grow;
      h *= grow;
      const cx = ss.x + ss.width / 2;
      const cy = ss.y + ss.height / 2;
      const roomW = west ? right : east ? 1 - ss.x : 2 * Math.min(cx, 1 - cx);
      const roomH = north ? bottom : south ? 1 - ss.y : 2 * Math.min(cy, 1 - cy);
      const fit = Math.min(1, roomW / w, roomH / h);
      w *= fit;
      h *= fit;
      left = west ? right - w : east ? ss.x : cx - w / 2;
      top = north ? bottom - h : south ? ss.y : cy - h / 2;
    }

    sel.x = left;
    sel.y = top;
    sel.width = w;
    sel.height = h;
  }

  /**
   * A fixed shape resizes from its corners only. A side handle would promise
   * a one-way move the shape can't make, so the sides hide until Free.
   */
  function syncHandles(): void {
    const ratio = ASPECT_RATIOS[aspectRatio];
    root.classList.toggle("rt-crop--locked", ratio !== null && ratio !== undefined);
  }

  /** Fit the largest centered frame of the preset's shape (Free leaves the frame as it is). */
  function applyAspect(preset: AspectRatioPreset): void {
    aspectRatio = preset;
    syncHandles();
    const ratio = ASPECT_RATIOS[preset];
    if (ratio === null || ratio === undefined) return;
    const imgRect = renderer.getImageRect();
    const pixelRatio = imgRect.width / imgRect.height;
    const normalizedRatio = ratio / pixelRatio;
    let newW = 1;
    let newH = newW / normalizedRatio;
    if (newH > 1) {
      newH = 1;
      newW = newH * normalizedRatio;
    }
    sel.width = newW;
    sel.height = newH;
    sel.x = (1 - newW) / 2;
    sel.y = (1 - newH) / 2;
  }

  // Initial layout
  syncHandles();
  updateLayout();

  return {
    root,
    getSelection: () => ({ ...sel }),
    isSelectionFull: boxFull,
    hasPending,
    canApply,
    getShape() {
      if (!canApply()) return null;
      const points = pendingOutline();
      if (!points) return null;
      const { feather, invert } = shapeOptions;
      // A hand-drawn outline keeps its points and curves through them; the rest are their outline.
      if (mode === "lasso") return { points: path.slice(), smooth: true, feather, invert };
      return { points: points.slice(), feather, invert };
    },
    getShapeMode: () => mode,
    setShapeMode(next) {
      if (next === mode) return;
      const from = mode;
      mode = next;
      path = [];
      closed = false;
      hover = null;
      if (isDrawnMode(next)) {
        // An outline has no frame to shape.
        aspectRatio = "free";
        syncHandles();
      } else {
        if (isDrawnMode(from)) Object.assign(sel, { x: 0, y: 0, width: 1, height: 1 });
        // A circle is round, and leaving it frees the frame where it is. The
        // figures start square, as they're drawn, unless the frame was already set.
        if (next === "circle") applyAspect("1:1");
        else if (from === "circle") applyAspect("free");
        else if (FIGURES.has(next) && boxFull()) applyAspect("1:1");
      }
      changed();
    },
    getShapeOptions: () => ({ ...shapeOptions }),
    setShapeOptions(next) {
      Object.assign(shapeOptions, next);
      changed();
    },
    removeLastPoint() {
      if (mode !== "polygon" || closed || path.length === 0) return false;
      path.length -= 2;
      changed();
      return true;
    },
    resetSelection() {
      sel.x = 0;
      sel.y = 0;
      sel.width = 1;
      sel.height = 1;
      aspectRatio = "free";
      mode = "rect";
      Object.assign(shapeOptions, { radius: 0, feather: 0, invert: false });
      path = [];
      closed = false;
      hover = null;
      tracing = null;
      syncHandles();
      updateLayout();
    },
    refresh: updateLayout,
    setAspectRatio(preset) {
      // A circle stays round, and an outline has no frame to shape.
      if (mode === "circle" || isDrawnMode(mode)) return;
      applyAspect(preset);
      if (ASPECT_RATIOS[preset] !== null && ASPECT_RATIOS[preset] !== undefined) changed();
    },
    getAspectRatio: () => aspectRatio,
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
      if (visible) updateLayout();
    },
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}

function createMask(): HTMLElement {
  const div = document.createElement("div");
  div.className = "rt-crop__mask";
  return div;
}

const round = (v: number): number => Math.round(v * 100) / 100;
