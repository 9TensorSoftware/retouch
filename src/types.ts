export type AppState = "idle" | "dropzone" | "gallery" | "editor" | "destroyed";

export type BuiltinEditorTool =
  | "trim"
  | "crop"
  | "transform"
  | "curves"
  | "hsl"
  | "adjust"
  | "filters";

/** Built-in tool ids plus any id registered via `Retouch.registerTool`. */
export type EditorTool = BuiltinEditorTool | (string & {});

export type FilterPreset =
  | "none"
  | "bw"
  | "sepia"
  | "warm"
  | "cool"
  | "vivid"
  | "vintage"
  | "kodachrome"
  | "technicolor"
  | "polaroid"
  | "brownie"
  | "invert";

export type MediaKind = "image" | "video";

/** Coarse rotation applied to the source before cropping, clockwise degrees. */
export type Orientation = 0 | 90 | 180 | 270;

export interface TrimRange {
  /** Seconds from media start, >= 0. */
  start: number;
  /** Seconds from media start; end - start >= MIN_TRIM_DURATION. */
  end: number;
}

export type FileRejectionReason = "type" | "size" | "duration" | "count" | "load-error";

/** Prepared request handed to a custom AI transport. */
export interface AiRequest {
  system: string;
  prompt: string;
  /** Base64 JPEG of the current frame (no data: prefix), when image context is enabled. */
  imageBase64?: string;
  /** JSON Schema describing the expected edit-operations object. */
  schema: Record<string, unknown>;
}

export interface AiOptions {
  /**
   * Anthropic API key. Browser-visible — fine for prototypes; production
   * should proxy via `baseUrl` or `complete` instead.
   */
  apiKey?: string;
  /** Model ID. Defaults to "claude-haiku-4-5". */
  model?: string;
  /** API origin override (e.g. your server-side proxy). */
  baseUrl?: string;
  /** Attach a downscaled frame so content-aware commands work. Defaults to true. */
  sendImage?: boolean;
  /** Show an "Add API key" popover storing the end user's key in localStorage. */
  allowUserKey?: boolean;
  /** Custom transport replacing the built-in Anthropic call. Must resolve to the raw edit-operations object. */
  complete?: (request: AiRequest) => Promise<unknown>;
}

/** Validated, clamped edit operations produced by the AI command bar. */
export interface AiEditOps {
  crop?: CropRect;
  aspect?: AspectRatioPreset;
  rotation?: number;
  /** Vertical keystone correction, -100 to 100. */
  keystoneV?: number;
  /** Horizontal keystone correction, -100 to 100. */
  keystoneH?: number;
  /** Absolute target orientation. */
  orientation?: Orientation;
  /** Toggle: mirror the displayed image horizontally. */
  flipH?: boolean;
  /** Toggle: mirror the displayed image vertically. */
  flipV?: boolean;
  adjustments?: Partial<Adjustments>;
  /** Per-band HSL shifts; only include bands you change. */
  hsl?: Partial<Record<HslBand, Partial<HslShift>>>;
  filter?: FilterPreset;
  filterStrength?: number;
  trim?: TrimRange;
  mute?: boolean;
  speed?: number;
  reset?: boolean;
  explanation: string;
}

export type GalleryViewMode = "cols-2" | "cols-3" | "cols-4" | "width-fit" | "height-fit" | "list";

export type AspectRatioPreset = "free" | "16:9" | "4:3" | "1:1" | "3:2" | "9:16";

export interface ImageExportOptions {
  /** Output format. Defaults to "png". */
  format?: "png" | "jpeg" | "webp";
  /** Quality 0–1 for lossy formats (jpeg/webp). Defaults to 0.92. */
  quality?: number;
  /** Cap the exported image's long edge in pixels. No cap by default. */
  maxDimension?: number;
}

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
  /** Enables the AI command bar in the editor when configured. */
  ai?: AiOptions;
  /**
   * Editor feature groups to mount, in tab order. Filters both built-in
   * tools and tools registered via `Retouch.registerTool`; omit for all.
   */
  tools?: EditorTool[];
  /** Image export format/quality/sizing. Videos always export as MP4/WebM. */
  export?: ImageExportOptions;
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
  /** -100–100 (≈ ±2 EV), default 0. */
  exposure: number;
  /** -100 (cool) – 100 (warm), default 0. */
  temperature: number;
  /** -100 (green) – 100 (magenta), default 0. */
  tint: number;
  /** Hue rotation in degrees, -180–180, default 0. */
  hue: number;
  /** -100–100, default 0. Boosts muted colors more than saturated ones. */
  vibrance: number;
  /** 0–100, default 0. */
  sharpen: number;
  /** 0–100, default 0. */
  blur: number;
  /** Film grain, 0–100, default 0. */
  grain: number;
  /** Edge darkening, 0–100, default 0. */
  vignette: number;
}

export type HslBand =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "aqua"
  | "blue"
  | "purple"
  | "magenta";

/** Per-band shifts, each -100..100 (0 = neutral). */
export interface HslShift {
  h: number;
  s: number;
  l: number;
}

/** Lightroom-style HSL mixer: independent shifts for eight hue bands. */
export type HslMixer = Record<HslBand, HslShift>;

/** One tone-curve control point, both axes normalized 0–1. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** Tone curves: a master curve plus per-channel curves (identity = 2 corner points). */
export interface Curves {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

export interface ImageEdits {
  /** Normalized over the oriented (rotated/flipped) source. */
  crop: CropRect;
  /** Fine straighten angle in degrees, -45 to 45, applied after crop. */
  rotation: number;
  /** Vertical keystone (perspective) correction, -100 to 100. */
  keystoneV: number;
  /** Horizontal keystone (perspective) correction, -100 to 100. */
  keystoneH: number;
  /** 90°-step rotation applied to the source before cropping. */
  orientation: Orientation;
  /** Mirror the source horizontally (before orientation). */
  flipH: boolean;
  /** Mirror the source vertically (before orientation). */
  flipV: boolean;
  adjustments: Adjustments;
  /** Tone curves applied after adjustments/filters (identity by default). */
  curves: Curves;
  /** Per-hue-band color mixer, applied before the curves. */
  hsl: HslMixer;
  /** Preset filter applied beneath the adjustments. */
  filter: FilterPreset;
  /** Preset intensity, 0–100. */
  filterStrength: number;
}

export interface VideoEdits extends ImageEdits {
  trim: TrimRange;
  mute: boolean;
  /** Playback rate, 0.25–4. Audio is dropped on export when ≠ 1. */
  speed: number;
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
  "ai:start": { id: string; prompt: string };
  "ai:applied": { id: string; ops: AiEditOps; explanation: string };
  "ai:error": { id: string; error: Error };
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
