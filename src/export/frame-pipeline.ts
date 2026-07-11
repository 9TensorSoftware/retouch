import { FabricImage, StaticCanvas } from "fabric";
import type { ImageEdits } from "../types";
import { createCanvas } from "../utils/canvas";
import { applyCurvesToContext, buildCurveLuts, curvesAreIdentity } from "../utils/curves";
import { buildFabricFilters, drawVignette, isNeutral } from "../utils/filters";
import { applyHslToContext, buildHueTable, hslIsNeutral } from "../utils/hsl";
import { applyKeystone, hasKeystone } from "../utils/perspective";
import { applySourceTransform, orientedDims, straightenFitScale } from "../utils/transform";

/**
 * Long-edge cap for exported video. Stays under fabric's default WebGL
 * texture size (2048) so filtered frames never fall off the GPU path.
 */
export const EXPORT_MAX_DIM = 1920;

/** Structural stand-in for mediabunny's VideoSample — keeps this module dependency-free. */
export interface DrawableSample {
  draw(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    sWidth: number,
    sHeight: number,
    dx: number,
    dy: number,
    dWidth?: number,
    dHeight?: number,
  ): void;
}

export interface FramePipeline {
  outWidth: number;
  outHeight: number;
  /** True when no edit changes any pixel — the caller can skip re-encoding entirely. */
  isIdentity: boolean;
  processFrame(sample: DrawableSample): HTMLCanvasElement;
  dispose(): void;
}

/** Encoders want even dimensions (yuv420 chroma subsampling). */
function even(value: number): number {
  const v = Math.max(2, Math.round(value));
  return v - (v % 2);
}

/**
 * Reusable per-frame transform applying crop → rotation → adjustments/filter,
 * with the same math and fabric filter stack as the editor preview and image
 * export, so exported video matches what the user saw.
 */
export function createFramePipeline(
  edits: ImageEdits,
  srcWidth: number,
  srcHeight: number,
): FramePipeline {
  const {
    crop,
    rotation,
    keystoneV,
    keystoneH,
    orientation,
    flipH,
    flipV,
    adjustments,
    filter,
    filterStrength,
  } = edits;

  // Crop region in oriented (rotated/flipped) source pixels
  const { width: orientedW, height: orientedH } = orientedDims(srcWidth, srcHeight, orientation);
  const sx = crop.x * orientedW;
  const sy = crop.y * orientedH;
  const sw = Math.max(1, crop.width * orientedW);
  const sh = Math.max(1, crop.height * orientedH);

  // Cap output resolution
  const k = Math.min(EXPORT_MAX_DIM / sw, EXPORT_MAX_DIM / sh, 1);
  const cropW = even(sw * k);
  const cropH = even(sh * k);

  // Straighten crops to the largest inscribed same-aspect window (matching
  // the preview's fill-the-frame zoom and the image exporter).
  const fit = straightenFitScale(cropW, cropH, rotation);
  const outW = even(cropW * fit);
  const outH = even(cropH * fit);

  const warp = hasKeystone(keystoneV, keystoneH);
  const curveLuts = curvesAreIdentity(edits.curves) ? null : buildCurveLuts(edits.curves);
  const hueTable = hslIsNeutral(edits.hsl) ? null : buildHueTable(edits.hsl);
  const untransformed = orientation === 0 && !flipH && !flipV;
  const neutralVisual =
    isNeutral(adjustments, filter, filterStrength) &&
    adjustments.vignette === 0 &&
    rotation === 0 &&
    !warp &&
    !curveLuts &&
    !hueTable;
  const fullFrame = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;

  const cropCanvas = createCanvas(cropW, cropH);
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) throw new Error("[Retouch] Failed to create export crop context");
  // The orientation/flip/crop transform is fixed for the pipeline's lifetime.
  applySourceTransform(cropCtx, {
    sourceWidth: srcWidth,
    sourceHeight: srcHeight,
    orientation,
    flipH,
    flipV,
    scale: k,
    offsetX: sx * k,
    offsetY: sy * k,
  });

  // Perspective correction warps the cropped frame before fabric sees it.
  let warpCanvas: HTMLCanvasElement | null = null;
  let warpCtx: CanvasRenderingContext2D | null = null;
  let warpScratch: HTMLCanvasElement | null = null;
  if (warp) {
    warpCanvas = createCanvas(cropW, cropH);
    warpCtx = warpCanvas.getContext("2d");
    warpScratch = createCanvas(1, 1);
  }

  // fabric is only involved when rotation or filters actually apply
  let staticCanvas: StaticCanvas | null = null;
  let fabricImg: FabricImage | null = null;
  if (!neutralVisual) {
    staticCanvas = new StaticCanvas(undefined, {
      width: outW,
      height: outH,
      renderOnAddRemove: false,
      // The encoder reads the backing element directly — keep it at logical
      // size or devicePixelRatio would scale the exported resolution.
      enableRetinaScaling: false,
    });
    fabricImg = new FabricImage(warpCanvas ?? cropCanvas, {
      selectable: false,
      evented: false,
      originX: "center",
      originY: "center",
      left: outW / 2,
      top: outH / 2,
      angle: rotation,
      objectCaching: false,
    });
    fabricImg.filters = buildFabricFilters(adjustments, filter, filterStrength);
    staticCanvas.add(fabricImg);
  }

  return {
    outWidth: neutralVisual ? cropW : outW,
    outHeight: neutralVisual ? cropH : outH,
    isIdentity: neutralVisual && fullFrame && untransformed && k === 1,
    processFrame(sample) {
      sample.draw(
        cropCtx,
        0,
        0,
        srcWidth,
        srcHeight,
        -srcWidth / 2,
        -srcHeight / 2,
        srcWidth,
        srcHeight,
      );
      if (warpCanvas && warpCtx && warpScratch) {
        applyKeystone(cropCanvas, warpScratch, warpCtx, keystoneV, keystoneH);
      }
      if (neutralVisual || !staticCanvas || !fabricImg) return cropCanvas;
      fabricImg.applyFilters();
      staticCanvas.renderAll();
      const element = staticCanvas.getElement();
      const ctx = element.getContext("2d");
      if (ctx && hueTable) {
        applyHslToContext(ctx, element.width, element.height, hueTable);
      }
      if (ctx && curveLuts) {
        applyCurvesToContext(ctx, element.width, element.height, curveLuts);
      }
      if (ctx && adjustments.vignette > 0) {
        drawVignette(ctx, element.width, element.height, adjustments.vignette);
      }
      return element;
    },
    dispose() {
      staticCanvas?.dispose();
      staticCanvas = null;
      fabricImg = null;
    },
  };
}
