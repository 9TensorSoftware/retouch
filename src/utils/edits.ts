import type { ImageEdits } from "../types";
import { curvesAreIdentity } from "./curves";
import { isNeutral } from "./filters";
import { hslIsNeutral } from "./hsl";
import { liquifyIsNeutral } from "./liquify";
import { masksAreNeutral } from "./masks";
import { stylizeIsNeutral } from "./stylize";

/**
 * True when the edits change no pixel — nothing to bake, nothing to export
 * differently. Covers every color pass and every geometric transform.
 */
export function imageEditsAreNeutral(edits: ImageEdits): boolean {
  const c = edits.crop;
  return (
    isNeutral(edits.adjustments, edits.filter, edits.filterStrength) &&
    edits.adjustments.vignette === 0 &&
    edits.adjustments.clarity === 0 &&
    edits.adjustments.dehaze === 0 &&
    c.x === 0 &&
    c.y === 0 &&
    c.width === 1 &&
    c.height === 1 &&
    edits.rotation === 0 &&
    edits.keystoneV === 0 &&
    edits.keystoneH === 0 &&
    edits.lensDistortion === 0 &&
    edits.lensDevignette === 0 &&
    edits.seamWidth === 100 &&
    edits.orientation === 0 &&
    !edits.flipH &&
    !edits.flipV &&
    curvesAreIdentity(edits.curves) &&
    hslIsNeutral(edits.hsl) &&
    masksAreNeutral(edits.masks) &&
    stylizeIsNeutral(edits.stylize) &&
    liquifyIsNeutral(edits.liquify)
  );
}

/**
 * True when the edits leave every pixel where it was: no crop, turn, flip,
 * straighten, perspective, lens warp, content-aware width or liquify. Tone
 * and color edits don't count.
 */
export function framingIsNeutral(edits: ImageEdits): boolean {
  const c = edits.crop;
  return (
    c.x === 0 &&
    c.y === 0 &&
    c.width === 1 &&
    c.height === 1 &&
    edits.rotation === 0 &&
    edits.orientation === 0 &&
    !edits.flipH &&
    !edits.flipV &&
    edits.keystoneV === 0 &&
    edits.keystoneH === 0 &&
    edits.lensDistortion === 0 &&
    edits.seamWidth === 100 &&
    liquifyIsNeutral(edits.liquify)
  );
}
