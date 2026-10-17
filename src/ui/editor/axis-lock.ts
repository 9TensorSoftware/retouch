// Direction lock for drags. A drag that sets off along an axis stays on it,
// so a straight pull doesn't pick up the hand's drift; one that sets off at
// an angle stays free. The first few pixels decide, once per drag.

export type DragAxis = "x" | "y" | "free";

/** Screen pixels a drag travels before its direction is decided. */
export const AXIS_DECIDE_PX = 6;
/** How many times further one axis must move than the other to lock to it (about 22°). */
export const AXIS_LOCK_RATIO = 2.5;

/** The axis a drag that has moved (dx, dy) screen px locks to; null while too short to tell. */
export function pickAxis(dx: number, dy: number): DragAxis | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < AXIS_DECIDE_PX) return null;
  if (ay >= ax * AXIS_LOCK_RATIO) return "y";
  if (ax >= ay * AXIS_LOCK_RATIO) return "x";
  return "free";
}

/** One drag's lock: decided on the way out, then kept until the pointer lets go. */
export interface AxisLock {
  /** The drag's deltas, with the off-axis part dropped once it has locked. */
  apply(dx: number, dy: number): { dx: number; dy: number };
  /** The decided axis, or null while the drag is too short to tell. */
  readonly axis: DragAxis | null;
}

export function createAxisLock(): AxisLock {
  let axis: DragAxis | null = null;
  return {
    apply(dx, dy) {
      axis ??= pickAxis(dx, dy);
      if (axis === "x") return { dx, dy: 0 };
      if (axis === "y") return { dx: 0, dy };
      return { dx, dy };
    },
    get axis() {
      return axis;
    },
  };
}
