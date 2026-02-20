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

function buildFilterString(adj: ImageEdits["adjustments"]): string {
  return `brightness(${adj.brightness / 100}) contrast(${adj.contrast / 100}) saturate(${adj.saturation / 100})`;
}

export function exportImage(image: HTMLImageElement, edits: ImageEdits): Promise<Blob> {
  return new Promise((resolve, reject) => {
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

    const canvas = document.createElement("canvas");
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      reject(new Error("[Retouch] Failed to create export canvas context"));
      return;
    }

    ctx.filter = buildFilterString(adjustments);
    ctx.translate(outWidth / 2, outHeight / 2);
    ctx.rotate(radians);
    ctx.drawImage(image, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("[Retouch] Failed to export image as blob"));
      }
    }, "image/png");
  });
}
