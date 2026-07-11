import { FabricImage, StaticCanvas } from "fabric";
import { createDefaultVideoEdits, DEFAULT_EDITS } from "../constants";
import type { FileRejectionReason, ImageEdits, ImageExportOptions, MediaEntry } from "../types";
import { applyCurvesToContext, buildCurveLuts, curvesAreIdentity } from "./curves";
import { buildFabricFilters, drawVignette } from "./filters";
import { applyKeystone, hasKeystone } from "./perspective";
import { applySourceTransform, orientedDims, straightenFitScale } from "./transform";
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
  image: HTMLImageElement | HTMLCanvasElement,
  edits: ImageEdits,
  options: ImageExportOptions = {},
): Promise<Blob> {
  const { crop, rotation, keystoneV, keystoneH, orientation, flipH, flipV, adjustments } = edits;

  // Crop region in oriented (rotated/flipped) source coordinates
  const rawW = "naturalWidth" in image ? image.naturalWidth : image.width;
  const rawH = "naturalHeight" in image ? image.naturalHeight : image.height;
  const { width: orientedW, height: orientedH } = orientedDims(rawW, rawH, orientation);
  const sx = crop.x * orientedW;
  const sy = crop.y * orientedH;
  const sw = crop.width * orientedW;
  const sh = crop.height * orientedH;

  // Straighten crops to the largest inscribed same-aspect window (matching
  // the preview's fill-the-frame zoom) instead of expanding with background.
  const fit = straightenFitScale(sw, sh, rotation);
  const outWidth = Math.max(1, Math.round(sw * fit));
  const outHeight = Math.max(1, Math.round(sh * fit));

  // Extract the oriented crop region onto a temp canvas
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = sw;
  cropCanvas.height = sh;
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) throw new Error("[Retouch] Failed to create crop canvas context");
  applySourceTransform(cropCtx, {
    sourceWidth: rawW,
    sourceHeight: rawH,
    orientation,
    flipH,
    flipV,
    scale: 1,
    offsetX: sx,
    offsetY: sy,
  });
  cropCtx.drawImage(image, -rawW / 2, -rawH / 2, rawW, rawH);
  cropCtx.setTransform(1, 0, 0, 1, 0, 0);

  // Perspective correction warps the cropped region before fabric sees it.
  let sourceCanvas = cropCanvas;
  if (hasKeystone(keystoneV, keystoneH)) {
    const warped = document.createElement("canvas");
    warped.width = cropCanvas.width;
    warped.height = cropCanvas.height;
    const warpedCtx = warped.getContext("2d");
    const scratch = document.createElement("canvas");
    if (warpedCtx) {
      applyKeystone(cropCanvas, scratch, warpedCtx, keystoneV, keystoneH);
      sourceCanvas = warped;
    }
  }

  // Load the cropped region as an image for fabric
  const croppedImg = new Image();
  croppedImg.src = sourceCanvas.toDataURL();
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
  fabricImg.filters = buildFabricFilters(adjustments, edits.filter, edits.filterStrength);
  fabricImg.applyFilters();

  exportCanvas.add(fabricImg);
  exportCanvas.renderAll();

  // Render to a plain canvas (fabric's toBlob would re-render and drop the
  // vignette pass), optionally downscaling the long edge to maxDimension.
  const format = options.format ?? "png";
  const longEdge = Math.max(outWidth, outHeight);
  const multiplier =
    options.maxDimension && options.maxDimension < longEdge ? options.maxDimension / longEdge : 1;
  const outCanvas = exportCanvas.toCanvasElement(multiplier);
  exportCanvas.dispose();

  if (!curvesAreIdentity(edits.curves)) {
    const outCtx = outCanvas.getContext("2d");
    if (outCtx) {
      applyCurvesToContext(outCtx, outCanvas.width, outCanvas.height, buildCurveLuts(edits.curves));
    }
  }

  if (adjustments.vignette > 0) {
    const outCtx = outCanvas.getContext("2d");
    if (outCtx) drawVignette(outCtx, outCanvas.width, outCanvas.height, adjustments.vignette);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    outCanvas.toBlob(resolve, `image/${format}`, options.quality ?? 0.92),
  );
  if (!blob) throw new Error("[Retouch] Failed to export image");
  return blob;
}
