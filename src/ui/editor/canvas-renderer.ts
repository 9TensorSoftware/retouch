import { Canvas, FabricImage } from "fabric";
import type { Adjustments, FilterPreset, ImageEdits } from "../../types";
import { buildFabricFilters } from "../../utils/filters";

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
  private filter: FilterPreset;
  private imageRect: ImageRect = { x: 0, y: 0, width: 0, height: 0 };

  constructor(container: HTMLElement, image: HTMLImageElement, edits: ImageEdits) {
    this.container = container;
    this.image = image;
    this.adjustments = { ...edits.adjustments };
    this.rotation = edits.rotation;
    this.filter = edits.filter;

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

    const imgW = this.image.naturalWidth;
    const imgH = this.image.naturalHeight;
    if (imgW === 0 || imgH === 0) return;

    // Fit image within the available area, with a small margin.
    const scale = Math.min((availWidth * 0.9) / imgW, (availHeight * 0.9) / imgH, 1);

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
    this.fabricImage.filters = buildFabricFilters(this.adjustments, this.filter);
    this.fabricImage.applyFilters();
  }
}
