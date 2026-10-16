import { FabricImage, StaticCanvas } from "fabric";
import { DEFAULT_ADJUSTMENTS } from "../../constants";
import type {
  Adjustments,
  Curves,
  EditMask,
  FilterPreset,
  HslMixer,
  StylizeEffect,
} from "../../types";
import { createCanvas } from "../../utils/canvas";
import { applyCurvesToContext, buildCurveLuts, curvesAreIdentity } from "../../utils/curves";
import { applyDetailToContext, detailIsNeutral } from "../../utils/detail";
import { buildFabricFilters, drawVignette } from "../../utils/filters";
import { applyHslToContext, buildHueTable, hslIsNeutral } from "../../utils/hsl";
import { applyMasksToContext, masksAreNeutral, prepareMasks } from "../../utils/masks";
import { applyStylizeToContext, stylizeIsNeutral } from "../../utils/stylize";

/** The tone, color and effect edits a preview tile can show (no geometry). */
export interface LookEdits {
  adjustments?: Adjustments;
  filter?: FilterPreset;
  filterStrength?: number;
  curves?: Curves;
  hsl?: HslMixer;
  stylize?: StylizeEffect;
  /** Selective masks; only meaningful when `base` is the full, uncropped frame. */
  masks?: EditMask[];
}

type Drawable = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

function sizeOf(source: Drawable): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (source instanceof HTMLVideoElement) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  return { width: source.width, height: source.height };
}

/**
 * A small square-ish copy of the photo to draw previews from: the long edge
 * is `size` px, so a dozen tiles render in a few milliseconds.
 */
export function createPreviewBase(source: Drawable, size = 160): HTMLCanvasElement {
  const { width, height } = sizeOf(source);
  const scale = Math.min(size / Math.max(1, width), size / Math.max(1, height), 1);
  const base = createCanvas(
    Math.max(1, Math.round(width * scale)),
    Math.max(1, Math.round(height * scale)),
  );
  if (width > 0 && height > 0)
    base.getContext("2d")?.drawImage(source, 0, 0, base.width, base.height);
  return base;
}

/**
 * `base` with a look applied — the same filter stack and 2D passes, in the
 * same order, as the editor's preview — as a JPEG data URL for a tile.
 */
export function renderLook(base: HTMLCanvasElement, edits: LookEdits): string {
  if (base.width === 0 || base.height === 0) return "";
  return renderLookToCanvas(base, edits).toDataURL("image/jpeg", 0.86);
}

/** As renderLook, into a canvas the size of `base` (transparency kept). */
export function renderLookToCanvas(base: HTMLCanvasElement, edits: LookEdits): HTMLCanvasElement {
  const adjustments = edits.adjustments ?? DEFAULT_ADJUSTMENTS;
  const { width, height } = base;

  const stage = new StaticCanvas(undefined, { width, height, enableRetinaScaling: false });
  const image = new FabricImage(base, { left: 0, top: 0, originX: "left", originY: "top" });
  image.filters = buildFabricFilters(
    adjustments,
    edits.filter ?? "none",
    edits.filterStrength ?? 100,
  );
  image.applyFilters();
  stage.add(image);
  stage.renderAll();
  const out = stage.toCanvasElement(1);
  stage.dispose();

  const ctx = out.getContext("2d");
  if (ctx) {
    if (!detailIsNeutral(adjustments.clarity, adjustments.dehaze)) {
      applyDetailToContext(ctx, out.width, out.height, adjustments.clarity, adjustments.dehaze);
    }
    if (edits.masks && !masksAreNeutral(edits.masks)) {
      applyMasksToContext(ctx, out.width, out.height, prepareMasks(edits.masks));
    }
    if (edits.hsl && !hslIsNeutral(edits.hsl)) {
      applyHslToContext(ctx, out.width, out.height, buildHueTable(edits.hsl));
    }
    if (edits.curves && !curvesAreIdentity(edits.curves)) {
      applyCurvesToContext(ctx, out.width, out.height, buildCurveLuts(edits.curves));
    }
    if (edits.stylize && !stylizeIsNeutral(edits.stylize)) {
      applyStylizeToContext(ctx, out.width, out.height, edits.stylize);
    }
    if (adjustments.vignette > 0) {
      drawVignette(ctx, out.width, out.height, adjustments.vignette);
    }
  }
  return out;
}
