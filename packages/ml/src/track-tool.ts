import type { TrackBox, TrackedVideo } from "./track";

/**
 * Overlay for the Track tool: each tracked box over the playing video, in
 * its own color, with its name and a trail of where it's been. Between the
 * frames the tracker read, boxes glide from one to the next, so the
 * overlay keeps up with playback. Boxes map through the crop, since every
 * tool but Crop shows the cropped frame.
 */

/** One color per track, in turn. */
export const TRACK_COLORS = ["#5cc8ff", "#ffc457", "#8ce99a", "#a58bff", "#ff9068", "#ff7eb6"];

export const trackColor = (id: number): string => TRACK_COLORS[(id - 1) % TRACK_COLORS.length];

export const trackName = (track: { id: number; label?: string }): string =>
  `${track.label ?? "thing"} ${track.id}`;

/** Seconds of trail behind each box. */
const TRAIL = 1.6;

/** The part of the frame on screen, 0–1. */
export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The boxes at `time`, each glided between the two sampled frames around
 * it. A track that ends or starts between them shows for the nearer half.
 */
export function boxesAt(result: TrackedVideo, time: number): TrackBox[] {
  const { frames, fps } = result;
  if (frames.length === 0) return [];
  const index = Math.max(0, Math.min(frames.length - 1, Math.floor((time - frames[0].time) * fps)));
  const a = frames[index];
  const b = frames[index + 1];
  if (!b || time <= a.time) return a.boxes;
  const f = Math.min(1, (time - a.time) / (b.time - a.time));
  const next = new Map(b.boxes.map((box) => [box.id, box]));
  const boxes: TrackBox[] = [];
  for (const box of a.boxes) {
    const to = next.get(box.id);
    if (to) {
      boxes.push({
        ...box,
        x: box.x + (to.x - box.x) * f,
        y: box.y + (to.y - box.y) * f,
        w: box.w + (to.w - box.w) * f,
        h: box.h + (to.h - box.h) * f,
      });
    } else if (f < 0.5) boxes.push(box);
  }
  const here = new Set(a.boxes.map((box) => box.id));
  for (const box of b.boxes) if (!here.has(box.id) && f >= 0.5) boxes.push(box);
  return boxes;
}

/**
 * When a track is first on screen: the first frame with its box. Later
 * than its `firstSeen`, since a track gets its number a few sightings in.
 */
export function firstShown(result: TrackedVideo, id: number): number | null {
  return result.frames.find((frame) => frame.boxes.some((box) => box.id === id))?.time ?? null;
}

/**
 * Everywhere a track went, as one box with some room around it — what
 * "Crop to it" frames. Null when the track is never seen.
 */
export function trackBounds(result: TrackedVideo, id: number, margin = 0.08): FrameRect | null {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const frame of result.frames) {
    for (const box of frame.boxes) {
      if (box.id !== id) continue;
      x0 = Math.min(x0, box.x);
      y0 = Math.min(y0, box.y);
      x1 = Math.max(x1, box.x + box.w);
      y1 = Math.max(y1, box.y + box.h);
    }
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const mx = (x1 - x0) * margin;
  const my = (y1 - y0) * margin;
  const x = Math.max(0, x0 - mx);
  const y = Math.max(0, y0 - my);
  return { x, y, width: Math.min(1, x1 + mx) - x, height: Math.min(1, y1 + my) - y };
}

export interface TrackOverlayHandle {
  show(result: TrackedVideo | null): void;
  /** Bring one track forward and dim the rest; null for all alike. */
  focus(id: number | null): void;
  /** The part of the frame on screen; null hides the boxes (the frame is turned or warped). */
  setFrame(frame: FrameRect | null): void;
  setVisible(visible: boolean): void;
  destroy(): void;
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

/**
 * `onTime` hears each drawn time and the tracks in that frame, so the pane
 * can move its playhead and light the rows.
 */
export function createTrackOverlay(
  canvasArea: HTMLElement,
  video: HTMLVideoElement,
  onTime: (time: number, ids: number[]) => void,
): TrackOverlayHandle {
  const container = canvasArea.querySelector("canvas")?.parentElement;
  const overlay = document.createElement("canvas");
  overlay.className = "rt-ml-track-overlay";
  overlay.style.cssText =
    "position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;pointer-events:none;display:none;";
  container?.appendChild(overlay);
  let result: TrackedVideo | null = null;
  /** Each track's one name, from the whole run. */
  let names = new Map<number, string>();
  let focused: number | null = null;
  let frame: FrameRect | null = { x: 0, y: 0, width: 1, height: 1 };
  let visible = false;
  let destroyed = false;
  let lastTime = video.currentTime;

  function draw(time = video.currentTime): void {
    lastTime = time;
    if (!visible) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(overlay.clientWidth * dpr));
    const h = Math.max(1, Math.round(overlay.clientHeight * dpr));
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w;
      overlay.height = h;
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const boxes = result ? boxesAt(result, time) : [];
    onTime(
      time,
      boxes.map((box) => box.id),
    );
    if (!result || !frame || boxes.length === 0) return;
    ctx.scale(dpr, dpr);
    const cw = w / dpr;
    const ch = h / dpr;
    const view = frame;
    const px = (x: number) => ((x - view.x) / view.width) * cw;
    const py = (y: number) => ((y - view.y) / view.height) * ch;
    const step = Math.round(TRAIL * result.fps);
    const index = Math.max(
      0,
      Math.min(result.frames.length - 1, Math.floor((time - result.frames[0].time) * result.fps)),
    );
    ctx.font = "600 11px system-ui, sans-serif";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const box of boxes) {
      const color = trackColor(box.id);
      const on = focused === null || focused === box.id;
      ctx.globalAlpha = on ? 1 : 0.3;
      ctx.strokeStyle = color;

      // Where its center has been over the last moments, ending where it is now.
      ctx.beginPath();
      for (let i = Math.max(0, index - step); i <= index; i++) {
        const past = result.frames[i].boxes.find((b) => b.id === box.id);
        if (past) ctx.lineTo(px(past.x + past.w / 2), py(past.y + past.h / 2));
      }
      ctx.lineTo(px(box.x + box.w / 2), py(box.y + box.h / 2));
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.lineWidth = focused === box.id ? 3 : 2;
      ctx.strokeRect(
        px(box.x),
        py(box.y),
        px(box.x + box.w) - px(box.x),
        py(box.y + box.h) - py(box.y),
      );

      const tag = names.get(box.id) ?? trackName(box);
      const chipH = 17;
      const padX = 6;
      const chipW = ctx.measureText(tag).width + padX * 2;
      const cx = Math.max(0, Math.min(cw - chipW, px(box.x) - 1));
      const cy = Math.max(0, py(box.y) - chipH - 3);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(cx, cy, chipW, chipH, 4);
      ctx.fill();
      ctx.fillStyle = "#10141a";
      ctx.fillText(tag, cx + padX, cy + 12.5);
    }
    ctx.globalAlpha = 1;
  }

  // Drawn per presented frame at that frame's own time (currentTime runs
  // ahead of the picture); per animation frame where the callback is missing.
  const rvfc = video as VideoWithRVFC;
  if (typeof rvfc.requestVideoFrameCallback === "function") {
    const onFrame = (_now: number, meta: { mediaTime: number }) => {
      if (destroyed) return;
      draw(meta.mediaTime);
      rvfc.requestVideoFrameCallback?.(onFrame);
    };
    rvfc.requestVideoFrameCallback(onFrame);
  } else {
    let raf = 0;
    const loop = () => {
      if (destroyed) return;
      draw();
      raf = video.paused ? 0 : requestAnimationFrame(loop);
    };
    video.addEventListener("play", () => {
      if (!raf) raf = requestAnimationFrame(loop);
    });
  }
  const redraw = () => {
    if (!destroyed) draw();
  };
  video.addEventListener("seeked", redraw);
  video.addEventListener("pause", redraw);

  const observer =
    typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => draw(lastTime)) : null;
  if (container) observer?.observe(container);

  return {
    show(next) {
      result = next;
      names = new Map(next?.tracks.map((track) => [track.id, trackName(track)]));
      focused = null;
      draw();
    },
    focus(id) {
      focused = id;
      draw(lastTime);
    },
    setFrame(next) {
      frame = next;
      draw(lastTime);
    },
    setVisible(next) {
      visible = next;
      overlay.style.display = next ? "" : "none";
      draw();
    },
    destroy() {
      destroyed = true;
      observer?.disconnect();
      video.removeEventListener("seeked", redraw);
      video.removeEventListener("pause", redraw);
      overlay.remove();
    },
  };
}
