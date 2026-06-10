import type { VideoEntry } from "../types";
import type { DrawableSample } from "./frame-pipeline";
import { createFramePipeline } from "./frame-pipeline";

export interface MediaRecorderExportOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

const MIME_CANDIDATES = ["video/mp4", "video/webm;codecs=vp9", "video/webm"];

/**
 * Realtime fallback for browsers without WebCodecs: plays a hidden clone of
 * the source through the frame pipeline onto a captured canvas stream and
 * records it. Takes as long as the trimmed clip lasts; output quality is
 * recorder-grade. Audio is routed through WebAudio so nothing is audible.
 */
export function exportWithMediaRecorder(
  entry: VideoEntry,
  options: MediaRecorderExportOptions = {},
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { trim, mute } = entry.edits;
    const trimmed = Math.max(0.05, trim.end - trim.start);
    const pipeline = createFramePipeline(entry.edits, entry.width, entry.height);

    const video = document.createElement("video");
    video.playsInline = true;
    video.src = entry.videoUrl;

    const sample: DrawableSample = {
      draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) =>
        ctx.drawImage(video, sx, sy, sw, sh, dx, dy, dw ?? sw, dh ?? sh),
    };

    let audioCtx: AudioContext | null = null;
    let rafId = 0;
    let settled = false;

    const cleanup = () => {
      cancelAnimationFrame(rafId);
      video.pause();
      video.removeAttribute("src");
      video.load();
      void audioCtx?.close().catch(() => {});
      pipeline.dispose();
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    video.addEventListener(
      "error",
      () => fail(new Error("[Retouch] Fallback export failed to load video")),
      {
        once: true,
      },
    );

    video.addEventListener(
      "loadedmetadata",
      () => {
        video.currentTime = trim.start;
        video.addEventListener(
          "seeked",
          () => {
            try {
              start();
            } catch (err) {
              fail(err instanceof Error ? err : new Error(String(err)));
            }
          },
          { once: true },
        );
      },
      { once: true },
    );

    function start(): void {
      const canvas = pipeline.processFrame(sample);
      const stream = canvas.captureStream(30);

      if (!mute && typeof AudioContext !== "undefined") {
        // Element output routes into the graph (inaudible) and out to the stream.
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        for (const track of dest.stream.getAudioTracks()) stream.addTrack(track);
        void audioCtx.resume().catch(() => {});
      } else {
        video.muted = true;
      }

      const mimeType = MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(new Blob(chunks, { type: recorder.mimeType || "video/webm" }));
      };

      const stop = () => {
        if (recorder.state !== "inactive") recorder.stop();
        video.pause();
      };

      options.signal?.addEventListener(
        "abort",
        () => {
          stop();
          fail(new Error("[Retouch] Export canceled"));
        },
        { once: true },
      );

      const tick = () => {
        if (settled) return;
        pipeline.processFrame(sample);
        const progress = (video.currentTime - trim.start) / trimmed;
        options.onProgress?.(Math.min(1, Math.max(0, progress)));
        if (video.currentTime >= trim.end || video.ended) {
          stop();
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      recorder.start(250);
      video
        .play()
        .then(() => {
          rafId = requestAnimationFrame(tick);
        })
        .catch(() => fail(new Error("[Retouch] Fallback export could not start playback")));
    }
  });
}
