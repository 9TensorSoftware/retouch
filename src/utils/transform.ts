import type { CropRect, Orientation } from "../types";

/**
 * Geometry helpers for the coarse transform (90°-step orientation + mirroring).
 *
 * The display space is `Rotate(orientation) ∘ Flip(flipH, flipV)` applied to
 * the raw source; crop rects are normalized over that display space, so every
 * transform change must remap the crop to keep it over the same content.
 */

export function orientedDims(
  width: number,
  height: number,
  orientation: Orientation,
): { width: number; height: number } {
  return orientation % 180 === 0 ? { width, height } : { width: height, height: width };
}

export function rotateOrientation(orientation: Orientation, quarterTurnsCW: number): Orientation {
  const turns = (((orientation / 90 + quarterTurnsCW) % 4) + 4) % 4;
  return (turns * 90) as Orientation;
}

/** Remap a normalized crop after the display rotates 90° clockwise. */
export function rotateCropCW(crop: CropRect): CropRect {
  return { x: 1 - crop.y - crop.height, y: crop.x, width: crop.height, height: crop.width };
}

/** Remap a normalized crop after the display rotates 90° counter-clockwise. */
export function rotateCropCCW(crop: CropRect): CropRect {
  return { x: crop.y, y: 1 - crop.x - crop.width, width: crop.height, height: crop.width };
}

/** Remap a normalized crop after the display mirrors horizontally. */
export function flipCropX(crop: CropRect): CropRect {
  return { ...crop, x: 1 - crop.x - crop.width };
}

/** Remap a normalized crop after the display mirrors vertically. */
export function flipCropY(crop: CropRect): CropRect {
  return { ...crop, y: 1 - crop.y - crop.height };
}

export interface SourceTransform {
  /** Raw source dimensions. */
  sourceWidth: number;
  sourceHeight: number;
  orientation: Orientation;
  flipH: boolean;
  flipV: boolean;
  /** Uniform output scale. */
  scale: number;
  /** Offset subtracted in output space (e.g. the crop origin), default 0. */
  offsetX?: number;
  offsetY?: number;
}

/**
 * Set the canvas transform so that drawing the raw source centered at the
 * origin — `drawImage(src, -sourceWidth/2, -sourceHeight/2, sourceWidth,
 * sourceHeight)` — lands flipped, rotated, scaled, and shifted by the crop
 * offset. Shared by the live renderer and both export paths so geometry
 * matches everywhere.
 */
export function applySourceTransform(ctx: CanvasRenderingContext2D, t: SourceTransform): void {
  const { width: ow, height: oh } = orientedDims(t.sourceWidth, t.sourceHeight, t.orientation);
  ctx.translate((ow * t.scale) / 2 - (t.offsetX ?? 0), (oh * t.scale) / 2 - (t.offsetY ?? 0));
  ctx.rotate((t.orientation * Math.PI) / 180);
  ctx.scale(t.scale * (t.flipH ? -1 : 1), t.scale * (t.flipV ? -1 : 1));
}

/**
 * Scale factor for the largest same-aspect rectangle inscribed in a
 * width×height rectangle rotated by `degrees` (Lightroom-style "constrain
 * crop" for the straighten slider). Multiply the dims by the returned factor
 * to get the inscribed window; zoom the preview by its inverse to fill the
 * frame with no background corners.
 */
export function straightenFitScale(width: number, height: number, degrees: number): number {
  if (width <= 0 || height <= 0 || degrees % 360 === 0) return 1;
  const rad = Math.abs((degrees * Math.PI) / 180);
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  // An axis-aligned w×h box fits in the rotated rect iff its bounding box in
  // the source frame fits: w·cos + h·sin ≤ W and w·sin + h·cos ≤ H.
  return Math.min(width / (width * cos + height * sin), height / (width * sin + height * cos), 1);
}
