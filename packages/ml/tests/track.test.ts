import { describe, expect, it } from "vitest";
import type { Detection } from "../src/detect";
import { createTracker, type TrackedVideo } from "../src/track";
import { boxesAt, firstShown, trackBounds } from "../src/track-tool";

const det = (x: number, y: number, label = "person", w = 0.1, h = 0.2): Detection => ({
  x,
  y,
  w,
  h,
  score: 0.9,
  label,
});

describe("createTracker", () => {
  it("keeps one id for a box that moves a little each frame", () => {
    const tracker = createTracker();
    expect(tracker.update([det(0.1, 0.1)], 0)).toEqual([]); // not confirmed yet
    expect(tracker.update([det(0.12, 0.1)], 0.2)).toEqual([]);
    const third = tracker.update([det(0.14, 0.1)], 0.4);
    expect(third).toHaveLength(1);
    expect(third[0]).toMatchObject({
      id: 1,
      label: "person",
      firstSeen: 0,
      lastSeen: 0.4,
      hits: 3,
    });
    expect(third[0].trail).toHaveLength(3);
  });

  it("tells two objects apart, and numbers them in order", () => {
    const tracker = createTracker({ minHits: 2 });
    tracker.update([det(0.1, 0.1), det(0.6, 0.5)], 0);
    const tracks = tracker.update([det(0.62, 0.5), det(0.11, 0.1)], 0.2);
    const at = (x: number) => tracks.find((t) => Math.abs(t.x - x) < 0.05)?.id;
    expect(new Set([at(0.11), at(0.62)])).toEqual(new Set([1, 2]));
    const next = tracker.update([det(0.13, 0.1), det(0.64, 0.5)], 0.4);
    expect(next.find((t) => t.x < 0.5)?.id).toBe(at(0.11));
    expect(next.find((t) => t.x > 0.5)?.id).toBe(at(0.62));
  });

  it("matches across classes only when the boxes all but coincide", () => {
    const tracker = createTracker({ minHits: 2 });
    tracker.update([det(0.1, 0.1, "bicycle")], 0);
    tracker.update([det(0.1, 0.1, "bicycle")], 0.2);
    // The detector wavers: same place, other class. Still bicycle 1, by vote.
    expect(tracker.update([det(0.1, 0.1, "motorcycle")], 0.4)[0]).toMatchObject({
      id: 1,
      label: "bicycle",
    });
    // Overlapping, but not nearly the same box: a different thing.
    tracker.update([det(0.1, 0.1, "bicycle"), det(0.14, 0.12, "dog")], 0.6);
    const next = tracker.update([det(0.1, 0.1, "bicycle"), det(0.14, 0.12, "dog")], 0.8);
    expect(next.map((t) => [t.id, t.label])).toEqual([
      [1, "bicycle"],
      [2, "dog"],
    ]);
  });

  it("follows a fast object by where it's heading", () => {
    // Moves its own width every frame: no overlap with its last box.
    const tracker = createTracker();
    tracker.update([det(0.1, 0.4)], 0);
    tracker.update([det(0.15, 0.4)], 0.1);
    tracker.update([det(0.22, 0.4)], 0.2);
    tracker.update([det(0.31, 0.4)], 0.3);
    expect(tracker.update([det(0.4, 0.4)], 0.4).map((t) => t.id)).toEqual([1]);
    expect(tracker.tracks()).toHaveLength(1);
  });

  it("keeps the id through a few missed frames, then lets it go", () => {
    const tracker = createTracker({ maxMissed: 2, minHits: 2 });
    tracker.update([det(0.3, 0.3)], 0);
    tracker.update([det(0.3, 0.3)], 0.2);
    tracker.update([], 0.4);
    tracker.update([], 0.6);
    expect(tracker.update([det(0.3, 0.3)], 0.8)[0].id).toBe(1);
    for (const t of [1, 1.2, 1.4]) tracker.update([], t);
    tracker.update([det(0.3, 0.3)], 1.6);
    expect(tracker.update([det(0.3, 0.3)], 1.8)[0].id).toBe(2);
  });

  it("never numbers a one-frame false positive", () => {
    const tracker = createTracker();
    tracker.update([det(0.5, 0.5, "kite")], 0);
    tracker.update([det(0.1, 0.1)], 0.2);
    tracker.update([det(0.1, 0.1)], 0.4);
    tracker.update([det(0.1, 0.1)], 0.6);
    expect(tracker.tracks().map((t) => [t.id, t.label])).toEqual([[1, "person"]]);
  });

  it("starts over on reset", () => {
    const tracker = createTracker({ minHits: 1 });
    expect(tracker.update([det(0.1, 0.1)], 0)[0].id).toBe(1);
    tracker.reset();
    expect(tracker.update([det(0.5, 0.5)], 0)[0].id).toBe(1);
  });
});

describe("Track tool geometry", () => {
  const box = (id: number, x: number, y = 0.2) => ({
    id,
    label: "car",
    x,
    y,
    w: 0.1,
    h: 0.1,
    score: 0.9,
  });
  const result: TrackedVideo = {
    fps: 2,
    frames: [
      { time: 1, boxes: [box(1, 0.1)] },
      { time: 1.5, boxes: [box(1, 0.2), box(2, 0.7)] },
      { time: 2, boxes: [box(2, 0.6, 0.5)] },
    ],
    tracks: [],
  };

  it("glides boxes between the frames it read", () => {
    const [mid] = boxesAt(result, 1.25);
    expect(mid.id).toBe(1);
    expect(mid.x).toBeCloseTo(0.15);
    // A track that starts between frames shows for the nearer half.
    expect(boxesAt(result, 1.2).map((b) => b.id)).toEqual([1]);
    expect(boxesAt(result, 1.3).map((b) => b.id)).toEqual([1, 2]);
    // One that ends does the same, the other way.
    expect(boxesAt(result, 1.7).map((b) => b.id)).toEqual([1, 2]);
    expect(boxesAt(result, 1.8).map((b) => b.id)).toEqual([2]);
    // Before the first frame and after the last, the nearest frame holds.
    expect(boxesAt(result, 0).map((b) => b.x)).toEqual([0.1]);
    expect(boxesAt(result, 9).map((b) => b.y)).toEqual([0.5]);
    expect(boxesAt({ fps: 6, frames: [], tracks: [] }, 1)).toEqual([]);
  });

  it("finds the first frame a track is on screen", () => {
    expect(firstShown(result, 1)).toBe(1);
    expect(firstShown(result, 2)).toBe(1.5);
    expect(firstShown(result, 9)).toBeNull();
  });

  it("bounds everywhere a track went, with room around it", () => {
    const bounds = trackBounds(result, 2, 0);
    expect(bounds?.x).toBeCloseTo(0.6);
    expect(bounds?.y).toBeCloseTo(0.2);
    expect(bounds?.width).toBeCloseTo(0.2);
    expect(bounds?.height).toBeCloseTo(0.4);
    const padded = trackBounds(result, 2);
    expect(padded?.x).toBeLessThan(0.6);
    expect(trackBounds(result, 9)).toBeNull();
  });
});
