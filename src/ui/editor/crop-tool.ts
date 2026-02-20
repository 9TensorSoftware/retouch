import { ASPECT_RATIOS } from "../../constants";
import type { AspectRatioPreset, CropRect } from "../../types";
import { clamp } from "../../utils/math";
import type { CanvasRenderer } from "./canvas-renderer";

export interface CropToolOptions {
  container: HTMLElement;
  renderer: CanvasRenderer;
  edits: { crop: CropRect };
  onChange: (crop: CropRect) => void;
}

export interface CropToolHandle {
  root: HTMLElement;
  getCrop(): CropRect;
  setAspectRatio(preset: AspectRatioPreset): void;
  getAspectRatio(): AspectRatioPreset;
  setVisible(visible: boolean): void;
  destroy(): void;
}

type HandlePosition = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

const MIN_SIZE = 0.05; // Minimum crop size in normalized coords

export function createCropTool(options: CropToolOptions): CropToolHandle {
  const { container, renderer, onChange } = options;
  let crop: CropRect = { ...options.edits.crop };
  let aspectRatio: AspectRatioPreset = "free";
  const abort = new AbortController();
  const signal = abort.signal;

  // Root overlay
  const root = document.createElement("div");
  root.className = "rt-crop";

  // 4 mask regions
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

    // Crop selection position in pixels (relative to container)
    const sx = imgRect.x + crop.x * imgRect.width;
    const sy = imgRect.y + crop.y * imgRect.height;
    const sw = crop.width * imgRect.width;
    const sh = crop.height * imgRect.height;

    // Selection
    selection.style.left = `${sx}px`;
    selection.style.top = `${sy}px`;
    selection.style.width = `${sw}px`;
    selection.style.height = `${sh}px`;

    // Container dimensions
    const cw = container.clientWidth || imgRect.width;
    const ch = container.clientHeight || imgRect.height;

    // Masks
    maskTop.style.left = "0";
    maskTop.style.top = "0";
    maskTop.style.width = `${cw}px`;
    maskTop.style.height = `${sy}px`;

    maskBottom.style.left = "0";
    maskBottom.style.top = `${sy + sh}px`;
    maskBottom.style.width = `${cw}px`;
    maskBottom.style.height = `${ch - sy - sh}px`;

    maskLeft.style.left = "0";
    maskLeft.style.top = `${sy}px`;
    maskLeft.style.width = `${sx}px`;
    maskLeft.style.height = `${sh}px`;

    maskRight.style.left = `${sx + sw}px`;
    maskRight.style.top = `${sy}px`;
    maskRight.style.width = `${cw - sx - sw}px`;
    maskRight.style.height = `${sh}px`;
  }

  // ── Drag interaction ──

  let dragging: { type: "move" | HandlePosition; startX: number; startY: number; startCrop: CropRect } | null = null;

  selection.addEventListener("pointerdown", (e) => {
    if ((e.target as HTMLElement).dataset.handle) return;
    e.preventDefault();
    dragging = { type: "move", startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
  }, { signal });

  for (const [pos, handle] of Object.entries(handles)) {
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dragging = { type: pos as HandlePosition, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
    }, { signal });
  }

  document.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    e.preventDefault();

    const imgRect = renderer.getImageRect();
    if (imgRect.width === 0 || imgRect.height === 0) return;

    const dx = (e.clientX - dragging.startX) / imgRect.width;
    const dy = (e.clientY - dragging.startY) / imgRect.height;
    const sc = dragging.startCrop;

    if (dragging.type === "move") {
      crop.x = clamp(sc.x + dx, 0, 1 - sc.width);
      crop.y = clamp(sc.y + dy, 0, 1 - sc.height);
    } else {
      handleResize(dragging.type, sc, dx, dy);
    }

    updateLayout();
    onChange(crop);
  }, { signal });

  document.addEventListener("pointerup", () => {
    dragging = null;
  }, { signal });

  function handleResize(pos: HandlePosition, sc: CropRect, dx: number, dy: number): void {
    const ratio = ASPECT_RATIOS[aspectRatio];
    let newX = sc.x;
    let newY = sc.y;
    let newW = sc.width;
    let newH = sc.height;

    // Horizontal edges
    if (pos.includes("w")) {
      const maxDx = sc.width - MIN_SIZE;
      const clampedDx = clamp(dx, -sc.x, maxDx);
      newX = sc.x + clampedDx;
      newW = sc.width - clampedDx;
    }
    if (pos.includes("e")) {
      newW = clamp(sc.width + dx, MIN_SIZE, 1 - sc.x);
    }

    // Vertical edges
    if (pos.includes("n")) {
      const maxDy = sc.height - MIN_SIZE;
      const clampedDy = clamp(dy, -sc.y, maxDy);
      newY = sc.y + clampedDy;
      newH = sc.height - clampedDy;
    }
    if (pos.includes("s")) {
      newH = clamp(sc.height + dy, MIN_SIZE, 1 - sc.y);
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

    crop.x = newX;
    crop.y = newY;
    crop.width = newW;
    crop.height = newH;
  }

  // Initial layout
  updateLayout();

  return {
    root,
    getCrop: () => ({ ...crop }),
    setAspectRatio(preset) {
      aspectRatio = preset;
      const ratio = ASPECT_RATIOS[preset];
      if (ratio !== null && ratio !== undefined) {
        // Adjust current crop to match ratio
        const imgRect = renderer.getImageRect();
        const pixelRatio = imgRect.width / imgRect.height;
        const normalizedRatio = ratio / pixelRatio;
        let newW = crop.width;
        let newH = newW / normalizedRatio;
        if (newH > 1) {
          newH = 1;
          newW = newH * normalizedRatio;
        }
        if (crop.x + newW > 1) crop.x = Math.max(0, 1 - newW);
        if (crop.y + newH > 1) crop.y = Math.max(0, 1 - newH);
        crop.width = newW;
        crop.height = newH;
        updateLayout();
        onChange(crop);
      }
    },
    getAspectRatio: () => aspectRatio,
    setVisible(visible) {
      root.style.display = visible ? "" : "none";
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
