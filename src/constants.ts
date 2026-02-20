import type { Adjustments, CropRect, ImageEdits } from "./types";

export const VERSION = "0.0.1";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const DEFAULT_CROP: CropRect = { x: 0, y: 0, width: 1, height: 1 };

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

export const DEFAULT_EDITS: ImageEdits = {
  crop: { ...DEFAULT_CROP },
  rotation: 0,
  adjustments: { ...DEFAULT_ADJUSTMENTS },
};

export const ASPECT_RATIOS: Record<string, number | null> = {
  free: null,
  "16:9": 16 / 9,
  "4:3": 4 / 3,
  "1:1": 1,
  "3:2": 3 / 2,
  "9:16": 9 / 16,
};
