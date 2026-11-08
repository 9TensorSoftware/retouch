import type { Detection } from "./detect";

/**
 * What the tools that find things have in common: how a finding becomes an
 * object on the editor's layer, and how long the findings are kept.
 */

/** One color per kind of thing, or per track, in turn. */
export const FINDING_COLORS = ["#5cc8ff", "#ffc457", "#8ce99a", "#a58bff", "#ff9068", "#ff7eb6"];

type Corner = readonly [x: number, y: number];

export function boxQuad(box: Pick<Detection, "x" | "y" | "w" | "h">): Corner[] {
  return [
    [box.x, box.y],
    [box.x + box.w, box.y],
    [box.x + box.w, box.y + box.h],
    [box.x, box.y + box.h],
  ];
}

/** A crop in 0–1 of the frame, as `edits.crop` takes it. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The boxes as one crop, with even room around them, kept inside the frame:
 * what "Crop to it" frames. Null when there are no boxes.
 */
export function cropAround(
  boxes: Iterable<Pick<Detection, "x" | "y" | "w" | "h">>,
  margin = 0.08,
): CropRect | null {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const box of boxes) {
    x0 = Math.min(x0, box.x);
    y0 = Math.min(y0, box.y);
    x1 = Math.max(x1, box.x + box.w);
    y1 = Math.max(y1, box.y + box.h);
  }
  if (x1 <= x0 || y1 <= y0) return null;
  const mx = (x1 - x0) * margin;
  const my = (y1 - y0) * margin;
  const x = Math.max(0, x0 - mx);
  const y = Math.max(0, y0 - my);
  return { x, y, width: Math.min(1, x1 + mx) - x, height: Math.min(1, y1 + my) - y };
}

/** What a detection is called: its class, or "face" from the face model. */
export const detectionName = (d: Pick<Detection, "label">): string => d.label ?? "face";

/** A color for each detection, the same for each class, in order of first sighting. */
export function detectionColors(found: readonly Pick<Detection, "label">[]): string[] {
  const colors = new Map<string, string>();
  return found.map((d) => {
    const name = detectionName(d);
    let color = colors.get(name);
    if (!color) {
      color = FINDING_COLORS[colors.size % FINDING_COLORS.length];
      colors.set(name, color);
    }
    return color;
  });
}

/** An image entry, as far as keeping its findings goes. */
interface PhotoEntry {
  image: object;
}

export interface KeptFindings<T> {
  /** The findings for the entry's pixels as they are now. */
  get(entry: PhotoEntry): T | undefined;
  set(entry: PhotoEntry, findings: T): void;
  /** The entry's next pixels line up with these findings: a mosaic, say. */
  carry(entry: PhotoEntry, findings: T): void;
  /** Those next pixels aren't coming after all. */
  drop(entry: PhotoEntry): void;
}

/**
 * Findings by the pixels they were found in, so they outlast a tool switch
 * or the editor remounting, and undo brings them back with their pixels.
 * Pixels that have moved, such as a baked crop, start with none.
 */
export function keepFindings<T>(): KeptFindings<T> {
  const byImage = new WeakMap<object, T>();
  const carried = new WeakMap<object, T>();
  return {
    get(entry) {
      const next = carried.get(entry);
      if (next !== undefined) {
        byImage.set(entry.image, next);
        carried.delete(entry);
      }
      return byImage.get(entry.image);
    },
    set(entry, findings) {
      byImage.set(entry.image, findings);
    },
    carry(entry, findings) {
      carried.set(entry, findings);
    },
    drop(entry) {
      carried.delete(entry);
    },
  };
}
