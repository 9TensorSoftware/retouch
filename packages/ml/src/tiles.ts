/**
 * Tile-grid math for running super-resolution networks over large images:
 * the image splits into core regions processed one at a time, each read
 * with surrounding overlap so tile borders see real context, then only the
 * core survives stitching — no visible seams.
 */

export interface Tile {
  /** Rect to read from the source (core plus clamped overlap). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Core region to keep, relative to the read rect. */
  keepX: number;
  keepY: number;
  keepW: number;
  keepH: number;
  /** Core position in source coordinates (where the kept region lands). */
  dx: number;
  dy: number;
}

/**
 * Cover a width×height image with core tiles of `tileSize`, each padded by
 * `overlap` on every side that has neighboring pixels. Cores partition the
 * image exactly: no gaps, no double-writes.
 */
export function computeTileGrid(
  width: number,
  height: number,
  tileSize = 128,
  overlap = 8,
): Tile[] {
  if (width <= 0 || height <= 0) return [];
  const step = Math.max(1, Math.floor(tileSize));
  const pad = Math.max(0, Math.floor(overlap));
  const tiles: Tile[] = [];
  for (let y0 = 0; y0 < height; y0 += step) {
    const coreH = Math.min(step, height - y0);
    for (let x0 = 0; x0 < width; x0 += step) {
      const coreW = Math.min(step, width - x0);
      const sx = Math.max(0, x0 - pad);
      const sy = Math.max(0, y0 - pad);
      const ex = Math.min(width, x0 + coreW + pad);
      const ey = Math.min(height, y0 + coreH + pad);
      tiles.push({
        sx,
        sy,
        sw: ex - sx,
        sh: ey - sy,
        keepX: x0 - sx,
        keepY: y0 - sy,
        keepW: coreW,
        keepH: coreH,
        dx: x0,
        dy: y0,
      });
    }
  }
  return tiles;
}
