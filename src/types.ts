export type AppState = "idle" | "dropzone" | "gallery" | "editor" | "destroyed";

export type EditorTool = "trim" | "crop" | "adjust" | "filters";

export type FilterPreset = "none" | "bw" | "sepia" | "warm" | "cool" | "vintage" | "vivid";

export type MediaKind = "image" | "video";

export interface TrimRange {
  /** Seconds from media start, >= 0. */
  start: number;
  /** Seconds from media start; end - start >= MIN_TRIM_DURATION. */
  end: number;
}

export type FileRejectionReason = "type" | "size" | "duration" | "count" | "load-error";

export type GalleryViewMode = "cols-2" | "cols-3" | "cols-4" | "width-fit" | "height-fit" | "list";

export type AspectRatioPreset = "free" | "16:9" | "4:3" | "1:1" | "3:2" | "9:16";

export interface RetouchOptions {
  /** Target DOM element or CSS selector to mount into. */
  target: string | HTMLElement;
  /** Maximum number of files. Defaults to Infinity. */
  maxFiles?: number;
  /** Accepted image MIME types. Defaults to common image types. */
  acceptedTypes?: string[];
  /** Accepted video MIME types. Pass [] to disable video. */
  acceptedVideoTypes?: string[];
  /** Maximum file size in bytes for any media. Defaults to Infinity. */
  maxFileSize?: number;
  /** Maximum video duration in seconds. Defaults to Infinity. */
  maxVideoDuration?: number;
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
  /** Preset filter applied beneath the adjustments. */
  filter: FilterPreset;
}

export interface VideoEdits extends ImageEdits {
  trim: TrimRange;
  mute: boolean;
}

interface MediaEntryBase {
  id: string;
  file: File;
  /** Object URL for the gallery thumbnail (video: a captured poster frame). */
  thumbnailUrl: string;
  edited: boolean;
}

export interface ImageEntry extends MediaEntryBase {
  kind: "image";
  image: HTMLImageElement;
  edits: ImageEdits;
}

export interface VideoEntry extends MediaEntryBase {
  kind: "video";
  /** Detached element; never appended to the DOM. */
  video: HTMLVideoElement;
  /** Object URL backing video.src — revoked separately from thumbnailUrl. */
  videoUrl: string;
  /** Seconds. */
  duration: number;
  width: number;
  height: number;
  edits: VideoEdits;
}

export type MediaEntry = ImageEntry | VideoEntry;

export interface RetouchEventMap {
  "state:change": { from: AppState; to: AppState };
  "images:add": { entries: MediaEntry[] };
  "images:remove": { id: string };
  "editor:open": { id: string };
  "editor:done": { id: string; edits: ImageEdits | VideoEdits };
  "editor:cancel": { id: string };
  "file:rejected": { file: File; reason: FileRejectionReason };
  "frame:capture": { sourceId: string; entry: ImageEntry };
  "export:start": { id: string; kind: MediaKind };
  "export:progress": { id: string; progress: number };
  "export:complete": { id: string; blob: Blob };
  "export:error": { id: string; error: Error };
  done: { blobs: Blob[] };
}

export interface ViewHandle {
  root: HTMLElement;
  destroy(): void;
}
