import { ASPECT_RATIOS } from "../../constants";
import type { AspectRatioPreset, CropRect } from "../../types";
import { clamp } from "../../utils/math";
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

  let dragging: {
    type: "move" | HandlePosition;
    startX: number;
    startY: number;
    startSel: CropRect;
  } | null = null;

  selection.addEventListener(
    "pointerdown",
    (e) => {
      if ((e.target as HTMLElement).dataset.handle) return;
      e.preventDefault();
      updateLayout(); // re-anchor in case the canvas moved since the last layout
      dragging = { type: "move", startX: e.clientX, startY: e.clientY, startSel: { ...sel } };
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
        dragging = {
          type: pos as HandlePosition,
          startX: e.clientX,
          startY: e.clientY,
          startSel: { ...sel },
        };
      },
      { signal },
    );
  }

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!dragging) return;
      e.preventDefault();

      const imgRect = renderer.getImageRect();
      if (imgRect.width === 0 || imgRect.height === 0) return;

      const dx = (e.clientX - dragging.startX) / imgRect.width;
      const dy = (e.clientY - dragging.startY) / imgRect.height;
      const ss = dragging.startSel;

      if (dragging.type === "move") {
        sel.x = clamp(ss.x + dx, 0, 1 - ss.width);
        sel.y = clamp(ss.y + dy, 0, 1 - ss.height);
      } else {
        handleResize(dragging.type, ss, dx, dy);
      }

      updateLayout();
      onChange({ ...sel });
    },
    { signal },
  );

  document.addEventListener(
    "pointerup",
    () => {
      dragging = null;
    },
    { signal },
  );

  function handleResize(pos: HandlePosition, ss: CropRect, dx: number, dy: number): void {
    const ratio = ASPECT_RATIOS[aspectRatio];
    let newX = ss.x;
    let newY = ss.y;
    let newW = ss.width;
    let newH = ss.height;

    // Horizontal edges
    if (pos.includes("w")) {
      const maxDx = ss.width - MIN_SIZE;
      const clampedDx = clamp(dx, -ss.x, maxDx);
      newX = ss.x + clampedDx;
      newW = ss.width - clampedDx;
    }
    if (pos.includes("e")) {
      newW = clamp(ss.width + dx, MIN_SIZE, 1 - ss.x);
    }

    // Vertical edges
    if (pos.includes("n")) {
      const maxDy = ss.height - MIN_SIZE;
      const clampedDy = clamp(dy, -ss.y, maxDy);
      newY = ss.y + clampedDy;
      newH = ss.height - clampedDy;
    }
    if (pos.includes("s")) {
      newH = clamp(ss.height + dy, MIN_SIZE, 1 - ss.y);
    }

    // Enforce aspect ratio
    if (ratio !== null && ratio !== undefined) {
      const imgRect = renderer.getImageRect();
      const pixelRatio = imgRect.width / imgRect.height;
      const normalizedRatio = ratio / pixelRatio;

      if (pos === "n" || pos === "s") {
        newW = newH * normalizedRatio;
        if (newX + newW > 1) newW = 1 - newX;
        newH = newW / normalizedRatio;
      } else {
        newH = newW / normalizedRatio;
        if (newY + newH > 1) newH = 1 - newY;
        newW = newH * normalizedRatio;
      }
    }

    // Clamp to bounds
    newW = clamp(newW, MIN_SIZE, 1 - newX);
    newH = clamp(newH, MIN_SIZE, 1 - newY);

    sel.x = newX;
    sel.y = newY;
    sel.width = newW;
    sel.height = newH;
  }

  // Initial layout
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
      updateLayout();
    },
    refresh: updateLayout,
    setAspectRatio(preset) {
      aspectRatio = preset;
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
