import { type Detection, type DetectObjectsOptions, detectObjects, iou } from "./detect";
import type { Point } from "./ocr";

/**
 * Multi-object tracking by detection: the object detector runs on sampled
 * frames, and each box is matched to the track it continues, so a bus is
 * "bus #2" from the frame it enters to the frame it leaves. Matching is
 * greedy on overlap with where each track should be by now (its last box
 * moved on by its velocity), within a class — or across one when the boxes
 * all but coincide, since detectors waver between neighbours like bicycle
 * and motorcycle; a track is called what it was seen as most. A track is
 * confirmed after a few sightings, so a one-frame false positive never gets
 * a number, and it coasts through a few missed frames before it's dropped.
 */

export interface TrackerOptions {
  /**
   * Least overlap (IoU) between a track's predicted box and a detection to
   * match. Defaults to 0.2. Not `iouThreshold`, which is the detector's NMS.
   */
  matchThreshold?: number;
  /** Frames a track may go unseen before it's dropped. Defaults to 6. */
  maxMissed?: number;
  /** Sightings before a track is confirmed and numbered. Defaults to 3. */
  minHits?: number;
  /** Box centers kept per track. Defaults to 30. */
  trailLength?: number;
}

/** A box that stays the same object from frame to frame. */
export interface Track extends Detection {
  /** 1, 2, 3… in order of confirmation. */
  id: number;
  label?: string;
  /** Seconds, by the times passed to `update`. */
  firstSeen: number;
  lastSeen: number;
  hits: number;
  /** Updates since it was last seen; 0 when it's in this frame. */
  missed: number;
  /** Box centers, oldest first. */
  trail: Point[];
}

export interface Tracker {
  /** Match one frame's detections; returns the confirmed tracks seen in it. */
  update(found: readonly Detection[], time: number): Track[];
  /** Every confirmed track so far, live or dropped, by id. */
  tracks(): Track[];
  reset(): void;
}

interface Candidate extends Track {
  /** Velocity of the box's corner and size, per second. */
  vx: number;
  vy: number;
  /** How often it was seen as each class. */
  votes: Map<string | undefined, number>;
}

/** Overlap at which a box continues a track of another class. */
const CROSS_CLASS_IOU = 0.5;

const center = (d: Detection): Point => [d.x + d.w / 2, d.y + d.h / 2];

export function createTracker(options: TrackerOptions = {}): Tracker {
  const threshold = options.matchThreshold ?? 0.2;
  const maxMissed = options.maxMissed ?? 6;
  const minHits = options.minHits ?? 3;
  const trailLength = options.trailLength ?? 30;
  let live: Candidate[] = [];
  let confirmed: Candidate[] = [];
  let nextId = 1;
  let lastTime: number | null = null;

  function update(found: readonly Detection[], time: number): Track[] {
    const dt = lastTime === null ? 0 : Math.max(0, time - lastTime);
    lastTime = time;

    // Every pair that overlaps enough, best first; the same class wins ties.
    const pairs: { t: number; d: number; score: number }[] = [];
    live.forEach((track, t) => {
      const predicted = { ...track, x: track.x + track.vx * dt, y: track.y + track.vy * dt };
      found.forEach((det, d) => {
        const overlap = iou(predicted, det);
        if (det.label === track.label ? overlap >= threshold : overlap >= CROSS_CLASS_IOU) {
          pairs.push({ t, d, score: det.label === track.label ? overlap : overlap * 0.9 });
        }
      });
    });
    pairs.sort((a, b) => b.score - a.score);

    const usedTrack = new Set<number>();
    const usedDet = new Set<number>();
    for (const { t, d } of pairs) {
      if (usedTrack.has(t) || usedDet.has(d)) continue;
      usedTrack.add(t);
      usedDet.add(d);
      const track = live[t];
      const det = found[d];
      if (dt > 0) {
        // Smoothed, so one jittery box doesn't fling the prediction.
        track.vx = 0.5 * track.vx + 0.5 * ((det.x - track.x) / dt);
        track.vy = 0.5 * track.vy + 0.5 * ((det.y - track.y) / dt);
      }
      Object.assign(track, { x: det.x, y: det.y, w: det.w, h: det.h, score: det.score });
      track.votes.set(det.label, (track.votes.get(det.label) ?? 0) + 1);
      track.label = [...track.votes].reduce((best, next) => (next[1] > best[1] ? next : best))[0];
      track.hits++;
      track.missed = 0;
      track.lastSeen = time;
      track.trail.push(center(det));
      if (track.trail.length > trailLength) track.trail.shift();
      if (track.id === 0 && track.hits >= minHits) {
        track.id = nextId++;
        confirmed.push(track);
      }
    }

    for (const [t, track] of live.entries()) if (!usedTrack.has(t)) track.missed++;
    // An unconfirmed track gets one frame's grace, so a flicker doesn't reset it.
    live = live.filter((track) => track.missed <= (track.id ? maxMissed : 1));

    found.forEach((det, d) => {
      if (usedDet.has(d)) return;
      const track: Candidate = {
        ...det,
        id: 0,
        firstSeen: time,
        lastSeen: time,
        hits: 1,
        missed: 0,
        trail: [center(det)],
        vx: 0,
        vy: 0,
        votes: new Map([[det.label, 1]]),
      };
      if (minHits <= 1) {
        track.id = nextId++;
        confirmed.push(track);
      }
      live.push(track);
    });

    return live.filter((track) => track.id && track.missed === 0).map(snapshot);
  }

  return {
    update,
    tracks: () => confirmed.map(snapshot),
    reset() {
      live = [];
      confirmed = [];
      nextId = 1;
      lastTime = null;
    },
  };
}

function snapshot({ vx: _vx, vy: _vy, votes: _votes, ...track }: Candidate): Track {
  return { ...track, trail: [...track.trail] };
}

/** One tracked box in one frame, compact enough to save. */
export interface TrackBox {
  id: number;
  label?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  score: number;
}

export interface TrackedFrame {
  /** Seconds into the video. */
  time: number;
  boxes: TrackBox[];
}

/** A track over the whole video. */
export interface TrackSummary {
  id: number;
  label?: string;
  firstSeen: number;
  lastSeen: number;
  /** Frames it was seen in. */
  hits: number;
}

export interface TrackedVideo {
  fps: number;
  frames: TrackedFrame[];
  tracks: TrackSummary[];
}

export interface TrackVideoOptions extends DetectObjectsOptions, TrackerOptions {
  /** Frames analysed per second of video. Defaults to 6. */
  fps?: number;
  /** Seconds. Defaults to the whole video. */
  start?: number;
  end?: number;
  /** Only these COCO classes are tracked; all of them by default. */
  labels?: readonly string[];
  /** Boxes smaller than this on their longer side (a fraction of the frame) are ignored. Defaults to 0. */
  minSize?: number;
  /** The longest edge frames are read at. Defaults to 640. */
  maxSize?: number;
  signal?: AbortSignal;
  /** After each frame: its boxes, and how far through the range it is (0–1). */
  onFrame?: (frame: TrackedFrame, progress: number) => void;
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      video.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      video.removeEventListener("seeked", done);
      reject(new Error("[Retouch ML] The video couldn't seek"));
    };
    video.addEventListener("seeked", done);
    video.addEventListener("error", fail, { once: true });
    video.currentTime = time;
  });
}

/**
 * Track objects through a video: seek to each sampled frame, detect, match.
 * The video is paused and left at the last frame read. Boxes are normalized
 * 0–1 over the frame.
 */
export async function trackVideo(
  video: HTMLVideoElement,
  options: TrackVideoOptions = {},
): Promise<TrackedVideo> {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    await new Promise((resolve) =>
      video.addEventListener("loadedmetadata", resolve, { once: true }),
    );
  }
  const fps = options.fps ?? 6;
  const start = Math.max(0, options.start ?? 0);
  const end = Math.min(video.duration, options.end ?? video.duration);
  const labels = options.labels ? new Set(options.labels) : null;
  const scale = Math.min(
    1,
    (options.maxSize ?? 640) / Math.max(video.videoWidth, video.videoHeight),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("[Retouch ML] Failed to create canvas context");

  const tracker = createTracker(options);
  const frames: TrackedFrame[] = [];
  const count = Math.max(1, Math.floor((end - start) * fps) + 1);
  video.pause();
  for (let i = 0; i < count; i++) {
    options.signal?.throwIfAborted();
    // Rounded, so saved results don't carry float noise.
    const time = Math.round(Math.min(end, start + i / fps) * 1000) / 1000;
    await seek(video, time);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const found = await detectObjects(canvas, options);
    const minSize = options.minSize ?? 0;
    const tracks = tracker.update(
      found.filter(
        (d) => (!labels || (d.label && labels.has(d.label))) && Math.max(d.w, d.h) >= minSize,
      ),
      time,
    );
    const frame: TrackedFrame = {
      time,
      boxes: tracks.map(({ id, label, x, y, w, h, score }) => ({ id, label, x, y, w, h, score })),
    };
    frames.push(frame);
    options.onFrame?.(frame, (i + 1) / count);
  }
  // A track is called what it was seen as most, in every frame, not what
  // the vote said by then: one name from the frame it enters.
  const tracks = tracker.tracks();
  const names = new Map(tracks.map((track) => [track.id, track.label]));
  for (const frame of frames) for (const box of frame.boxes) box.label = names.get(box.id);
  return {
    fps,
    frames,
    tracks: tracks.map(({ id, label, firstSeen, lastSeen, hits }) => ({
      id,
      label,
      firstSeen,
      lastSeen,
      hits,
    })),
  };
}
