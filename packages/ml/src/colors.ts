/**
 * Semantic colors for the canvas-drawn ML overlays. Canvas contexts can't
 * read CSS custom properties, so these literals mirror the core theme:
 * KEEP tracks the success green, REMOVE tracks the darkroom `--rt-danger`.
 * Tuples exist for raw ImageData writes (the select tint); `rgba()` builds
 * context styles from the same source of truth.
 */
export const KEEP_RGB: readonly [number, number, number] = [94, 210, 120];
export const REMOVE_RGB: readonly [number, number, number] = [229, 83, 61];

/** Ink used on top of a KEEP-colored chip (detect labels). */
export const ON_KEEP = "#10160F";

export function rgba(rgb: readonly [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}
