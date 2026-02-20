import { FabricImage, filters, StaticCanvas } from "fabric";
import { DEFAULT_EDITS } from "../constants";
import type { ImageEdits, ImageEntry } from "../types";

export function generateId(): string {
  return crypto.randomUUID();
}

export function isAcceptedType(file: File, accepted: string[]): boolean {
  return accepted.some((type) => {
    if (type.endsWith("/*")) {
      return file.type.startsWith(type.slice(0, -1));
    }
    return file.type === type;
  });
}

export function createThumbnailUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeThumbnailUrl(url: string): void {
  URL.revokeObjectURL(url);
}

export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`[Retouch] Failed to load image: ${file.name}`));
    };
    img.src = url;
  });
}

export async function processFiles(
  files: FileList | File[],
  acceptedTypes: string[],
): Promise<ImageEntry[]> {
  const entries: ImageEntry[] = [];
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    if (!isAcceptedType(file, acceptedTypes)) continue;

    const image = await loadImage(file);
    entries.push({
      id: generateId(),
      file,
      image,
      thumbnailUrl: createThumbnailUrl(file),
      edits: structuredClone(DEFAULT_EDITS),
      edited: false,
    });
  }

  return entries;
}

export async function exportImage(image: HTMLImageElement, edits: ImageEdits): Promise<Blob> {
  const { crop, rotation, adjustments } = edits;

  // Source region in original image coordinates
  const sx = crop.x * image.naturalWidth;
  const sy = crop.y * image.naturalHeight;
  const sw = crop.width * image.naturalWidth;
  const sh = crop.height * image.naturalHeight;

  // Calculate output dimensions accounting for rotation
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const outWidth = Math.round(sw * cos + sh * sin);
  const outHeight = Math.round(sh * cos + sw * sin);

  // Extract the crop region onto a temp canvas
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) throw new Error("[Retouch] Failed to create crop canvas context");
  cropCtx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  // Load the cropped region as an image for fabric
  const croppedImg = new Image();
  croppedImg.src = cropCanvas.toDataURL();
  await new Promise<void>((resolve) => {
    croppedImg.onload = () => resolve();
  });

  // Create a fabric static canvas at full export resolution
  const exportCanvas = new StaticCanvas(undefined, {
    width: outWidth,
    height: outHeight,
  });

  const fabricImg = new FabricImage(croppedImg, {
    originX: "center",
    originY: "center",
    left: outWidth / 2,
    top: outHeight / 2,
    angle: rotation,
  });

  // Apply the same filter mapping as CanvasRenderer
  fabricImg.filters = [
    new filters.Brightness({ brightness: (adjustments.brightness - 100) / 100 }),
    new filters.Contrast({ contrast: (adjustments.contrast - 100) / 100 }),
    new filters.Saturation({ saturation: (adjustments.saturation - 100) / 100 }),
  ];
  fabricImg.applyFilters();

  exportCanvas.add(fabricImg);
  exportCanvas.renderAll();

  // Export to blob
  const dataUrl = exportCanvas.toDataURL({ format: "png", multiplier: 1 });
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  exportCanvas.dispose();
  return blob;
}
