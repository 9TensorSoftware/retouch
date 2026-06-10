import { MIN_TRIM_DURATION } from "../constants";
import type { ImageEntry, MediaEntry, TrimRange, VideoEntry } from "../types";
import { createCanvas } from "./canvas";
import { clamp } from "./math";

export function isVideoEntry(entry: MediaEntry): entry is VideoEntry {
  return entry.kind === "video";
}

export function isImageEntry(entry: MediaEntry): entry is ImageEntry {
  return entry.kind === "image";
}

// ── Loading ───────────────────────────────────

export interface LoadedVideo {
  video: HTMLVideoElement;
  url: string;
  duration: number;
  width: number;
  height: number;
}

/** Release a video element's decoder and detach its source. */
export function releaseVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute("src");
  video.load();
}

export function loadVideo(file: File): Promise<LoadedVideo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.playsInline = true;

    const fail = (message: string) => {
      releaseVideo(video);
      URL.revokeObjectURL(url);
      reject(new Error(message));
    };

    video.addEventListener("error", () => fail(`[Retouch] Failed to load video: ${file.name}`), {
      once: true,
    });

    video.addEventListener(
      "loadedmetadata",
      () => {
        const finish = () => {
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            fail(`[Retouch] Video has no decodable track: ${file.name}`);
            return;
          }
          resolve({
            video,
            url,
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        };

        if (!Number.isFinite(video.duration)) {
          // Streamed recordings (e.g. MediaRecorder WebM) report Infinity until
          // forced to compute the real duration via a far seek.
          video.addEventListener(
            "durationchange",
            () => {
              video.currentTime = 0;
              if (Number.isFinite(video.duration)) finish();
              else fail(`[Retouch] Could not determine video duration: ${file.name}`);
            },
            { once: true },
          );
          video.currentTime = 1e7;
        } else {
          finish();
        }
      },
      { once: true },
    );

    video.src = url;
  });
}

// ── Seeking ───────────────────────────────────

export interface SeekQueue {
  /** Seek to t. Rapid calls coalesce — resolves once the queue settles. */
  seek(t: number): Promise<void>;
  destroy(): void;
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/** Wait until the just-seeked frame is actually paintable (Safari fires `seeked` early). */
function awaitPaint(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const v = video as VideoWithRVFC;
    if (typeof v.requestVideoFrameCallback === "function") {
      v.requestVideoFrameCallback(() => resolve());
      // A paused element may never present a new frame on some platforms; don't hang.
      setTimeout(resolve, 250);
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }
  });
}

/**
 * Serializes seeks on a video element. Setting `currentTime` while a seek is
 * in flight makes browsers (notably Safari) coalesce or drop frames; routing
 * every seek through one queue keeps the displayed frame trustworthy.
 */
export function createSeekQueue(video: HTMLVideoElement): SeekQueue {
  let busy = false;
  let destroyed = false;
  let pendingTarget: number | null = null;
  let waiters: Array<() => void> = [];

  function settle(): void {
    const resolved = waiters;
    waiters = [];
    for (const fn of resolved) fn();
  }

  function seekOnce(t: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let timeoutId = 0;
      const onSeeked = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      // Fallback: `seeked` may not fire when seeking to the current position.
      timeoutId = window.setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        resolve();
      }, 1000);
      video.currentTime = t;
    }).then(() => awaitPaint(video));
  }

  async function pump(first: number): Promise<void> {
    busy = true;
    let target: number | null = first;
    while (target !== null && !destroyed) {
      await seekOnce(target);
      target = pendingTarget;
      pendingTarget = null;
    }
    busy = false;
    settle();
  }

  return {
    seek(t) {
      if (destroyed) return Promise.resolve();
      return new Promise((resolve) => {
        waiters.push(resolve);
        if (busy) {
          pendingTarget = t;
        } else {
          void pump(t);
        }
      });
    },
    destroy() {
      destroyed = true;
      pendingTarget = null;
      settle();
    },
  };
}

// ── Frame capture ─────────────────────────────

/** Draw the video's current frame to a canvas, optionally capped to maxDim. */
export function captureFrame(video: HTMLVideoElement, maxDim?: number): HTMLCanvasElement {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const scale = maxDim ? Math.min(maxDim / w, maxDim / h, 1) : 1;
  const canvas = createCanvas(
    Math.max(1, Math.round(w * scale)),
    Math.max(1, Math.round(h * scale)),
  );
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[Retouch] Failed to create capture context");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Capture a poster frame (slightly past the start — frame 0 is often black). */
export async function capturePoster(
  video: HTMLVideoElement,
  seekQueue: SeekQueue,
): Promise<string> {
  await seekQueue.seek(Math.min(1, video.duration / 10));
  const canvas = captureFrame(video, 480);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.8));
  if (!blob) throw new Error("[Retouch] Failed to encode poster frame");
  return URL.createObjectURL(blob);
}

// ── Filmstrip ─────────────────────────────────

export interface FilmstripOptions {
  /** Object URL of the video file. */
  url: string;
  duration: number;
  count: number;
  thumbWidth: number;
  thumbHeight: number;
}

/**
 * Progressively generates filmstrip thumbnails on a dedicated offscreen video
 * element (never the playback element — seeking would fight the transport).
 * Returns a cancel function.
 */
export function generateFilmstrip(
  options: FilmstripOptions,
  onThumb: (index: number, canvas: HTMLCanvasElement) => void,
): () => void {
  let cancelled = false;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const queue = createSeekQueue(video);

  const release = () => {
    queue.destroy();
    releaseVideo(video);
  };

  video.addEventListener(
    "loadedmetadata",
    async () => {
      for (let i = 0; i < options.count; i++) {
        if (cancelled) break;
        const t = ((i + 0.5) / options.count) * options.duration;
        await queue.seek(t);
        if (cancelled) break;
        const canvas = createCanvas(options.thumbWidth, options.thumbHeight);
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        drawCover(ctx, video, options.thumbWidth, options.thumbHeight);
        onThumb(i, canvas);
      }
      release();
    },
    { once: true },
  );
  video.addEventListener("error", release, { once: true });
  video.src = options.url;

  return () => {
    cancelled = true;
    release();
  };
}

/** Draw a video frame covering the target box (center-cropped). */
function drawCover(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (vw === 0 || vh === 0) return;
  const scale = Math.max(width / vw, height / vh);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, width, height);
}

// ── Pure helpers ──────────────────────────────

/** "m:ss" (or "h:mm:ss" past an hour), rounded to whole seconds. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "m:ss.t" with tenths, for transport readouts. */
export function formatTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = clamped - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

export function clampTrim(
  range: TrimRange,
  duration: number,
  minDuration = MIN_TRIM_DURATION,
): TrimRange {
  const start = clamp(range.start, 0, Math.max(0, duration - minDuration));
  const end = clamp(range.end, start + minDuration, Math.max(duration, start + minDuration));
  return { start, end: Math.min(end, Math.max(duration, minDuration)) };
}

/** Snap t to the nearest target within threshold, else return t unchanged. */
export function snapTime(t: number, targets: number[], threshold = 0.15): number {
  let best = t;
  let bestDist = threshold;
  for (const target of targets) {
    const d = Math.abs(t - target);
    if (d < bestDist) {
      bestDist = d;
      best = target;
    }
  }
  return best;
}

export function frameFileName(sourceName: string, time: number): string {
  const stem = sourceName.replace(/\.[^.]+$/, "");
  return `${stem}-frame-${time.toFixed(2)}s.png`;
}
