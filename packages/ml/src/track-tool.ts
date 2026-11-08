import type { ObjectLayer } from "@9tensor/retouch";
import { boxQuad, cropAround, FINDING_COLORS } from "./findings";
import type { TrackBox, TrackedVideo } from "./track";

/**
 * Track's side of the editor's object layer: each tracked box over the
 * playing video, in its own color, with its name and a trail of where it's
 * been. Between the frames the tracker read, boxes glide from one to the
 * next, so the layer keeps up with playback.
 */

export const trackColor = (id: number): string => FINDING_COLORS[(id - 1) % FINDING_COLORS.length];

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
  const boxes = result.frames.flatMap((frame) => frame.boxes.filter((box) => box.id === id));
  return cropAround(boxes, margin);
}

export interface TrackOverlayHandle {
  show(result: TrackedVideo | null): void;
  /** Off while the tool is away: nothing is worked out per frame. */
  setVisible(visible: boolean): void;
  destroy(): void;
}

type VideoWithRVFC = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
};

/**
 * Keeps `layer` on the video's current frame. `onTime` hears each drawn time
 * and the tracks in that frame, so the pane can move its playhead and light
 * the rows.
 */
export function createTrackOverlay(
  layer: Pick<ObjectLayer, "show">,
  video: HTMLVideoElement,
  onTime: (time: number, ids: number[]) => void,
): TrackOverlayHandle {
  let result: TrackedVideo | null = null;
  /** Each track's one name, from the whole run. */
  let names = new Map<number, string>();
  let visible = false;
  let destroyed = false;

  function draw(time = video.currentTime): void {
    if (!visible) return;
    const boxes = result ? boxesAt(result, time) : [];
    onTime(
      time,
      boxes.map((box) => box.id),
    );
    if (!result || boxes.length === 0) {
      layer.show([]);
      return;
    }
    const { frames, fps } = result;
    const step = Math.round(TRAIL * fps);
    const index = Math.max(
      0,
      Math.min(frames.length - 1, Math.floor((time - frames[0].time) * fps)),
    );
    layer.show(
      boxes.map((box) => {
        // Where its center has been over the last moments, ending where it is now.
        const trail: [number, number][] = [];
        for (let i = Math.max(0, index - step); i <= index; i++) {
          const past = frames[i].boxes.find((b) => b.id === box.id);
          if (past) trail.push([past.x + past.w / 2, past.y + past.h / 2]);
        }
        trail.push([box.x + box.w / 2, box.y + box.h / 2]);
        return {
          id: String(box.id),
          quad: boxQuad(box),
          color: trackColor(box.id),
          tag: names.get(box.id) ?? trackName(box),
          trail,
        };
      }),
    );
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

  return {
    show(next) {
      result = next;
      names = new Map(next?.tracks.map((track) => [track.id, trackName(track)]));
      draw();
    },
    setVisible(next) {
      visible = next;
      draw();
    },
    destroy() {
      destroyed = true;
      video.removeEventListener("seeked", redraw);
      video.removeEventListener("pause", redraw);
    },
  };
}
