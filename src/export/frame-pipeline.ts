import { FabricImage, StaticCanvas } from "fabric";
import type { ImageEdits } from "../types";
import { createCanvas } from "../utils/canvas";
import { applyCurvesToContext, buildCurveLuts, curvesAreIdentity } from "../utils/curves";
import { applyDetailToContext, detailIsNeutral } from "../utils/detail";
import { buildFabricFilters, drawVignette, isNeutral } from "../utils/filters";
import { applyHslToContext, buildHueTable, hslIsNeutral } from "../utils/hsl";
import { applyLensToCanvas, hasLens } from "../utils/lens";
import { applyMasksToContext, masksAreNeutral, prepareMasks } from "../utils/masks";
import { applyKeystone, hasKeystone } from "../utils/perspective";
import { applyStylizeToContext, stylizeIsNeutral } from "../utils/stylize";
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
    lensDistortion,
    lensDevignette,
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
  const lens = hasLens(lensDistortion, lensDevignette);
  const detailNeutral = detailIsNeutral(adjustments.clarity, adjustments.dehaze);
  const curveLuts = curvesAreIdentity(edits.curves) ? null : buildCurveLuts(edits.curves);
  const hueTable = hslIsNeutral(edits.hsl) ? null : buildHueTable(edits.hsl);
  const preparedMasks = masksAreNeutral(edits.masks) ? [] : prepareMasks(edits.masks);
  const stylizeNeutral = stylizeIsNeutral(edits.stylize);
  const deflicker = "deflicker" in edits && (edits as { deflicker: boolean }).deflicker === true;
  const untransformed = orientation === 0 && !flipH && !flipV;
  const neutralVisual =
    isNeutral(adjustments, filter, filterStrength) &&
    adjustments.vignette === 0 &&
    rotation === 0 &&
    !warp &&
    !lens &&
    detailNeutral &&
    !curveLuts &&
    !hueTable &&
    preparedMasks.length === 0 &&
    stylizeNeutral &&
    !deflicker;
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

  // Perspective/lens corrections warp the cropped frame before fabric sees it.
  let warpCanvas: HTMLCanvasElement | null = null;
  let warpCtx: CanvasRenderingContext2D | null = null;
  let warpScratch: HTMLCanvasElement | null = null;
  if (warp) {
    warpCanvas = createCanvas(cropW, cropH);
    warpCtx = warpCanvas.getContext("2d");
    warpScratch = createCanvas(1, 1);
  }
  let lensCanvas: HTMLCanvasElement | null = null;
  let lensCtx: CanvasRenderingContext2D | null = null;
  if (lens) {
    lensCanvas = createCanvas(cropW, cropH);
    lensCtx = lensCanvas.getContext("2d");
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
    fabricImg = new FabricImage(lensCanvas ?? warpCanvas ?? cropCanvas, {
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

  // Deflicker state: exponential moving average of the frame's mean luma.
  let emaLuma: number | null = null;

  function applyDeflicker(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const image = ctx.getImageData(0, 0, w, h);
    const data = image.data;
    let sum = 0;
    let count = 0;
    const stride = Math.max(4, Math.floor(data.length / 4 / 50_000) * 4);
    for (let i = 0; i < data.length; i += stride) {
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      count++;
    }
    const mean = Math.max(1, sum / count);
    emaLuma = emaLuma === null ? mean : emaLuma * 0.85 + mean * 0.15;
    const gain = Math.min(1.18, Math.max(0.85, emaLuma / mean));
    if (Math.abs(gain - 1) < 0.005) return;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * gain);
      data[i + 1] = Math.min(255, data[i + 1] * gain);
      data[i + 2] = Math.min(255, data[i + 2] * gain);
    }
    ctx.putImageData(image, 0, 0);
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
      if (lensCanvas && lensCtx) {
        applyLensToCanvas(warpCanvas ?? cropCanvas, lensCtx, lensDistortion, lensDevignette);
      }
      if (neutralVisual || !staticCanvas || !fabricImg) return cropCanvas;
      fabricImg.applyFilters();
      staticCanvas.renderAll();
      const element = staticCanvas.getElement();
      const ctx = element.getContext("2d");
      if (ctx && !detailNeutral) {
        applyDetailToContext(
          ctx,
          element.width,
          element.height,
          adjustments.clarity,
          adjustments.dehaze,
        );
      }
      if (ctx && preparedMasks.length > 0) {
        applyMasksToContext(ctx, element.width, element.height, preparedMasks);
      }
      if (ctx && hueTable) {
        applyHslToContext(ctx, element.width, element.height, hueTable);
      }
      if (ctx && curveLuts) {
        applyCurvesToContext(ctx, element.width, element.height, curveLuts);
      }
      if (ctx && !stylizeNeutral) {
        applyStylizeToContext(ctx, element.width, element.height, edits.stylize);
      }
      if (ctx && adjustments.vignette > 0) {
        drawVignette(ctx, element.width, element.height, adjustments.vignette);
      }
      if (ctx && deflicker) {
        applyDeflicker(ctx, element.width, element.height);
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
