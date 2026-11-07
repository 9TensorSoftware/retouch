import type { Framing, ImageEdits, Orientation } from "../types";
import { lensSourcePoint } from "./lens";
import { keystoneScaleAt } from "./perspective";
import { orientedDims, straightenFitScale } from "./transform";

/**
 * Where a result's pixels came from, walking the frame pipeline backwards:
 * straighten, lens, keystone, crop, turn, flip. Points are fractions of the
 * image's width and height, so a step doesn't care what size its pixels were
 * baked at. Liquify and content-aware width move pixels too, but no edge of
 * the frame follows them, so they don't count here.
 */

export interface Point {
  x: number;
  y: number;
}

/** Points along each edge where the outline bends. */
const CURVE_SAMPLES = 32;

export function framingOf(edits: ImageEdits, width: number, height: number): Framing {
  return {
    width: width * (edits.seamWidth / 100),
    height,
    crop: { ...edits.crop },
    rotation: edits.rotation,
    keystoneV: edits.keystoneV,
    keystoneH: edits.keystoneH,
    lensDistortion: edits.lensDistortion,
    orientation: edits.orientation,
    flipH: edits.flipH,
    flipV: edits.flipV,
  };
}

/** Undo the turn and flip: from the display's frame to the raw source's. */
function unorient(point: Point, orientation: Orientation, flipH: boolean, flipV: boolean): Point {
  let { x, y } = point;
  if (orientation === 90) [x, y] = [y, 1 - x];
  else if (orientation === 180) [x, y] = [1 - x, 1 - y];
  else if (orientation === 270) [x, y] = [1 - y, x];
  return { x: flipH ? 1 - x : x, y: flipV ? 1 - y : y };
}

/** Where a point of a step's result sits in the pixels the step worked on. */
export function toSource(point: Point, framing: Framing): Point {
  const { crop, rotation, keystoneV, keystoneH, lensDistortion } = framing;
  const oriented = orientedDims(framing.width, framing.height, framing.orientation);
  const width = Math.max(1, oriented.width * crop.width);
  const height = Math.max(1, oriented.height * crop.height);

  // Straighten turns the crop about its center, and zooms in to fill the frame.
  const fit = straightenFitScale(width, height, rotation);
  const dx = (point.x - 0.5) * width * fit;
  const dy = (point.y - 0.5) * height * fit;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  let x = 0.5 + (cos * dx + sin * dy) / width;
  let y = 0.5 + (cos * dy - sin * dx) / height;

  if (lensDistortion !== 0) {
    ({ x, y } = lensSourcePoint(x, y, width, height, lensDistortion));
  }
  // The keystone warp runs vertical then horizontal, so it unwinds the other way.
  if (keystoneH !== 0) y = 0.5 + (y - 0.5) / keystoneScaleAt(x, keystoneH);
  if (keystoneV !== 0) x = 0.5 + (x - 0.5) / keystoneScaleAt(y, keystoneV);

  return unorient(
    { x: crop.x + x * crop.width, y: crop.y + y * crop.height },
    framing.orientation,
    framing.flipH,
    framing.flipV,
  );
}

/**
 * The scale that fits a picture on the stage, with a small margin. A whole
 * photo stops at its own pixels; a crop fills the stage however few it has
 * kept, or cropping to a small area would just show a small picture.
 */
export function stageFitScale(
  available: { width: number; height: number },
  source: { width: number; height: number },
  cropped: boolean,
): number {
  const fit = Math.min(
    (available.width * 0.9) / source.width,
    (available.height * 0.9) / source.height,
  );
  return cropped ? fit : Math.min(fit, 1);
}

function keepsWholeFrame(framing: Framing): boolean {
  const { crop } = framing;
  return (
    crop.x === 0 &&
    crop.y === 0 &&
    crop.width === 1 &&
    crop.height === 1 &&
    framing.rotation === 0 &&
    framing.keystoneV === 0 &&
    framing.keystoneH === 0 &&
    framing.lensDistortion === 0
  );
}

/**
 * The result's edge, traced on the original through every step from the
 * oldest bake to the edits on it now. Null when it would just be the whole
 * photo, as when it's only been turned.
 */
export function outlineOf(steps: readonly Framing[]): Point[] | null {
  if (steps.every(keepsWholeFrame)) return null;
  const curved = steps.some(
    (step) => step.keystoneV !== 0 || step.keystoneH !== 0 || step.lensDistortion !== 0,
  );
  const samples = curved ? CURVE_SAMPLES : 1;
  const edge: Point[] = [];
  for (let i = 0; i < samples; i++) edge.push({ x: i / samples, y: 0 });
  for (let i = 0; i < samples; i++) edge.push({ x: 1, y: i / samples });
  for (let i = 0; i < samples; i++) edge.push({ x: 1 - i / samples, y: 1 });
  for (let i = 0; i < samples; i++) edge.push({ x: 0, y: 1 - i / samples });
  return edge.map((point) => steps.reduceRight(toSource, point));
}
