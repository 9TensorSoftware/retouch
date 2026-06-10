import { ACCEPTED_TYPES } from "./constants";
import { EventEmitter } from "./event-emitter";
import { StateMachine } from "./state-machine";
import { injectStyles } from "./styles";
import type {
  AppState,
  ImageEntry,
  MediaEntry,
  RetouchEventMap,
  RetouchOptions,
  ViewHandle,
} from "./types";
import { createDropZone } from "./ui/drop-zone";
import { createEditor } from "./ui/editor/editor";
import { createGallery } from "./ui/gallery";
import { h } from "./ui/h";
import { exportImage, processFiles, revokeThumbnailUrl } from "./utils/image";
import { isImageEntry, releaseVideo } from "./utils/video";

const STATE_TRANSITIONS: Record<AppState, AppState[]> = {
  idle: ["dropzone"],
  dropzone: ["gallery", "destroyed"],
  gallery: ["editor", "dropzone", "destroyed"],
  editor: ["gallery", "destroyed"],
  destroyed: [],
};

export class Retouch {
  private readonly root: HTMLElement;
  private readonly container: HTMLElement;
  private readonly media = new Map<string, MediaEntry>();
  private readonly sm: StateMachine<AppState>;
  private readonly emitter = new EventEmitter<RetouchEventMap>();
  private readonly options: Required<
    Pick<
      RetouchOptions,
      "maxFiles" | "acceptedTypes" | "acceptedVideoTypes" | "maxFileSize" | "maxVideoDuration"
    >
  > & {
    onDone?: RetouchOptions["onDone"];
  };

  private currentView: ViewHandle | null = null;
  private editingImageId: string | null = null;

  constructor(options: RetouchOptions) {
    if (typeof options.target === "string") {
      const el = document.querySelector<HTMLElement>(options.target);
      if (!el) {
        throw new Error(`[Retouch] Target element not found: ${options.target}`);
      }
      this.container = el;
    } else {
      this.container = options.target;
    }

    this.options = {
      maxFiles: options.maxFiles ?? Number.POSITIVE_INFINITY,
      acceptedTypes: options.acceptedTypes ?? ACCEPTED_TYPES,
      // Off by default until video export ships; pass ACCEPTED_VIDEO_TYPES to opt in.
      acceptedVideoTypes: options.acceptedVideoTypes ?? [],
      maxFileSize: options.maxFileSize ?? Number.POSITIVE_INFINITY,
      maxVideoDuration: options.maxVideoDuration ?? Number.POSITIVE_INFINITY,
      onDone: options.onDone,
    };

    injectStyles();

    this.root = h("div", { class: "rt-root" });
    this.container.appendChild(this.root);

    this.sm = new StateMachine<AppState>("idle", STATE_TRANSITIONS);
    this.sm.onChange(({ to }) => {
      this.handleStateChange(to);
    });

    this.sm.transition("dropzone");
  }

  get state(): AppState {
    return this.sm.state;
  }

  on<K extends keyof RetouchEventMap>(
    event: K,
    fn: (data: RetouchEventMap[K]) => void,
  ): () => void {
    return this.emitter.on(event, fn);
  }

  async addFiles(files: File[]): Promise<void> {
    const remaining = this.options.maxFiles - this.media.size;
    for (const file of files.slice(Math.max(0, remaining))) {
      this.emitter.emit("file:rejected", { file, reason: "count" });
    }
    if (remaining <= 0) return;

    const sliced = files.slice(0, remaining);
    const { entries, rejected } = await processFiles(sliced, {
      acceptedImageTypes: this.options.acceptedTypes,
      acceptedVideoTypes: this.options.acceptedVideoTypes,
      maxFileSize: this.options.maxFileSize,
      maxVideoDuration: this.options.maxVideoDuration,
    });

    for (const rejection of rejected) {
      this.emitter.emit("file:rejected", rejection);
    }
    if (entries.length === 0) return;

    for (const entry of entries) {
      this.media.set(entry.id, entry);
    }

    this.emitter.emit("images:add", { entries });

    if (this.sm.state === "dropzone") {
      this.sm.transition("gallery");
    } else if (this.sm.state === "gallery") {
      this.unmountCurrentView();
      this.mountGallery();
    }
  }

  removeImage(id: string): void {
    const entry = this.media.get(id);
    if (!entry) return;
    revokeThumbnailUrl(entry.thumbnailUrl);
    if (entry.kind === "video") {
      releaseVideo(entry.video);
      URL.revokeObjectURL(entry.videoUrl);
    }
    this.media.delete(id);
    this.emitter.emit("images:remove", { id });

    if (this.media.size === 0 && this.sm.state === "gallery") {
      this.sm.transition("dropzone");
    }
  }

  openEditor(id: string): void {
    if (!this.media.has(id)) return;
    this.editingImageId = id;
    this.emitter.emit("editor:open", { id });
    this.sm.transition("editor");
  }

  closeEditor(commit: boolean): void {
    if (this.sm.state !== "editor" || !this.editingImageId) return;
    const id = this.editingImageId;
    const entry = this.media.get(id);

    if (commit && entry) {
      entry.edited = true;
      this.emitter.emit("editor:done", { id, edits: entry.edits });
    } else {
      this.emitter.emit("editor:cancel", { id });
    }

    this.editingImageId = null;
    this.sm.transition("gallery");
  }

  getEditingEntry(): MediaEntry | null {
    if (!this.editingImageId) return null;
    return this.media.get(this.editingImageId) ?? null;
  }

  /** All media entries, in insertion order. */
  getMedia(): MediaEntry[] {
    return Array.from(this.media.values());
  }

  /** @deprecated Use getMedia() — this excludes video entries. */
  getImages(): ImageEntry[] {
    return this.getMedia().filter(isImageEntry);
  }

  async exportAll(): Promise<Blob[]> {
    const blobs: Blob[] = [];
    for (const entry of this.media.values()) {
      if (entry.kind === "image") {
        blobs.push(await exportImage(entry.image, entry.edits));
      } else {
        // Interim until the video export pipeline lands: pass the original through.
        blobs.push(entry.file);
      }
    }
    return blobs;
  }

  async done(): Promise<void> {
    const blobs = await this.exportAll();
    this.emitter.emit("done", { blobs });
    this.options.onDone?.(blobs);
  }

  destroy(): void {
    if (this.sm.state === "destroyed") return;
    this.unmountCurrentView();

    for (const entry of this.media.values()) {
      revokeThumbnailUrl(entry.thumbnailUrl);
      if (entry.kind === "video") {
        releaseVideo(entry.video);
        URL.revokeObjectURL(entry.videoUrl);
      }
    }
    this.media.clear();

    this.root.remove();
    this.sm.transition("destroyed");
    this.sm.destroy();
    this.emitter.removeAll();
  }

  // ── View lifecycle ────────────────────────

  private handleStateChange(to: AppState): void {
    this.unmountCurrentView();

    switch (to) {
      case "dropzone":
        this.mountDropZone();
        break;
      case "gallery":
        this.mountGallery();
        break;
      case "editor":
        this.mountEditor();
        break;
    }
  }

  private unmountCurrentView(): void {
    if (this.currentView) {
      this.currentView.destroy();
      this.currentView = null;
    }
  }

  private acceptAttribute(): string {
    return [...this.options.acceptedTypes, ...this.options.acceptedVideoTypes].join(",");
  }

  private mountDropZone(): void {
    const videoEnabled = this.options.acceptedVideoTypes.length > 0;
    const view = createDropZone({
      onFiles: (files) => this.addFiles(files),
      accept: this.acceptAttribute(),
      label: videoEnabled ? "Drop files here or " : "Drop images here or ",
      hint: videoEnabled ? "PNG, JPG, WebP, MP4, WebM" : "PNG, JPG, WebP",
    });
    this.root.appendChild(view.root);
    this.currentView = view;
  }

  async downloadImage(id: string): Promise<void> {
    const entry = this.media.get(id);
    if (!entry) return;

    let blob: Blob;
    let filename: string;
    if (entry.kind === "image") {
      blob = await exportImage(entry.image, entry.edits);
      filename = `${entry.file.name.replace(/\.[^.]+$/, "")}.png`;
    } else {
      // Interim until the video export pipeline lands: download the original.
      blob = entry.file;
      filename = entry.file.name;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private mountGallery(): void {
    const view = createGallery({
      images: this.getMedia(),
      accept: this.acceptAttribute(),
      onEdit: (id) => this.openEditor(id),
      onRemove: (id) => this.removeImage(id),
      onAddMore: (files) => this.addFiles(files),
      onDownload: (id) => this.downloadImage(id),
    });
    this.root.appendChild(view.root);
    this.currentView = view;
  }

  private mountEditor(): void {
    const entry = this.getEditingEntry();
    if (!entry) return;
    const view = createEditor({
      entry,
      onDone: () => this.closeEditor(true),
      onCancel: () => this.closeEditor(false),
    });
    document.body.appendChild(view.root);
    this.currentView = view;
  }
}
