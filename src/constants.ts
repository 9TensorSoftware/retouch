import type { Adjustments, CropRect, Curves, HslMixer, ImageEdits, VideoEdits } from "./types";

export const VERSION = "0.0.2";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

/** Smallest allowed trimmed length, in seconds. */
export const MIN_TRIM_DURATION = 0.1;

/** Long-edge cap for the editor's video preview canvas. */
export const PREVIEW_MAX_DIM = 1280;

/** Long-edge cap for the editor's image preview canvas (static — filtered per edit, not per frame). */
export const IMAGE_PREVIEW_MAX_DIM = 2048;

export const FILMSTRIP_THUMB_HEIGHT = 48;
export const FILMSTRIP_MAX_THUMBS = 20;

export const DEFAULT_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  exposure: 0,
  temperature: 0,
  tint: 0,
  hue: 0,
  vibrance: 0,
  sharpen: 0,
  blur: 0,
  grain: 0,
  vignette: 0,
};

/** Identity tone curves (straight diagonal per channel). */
export function createDefaultCurves(): Curves {
  return {
    master: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    r: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    g: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    b: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

/** All-zero HSL mixer. */
export function createDefaultHsl(): HslMixer {
  const zero = () => ({ h: 0, s: 0, l: 0 });
  return {
    red: zero(),
    orange: zero(),
    yellow: zero(),
    green: zero(),
    aqua: zero(),
    blue: zero(),
    purple: zero(),
    magenta: zero(),
  };
}

export const DEFAULT_EDITS: ImageEdits = {
  crop: { ...DEFAULT_CROP },
  rotation: 0,
  keystoneV: 0,
  keystoneH: 0,
  orientation: 0,
  flipH: false,
  flipV: false,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
  curves: createDefaultCurves(),
  hsl: createDefaultHsl(),
  masks: [],
  filter: "none",
  filterStrength: 100,
};

export function createDefaultVideoEdits(duration: number): VideoEdits {
  return {
    ...structuredClone(DEFAULT_EDITS),
    trim: { start: 0, end: duration },
    mute: false,
    speed: 1,
  };
}

export const ASPECT_RATIOS: Record<string, number | null> = {
  free: null,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "3:2": 3 / 2,
  "9:16": 9 / 16,
};
