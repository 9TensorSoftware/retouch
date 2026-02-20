import type { Adjustments, ImageEdits } from "../../types";

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CanvasRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly container: HTMLElement;
  private readonly image: HTMLImageElement;
  private adjustments: Adjustments;
  private rotation = 0;
  private imageRect: ImageRect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    container: HTMLElement,
    image: HTMLImageElement,
    edits: ImageEdits,
  ) {
    this.container = container;
    this.image = image;
    this.adjustments = { ...edits.adjustments };
    this.rotation = edits.rotation;

    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.container.appendChild(this.canvas);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("[Retouch] Failed to get 2D context");
    this.ctx = ctx;
  }

  setAdjustments(adj: Adjustments): void {
    this.adjustments = { ...adj };
  }

  setRotation(deg: number): void {
    this.rotation = deg;
  }

  getImageRect(): ImageRect {
    return { ...this.imageRect };
  }

  getCanvasElement(): HTMLCanvasElement {
    return this.canvas;
  }

  render(): void {
    const containerWidth = this.container.clientWidth || 800;
    const containerHeight = this.container.clientHeight || 600;

    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;
    if (imgW === 0 || imgH === 0) return;

    // Fit image to container
    const scale = Math.min(
      containerWidth * 0.9 / imgW,
      containerHeight * 0.9 / imgH,
      1,
    );

    const drawW = Math.round(imgW * scale);
    const drawH = Math.round(imgH * scale);

    // Size canvas to the image display size
    this.canvas.width = drawW;
    this.canvas.height = drawH;
    this.canvas.style.width = `${drawW}px`;
    this.canvas.style.height = `${drawH}px`;

    this.imageRect = { x: 0, y: 0, width: drawW, height: drawH };

    const ctx = this.ctx;
    ctx.clearRect(0, 0, drawW, drawH);

    // Apply adjustments
    const { brightness, contrast, saturation } = this.adjustments;
    ctx.filter = `brightness(${brightness / 100}) contrast(${contrast / 100}) saturate(${saturation / 100})`;

    // Apply rotation
    if (this.rotation !== 0) {
      const radians = (this.rotation * Math.PI) / 180;
      ctx.save();
      ctx.translate(drawW / 2, drawH / 2);
      ctx.rotate(radians);
      ctx.drawImage(this.image, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    } else {
      ctx.drawImage(this.image, 0, 0, drawW, drawH);
    }

    ctx.filter = "none";
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
    this.canvas.remove();
  }
}
