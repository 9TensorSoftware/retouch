import { KEEP_RGB, REMOVE_RGB, rgba } from "./colors";
import {
  candidateLogits,
  candidateMask,
  maskLogitsToGray,
  type SamCandidates,
  type SamPoint,
} from "./sam";

/**
 * The Select tool's model of a selection, and the surface over the photo
 * where you point and click. Pointing outlines what a click would select;
 * a click selects it, and the rest of the photo dims. Adding to it and
 * taking parts away are modes of their own (or Shift- and Alt-click), so a
 * plain click never changes a selection by surprise.
 */

/** @deprecated Clicks no longer step through shapes; kept for the public API. */
export const SAME_SPOT = 0.015;

/**
 * @deprecated Clicks no longer step through shapes; kept for the public API.
 * True when a keep click lands on the last keep point again.
 */
export function isRepeatClick(points: SamPoint[], x: number, y: number, label: 0 | 1): boolean {
  const last = points[points.length - 1];
  return label === 1 && last?.label === 1 && Math.hypot(x - last.x, y - last.y) < SAME_SPOT;
}

/** What a click on the photo does. */
export type ClickMode = "new" | "add" | "remove";

/** The clicks that make a selection, and which of the model's shapes for them. */
export interface Selection {
  points: SamPoint[];
  /** A candidate's index, or null for the one the model rates best. */
  shape: number | null;
}

export const EMPTY_SELECTION: Selection = { points: [], shape: null };

/**
 * The clicks after one more at (x, y). Shift adds and Alt takes away,
 * whatever the mode. A new selection starts over from this click; null
 * when there's nothing to take away from.
 */
export function clickedPoints(
  points: SamPoint[],
  mode: ClickMode,
  x: number,
  y: number,
  keys: { shift?: boolean; alt?: boolean } = {},
): SamPoint[] | null {
  const effective: ClickMode = keys.alt ? "remove" : keys.shift ? "add" : mode;
  if (effective === "new" || points.length === 0) {
    return effective === "remove" && points.length === 0 ? null : [{ x, y, label: 1 }];
  }
  return [...points, { x, y, label: effective === "add" ? 1 : 0 }];
}

export interface SelectionHistory {
  readonly current: Selection;
  readonly canUndo: boolean;
  /** Move to a new selection, keeping the one before for undo. */
  set(next: Selection): void;
  /** Back one step; false when there's nothing to go back to. */
  undo(): boolean;
  /** Nothing selected and nothing to undo: the photo changed under it. */
  reset(): void;
}

/** Every click, shape pick and Start over is a step Undo takes back. */
export function createSelectionHistory(limit = 50): SelectionHistory {
  let current = EMPTY_SELECTION;
  const past: Selection[] = [];
  return {
    get current() {
      return current;
    },
    get canUndo() {
      return past.length > 0;
    },
    set(next) {
      past.push(current);
      if (past.length > limit) past.shift();
      current = next;
    },
    undo() {
      const previous = past.pop();
      if (!previous) return false;
      current = previous;
      return true;
    },
    reset() {
      past.length = 0;
      current = EMPTY_SELECTION;
    },
  };
}

/** A candidate as on/off cells of the decoder's grid, the padding left out. */
function cells(candidates: SamCandidates, index: number): { on: Uint8Array; area: number } {
  const { width, height, stride } = candidates.region;
  const logits = candidateLogits(candidates, index);
  const on = new Uint8Array(width * height);
  let area = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (logits[y * stride + x] > 0) {
        on[y * width + x] = 1;
        area++;
      }
    }
  }
  return { on, area };
}

function overlap(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.length; i++) {
    both += a[i] & b[i];
    either += a[i] | b[i];
  }
  return either === 0 ? 1 : both / either;
}

/**
 * The shapes worth offering for a click, smallest first: the model's
 * candidates without the empty ones, and without any that are nearly the
 * same as a better one.
 */
export function distinctShapes(candidates: SamCandidates, same = 0.9): number[] {
  const kept: { index: number; on: Uint8Array; area: number }[] = [];
  for (const index of candidates.order) {
    const { on, area } = cells(candidates, index);
    if (area === 0) continue;
    if (kept.every((k) => overlap(k.on, on) < same)) kept.push({ index, on, area });
  }
  return kept.sort((a, b) => a.area - b.area).map((k) => k.index);
}

/** Names for shapes listed smallest first. */
export function shapeLabels(count: number): string[] {
  if (count <= 1) return ["Selected"];
  if (count === 2) return ["Smaller", "Larger"];
  return ["Small", "Medium", "Large"].slice(0, count);
}

/** True when (x, y), as fractions of the photo, falls inside the candidate. */
export function shapeContains(
  candidates: SamCandidates,
  index: number,
  x: number,
  y: number,
): boolean {
  const { width, height, stride } = candidates.region;
  const gx = Math.min(width - 1, Math.max(0, Math.floor(x * width)));
  const gy = Math.min(height - 1, Math.max(0, Math.floor(y * height)));
  return candidateLogits(candidates, index)[gy * stride + gx] > 0;
}

/**
 * A square picture of just the selected thing, cut out of the photo and
 * framed around it, as an image URL for a tile.
 */
export function shapeThumbnail(
  image: CanvasImageSource,
  candidates: SamCandidates,
  index: number,
  size = 112,
): string {
  const { width: gw, height: gh, stride } = candidates.region;
  const logits = candidateLogits(candidates, index);
  let minX = gw;
  let minY = gh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (logits[y * stride + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return "";
  // A square around the thing, with a margin, in source pixels.
  const { width: W, height: H } = candidates;
  const cx = ((minX + maxX + 1) / 2 / gw) * W;
  const cy = ((minY + maxY + 1) / 2 / gh) * H;
  const side = Math.min(
    Math.max(W, H),
    Math.max(((maxX - minX + 1) / gw) * W, ((maxY - minY + 1) / gh) * H) * 1.15,
  );
  const sx = cx - side / 2;
  const sy = cy - side / 2;

  const gray = document.createElement("canvas");
  gray.width = stride;
  gray.height = stride;
  gray
    .getContext("2d")
    ?.putImageData(new ImageData(maskLogitsToGray(logits), stride, stride), 0, 0);
  const mask = document.createElement("canvas");
  mask.width = size;
  mask.height = size;
  const mctx = mask.getContext("2d");
  if (!mctx) return "";
  mctx.imageSmoothingEnabled = true;
  mctx.drawImage(
    gray,
    (sx / W) * gw,
    (sy / H) * gh,
    (side / W) * gw,
    (side / H) * gh,
    0,
    0,
    size,
    size,
  );
  const m = mctx.getImageData(0, 0, size, size);
  for (let i = 0; i < m.data.length; i += 4) {
    m.data[i + 3] = m.data[i] > 127 ? 255 : 0;
  }
  mctx.putImageData(m, 0, 0);

  const out = document.createElement("canvas");
  out.width = size;
  out.height = size;
  const octx = out.getContext("2d");
  if (!octx) return "";
  octx.drawImage(image, sx, sy, side, side, 0, 0, size, size);
  octx.globalCompositeOperation = "destination-in";
  octx.drawImage(mask, 0, 0);
  return out.toDataURL("image/png");
}

// ── The surface over the photo ──

export interface SelectSurfaceOptions {
  /** The mouse moved over the photo (not a finger: touch has no pointing). */
  onHover?: (x: number, y: number) => void;
  onHoverEnd?: () => void;
  onClick: (x: number, y: number, keys: { shift: boolean; alt: boolean }) => void;
}

/** What the pointer looks like over the photo. */
export type SurfaceCursor = ClickMode | "busy" | "idle";

export interface SelectSurfaceHandle {
  /** The selection, drawn dimming the rest; null for none. */
  setSelection(candidates: SamCandidates | null, index?: number): void;
  /** What a click would select, outlined; null for none. */
  setHover(candidates: SamCandidates | null, index?: number): void;
  setPoints(points: SamPoint[]): void;
  setCursor(cursor: SurfaceCursor): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

/** A crosshair with a small + or − beside it, for Add and Remove. */
function signCursor(sign: "+" | "-"): string {
  const bar = '<path d="M17 21h8"/>';
  const post = sign === "+" ? '<path d="M21 17v8"/>' : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" fill="none" stroke-linecap="round"><g stroke="black" stroke-width="4"><path d="M10 2v16M2 10h16"/>${bar}${post}</g><g stroke="white" stroke-width="2"><path d="M10 2v16M2 10h16"/>${bar}${post}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 10 10, crosshair`;
}

const CURSORS: Record<SurfaceCursor, string> = {
  new: "crosshair",
  add: signCursor("+"),
  remove: signCursor("-"),
  busy: "progress",
  idle: "default",
};

/** A mask's on pixels as white, the rest clear, plus its outline. */
function shapeLayers(mask: HTMLCanvasElement): {
  fill: HTMLCanvasElement;
  edge: HTMLCanvasElement;
} {
  const { width: w, height: h } = mask;
  const src = mask.getContext("2d")?.getImageData(0, 0, w, h).data;
  const fill = document.createElement("canvas");
  const edge = document.createElement("canvas");
  fill.width = edge.width = w;
  fill.height = edge.height = h;
  if (!src) return { fill, edge };
  const fillData = new ImageData(w, h);
  const edgeData = new ImageData(w, h);
  const on = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4] > 127;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const i = (y * w + x) * 4;
      fillData.data[i] = fillData.data[i + 1] = fillData.data[i + 2] = fillData.data[i + 3] = 255;
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) {
        edgeData.data[i] = edgeData.data[i + 1] = edgeData.data[i + 2] = edgeData.data[i + 3] = 255;
      }
    }
  }
  fill.getContext("2d")?.putImageData(fillData, 0, 0);
  edge.getContext("2d")?.putImageData(edgeData, 0, 0);
  return { fill, edge };
}

/** `layer` filled with one color, keeping its alpha. */
function tinted(layer: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = layer.width;
  out.height = layer.height;
  const ctx = out.getContext("2d");
  if (!ctx) return out;
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  return out;
}

export function createSelectSurface(
  canvasArea: HTMLElement,
  handlers: SelectSurfaceOptions | ((x: number, y: number, shiftKey: boolean) => void),
): SelectSurfaceHandle {
  // A plain function is the old form: a click handler alone.
  const options: SelectSurfaceOptions =
    typeof handlers === "function"
      ? { onClick: (x, y, keys) => handlers(x, y, keys.shift) }
      : handlers;
  const target = canvasArea.querySelector("canvas");
  const container = target?.parentElement;
  const overlay = document.createElement("canvas");
  overlay.className = "rt-ml-select-overlay";
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;cursor:crosshair;touch-action:none;display:none;";
  container?.appendChild(overlay);

  type Shape = { candidates: SamCandidates; index: number } | null;
  let selection: Shape = null;
  let hover: Shape = null;
  let points: SamPoint[] = [];
  // Drawn layers for the current size, so a redraw (a resize) only composes.
  const layerCache = new Map<string, { fill: HTMLCanvasElement; edge: HTMLCanvasElement }>();
  const keyOf = new WeakMap<SamCandidates, number>();
  let nextKey = 0;

  function layersFor(shape: NonNullable<Shape>, w: number, h: number) {
    let id = keyOf.get(shape.candidates);
    if (id === undefined) {
      id = nextKey++;
      keyOf.set(shape.candidates, id);
    }
    const key = `${id}:${shape.index}:${w}x${h}`;
    let layers = layerCache.get(key);
    if (!layers) {
      layers = shapeLayers(candidateMask(shape.candidates, shape.index, w, h));
      layerCache.set(key, layers);
      // A handful is plenty: the selection, the hover, and a step back.
      if (layerCache.size > 6) layerCache.delete(layerCache.keys().next().value as string);
    }
    return layers;
  }

  const same = (a: Shape, b: Shape): boolean =>
    !!a && !!b && a.candidates === b.candidates && a.index === b.index;

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

    if (selection) {
      const { fill, edge } = layersFor(selection, w, h);
      // The rest of the photo dims, so what's selected stands out.
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "destination-out";
      ctx.drawImage(fill, 0, 0);
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(tinted(fill, rgba(KEEP_RGB, 0.16)), 0, 0);
      drawEdge(ctx, edge, rgba(KEEP_RGB, 1));
    }
    if (hover && !same(hover, selection)) {
      const { fill, edge } = layersFor(hover, w, h);
      ctx.drawImage(tinted(fill, "rgba(255, 255, 255, 0.18)"), 0, 0);
      drawEdge(ctx, edge, "rgba(255, 255, 255, 0.95)");
    }
    for (const p of points) {
      const x = p.x * w;
      const y = p.y * h;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = p.label === 1 ? rgba(KEEP_RGB, 1) : rgba(REMOVE_RGB, 1);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "white";
      ctx.stroke();
      // + keeps, − takes away.
      ctx.beginPath();
      ctx.moveTo(x - 3.5, y);
      ctx.lineTo(x + 3.5, y);
      if (p.label === 1) {
        ctx.moveTo(x, y - 3.5);
        ctx.lineTo(x, y + 3.5);
      }
      ctx.stroke();
    }
  }

  /** An outline that reads on light and dark photos alike. */
  function drawEdge(ctx: CanvasRenderingContext2D, edge: HTMLCanvasElement, color: string): void {
    const line = tinted(edge, color);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
    ctx.shadowBlur = 3;
    ctx.drawImage(line, 0, 0);
    ctx.shadowBlur = 0;
    // Twice, offset a pixel, for a line two pixels wide.
    ctx.drawImage(line, 1, 0);
    ctx.drawImage(line, 0, 1);
    ctx.restore();
  }

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (overlay.style.display !== "none") redraw();
        })
      : null;
  if (container) observer?.observe(container);

  function at(e: PointerEvent): { x: number; y: number } | null {
    const bounds = overlay.getBoundingClientRect();
    if (bounds.width < 2 || bounds.height < 2) return null;
    return {
      x: (e.clientX - bounds.left) / bounds.width,
      y: (e.clientY - bounds.top) / bounds.height,
    };
  }

  overlay.addEventListener("pointerdown", (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    const point = at(e);
    if (point) options.onClick(point.x, point.y, { shift: e.shiftKey, alt: e.altKey });
  });
  overlay.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse" || e.buttons !== 0) return;
    const point = at(e);
    if (point) options.onHover?.(point.x, point.y);
  });
  overlay.addEventListener("pointerleave", () => options.onHoverEnd?.());

  return {
    setSelection(candidates, index = 0) {
      selection = candidates ? { candidates, index } : null;
      redraw();
    },
    setHover(candidates, index = 0) {
      const next: Shape = candidates ? { candidates, index } : null;
      if (next === hover || same(next, hover)) return;
      hover = next;
      redraw();
    },
    setPoints(next) {
      points = [...next];
      redraw();
    },
    setCursor(cursor) {
      overlay.style.cursor = CURSORS[cursor];
    },
    setVisible(visible) {
      overlay.style.display = visible ? "" : "none";
      if (visible) redraw();
      else hover = null;
    },
    destroy() {
      observer?.disconnect();
      overlay.remove();
    },
  };
}
