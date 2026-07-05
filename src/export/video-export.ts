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
  const speed = entry.edits.speed ?? 1;

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

    // Packet copy is only safe when nothing is cut or retimed: a trimmed copy
    // can only start on a keyframe, which silently shifts the in-point. Any
    // real trim or speed change re-encodes for sample accuracy (without the
    // canvas pipeline when the frames themselves are untouched).
    const isFullRange = trim.start <= 0.001 && trim.end >= entry.duration - 0.05;

    // Samples reach `process` already rebased to the trim start, so a speed
    // change is a straight division of the timestamps.
    type ConversionSample = InstanceType<typeof mb.VideoSample>;
    const retime = (sample: ConversionSample): ConversionSample => {
      sample.setTimestamp(sample.timestamp / speed);
      sample.setDuration(sample.duration / speed);
      return sample;
    };
    const processPixels = (sample: ConversionSample) => {
      const frame = pipeline.processFrame(sample);
      if (speed === 1) return frame;
      return new mb.VideoSample(frame, {
        timestamp: sample.timestamp / speed,
        duration: sample.duration / speed,
      });
    };

    const videoOptions = pipeline.isIdentity
      ? isFullRange && speed === 1
        ? { codec }
        : speed === 1
          ? { codec, forceTranscode: true }
          : { codec, forceTranscode: true, process: retime }
      : {
          codec,
          forceTranscode: true,
          process: processPixels,
          processedWidth: pipeline.outWidth,
          processedHeight: pipeline.outHeight,
        };

    try {
      const conversion = await mb.Conversion.init({
        input,
        output,
        trim: { start: trim.start, end: trim.end },
        video: videoOptions,
        // Speed changes drop audio: resampling without pitch artifacts is out
        // of scope for the in-browser pipeline.
        audio: mute || speed !== 1 ? { discard: true } : undefined,
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
