/**
 * Keystone (perspective) correction as two separable strip warps — pure
 * canvas 2D, no dependencies. Vertical keystone rescales each row around the
 * center (fixing converging verticals); horizontal keystone does the same per
 * column. Applying both sequentially approximates the full homography closely
 * enough for correction work while staying fast enough for per-frame video.
 */

/** Slider range is −100..100; map to a max edge scale change of ±30%. */
const KEYSTONE_STRENGTH = 0.006;

export function hasKeystone(keystoneV: number, keystoneH: number): boolean {
  return keystoneV !== 0 || keystoneH !== 0;
}

/**
 * Horizontal scale of the row at normalized position t (0 = top, 1 = bottom)
 * for a vertical-keystone amount (−100..100). Positive widens the top —
 * correcting the converging verticals of an upward shot.
 */
export function keystoneScaleAt(t: number, amount: number): number {
  return Math.max(0.4, 1 + (0.5 - t) * amount * KEYSTONE_STRENGTH);
}

/**
 * Warp `src` into `dst` (same dimensions) applying vertical then horizontal
 * keystone. `scratch` is a caller-owned intermediate canvas, resized here.
 */
export function applyKeystone(
  src: HTMLCanvasElement,
  scratch: HTMLCanvasElement,
  dst: CanvasRenderingContext2D,
  keystoneV: number,
  keystoneH: number,
): void {
  const w = src.width;
  const h = src.height;
  if (w === 0 || h === 0) return;

  let stage: HTMLCanvasElement = src;

  if (keystoneV !== 0) {
    if (scratch.width !== w || scratch.height !== h) {
      scratch.width = w;
      scratch.height = h;
    }
    const ctx = scratch.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      const s = keystoneScaleAt(h > 1 ? y / (h - 1) : 0.5, keystoneV);
      const rowW = w * s;
      ctx.drawImage(stage, 0, y, w, 1, (w - rowW) / 2, y, rowW, 1);
    }
    stage = scratch;
  }

  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.clearRect(0, 0, w, h);

  if (keystoneH !== 0) {
    for (let x = 0; x < w; x++) {
      const s = keystoneScaleAt(w > 1 ? x / (w - 1) : 0.5, keystoneH);
      const colH = h * s;
      dst.drawImage(stage, x, 0, 1, h, x, (h - colH) / 2, 1, colH);
    }
  } else {
    dst.drawImage(stage, 0, 0);
  }
}
