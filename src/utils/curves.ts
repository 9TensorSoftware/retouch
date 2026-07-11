import type { CurvePoint, Curves } from "../types";
import { clamp } from "./math";

/**
 * Tone curves as a CPU LUT pass — the same "post pass over the composed
 * frame" pattern as the vignette, shared by the live preview, the image
 * exporter, and the per-frame video pipeline.
 */

const EPS = 1e-4;

export function curveIsIdentity(points: CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  const [a, b] = points;
  return (
    Math.abs(a.x) < EPS && Math.abs(a.y) < EPS && Math.abs(b.x - 1) < EPS && Math.abs(b.y - 1) < EPS
  );
}

export function curvesAreIdentity(curves: Curves): boolean {
  return (
    curveIsIdentity(curves.master) &&
    curveIsIdentity(curves.r) &&
    curveIsIdentity(curves.g) &&
    curveIsIdentity(curves.b)
  );
}

/** Sorted, clamped, deduplicated control points (never fewer than 2). */
function sanitize(points: CurvePoint[]): CurvePoint[] {
  const pts = points
    .map((p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }))
    .sort((a, b) => a.x - b.x)
    .filter((p, i, arr) => i === 0 || p.x - arr[i - 1].x > EPS);
  if (pts.length < 2)
    return [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ];
  return pts;
}

/**
 * 256-entry LUT through the control points using Fritsch–Carlson monotone
 * cubic interpolation — no overshoot, so tone curves never invert locally.
 */
export function buildCurveLut(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const pts = sanitize(points);
  const n = pts.length;

  // Segment slopes
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    slope.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  }

  // Tangents (Fritsch–Carlson)
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m.push(0);
    } else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      m.push((w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]));
    }
  }
  m.push(slope[n - 2]);

  let seg = 0;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    if (x <= pts[0].x) {
      lut[i] = Math.round(pts[0].y * 255);
      continue;
    }
    if (x >= pts[n - 1].x) {
      lut[i] = Math.round(pts[n - 1].y * 255);
      continue;
    }
    while (seg < n - 2 && x > pts[seg + 1].x) seg++;
    const h = dx[seg];
    const t = (x - pts[seg].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const y =
      pts[seg].y * (2 * t3 - 3 * t2 + 1) +
      m[seg] * h * (t3 - 2 * t2 + t) +
      pts[seg + 1].y * (-2 * t3 + 3 * t2) +
      m[seg + 1] * h * (t3 - t2);
    lut[i] = Math.round(clamp(y, 0, 1) * 255);
  }
  return lut;
}

export interface CurveLuts {
  r: Uint8ClampedArray;
  g: Uint8ClampedArray;
  b: Uint8ClampedArray;
}

/** Per-channel LUTs with the master curve composed on top: out = master(channel(v)). */
export function buildCurveLuts(curves: Curves): CurveLuts {
  const master = buildCurveLut(curves.master);
  const compose = (points: CurvePoint[]): Uint8ClampedArray => {
    const channel = buildCurveLut(points);
    const out = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) out[i] = master[channel[i]];
    return out;
  };
  return { r: compose(curves.r), g: compose(curves.g), b: compose(curves.b) };
}

/** Apply the curves in place over a canvas 2D context. */
export function applyCurvesToContext(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  luts: CurveLuts,
): void {
  if (width === 0 || height === 0) return;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const { r, g, b } = luts;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r[data[i]];
    data[i + 1] = g[data[i + 1]];
    data[i + 2] = b[data[i + 2]];
  }
  ctx.putImageData(image, 0, 0);
}
