import { ACCEPTED_TYPES } from "./constants";
import { EventEmitter } from "./event-emitter";
import { StateMachine } from "./state-machine";
import { injectStyles } from "./styles";
import type { AppState, ImageEntry, RetouchEventMap, RetouchOptions, ViewHandle } from "./types";
import { h } from "./ui/h";
import { exportImage, processFiles, revokeThumbnailUrl } from "./utils/image";

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
  private readonly images = new Map<string, ImageEntry>();
  private readonly sm: StateMachine<AppState>;
  private readonly emitter = new EventEmitter<RetouchEventMap>();
  private readonly options: Required<
    Pick<RetouchOptions, "maxFiles" | "acceptedTypes">
  > & { onDone?: RetouchOptions["onDone"] };

  private currentView: ViewHandle | null = null;
  private editingImageId: string | null = null;

  constructor(options: RetouchOptions) {
    // Resolve target
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
      onDone: options.onDone,
    };

    // Inject global styles
    injectStyles();

    // Create root element
    this.root = h("div", { class: "rt-root" });
    this.container.appendChild(this.root);

    // State machine
    this.sm = new StateMachine<AppState>("idle", STATE_TRANSITIONS);
    this.sm.onChange(({ from, to }) => {
      this.emitter.emit("state:change", { from, to });
      this.handleStateChange(to);
    });

    // Kick off
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
    const remaining = this.options.maxFiles - this.images.size;
    if (remaining <= 0) return;

    const sliced = files.slice(0, remaining);
    const entries = await processFiles(sliced, this.options.acceptedTypes);
    if (entries.length === 0) return;

    for (const entry of entries) {
      this.images.set(entry.id, entry);
    }

    this.emitter.emit("images:add", { entries });

    if (this.sm.state === "dropzone") {
      this.sm.transition("gallery");
    }
  }

  removeImage(id: string): void {
    const entry = this.images.get(id);
    if (!entry) return;
    revokeThumbnailUrl(entry.thumbnailUrl);
    this.images.delete(id);
    this.emitter.emit("images:remove", { id });

    if (this.images.size === 0 && this.sm.state === "gallery") {
      this.sm.transition("dropzone");
    }
  }

  openEditor(id: string): void {
    if (!this.images.has(id)) return;
    this.editingImageId = id;
    this.emitter.emit("editor:open", { id });
    this.sm.transition("editor");
  }

  closeEditor(commit: boolean): void {
    if (this.sm.state !== "editor" || !this.editingImageId) return;
    const id = this.editingImageId;
    const entry = this.images.get(id);

    if (commit && entry) {
      entry.edited = true;
      this.emitter.emit("editor:done", { id, edits: entry.edits });
    } else {
      this.emitter.emit("editor:cancel", { id });
    }

    this.editingImageId = null;
    this.sm.transition("gallery");
  }

  getEditingEntry(): ImageEntry | null {
    if (!this.editingImageId) return null;
    return this.images.get(this.editingImageId) ?? null;
  }

  getImages(): ImageEntry[] {
    return Array.from(this.images.values());
  }

  async exportAll(): Promise<Blob[]> {
    const blobs: Blob[] = [];
    for (const entry of this.images.values()) {
      const blob = await exportImage(entry.image, entry.edits);
      blobs.push(blob);
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

    for (const entry of this.images.values()) {
      revokeThumbnailUrl(entry.thumbnailUrl);
    }
    this.images.clear();

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

  // These will be replaced by actual view implementations in later phases.
  // For now they create minimal placeholder elements.

  private mountDropZone(): void {
    const { createDropZone } = require("./ui/drop-zone") as typeof import("./ui/drop-zone");
    const view = createDropZone({
      onFiles: (files) => this.addFiles(files),
    });
    this.root.appendChild(view.root);
    this.currentView = view;
  }

  private mountGallery(): void {
    const { createGallery } = require("./ui/gallery") as typeof import("./ui/gallery");
    const view = createGallery({
      images: this.getImages(),
      onEdit: (id) => this.openEditor(id),
      onRemove: (id) => this.removeImage(id),
      onAddMore: (files) => this.addFiles(files),
      onDone: () => this.done(),
    });
    this.root.appendChild(view.root);
    this.currentView = view;
  }

  private mountEditor(): void {
    const entry = this.getEditingEntry();
    if (!entry) return;
    const { createEditor } = require("./ui/editor/editor") as typeof import("./ui/editor/editor");
    const view = createEditor({
      entry,
      onDone: () => this.closeEditor(true),
      onCancel: () => this.closeEditor(false),
    });
    this.root.appendChild(view.root);
    this.currentView = view;
  }
}
