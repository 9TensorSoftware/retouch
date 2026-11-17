import type { CropRect, CropShape } from "../types";

/**
 * Shaped crops. A shape is an outline over the cropped frame, x, y pairs
 * normalized 0–1: every shape is points by the time it's applied, so a
 * later crop, turn or flip moves it by moving its points, and the export
 * draws all of them the same way.
 */

/** How a crop is drawn: a frame holding a shape, or an outline drawn on the photo. */
export type CropShapeMode =
  | "rect"
  | "ellipse"
  | "circle"
  | "star"
  | "heart"
  | "hexagon"
  | "triangle"
  | "lasso"
  | "polygon";

/** The shapes drawn by hand, point by point; the rest fill a frame resized by its handles. */
export function isDrawnMode(mode: CropShapeMode): mode is "lasso" | "polygon" {
  return mode === "lasso" || mode === "polygon";
}

// Enough points that no facet shows at export size: a 256-point ellipse
// strays under half a pixel from the curve at 8000 px across.
const ELLIPSE_POINTS = 256;
const CORNER_POINTS = 32;
const HEART_POINTS = 192;
const STAR_INNER = 0.42;
/** Segments per stretch of a smoothed outline. */
const SMOOTH_STEPS = 6;

/** Stretch an outline so its bounds fill the unit square. */
function fillUnit(points: number[]): number[] {
  const b = boundsOf(points);
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    out.push((points[i] - b.x) / (b.width || 1), (points[i + 1] - b.y) / (b.height || 1));
  }
  return out;
}

/** A regular outline around a center: `count` corners from the top, alternating radii. */
function radial(count: number, radii: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const r = radii[i % radii.length];
    out.push(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  return out;
}

/** A shape's outline filling the unit square; the ellipse's also stands in for the circle. */
function unitOutline(mode: Exclude<CropShapeMode, "rect" | "lasso" | "polygon">): number[] {
  switch (mode) {
    case "ellipse":
    case "circle": {
      const out: number[] = [];
      for (let i = 0; i < ELLIPSE_POINTS; i++) {
        const t = (i / ELLIPSE_POINTS) * 2 * Math.PI;
        out.push(0.5 + 0.5 * Math.cos(t), 0.5 + 0.5 * Math.sin(t));
      }
      return out;
    }
    case "star":
      return fillUnit(radial(10, [1, STAR_INNER]));
    case "hexagon":
      return fillUnit(radial(6, [1]));
    case "triangle":
      return [0.5, 0, 1, 1, 0, 1];
    case "heart": {
      // The classic heart curve, point down.
      const out: number[] = [];
      for (let i = 0; i < HEART_POINTS; i++) {
        const t = (i / HEART_POINTS) * 2 * Math.PI;
        const x = 16 * Math.sin(t) ** 3;
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        out.push(x, -y);
      }
      return fillUnit(out);
    }
  }
}

/**
 * A rectangle with round corners, in frame coordinates. `aspect` is the
 * frame's width over its height in pixels, so the corners come out round on
 * screen, not stretched with the frame. `radius` 0–100 runs from square
 * corners to a short side that's all curve.
 */
function roundedRect(box: CropRect, aspect: number, radius: number): number[] {
  const { x, y, width, height } = box;
  if (radius <= 0) return [x, y, x + width, y, x + width, y + height, x, y + height];
  // Work in pixel-shaped units (the frame is aspect × 1), then come back.
  const w = width * aspect;
  const r = (Math.min(radius, 100) / 100) * (Math.min(w, height) / 2);
  const rx = r / aspect;
  const corners: [number, number, number][] = [
    [x + width - rx, y + r, -Math.PI / 2],
    [x + width - rx, y + height - r, 0],
    [x + rx, y + height - r, Math.PI / 2],
    [x + rx, y + r, Math.PI],
  ];
  const out: number[] = [];
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= CORNER_POINTS; i++) {
      const t = start + (i / CORNER_POINTS) * (Math.PI / 2);
      out.push(cx + rx * Math.cos(t), cy + r * Math.sin(t));
    }
  }
  return out;
}

/**
 * A framed shape's outline: the shape filling `box` (normalized over the
 * frame). `aspect` is the frame's width over height in pixels, for round
 * corners; `radius` 0–100 rounds a rectangle's.
 */
export function frameOutline(
  mode: Exclude<CropShapeMode, "lasso" | "polygon">,
  box: CropRect,
  aspect: number,
  radius = 0,
): number[] {
  if (mode === "rect") return roundedRect(box, aspect, radius);
  const unit = unitOutline(mode);
  const out: number[] = [];
  for (let i = 0; i < unit.length; i += 2) {
    out.push(box.x + unit[i] * box.width, box.y + unit[i + 1] * box.height);
  }
  return out;
}

/** The outline as drawn: its points, or for a smooth one, the curve through them. */
export function shapeOutline(shape: Pick<CropShape, "points" | "smooth">): number[] {
  const p = shape.points;
  const n = p.length / 2;
  if (!shape.smooth || n < 3) return p;
  // Quadratic curves between the midpoints of each side, bending at the points.
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n;
    const b = (i + 1) % n;
    const x0 = (p[a * 2] + p[i * 2]) / 2;
    const y0 = (p[a * 2 + 1] + p[i * 2 + 1]) / 2;
    const x2 = (p[i * 2] + p[b * 2]) / 2;
    const y2 = (p[i * 2 + 1] + p[b * 2 + 1]) / 2;
    for (let s = 0; s < SMOOTH_STEPS; s++) {
      const t = s / SMOOTH_STEPS;
      const u = 1 - t;
      out.push(
        u * u * x0 + 2 * u * t * p[i * 2] + t * t * x2,
        u * u * y0 + 2 * u * t * p[i * 2 + 1] + t * t * y2,
      );
    }
  }
  return out;
}

/** The box around some points. */
export function boundsOf(points: number[]): CropRect {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  if (minX > maxX) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The outline's area, as a fraction of the frame. */
export function areaOf(points: number[]): number {
  let sum = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sum += points[i * 2] * points[j * 2 + 1] - points[j * 2] * points[i * 2 + 1];
  }
  return Math.abs(sum) / 2;
}

/** Whether (x, y) falls inside the outline (even-odd). */
export function containsPoint(points: number[], x: number, y: number): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i * 2];
    const yi = points[i * 2 + 1];
    const xj = points[j * 2];
    const yj = points[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Move each point through `map`. */
function mapPoints(shape: CropShape, map: (x: number, y: number) => [number, number]): CropShape {
  const points: number[] = [];
  for (let i = 0; i < shape.points.length; i += 2) {
    points.push(...map(shape.points[i], shape.points[i + 1]));
  }
  return { ...shape, points };
}

/** The shape over a part of its frame, `within` (normalized over the frame), as that part's own frame. */
export function reframeShape(shape: CropShape, within: CropRect): CropShape {
  return mapPoints(shape, (x, y) => [
    (x - within.x) / within.width,
    (y - within.y) / within.height,
  ]);
}

/** The shape after the frame turns 90° clockwise, as `rotateCropCW` moves the crop. */
export function rotateShapeCW(shape: CropShape): CropShape {
  return mapPoints(shape, (x, y) => [1 - y, x]);
}

/** The shape after the frame turns 90° counter-clockwise. */
export function rotateShapeCCW(shape: CropShape): CropShape {
  return mapPoints(shape, (x, y) => [y, 1 - x]);
}

/** The shape after the frame mirrors left to right. */
export function flipShapeX(shape: CropShape): CropShape {
  return mapPoints(shape, (x, y) => [1 - x, y]);
}

/** The shape after the frame mirrors top to bottom. */
export function flipShapeY(shape: CropShape): CropShape {
  return mapPoints(shape, (x, y) => [x, 1 - y]);
}

/**
 * Whether a shape still changes anything in the frame: an outline punched
 * out wholly beside the frame doesn't.
 */
export function shapeTouchesFrame(shape: CropShape): boolean {
  if (!shape.invert) return true;
  const b = boundsOf(shapeOutline(shape));
  return b.x < 1 && b.y < 1 && b.x + b.width > 0 && b.y + b.height > 0;
}

/** The soft edge in pixels, for a frame `width` × `height`: up to a quarter of the shape's short side. */
export function featherPixels(shape: CropShape, width: number, height: number): number {
  if (shape.feather <= 0) return 0;
  const b = boundsOf(shape.points);
  return (Math.min(shape.feather, 100) / 100) * 0.25 * Math.min(b.width * width, b.height * height);
}

function tracePath(
  ctx: CanvasRenderingContext2D,
  points: number[],
  width: number,
  height: number,
): void {
  ctx.beginPath();
  ctx.moveTo(points[0] * width, points[1] * height);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] * width, points[i + 1] * height);
  ctx.closePath();
}

/**
 * Cut the shapes from a frame already drawn on `ctx` (`width` × `height`
 * pixels): what each leaves out turns transparent. A soft edge fades in on
 * the kept side, so the outline is where the photo ends either way.
 */
export function applyCropShapes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shapes: readonly CropShape[],
): void {
  for (const shape of shapes) {
    const points = shapeOutline(shape);
    if (points.length < 6) continue;
    const feather = featherPixels(shape, width, height);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (feather < 1) {
      ctx.globalCompositeOperation = shape.invert ? "destination-out" : "destination-in";
      ctx.fillStyle = "#000";
      tracePath(ctx, points, width, height);
      ctx.fill();
    } else {
      const mask = softMask(points, width, height, feather, shape.invert);
      if (mask) {
        ctx.globalCompositeOperation = shape.invert ? "destination-out" : "destination-in";
        ctx.drawImage(mask, 0, 0);
      }
    }
    ctx.restore();
  }
}

/**
 * The shape with a soft edge, as an alpha mask: what's kept (or, inverted,
 * what's cut) at full strength, fading to nothing at the outline. The
 * shape is pulled in (or pushed out) by half the fade, then blurred.
 */
function softMask(
  points: number[],
  width: number,
  height: number,
  feather: number,
  invert: boolean,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "#fff";
  ctx.lineJoin = "round";
  ctx.lineWidth = feather;
  tracePath(ctx, points, width, height);
  ctx.fill();
  // Kept inside: pull in. Punched out: push the hole out, into what's kept.
  ctx.globalCompositeOperation = invert ? "source-over" : "destination-out";
  ctx.stroke();
  ctx.globalCompositeOperation = "source-over";

  // Only the shape and its fade need blurring; beyond that the mask is empty.
  const radius = Math.max(1, Math.round(feather / 4));
  const pad = radius * 3 + 2;
  const b = boundsOf(points);
  const x0 = Math.max(0, Math.floor(b.x * width - feather - pad));
  const y0 = Math.max(0, Math.floor(b.y * height - feather - pad));
  const x1 = Math.min(width, Math.ceil((b.x + b.width) * width + feather + pad));
  const y1 = Math.min(height, Math.ceil((b.y + b.height) * height + feather + pad));
  if (x1 <= x0 || y1 <= y0) return canvas;
  const region = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  blurAlpha(region.data, region.width, region.height, radius);
  ctx.putImageData(region, x0, y0);
  return canvas;
}

/**
 * Blur the alpha of RGBA pixels in place: three box passes each way, near
 * enough a gaussian of `radius`. Past the edges, the edge pixel carries on.
 */
export function blurAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): void {
  const a = new Float32Array(width * height);
  for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3];
  const tmp = new Float32Array(Math.max(width, height));
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) blurLine(a, y * width, 1, width, radius, tmp);
    for (let x = 0; x < width; x++) blurLine(a, x, width, height, radius, tmp);
  }
  for (let i = 0; i < a.length; i++) data[i * 4 + 3] = a[i];
}

/** One box pass along a row or column of `n` values, `stride` apart from `start`. */
function blurLine(
  a: Float32Array,
  start: number,
  stride: number,
  n: number,
  radius: number,
  tmp: Float32Array,
): void {
  for (let i = 0; i < n; i++) tmp[i] = a[start + i * stride];
  const last = n - 1;
  let sum = 0;
  for (let i = -radius; i <= radius; i++) sum += tmp[Math.min(last, Math.max(0, i))];
  const window = radius * 2 + 1;
  for (let i = 0; i < n; i++) {
    a[start + i * stride] = sum / window;
    sum += tmp[Math.min(last, i + radius + 1)] - tmp[Math.max(0, i - radius)];
  }
}
