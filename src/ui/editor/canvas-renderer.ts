import { Canvas, FabricImage } from "fabric";
import { createDefaultCurves, IMAGE_PREVIEW_MAX_DIM, PREVIEW_MAX_DIM } from "../../constants";
import type {
  Adjustments,
  CropRect,
  Curves,
  FilterPreset,
  ImageEdits,
  Orientation,
} from "../../types";
import { createCanvas } from "../../utils/canvas";
import type { CurveLuts } from "../../utils/curves";
import { applyCurvesToContext, buildCurveLuts, curvesAreIdentity } from "../../utils/curves";
import { buildFabricFilters, drawVignette, isNeutral } from "../../utils/filters";
import { applyKeystone, hasKeystone } from "../../utils/perspective";
import { applySourceTransform, orientedDims, straightenFitScale } from "../../utils/transform";

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RenderSource = HTMLImageElement | HTMLVideoElement;

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

export class CanvasRenderer {
  private readonly fabricCanvas: Canvas;
  private readonly fabricImage: FabricImage;
  private readonly container: HTMLElement;
  private readonly source: RenderSource;
  private readonly video: HTMLVideoElement | null;
  /**
   * Every source renders through this capped intermediate canvas: it bounds
   * per-frame filter cost, stays inside the WebGL texture limit, and bakes
   * the orientation/flip transform in so crop-overlay math stays
   * source-agnostic.
   */
  private frameCanvas: HTMLCanvasElement;
  private frameCtx: CanvasRenderingContext2D;
  /** Scratch canvases for the keystone warp (allocated on first use). */
  private warpSrc: HTMLCanvasElement | null = null;
  private warpScratch: HTMLCanvasElement | null = null;
  private readonly rawWidth: number;
  private readonly rawHeight: number;
  private readonly previewCap: number;
  private readonly abort = new AbortController();
  private adjustments: Adjustments;
  private rotation = 0;
  private keystoneV = 0;
  private keystoneH = 0;
  private curves: Curves = createDefaultCurves();
  /** Cached LUTs; null while the curves are identity. */
  private curveLuts: CurveLuts | null = null;
  private orientation: Orientation;
  private flipH: boolean;
  private flipV: boolean;
  private filter: FilterPreset;
  private filterStrength: number;
  private crop: CropRect;
  /** The committed crop stays applied in every tool; compare lifts it briefly. */
  private cropApplied = true;
  private imageRect: ImageRect = { x: 0, y: 0, width: 0, height: 0 };
  private looping = false;

  constructor(container: HTMLElement, source: RenderSource, edits: ImageEdits) {
    this.container = container;
    this.source = source;
    this.adjustments = { ...edits.adjustments };
    this.rotation = edits.rotation;
    this.keystoneV = edits.keystoneV;
    this.keystoneH = edits.keystoneH;
    this.setCurves(edits.curves);
    this.orientation = edits.orientation;
    this.flipH = edits.flipH;
    this.flipV = edits.flipV;
    this.filter = edits.filter;
    this.filterStrength = edits.filterStrength;
    this.crop = { ...edits.crop };

    this.video = "videoWidth" in source ? source : null;
    if (this.video) {
      this.rawWidth = this.video.videoWidth;
      this.rawHeight = this.video.videoHeight;
      this.previewCap = PREVIEW_MAX_DIM;
    } else {
      const image = source as HTMLImageElement;
      this.rawWidth = image.naturalWidth;
      this.rawHeight = image.naturalHeight;
      this.previewCap = IMAGE_PREVIEW_MAX_DIM;
    }

    const { canvas, ctx } = this.buildFrameCanvas();
    this.frameCanvas = canvas;
    this.frameCtx = ctx;
    this.drawFrame();

    const canvasEl = document.createElement("canvas");
    this.container.appendChild(canvasEl);

    this.fabricCanvas = new Canvas(canvasEl, {
      selection: false,
      renderOnAddRemove: false,
      skipTargetFind: true,
    });

    this.fabricImage = new FabricImage(this.frameCanvas, {
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      originX: "center",
      originY: "center",
      objectCaching: false,
    });

    this.fabricCanvas.add(this.fabricImage);

    // Curves and vignette are 2D passes over the composed frame, not fabric
    // filters (curves need an arbitrary per-channel LUT).
    this.fabricCanvas.on("after:render", ({ ctx: renderCtx }) => {
      if (!renderCtx) return;
      const el = this.fabricCanvas.getElement();
      if (this.curveLuts) {
        applyCurvesToContext(renderCtx, el.width, el.height, this.curveLuts);
      }
      if (this.adjustments.vignette > 0) {
        drawVignette(renderCtx, el.width, el.height, this.adjustments.vignette);
      }
    });

    if (this.video) {
      const signal = this.abort.signal;
      this.video.addEventListener("play", () => this.startLoop(), { signal });
      this.video.addEventListener(
        "pause",
        () => {
          this.stopLoop();
          this.renderFrame();
        },
        { signal },
      );
      this.video.addEventListener(
        "ended",
        () => {
          this.stopLoop();
          this.renderFrame();
        },
        { signal },
      );
      this.video.addEventListener(
        "seeked",
        () => {
          if (this.video?.paused) this.renderFrame();
        },
        { signal },
      );
    }
  }

  setAdjustments(adj: Adjustments): void {
    this.adjustments = { ...adj };
  }

  setRotation(deg: number): void {
    this.rotation = deg;
  }

  /** Update the tone curves (LUTs are rebuilt once per change, not per frame). */
  setCurves(curves: Curves): void {
    this.curves = structuredClone(curves);
    this.curveLuts = curvesAreIdentity(curves) ? null : buildCurveLuts(curves);
  }

  /**
   * Luminance histogram of the current (cropped/warped, pre-color) frame —
   * the input the tone curves operate on.
   */
  computeHistogram(): Uint32Array {
    const bins = new Uint32Array(256);
    const w = this.frameCanvas.width;
    const h = this.frameCanvas.height;
    if (w === 0 || h === 0) return bins;
    const data = this.frameCtx.getImageData(0, 0, w, h).data;
    // Sample at a stride that caps the work near ~250k pixels.
    const step = Math.max(1, Math.floor((w * h) / 250_000)) * 4;
    for (let i = 0; i < data.length; i += step) {
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      bins[Math.min(255, Math.round(lum))]++;
    }
    return bins;
  }

  /** Update keystone correction; the frame is redrawn through the warp. */
  setKeystone(vertical: number, horizontal: number): void {
    if (vertical === this.keystoneV && horizontal === this.keystoneH) return;
    this.keystoneV = vertical;
    this.keystoneH = horizontal;
    this.drawFrame();
  }

  setFilter(preset: FilterPreset): void {
    this.filter = preset;
  }

  setFilterStrength(strength: number): void {
    this.filterStrength = strength;
  }

  /** Update orientation/mirroring; the frame canvas is rebuilt to the new dims. */
  setTransform(orientation: Orientation, flipH: boolean, flipV: boolean): void {
    this.orientation = orientation;
    this.flipH = flipH;
    this.flipV = flipV;
    this.updateFrameGeometry();
  }

  /** Track the crop rect (only affects pixels while the crop is applied). */
  setCrop(crop: CropRect): void {
    this.crop = { ...crop };
    if (this.cropApplied) this.updateFrameGeometry();
  }

  /**
   * Show the cropped region only (Lightroom-style: every tool but Crop sees
   * the cropped image; the Crop tool sees the full frame plus the marquee).
   */
  setCropApplied(applied: boolean): void {
    if (applied === this.cropApplied) return;
    this.cropApplied = applied;
    this.updateFrameGeometry();
  }

  getImageRect(): ImageRect {
    return { ...this.imageRect };
  }

  getCanvasElement(): HTMLCanvasElement {
    return this.fabricCanvas.getElement();
  }

  render(): void {
    // Measure the available area from the parent, not `this.container`: the
    // container is sized by its content (the canvas), so measuring it here would
    // feed each render's canvas size back into the next render's fit scale,
    // shrinking the image by the 0.9 margin on every edit.
    const area = this.container.parentElement;
    const availWidth = (area?.clientWidth ?? this.container.clientWidth) || 800;
    const availHeight = (area?.clientHeight ?? this.container.clientHeight) || 600;

    const { width: sourceW, height: sourceH } = this.visibleSize();
    if (sourceW === 0 || sourceH === 0) return;

    // Fit the oriented source within the available area, with a small margin.
    const scale = Math.min((availWidth * 0.9) / sourceW, (availHeight * 0.9) / sourceH, 1);

    const drawW = Math.round(sourceW * scale);
    const drawH = Math.round(sourceH * scale);

    // Size the fabric canvas to the drawn image dimensions
    this.fabricCanvas.setDimensions({ width: drawW, height: drawH });

    // Straighten fills the frame: zoom by the inverse of the largest
    // inscribed same-aspect rect so rotation never exposes the background.
    const fit = straightenFitScale(sourceW, sourceH, this.rotation);
    this.fabricImage.set({
      left: drawW / 2,
      top: drawH / 2,
      scaleX: drawW / this.frameCanvas.width / fit,
      scaleY: drawH / this.frameCanvas.height / fit,
      angle: this.rotation,
    });

    this.applyFilters();

    this.imageRect = { x: 0, y: 0, width: drawW, height: drawH };

    this.fabricCanvas.requestRenderAll();
  }

  /** Redraw the current frame (and re-filter it when filters are active). */
  renderFrame(): void {
    this.drawFrame();
    if (!isNeutral(this.adjustments, this.filter, this.filterStrength)) {
      this.fabricImage.applyFilters();
    }
    this.fabricCanvas.requestRenderAll();
  }

  /** Convert screen coordinates (relative to canvas) to normalized image coords (0–1). */
  screenToImage(sx: number, sy: number): { x: number; y: number } {
    const r = this.imageRect;
    return {
      x: r.width > 0 ? (sx - r.x) / r.width : 0,
      y: r.height > 0 ? (sy - r.y) / r.height : 0,
    };
  }

  /** Convert normalized image coords (0–1) to screen coordinates relative to canvas. */
  imageToScreen(ix: number, iy: number): { x: number; y: number } {
    const r = this.imageRect;
    return {
      x: r.x + ix * r.width,
      y: r.y + iy * r.height,
    };
  }

  destroy(): void {
    this.stopLoop();
    this.abort.abort();
    this.fabricCanvas.dispose();
  }

  /** Oriented source dimensions (raw, uncapped). */
  private orientedSize(): { width: number; height: number } {
    return orientedDims(this.rawWidth, this.rawHeight, this.orientation);
  }

  private cropActive(): boolean {
    const c = this.crop;
    return this.cropApplied && (c.x > 0 || c.y > 0 || c.width < 1 || c.height < 1);
  }

  /** Oriented dims of what the preview shows (crop region when applied). */
  private visibleSize(): { width: number; height: number } {
    const { width, height } = this.orientedSize();
    if (!this.cropActive()) return { width, height };
    return {
      width: Math.max(1, width * this.crop.width),
      height: Math.max(1, height * this.crop.height),
    };
  }

  private frameDims(): { width: number; height: number } {
    const { width, height } = this.visibleSize();
    const cap = Math.min(this.previewCap / width, this.previewCap / height, 1);
    return {
      width: Math.max(1, Math.round(width * cap)),
      height: Math.max(1, Math.round(height * cap)),
    };
  }

  /** Resize the frame canvas to the current visible region and redraw. */
  private updateFrameGeometry(): void {
    const { width, height } = this.frameDims();
    if (this.frameCanvas.width !== width || this.frameCanvas.height !== height) {
      this.frameCanvas.width = width;
      this.frameCanvas.height = height;
      this.fabricImage.set({ width, height });
    }
    this.drawFrame();
  }

  private buildFrameCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const { width, height } = this.frameDims();
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[Retouch] Failed to create preview frame context");
    return { canvas, ctx };
  }

  private drawFrame(): void {
    const oriented = this.orientedSize();
    const visible = this.visibleSize();
    const scale = this.frameCanvas.width / visible.width;
    const cropOn = this.cropActive();
    const warp = hasKeystone(this.keystoneV, this.keystoneH);

    // With keystone active, draw into a scratch canvas first, then warp it
    // into the frame canvas fabric reads from.
    let target: CanvasRenderingContext2D | null = this.frameCtx;
    if (warp) {
      if (!this.warpSrc) this.warpSrc = createCanvas(1, 1);
      if (!this.warpScratch) this.warpScratch = createCanvas(1, 1);
      if (
        this.warpSrc.width !== this.frameCanvas.width ||
        this.warpSrc.height !== this.frameCanvas.height
      ) {
        this.warpSrc.width = this.frameCanvas.width;
        this.warpSrc.height = this.frameCanvas.height;
      }
      target = this.warpSrc.getContext("2d");
      if (!target) return;
    }

    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, this.frameCanvas.width, this.frameCanvas.height);
    applySourceTransform(target, {
      sourceWidth: this.rawWidth,
      sourceHeight: this.rawHeight,
      orientation: this.orientation,
      flipH: this.flipH,
      flipV: this.flipV,
      scale,
      offsetX: cropOn ? this.crop.x * oriented.width * scale : 0,
      offsetY: cropOn ? this.crop.y * oriented.height * scale : 0,
    });
    target.drawImage(
      this.source,
      -this.rawWidth / 2,
      -this.rawHeight / 2,
      this.rawWidth,
      this.rawHeight,
    );
    target.restore();

    if (warp && this.warpSrc && this.warpScratch) {
      applyKeystone(this.warpSrc, this.warpScratch, this.frameCtx, this.keystoneV, this.keystoneH);
    }
  }

  private startLoop(): void {
    if (this.looping || !this.video) return;
    this.looping = true;
    const video = this.video as VideoWithRVFC;
    const rvfc =
      typeof video.requestVideoFrameCallback === "function"
        ? video.requestVideoFrameCallback.bind(video)
        : null;
    const schedule = (cb: () => void) => {
      if (rvfc) rvfc(cb);
      else requestAnimationFrame(cb);
    };
    const step = () => {
      if (!this.looping) return;
      this.renderFrame();
      schedule(step);
    };
    schedule(step);
  }

  private stopLoop(): void {
    this.looping = false;
  }

  private applyFilters(): void {
    this.fabricImage.filters = buildFabricFilters(
      this.adjustments,
      this.filter,
      this.filterStrength,
    );
    this.fabricImage.applyFilters();
  }
}
