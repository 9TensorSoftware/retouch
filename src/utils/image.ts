import { FabricImage, StaticCanvas } from "fabric";
import { createDefaultVideoEdits, DEFAULT_EDITS } from "../constants";
import type { FileRejectionReason, ImageEdits, ImageExportOptions, MediaEntry } from "../types";
import { buildFabricFilters } from "./filters";
import { capturePoster, createSeekQueue, loadVideo, releaseVideo } from "./video";

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

export interface ProcessFilesOptions {
  acceptedImageTypes: string[];
  acceptedVideoTypes: string[];
  maxFileSize: number;
  maxVideoDuration: number;
}

export interface RejectedFile {
  file: File;
  reason: FileRejectionReason;
}

export interface ProcessFilesResult {
  entries: MediaEntry[];
  rejected: RejectedFile[];
}

export async function processFiles(
  files: FileList | File[],
  options: ProcessFilesOptions,
): Promise<ProcessFilesResult> {
  const entries: MediaEntry[] = [];
  const rejected: RejectedFile[] = [];

  for (const file of Array.from(files)) {
    const isImage = isAcceptedType(file, options.acceptedImageTypes);
    const isVideo = !isImage && isAcceptedType(file, options.acceptedVideoTypes);

    if (!isImage && !isVideo) {
      rejected.push({ file, reason: "type" });
      continue;
    }
    if (file.size > options.maxFileSize) {
      rejected.push({ file, reason: "size" });
      continue;
    }

    if (isImage) {
      try {
        const image = await loadImage(file);
        entries.push({
          kind: "image",
          id: generateId(),
          file,
          image,
          thumbnailUrl: createThumbnailUrl(file),
          edits: structuredClone(DEFAULT_EDITS),
          edited: false,
        });
      } catch {
        rejected.push({ file, reason: "load-error" });
      }
      continue;
    }

    try {
      const { video, url, duration, width, height } = await loadVideo(file);
      if (duration > options.maxVideoDuration) {
        releaseVideo(video);
        URL.revokeObjectURL(url);
        rejected.push({ file, reason: "duration" });
        continue;
      }
      const seekQueue = createSeekQueue(video);
      const thumbnailUrl = await capturePoster(video, seekQueue);
      seekQueue.destroy();
      entries.push({
        kind: "video",
        id: generateId(),
        file,
        video,
        videoUrl: url,
        duration,
        width,
        height,
        thumbnailUrl,
        edits: createDefaultVideoEdits(duration),
        edited: false,
      });
    } catch {
      rejected.push({ file, reason: "load-error" });
    }
  }

  return { entries, rejected };
}

export async function exportImage(
  image: HTMLImageElement,
  edits: ImageEdits,
  options: ImageExportOptions = {},
): Promise<Blob> {
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

  // Same filter stack as the live CanvasRenderer (preset beneath adjustments)
  fabricImg.filters = buildFabricFilters(adjustments, edits.filter);
  fabricImg.applyFilters();

  exportCanvas.add(fabricImg);
  exportCanvas.renderAll();

  // Export to blob, optionally downscaling the long edge to maxDimension.
  const format = options.format ?? "png";
  const longEdge = Math.max(outWidth, outHeight);
  const multiplier =
    options.maxDimension && options.maxDimension < longEdge ? options.maxDimension / longEdge : 1;
  const blob = await exportCanvas.toBlob({ format, quality: options.quality ?? 0.92, multiplier });

  exportCanvas.dispose();
  if (!blob) throw new Error("[Retouch] Failed to export image");
  return blob;
}
