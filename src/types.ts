export type AppState = "idle" | "dropzone" | "gallery" | "editor" | "destroyed";

export type EditorTool = "crop" | "adjust";

export type GalleryViewMode = "grid" | "masonry" | "list";

export type AspectRatioPreset = "free" | "16:9" | "4:3" | "1:1" | "3:2" | "9:16";

export interface RetouchOptions {
  /** Target DOM element or CSS selector to mount into. */
  target: string | HTMLElement;
  /** Maximum number of files. Defaults to Infinity. */
  maxFiles?: number;
  /** Accepted MIME types. Defaults to common image types. */
  acceptedTypes?: string[];
  /** Called when the user clicks Done in the gallery with all exported blobs. */
  onDone?: (blobs: Blob[]) => void;
}

export interface CropRect {
  /** Normalized left (0–1). */
  x: number;
  /** Normalized top (0–1). */
  y: number;
  /** Normalized width (0–1). */
  width: number;
  /** Normalized height (0–1). */
  height: number;
}

export interface Adjustments {
  /** 0–200, default 100. */
  brightness: number;
  /** 0–200, default 100. */
  contrast: number;
  /** 0–200, default 100. */
  saturation: number;
}

export interface ImageEdits {
  crop: CropRect;
  /** Degrees, -45 to 45. */
  rotation: number;
  adjustments: Adjustments;
}

export interface ImageEntry {
  id: string;
  file: File;
  image: HTMLImageElement;
  thumbnailUrl: string;
  edits: ImageEdits;
  edited: boolean;
}

export interface RetouchEventMap {
  "state:change": { from: AppState; to: AppState };
  "images:add": { entries: ImageEntry[] };
  "images:remove": { id: string };
  "editor:open": { id: string };
  "editor:done": { id: string; edits: ImageEdits };
  "editor:cancel": { id: string };
  done: { blobs: Blob[] };
}

export interface ViewHandle {
  root: HTMLElement;
  destroy(): void;
}
