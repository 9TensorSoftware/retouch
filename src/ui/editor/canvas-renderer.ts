import { Canvas, FabricImage, filters } from "fabric";
import type { Adjustments, ImageEdits } from "../../types";

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CanvasRenderer {
  private readonly fabricCanvas: Canvas;
  private readonly fabricImage: FabricImage;
  private readonly container: HTMLElement;
  private readonly image: HTMLImageElement;
  private adjustments: Adjustments;
  private rotation = 0;
  private imageRect: ImageRect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(container: HTMLElement, image: HTMLImageElement, edits: ImageEdits) {
    this.container = container;
    this.image = image;
    this.adjustments = { ...edits.adjustments };
    this.rotation = edits.rotation;

    const canvasEl = document.createElement("canvas");
    this.container.appendChild(canvasEl);

    this.fabricCanvas = new Canvas(canvasEl, {
      selection: false,
      renderOnAddRemove: false,
      skipTargetFind: true,
    });

    this.fabricImage = new FabricImage(this.image, {
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      originX: "center",
      originY: "center",
    });

    this.fabricCanvas.add(this.fabricImage);
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
    return this.fabricCanvas.getElement();
  }

  render(): void {
    const containerWidth = this.container.clientWidth || 800;
    const containerHeight = this.container.clientHeight || 600;

    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;
    if (imgW === 0 || imgH === 0) return;

    // Fit image to container (same logic as before)
    const scale = Math.min((containerWidth * 0.9) / imgW, (containerHeight * 0.9) / imgH, 1);

    const drawW = Math.round(imgW * scale);
    const drawH = Math.round(imgH * scale);

    // Size the fabric canvas to the drawn image dimensions
    this.fabricCanvas.setDimensions({ width: drawW, height: drawH });

    // Position image centered in canvas
    this.fabricImage.set({
      left: drawW / 2,
      top: drawH / 2,
      scaleX: scale,
      scaleY: scale,
      angle: this.rotation,
    });

    this.applyFilters();

    this.imageRect = { x: 0, y: 0, width: drawW, height: drawH };

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
    this.fabricCanvas.dispose();
  }

  private applyFilters(): void {
    const { brightness, contrast, saturation } = this.adjustments;

    // Map 0–200 slider range (100 = neutral) to fabric's -1 to 1 range (0 = neutral)
    this.fabricImage.filters = [
      new filters.Brightness({ brightness: (brightness - 100) / 100 }),
      new filters.Contrast({ contrast: (contrast - 100) / 100 }),
      new filters.Saturation({ saturation: (saturation - 100) / 100 }),
    ];

    this.fabricImage.applyFilters();
  }
}
