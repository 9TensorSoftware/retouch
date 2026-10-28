import { ASPECT_RATIOS } from "../../constants";
import type { AspectRatioPreset, CropRect } from "../../types";
import { clamp } from "../../utils/math";
import { type AxisLock, createAxisLock, type DragAxis } from "./axis-lock";
import type { CanvasRenderer } from "./canvas-renderer";

export interface CropToolOptions {
  container: HTMLElement;
  renderer: CanvasRenderer;
  /** Fires whenever the pending selection changes (drag, aspect preset). */
  onChange: (selection: CropRect) => void;
}

export interface CropToolHandle {
  root: HTMLElement;
  /** Pending selection in visible-image space (0–1). Full frame = nothing to apply. */
  getSelection(): CropRect;
  /** True when the selection covers the whole visible frame. */
  isSelectionFull(): boolean;
  /** Snap the marquee back to the full visible frame (after apply/undo/transform). */
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

/**
 * Commit-style crop marquee. It never edits the committed crop directly: the
 * user drags a pending selection over the (already cropped) preview, and the
 * editor composes it into the edit state when they hit Apply.
 */
export function createCropTool(options: CropToolOptions): CropToolHandle {
  const { container, renderer, onChange } = options;
  const sel: CropRect = { x: 0, y: 0, width: 1, height: 1 };
  let aspectRatio: AspectRatioPreset = "free";
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
  root.appendChild(selection);
  container.appendChild(root);

  // ── Layout ──

  function updateLayout(): void {
    const imgRect = renderer.getImageRect();

    const sx = imgRect.x + sel.x * imgRect.width;
    const sy = imgRect.y + sel.y * imgRect.height;
    const sw = sel.width * imgRect.width;
    const sh = sel.height * imgRect.height;

    selection.style.left = `${sx}px`;
    selection.style.top = `${sy}px`;
    selection.style.width = `${sw}px`;
    selection.style.height = `${sh}px`;

    const cw = container.clientWidth || imgRect.width;
    const ch = container.clientHeight || imgRect.height;

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
  }

  // ── Drag interaction ──

  // One pointer drives a drag: other fingers (a pinch, a stray touch) are ignored.
  // Moves and corners can go either way, so they lock to the direction they
  // set off in; an edge handle only has one way to go.
  let dragging: {
    id: number;
    type: "move" | HandlePosition;
    startX: number;
    startY: number;
    startSel: CropRect;
    lock: AxisLock | null;
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

  document.addEventListener(
    "pointermove",
    (e) => {
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

      updateLayout();
      onChange({ ...sel });
    },
    { signal },
  );

  const endDrag = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== dragging.id) return;
    dragging = null;
    releaseCursor();
  };
  document.addEventListener("pointerup", endDrag, { signal });
  document.addEventListener("pointercancel", endDrag, { signal });

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

  // Initial layout
  syncHandles();
  updateLayout();

  return {
    root,
    getSelection: () => ({ ...sel }),
    isSelectionFull() {
      return sel.x < EPS && sel.y < EPS && sel.width > 1 - EPS && sel.height > 1 - EPS;
    },
    resetSelection() {
      sel.x = 0;
      sel.y = 0;
      sel.width = 1;
      sel.height = 1;
      aspectRatio = "free";
      syncHandles();
      updateLayout();
    },
    refresh: updateLayout,
    setAspectRatio(preset) {
      aspectRatio = preset;
      syncHandles();
      const ratio = ASPECT_RATIOS[preset];
      if (ratio !== null && ratio !== undefined) {
        // Fit the largest centered selection with this ratio
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
        updateLayout();
        onChange({ ...sel });
      }
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
