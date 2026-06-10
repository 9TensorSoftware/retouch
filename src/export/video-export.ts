import type { VideoEntry } from "../types";
import { createFramePipeline } from "./frame-pipeline";
import { exportWithMediaRecorder } from "./media-recorder-export";

export interface VideoExportOptions {
  /** Receives 0..1 conversion progress. */
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

export function supportsWebCodecs(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined";
}

/**
 * Re-encode a video entry applying trim, crop, rotation, adjustments and
 * filter, preserving audio (or dropping it when muted). mediabunny is loaded
 * lazily here — image-only consumers never pay for it.
 */
export async function exportVideo(
  entry: VideoEntry,
  options: VideoExportOptions = {},
): Promise<Blob> {
  if (!supportsWebCodecs()) {
    // Realtime, recorder-grade fallback (e.g. Firefox Android).
    return exportWithMediaRecorder(entry, options);
  }

  const mb = await import("mediabunny");
  const { trim, mute } = entry.edits;

  // Container preference: MP4, then WebM if the browser can't encode for MP4.
  const formats = [new mb.Mp4OutputFormat(), new mb.WebMOutputFormat()];
  let lastError: Error | null = null;

  for (const format of formats) {
    const codec = await mb.getFirstEncodableVideoCodec(format.getSupportedVideoCodecs(), {
      width: entry.width,
      height: entry.height,
    });
    if (!codec) continue;

    const pipeline = createFramePipeline(entry.edits, entry.width, entry.height);
    const input = new mb.Input({ source: new mb.BlobSource(entry.file), formats: mb.ALL_FORMATS });
    const target = new mb.BufferTarget();
    const output = new mb.Output({ format, target });

    try {
      const conversion = await mb.Conversion.init({
        input,
        output,
        trim: { start: trim.start, end: trim.end },
        // Identity edits skip the per-frame pipeline so mediabunny can copy
        // packets without re-encoding (fast, lossless trim).
        video: pipeline.isIdentity
          ? { codec }
          : {
              codec,
              forceTranscode: true,
              process: (sample) => pipeline.processFrame(sample),
              processedWidth: pipeline.outWidth,
              processedHeight: pipeline.outHeight,
            },
        audio: mute ? { discard: true } : undefined,
        showWarnings: false,
      });

      if (!conversion.isValid) {
        lastError = new Error(
          `[Retouch] Conversion to ${format.mimeType} is not possible in this browser.`,
        );
        continue;
      }

      conversion.onProgress = (progress) => options.onProgress?.(progress);
      const onAbort = () => void conversion.cancel();
      options.signal?.addEventListener("abort", onAbort, { once: true });

      try {
        await conversion.execute();
      } finally {
        options.signal?.removeEventListener("abort", onAbort);
      }

      const buffer = target.buffer;
      if (!buffer) throw new Error("[Retouch] Video export produced no data.");
      return new Blob([buffer], { type: format.mimeType });
    } catch (err) {
      if (options.signal?.aborted) throw err;
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      pipeline.dispose();
    }
  }

  throw lastError ?? new Error("[Retouch] No supported video export format in this browser.");
}

/** File extension matching an exported blob's container type. */
export function extensionForBlob(blob: Blob): string {
  if (blob.type.includes("mp4")) return "mp4";
  if (blob.type.includes("webm")) return "webm";
  if (blob.type.includes("matroska")) return "mkv";
  return "bin";
}
