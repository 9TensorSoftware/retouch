import { Canvas, FabricImage } from "fabric";
import { IMAGE_PREVIEW_MAX_DIM, PREVIEW_MAX_DIM } from "../../constants";
import type { Adjustments, FilterPreset, ImageEdits, Orientation } from "../../types";
import { createCanvas } from "../../utils/canvas";
import { buildFabricFilters, drawVignette, isNeutral } from "../../utils/filters";
import { applySourceTransform, orientedDims } from "../../utils/transform";

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
  private readonly rawWidth: number;
  private readonly rawHeight: number;
  private readonly previewCap: number;
  private readonly abort = new AbortController();
  private adjustments: Adjustments;
  private rotation = 0;
  private orientation: Orientation;
  private flipH: boolean;
  private flipV: boolean;
  private filter: FilterPreset;
  private filterStrength: number;
  private imageRect: ImageRect = { x: 0, y: 0, width: 0, height: 0 };
  private looping = false;

  constructor(container: HTMLElement, source: RenderSource, edits: ImageEdits) {
    this.container = container;
    this.source = source;
    this.adjustments = { ...edits.adjustments };
    this.rotation = edits.rotation;
    this.orientation = edits.orientation;
    this.flipH = edits.flipH;
    this.flipV = edits.flipV;
    this.filter = edits.filter;
    this.filterStrength = edits.filterStrength;

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

    // Vignette is a 2D pass over the composed frame, not a fabric filter.
    this.fabricCanvas.on("after:render", ({ ctx: renderCtx }) => {
      if (this.adjustments.vignette > 0 && renderCtx) {
        const el = this.fabricCanvas.getElement();
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
    const { width, height } = this.frameDims();
    if (this.frameCanvas.width !== width || this.frameCanvas.height !== height) {
      this.frameCanvas.width = width;
      this.frameCanvas.height = height;
      this.fabricImage.set({ width, height });
    }
    this.drawFrame();
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

    const { width: sourceW, height: sourceH } = this.orientedSize();
    if (sourceW === 0 || sourceH === 0) return;

    // Fit the oriented source within the available area, with a small margin.
    const scale = Math.min((availWidth * 0.9) / sourceW, (availHeight * 0.9) / sourceH, 1);

    const drawW = Math.round(sourceW * scale);
    const drawH = Math.round(sourceH * scale);

    // Size the fabric canvas to the drawn image dimensions
    this.fabricCanvas.setDimensions({ width: drawW, height: drawH });

    this.fabricImage.set({
      left: drawW / 2,
      top: drawH / 2,
      scaleX: drawW / this.frameCanvas.width,
      scaleY: drawH / this.frameCanvas.height,
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

  private frameDims(): { width: number; height: number } {
    const { width, height } = this.orientedSize();
    const cap = Math.min(this.previewCap / width, this.previewCap / height, 1);
    return {
      width: Math.max(1, Math.round(width * cap)),
      height: Math.max(1, Math.round(height * cap)),
    };
  }

  private buildFrameCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const { width, height } = this.frameDims();
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[Retouch] Failed to create preview frame context");
    return { canvas, ctx };
  }

  private drawFrame(): void {
    const { width: orientedW } = this.orientedSize();
    const scale = this.frameCanvas.width / orientedW;
    const ctx = this.frameCtx;
    ctx.save();
    applySourceTransform(ctx, {
      sourceWidth: this.rawWidth,
      sourceHeight: this.rawHeight,
      orientation: this.orientation,
      flipH: this.flipH,
      flipV: this.flipV,
      scale,
    });
    ctx.drawImage(
      this.source,
      -this.rawWidth / 2,
      -this.rawHeight / 2,
      this.rawWidth,
      this.rawHeight,
    );
    ctx.restore();
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
