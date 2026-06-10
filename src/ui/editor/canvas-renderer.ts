import { Canvas, FabricImage } from "fabric";
import { PREVIEW_MAX_DIM } from "../../constants";
import type { Adjustments, FilterPreset, ImageEdits } from "../../types";
import { createCanvas } from "../../utils/canvas";
import { buildFabricFilters, isNeutral } from "../../utils/filters";

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
  private readonly video: HTMLVideoElement | null;
  /**
   * Video frames are copied into this capped-size canvas and fabric wraps the
   * canvas, not the element. That bounds per-frame filter cost, stays inside
   * the WebGL texture limit, and keeps crop-overlay math source-agnostic.
   */
  private readonly frameCanvas: HTMLCanvasElement | null;
  private readonly frameCtx: CanvasRenderingContext2D | null;
  private readonly sourceWidth: number;
  private readonly sourceHeight: number;
  private readonly abort = new AbortController();
  private adjustments: Adjustments;
  private rotation = 0;
  private filter: FilterPreset;
  private imageRect: ImageRect = { x: 0, y: 0, width: 0, height: 0 };
  private looping = false;

  constructor(container: HTMLElement, source: RenderSource, edits: ImageEdits) {
    this.container = container;
    this.adjustments = { ...edits.adjustments };
    this.rotation = edits.rotation;
    this.filter = edits.filter;

    this.video = "videoWidth" in source ? source : null;
    if (this.video) {
      this.sourceWidth = this.video.videoWidth;
      this.sourceHeight = this.video.videoHeight;
      const cap = Math.min(
        PREVIEW_MAX_DIM / this.sourceWidth,
        PREVIEW_MAX_DIM / this.sourceHeight,
        1,
      );
      this.frameCanvas = createCanvas(
        Math.max(1, Math.round(this.sourceWidth * cap)),
        Math.max(1, Math.round(this.sourceHeight * cap)),
      );
      this.frameCtx = this.frameCanvas.getContext("2d");
      this.drawFrame();
    } else {
      this.sourceWidth = (source as HTMLImageElement).naturalWidth;
      this.sourceHeight = (source as HTMLImageElement).naturalHeight;
      this.frameCanvas = null;
      this.frameCtx = null;
    }

    const canvasEl = document.createElement("canvas");
    this.container.appendChild(canvasEl);

    this.fabricCanvas = new Canvas(canvasEl, {
      selection: false,
      renderOnAddRemove: false,
      skipTargetFind: true,
    });

    this.fabricImage = new FabricImage(this.frameCanvas ?? (source as HTMLImageElement), {
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      originX: "center",
      originY: "center",
      ...(this.video ? { objectCaching: false } : {}),
    });

    this.fabricCanvas.add(this.fabricImage);

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

    if (this.sourceWidth === 0 || this.sourceHeight === 0) return;

    // Fit the source within the available area, with a small margin.
    const scale = Math.min(
      (availWidth * 0.9) / this.sourceWidth,
      (availHeight * 0.9) / this.sourceHeight,
      1,
    );

    const drawW = Math.round(this.sourceWidth * scale);
    const drawH = Math.round(this.sourceHeight * scale);

    // Size the fabric canvas to the drawn image dimensions
    this.fabricCanvas.setDimensions({ width: drawW, height: drawH });

    // The fabric element may be the capped frame canvas rather than the source.
    const elementW = this.frameCanvas?.width ?? this.sourceWidth;
    const elementH = this.frameCanvas?.height ?? this.sourceHeight;

    this.fabricImage.set({
      left: drawW / 2,
      top: drawH / 2,
      scaleX: drawW / elementW,
      scaleY: drawH / elementH,
      angle: this.rotation,
    });

    this.applyFilters();

    this.imageRect = { x: 0, y: 0, width: drawW, height: drawH };

    this.fabricCanvas.requestRenderAll();
  }

  /** Redraw the current frame (and re-filter it when filters are active). */
  renderFrame(): void {
    if (this.video) this.drawFrame();
    if (!isNeutral(this.adjustments, this.filter)) {
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

  private drawFrame(): void {
    if (!this.video || !this.frameCtx || !this.frameCanvas) return;
    this.frameCtx.drawImage(this.video, 0, 0, this.frameCanvas.width, this.frameCanvas.height);
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
    this.fabricImage.filters = isNeutral(this.adjustments, this.filter)
      ? []
      : buildFabricFilters(this.adjustments, this.filter);
    this.fabricImage.applyFilters();
  }
}
