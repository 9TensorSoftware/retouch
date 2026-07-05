import { FabricImage, StaticCanvas } from "fabric";
import type { ImageEdits } from "../types";
import { createCanvas } from "../utils/canvas";
import { buildFabricFilters, drawVignette, isNeutral } from "../utils/filters";

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
  const { crop, rotation, adjustments, filter, filterStrength } = edits;

  // Source crop region in pixels
  const sx = crop.x * srcWidth;
  const sy = crop.y * srcHeight;
  const sw = Math.max(1, crop.width * srcWidth);
  const sh = Math.max(1, crop.height * srcHeight);

  // Cap output resolution
  const k = Math.min(EXPORT_MAX_DIM / sw, EXPORT_MAX_DIM / sh, 1);
  const cropW = even(sw * k);
  const cropH = even(sh * k);

  // Output dimensions account for rotation (same expansion as exportImage)
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const outW = even(cropW * cos + cropH * sin);
  const outH = even(cropH * cos + cropW * sin);

  const neutralVisual =
    isNeutral(adjustments, filter, filterStrength) && adjustments.vignette === 0 && rotation === 0;
  const fullFrame = crop.x === 0 && crop.y === 0 && crop.width === 1 && crop.height === 1;

  const cropCanvas = createCanvas(cropW, cropH);
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) throw new Error("[Retouch] Failed to create export crop context");

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
    fabricImg = new FabricImage(cropCanvas, {
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
    isIdentity: neutralVisual && fullFrame && k === 1,
    processFrame(sample) {
      sample.draw(cropCtx, sx, sy, sw, sh, 0, 0, cropW, cropH);
      if (neutralVisual || !staticCanvas || !fabricImg) return cropCanvas;
      fabricImg.applyFilters();
      staticCanvas.renderAll();
      const element = staticCanvas.getElement();
      if (adjustments.vignette > 0) {
        const ctx = element.getContext("2d");
        if (ctx) drawVignette(ctx, element.width, element.height, adjustments.vignette);
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
