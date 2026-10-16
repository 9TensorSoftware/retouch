import { ACCEPTED_TYPES, ACCEPTED_VIDEO_TYPES, DEFAULT_EDITS } from "./constants";
import { EventEmitter } from "./event-emitter";
import type { GifExportOptions } from "./export/gif-export";
import { exportVideo, extensionForBlob } from "./export/video-export";
import { StateMachine } from "./state-machine";
import { injectStyles } from "./styles";
import type {
  AppState,
  FileRejectionReason,
  GalleryViewMode,
  ImageEntry,
  MediaEntry,
  RetouchEventMap,
  RetouchOptions,
  ShellTheme,
  VideoEntry,
  ViewHandle,
} from "./types";
import { createDropZone } from "./ui/drop-zone";
import { createEditor } from "./ui/editor/editor";
import type { EditorToolPlugin } from "./ui/editor/tool-registry";
import { registerEditorTool } from "./ui/editor/tool-registry";
import type { ExportOverlayHandle } from "./ui/export-overlay";
import { createExportOverlay } from "./ui/export-overlay";
import { createGallery, loadGalleryView, saveGalleryView } from "./ui/gallery";
import { h } from "./ui/h";
import { isTouchFirst, shortcutLabel } from "./ui/platform";
import type { RejectionLimits, Toast, ToastHost } from "./ui/toast";
import { createToastHost, rejectionDetail, rejectionMessage, rejectionSummary } from "./ui/toast";
import { filesFromPaste, readClipboardFiles } from "./utils/clipboard";
import { framingIsNeutral, imageEditsAreNeutral } from "./utils/edits";
import { formatNames } from "./utils/formats";
import {
  createThumbnailUrl,
  exportImage,
  generateId,
  loadImage,
  processFiles,
  revokeThumbnailUrl,
} from "./utils/image";
import { captureFrame, frameFileName, isImageEntry, releaseVideo } from "./utils/video";

/** Image-only exports get the progress sheet once they've run this long (ms). */
const EXPORT_SHEET_DELAY = 400;

/** True when an event lands in something that takes text, such as a host page field. */
function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || !!target.closest("input, textarea, select, [contenteditable]"))
  );
}

const STATE_TRANSITIONS: Record<AppState, AppState[]> = {
  idle: ["dropzone"],
  dropzone: ["gallery", "destroyed"],
  gallery: ["editor", "dropzone", "destroyed"],
  editor: ["gallery", "destroyed"],
  destroyed: [],
};

export class Retouch {
  /**
   * Register a custom editor feature group (a tab + contextual pane) before
   * instantiating Retouch. See `EditorToolPlugin`.
   */
  static registerTool(plugin: EditorToolPlugin): void {
    registerEditorTool(plugin);
  }

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
    ai?: RetouchOptions["ai"];
    tools?: RetouchOptions["tools"];
    rail?: RetouchOptions["rail"];
    export?: RetouchOptions["export"];
    commitMode?: RetouchOptions["commitMode"];
  };

  private currentView: ViewHandle | null = null;
  private editingImageId: string | null = null;
  /** Images whose Done-commit bake is still rendering. */
  private readonly baking = new Map<string, Promise<void>>();
  private exportAbort: AbortController | null = null;
  private readonly toasts: ToastHost;
  /** The gallery's layout, kept across re-renders (and remembered in this browser). */
  private galleryView: GalleryViewMode = loadGalleryView() ?? "rows";
  /** Selected gallery items, kept here so a selection survives a re-render. */
  private readonly selection = new Set<string>();
  /** The last removal from the gallery, while its Undo is on offer. */
  private trash: { entry: MediaEntry; index: number }[] | null = null;
  private trashToast: Toast | null = null;

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
      acceptedVideoTypes: options.acceptedVideoTypes ?? ACCEPTED_VIDEO_TYPES,
      maxFileSize: options.maxFileSize ?? Number.POSITIVE_INFINITY,
      maxVideoDuration: options.maxVideoDuration ?? Number.POSITIVE_INFINITY,
      onDone: options.onDone,
      ai: options.ai,
      tools: options.tools,
      rail: options.rail,
      export: options.export,
      commitMode: options.commitMode,
    };

    injectStyles();

    this.root = h("div", { class: "rt-root", "data-rt-theme": options.theme ?? "light" });
    this.container.appendChild(this.root);

    // Feedback for rejected files, failed exports and undoable removals.
    this.toasts = createToastHost();
    // Paste adds files while the drop zone or gallery is up.
    document.addEventListener("paste", this.onPaste);

    this.sm = new StateMachine<AppState>("idle", STATE_TRANSITIONS);
    this.sm.onChange(({ to }) => {
      this.handleStateChange(to);
    });

    this.sm.transition("dropzone");
  }

  get state(): AppState {
    return this.sm.state;
  }

  /** Switch the drop zone and gallery between "light", "dark" and "auto" (follow the OS). */
  setTheme(theme: ShellTheme): void {
    this.root.dataset.rtTheme = theme;
  }

  on<K extends keyof RetouchEventMap>(
    event: K,
    fn: (data: RetouchEventMap[K]) => void,
  ): () => void {
    return this.emitter.on(event, fn);
  }

  async addFiles(files: File[]): Promise<void> {
    const remaining = this.options.maxFiles - this.media.size;
    const overflow = files
      .slice(Math.max(0, remaining))
      .map((file) => ({ file, reason: "count" as const }));
    for (const rejection of overflow) {
      this.emitter.emit("file:rejected", rejection);
    }
    if (remaining <= 0) {
      this.toastRejections(overflow);
      return;
    }

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
    this.toastRejections([...rejected, ...overflow]);
    if (entries.length === 0) return;

    for (const entry of entries) {
      this.media.set(entry.id, entry);
    }

    this.emitter.emit("images:add", { entries });

    if (this.sm.state === "dropzone") {
      this.sm.transition("gallery");
    } else if (this.sm.state === "gallery") {
      this.remountGallery();
    }
  }

  removeImage(id: string): void {
    const entry = this.media.get(id);
    if (!entry) return;
    this.releaseEntry(entry);
    this.media.delete(id);
    this.selection.delete(id);
    this.emitter.emit("images:remove", { id });

    if (this.media.size === 0 && this.sm.state === "gallery") {
      this.sm.transition("dropzone");
    }
  }

  /** Free what an entry holds: its thumbnail URL, and a video's element and URL. */
  private releaseEntry(entry: MediaEntry): void {
    revokeThumbnailUrl(entry.thumbnailUrl);
    if (entry.kind === "video") {
      releaseVideo(entry.video);
      URL.revokeObjectURL(entry.videoUrl);
    }
  }

  /**
   * Remove entries from the gallery with an Undo on offer: they leave
   * straight away (images:remove fires), and come back where they were if
   * Undo is pressed (images:add fires). Once the toast is gone, so are they.
   */
  private removeFromGallery(ids: string[]): void {
    // A new removal ends the last one's chance of coming back.
    this.trashToast?.dismiss();
    this.emptyTrash();
    const order = [...this.media.keys()];
    const removed = ids.flatMap((id) => {
      const entry = this.media.get(id);
      return entry ? [{ entry, index: order.indexOf(id) }] : [];
    });
    if (removed.length === 0) return;
    for (const { entry } of removed) {
      this.media.delete(entry.id);
      this.selection.delete(entry.id);
      this.emitter.emit("images:remove", { id: entry.id });
    }
    this.trash = removed;
    this.trashToast = this.toasts.show(
      removed.length === 1
        ? `Removed "${removed[0].entry.file.name}"`
        : `Removed ${removed.length} items`,
      "info",
      {
        action: { label: "Undo", onClick: () => this.undoRemove(removed) },
        onDismiss: () => {
          if (this.trash === removed) this.emptyTrash();
        },
      },
    );
    if (this.media.size === 0 && this.sm.state === "gallery") {
      this.sm.transition("dropzone");
    }
  }

  /** Put the last removal back, in its old places. */
  private undoRemove(removed: { entry: MediaEntry; index: number }[]): void {
    if (this.trash !== removed || this.sm.state === "destroyed") return;
    this.trash = null;
    if (this.media.size + removed.length > this.options.maxFiles) {
      this.toasts.show("There's no room to put them back", "error", {
        detail: rejectionDetail("count", this.limits()),
      });
      for (const { entry } of removed) this.releaseEntry(entry);
      return;
    }
    const entries = [...this.media.values()];
    for (const { entry, index } of [...removed].sort((a, b) => a.index - b.index)) {
      entries.splice(Math.min(index, entries.length), 0, entry);
    }
    this.media.clear();
    for (const entry of entries) this.media.set(entry.id, entry);
    this.emitter.emit("images:add", { entries: removed.map((r) => r.entry) });
    if (this.sm.state === "dropzone") {
      this.sm.transition("gallery");
    } else if (this.sm.state === "gallery") {
      this.remountGallery();
    }
  }

  /** Let go of the last removal for good. */
  private emptyTrash(): void {
    if (!this.trash) return;
    for (const { entry } of this.trash) this.releaseEntry(entry);
    this.trash = null;
  }

  /** The limits a rejected file is measured against, for its toast. */
  private limits(): RejectionLimits {
    return {
      types: [...this.options.acceptedTypes, ...this.options.acceptedVideoTypes],
      maxFileSize: this.options.maxFileSize,
      maxVideoDuration: this.options.maxVideoDuration,
      maxFiles: this.options.maxFiles,
    };
  }

  /** One toast per batch: the file and what would have worked, or a tally. */
  private toastRejections(rejected: { file: File; reason: FileRejectionReason }[]): void {
    if (rejected.length === 0 || this.sm.state === "destroyed") return;
    if (rejected.length === 1) {
      const [{ file, reason }] = rejected;
      this.toasts.show(rejectionMessage(file.name, reason), "error", {
        detail: rejectionDetail(reason, this.limits()),
      });
      return;
    }
    const { message, detail } = rejectionSummary(rejected.map((r) => r.reason));
    this.toasts.show(message, "error", { detail });
  }

  /** One toast for the files whose export failed (their originals went out instead). */
  private toastExportFailures(names: string[]): void {
    if (names.length === 0 || this.sm.state === "destroyed") return;
    this.toasts.show(
      names.length === 1
        ? `"${names[0]}" couldn't be exported`
        : `${names.length} files couldn't be exported`,
      "error",
      {
        detail:
          names.length === 1
            ? "The original file went out instead."
            : "Their original files went out instead.",
      },
    );
  }

  /** ⌘V / Ctrl+V: files on the clipboard join the gallery. */
  private readonly onPaste = (event: ClipboardEvent): void => {
    if (this.sm.state !== "dropzone" && this.sm.state !== "gallery") return;
    if (event.defaultPrevented || isEditable(event.target)) return;
    // Only when nothing else on the host page has focus, or when it's ours.
    const active = document.activeElement;
    if (active && active !== document.body && !this.root.contains(active)) return;
    const files = filesFromPaste(event);
    if (files.length === 0) return;
    event.preventDefault();
    void this.addFiles(files);
  };

  /** The Paste button: read the clipboard (the browser asks first). */
  private async pasteFromClipboard(): Promise<void> {
    let files: File[];
    try {
      files = await readClipboardFiles();
    } catch {
      this.toasts.show("Couldn't read the clipboard", "info", {
        detail: `Press ${shortcutLabel("V")} to paste instead.`,
      });
      return;
    }
    if (files.length === 0) {
      this.toasts.show("There's no photo on the clipboard", "info", {
        detail: "Copy one, then paste it here.",
      });
      return;
    }
    await this.addFiles(files);
  }

  /**
   * Committed images whose baked edits moved pixels (a crop, turn, warp…):
   * their pristine original no longer lines up with what's on screen, so
   * the editor compares them side by side rather than with the divider.
   */
  private readonly reframed = new WeakSet<ImageEntry>();

  /** Keep the pristine source around the first time pixels get replaced. */
  private stashOriginal(entry: ImageEntry): void {
    if (!entry.original) {
      entry.original = { file: entry.file, image: entry.image };
    }
  }

  /**
   * Render an image entry's edits into its pixels: the file and element are
   * replaced by the baked result, the edits reset to neutral, and the
   * pristine original stays on the entry for Reset. Visuals never change —
   * baked pixels with neutral edits render identically to original pixels
   * with the edits applied.
   */
  private async bakeEntry(entry: ImageEntry): Promise<void> {
    const edits = structuredClone(entry.edits);
    const type = entry.file.type === "image/jpeg" ? "jpeg" : "png";
    try {
      const blob = await exportImage(entry.image, edits, {
        format: type as "jpeg" | "png",
        quality: 0.95,
      });
      const file = new File([blob], entry.file.name, { type: `image/${type}` });
      const image = await loadImage(file);
      this.stashOriginal(entry);
      if (!framingIsNeutral(edits)) this.reframed.add(entry);
      entry.file = file;
      entry.image = image;
      entry.edits = structuredClone(DEFAULT_EDITS);
      await this.refreshThumbnail(entry);
      this.emitter.emit("image:commit", { id: entry.id });
      if (this.sm.state === "gallery") this.remountGallery();
    } catch (error) {
      // Baking failed — the entry simply stays non-destructive.
      console.error("[Retouch] Failed to commit edits into the image", error);
    }
  }

  /**
   * Restore the pristine original over a committed image: pixels, file, and
   * neutral edits, as if it was just added. Available once the entry's
   * pixels were replaced (Done-commit or a destructive ML tool).
   */
  async restoreOriginal(id: string): Promise<void> {
    const entry = this.media.get(id);
    if (!entry || entry.kind !== "image" || !entry.original) return;
    const pending = this.baking.get(id);
    if (pending) await pending;
    entry.file = entry.original.file;
    entry.image = entry.original.image;
    entry.original = undefined;
    this.reframed.delete(entry);
    entry.edits = structuredClone(DEFAULT_EDITS);
    entry.edited = false;
    revokeThumbnailUrl(entry.thumbnailUrl);
    entry.thumbnailUrl = createThumbnailUrl(entry.file);
    this.emitter.emit("image:restore", { id });
    if (this.sm.state === "editor" && this.editingImageId === id) {
      this.unmountCurrentView();
      this.mountEditor();
    } else if (this.sm.state === "gallery") {
      this.remountGallery();
    }
  }

  /**
   * Replace an image entry's pixels in place — the destructive counterpart
   * to the non-destructive edit model, used by tools like ML erase. Edits
   * are preserved; if the entry is open in the editor, the editor remounts
   * on the new source (undo history restarts).
   */
  async replaceImageSource(id: string, file: File): Promise<void> {
    const entry = this.media.get(id);
    if (!entry || entry.kind !== "image") {
      throw new Error("[Retouch] replaceImageSource needs an existing image entry");
    }
    const image = await loadImage(file);
    this.stashOriginal(entry);
    revokeThumbnailUrl(entry.thumbnailUrl);
    entry.file = file;
    entry.image = image;
    entry.thumbnailUrl = createThumbnailUrl(file);
    entry.edited = true;
    if (this.sm.state === "editor" && this.editingImageId === id) {
      this.unmountCurrentView();
      this.mountEditor();
    } else if (this.sm.state === "gallery") {
      this.remountGallery();
    }
  }

  openEditor(id: string): void {
    if (!this.media.has(id)) return;
    // A commit may still be baking — reopen once the pixels are final.
    const pending = this.baking.get(id);
    if (pending) {
      void pending.then(() => this.openEditor(id));
      return;
    }
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
      void this.refreshThumbnail(entry);
      this.emitter.emit("editor:done", { id, edits: entry.edits });
      if (
        entry.kind === "image" &&
        this.options.commitMode !== "keep-edits" &&
        !imageEditsAreNeutral(entry.edits)
      ) {
        const bake = this.bakeEntry(entry).finally(() => this.baking.delete(id));
        this.baking.set(id, bake);
      }
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
    this.exportAbort?.abort();
    const abort = new AbortController();
    this.exportAbort = abort;
    const blobs: Blob[] = [];
    const failed: string[] = [];
    const media = this.getMedia();

    // The export sheet: thumbnails with a ring each. Straight away when
    // there's video (it takes a while); for images, only once the run has
    // gone on long enough to wonder about.
    const overlay =
      media.length > 0
        ? createExportOverlay({
            items: media.map((entry) => ({
              id: entry.id,
              name: entry.file.name,
              thumbnail: entry.thumbnailUrl,
            })),
            onCancel: () => this.cancelExport(),
          })
        : null;
    let reveal: ReturnType<typeof setTimeout> | undefined;
    if (overlay && media.some((entry) => entry.kind === "video")) overlay.attach();
    else if (overlay) reveal = setTimeout(() => overlay.attach(), EXPORT_SHEET_DELAY);

    let finished = false;
    try {
      for (const entry of media) {
        if (abort.signal.aborted) throw new Error("[Retouch] Export canceled");
        if (!this.media.has(entry.id)) continue;
        this.emitter.emit("export:start", { id: entry.id, kind: entry.kind });
        overlay?.setActive(entry.id);
        try {
          const blob =
            entry.kind === "image"
              ? await exportImage(entry.image, entry.edits, this.options.export)
              : await this.exportVideoEntry(entry, abort.signal, overlay);
          overlay?.setComplete(entry.id);
          this.emitter.emit("export:progress", { id: entry.id, progress: 1 });
          this.emitter.emit("export:complete", { id: entry.id, blob });
          blobs.push(blob);
        } catch (err) {
          if (abort.signal.aborted) throw err;
          const error = err instanceof Error ? err : new Error(String(err));
          overlay?.setError(entry.id);
          failed.push(entry.file.name);
          this.emitter.emit("export:error", { id: entry.id, error });
          // Degrade gracefully: deliver the unedited original for this entry.
          blobs.push(entry.file);
        }
      }
      finished = true;
    } finally {
      clearTimeout(reveal);
      if (finished) overlay?.finish();
      else overlay?.destroy();
      if (this.exportAbort === abort) this.exportAbort = null;
      if (!abort.signal.aborted) this.toastExportFailures(failed);
    }
    return blobs;
  }

  /** Abort an in-flight exportAll()/done() run. */
  cancelExport(): void {
    this.exportAbort?.abort();
  }

  private exportVideoEntry(
    entry: VideoEntry,
    signal: AbortSignal,
    overlay?: ExportOverlayHandle | null,
  ): Promise<Blob> {
    return exportVideo(entry, {
      signal,
      onProgress: (progress) => {
        overlay?.setProgress(entry.id, progress);
        this.emitter.emit("export:progress", { id: entry.id, progress });
      },
    });
  }

  async done(): Promise<void> {
    let blobs: Blob[];
    try {
      blobs = await this.exportAll();
    } catch (err) {
      // A canceled export ends the run without firing done.
      if (this.exportAbort === null) return;
      throw err;
    }
    this.emitter.emit("done", { blobs });
    this.options.onDone?.(blobs);
  }

  destroy(): void {
    if (this.sm.state === "destroyed") return;
    this.cancelExport();
    this.unmountCurrentView();
    document.removeEventListener("paste", this.onPaste);

    this.emptyTrash();
    for (const entry of this.media.values()) this.releaseEntry(entry);
    this.media.clear();
    this.selection.clear();

    this.toasts.destroy();
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
    const what = this.options.acceptedVideoTypes.length > 0 ? "photos and videos" : "photos";
    const view = createDropZone({
      onFiles: (files) => this.addFiles(files),
      onPaste: () => void this.pasteFromClipboard(),
      accept: this.acceptAttribute(),
      // Phones can't drop; they add.
      title: `${isTouchFirst() ? "Add" : "Drop"} ${what}`,
      formats: formatNames([...this.options.acceptedTypes, ...this.options.acceptedVideoTypes]),
    });
    this.root.appendChild(view.root);
    this.currentView = view;
  }

  async downloadImage(id: string): Promise<void> {
    const entry = this.media.get(id);
    if (!entry) return;

    const stem = entry.file.name.replace(/\.[^.]+$/, "");
    let blob: Blob;
    let filename: string;
    try {
      if (entry.kind === "image") {
        blob = await exportImage(entry.image, entry.edits, this.options.export);
        const format = this.options.export?.format ?? "png";
        filename = `${stem}.${format === "jpeg" ? "jpg" : format}`;
      } else {
        blob = await this.exportVideoEntry(entry, new AbortController().signal);
        filename = `${stem}.${extensionForBlob(blob)}`;
      }
    } catch (err) {
      // Degrade gracefully, as exportAll does: the original goes out instead.
      const error = err instanceof Error ? err : new Error(String(err));
      this.emitter.emit("export:error", { id: entry.id, error });
      this.toastExportFailures([entry.file.name]);
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

  /**
   * Re-render an entry's gallery thumbnail so the card shows the edited
   * result (crop/filter/adjustments applied). Video uses the current frame.
   */
  /** Export the trimmed range of a video as an animated GIF. */
  async exportGif(id: string, options?: GifExportOptions): Promise<Blob> {
    const entry = this.media.get(id);
    if (!entry || entry.kind !== "video") {
      throw new Error("[Retouch] exportGif needs a video entry");
    }
    const { exportGif } = await import("./export/gif-export");
    return exportGif(entry, options);
  }

  private async exportGifAndDownload(id: string, options?: GifExportOptions): Promise<void> {
    const entry = this.media.get(id);
    if (!entry) return;
    const blob = await this.exportGif(id, options);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entry.file.name.replace(/\.[^.]+$/, "")}.gif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** Use the video's current frame (with edits) as its gallery poster. */
  private async setPosterFrame(entry: MediaEntry): Promise<void> {
    if (entry.kind !== "video") return;
    try {
      const blob = await exportImage(captureFrame(entry.video), entry.edits, {
        format: "jpeg",
        quality: 0.85,
        maxDimension: 512,
      });
      revokeThumbnailUrl(entry.thumbnailUrl);
      entry.thumbnailUrl = URL.createObjectURL(blob);
      entry.posterPicked = true;
    } catch {
      // keep the existing poster
    }
  }

  private async refreshThumbnail(entry: MediaEntry): Promise<void> {
    if (entry.kind === "video" && entry.posterPicked) return;
    try {
      const source = entry.kind === "video" ? captureFrame(entry.video) : entry.image;
      const blob = await exportImage(source, entry.edits, {
        format: "jpeg",
        quality: 0.85,
        maxDimension: 512,
      });
      revokeThumbnailUrl(entry.thumbnailUrl);
      entry.thumbnailUrl = URL.createObjectURL(blob);
      if (this.sm.state === "gallery") this.remountGallery();
    } catch {
      // Keep the original thumbnail if the preview render fails.
    }
  }

  private mountGallery(): void {
    const view = createGallery({
      images: this.getMedia(),
      accept: this.acceptAttribute(),
      onEdit: (id) => this.openEditor(id),
      onRemove: (ids) => this.removeFromGallery(ids),
      onAddMore: (files) => this.addFiles(files),
      onDownload: (id) => this.downloadImage(id),
      onDone: this.options.onDone ? () => this.done() : undefined,
      view: this.galleryView,
      onViewChange: (mode) => {
        this.galleryView = mode;
        saveGalleryView(mode);
      },
      selection: this.selection,
    });
    this.root.appendChild(view.root);
    this.currentView = view;
  }

  /** Re-render the gallery in place, keeping its scroll position. */
  private remountGallery(): void {
    const top = this.currentView?.root.scrollTop ?? 0;
    this.unmountCurrentView();
    this.mountGallery();
    if (this.currentView && top > 0) this.currentView.root.scrollTop = top;
  }

  private mountEditor(): void {
    const entry = this.getEditingEntry();
    if (!entry) return;
    const view = createEditor({
      entry,
      onDone: () => this.closeEditor(true),
      onCancel: () => this.closeEditor(false),
      hasOriginal: () => entry.kind === "image" && !!entry.original,
      originalAligned: () =>
        entry.kind === "image" && !!entry.original && !this.reframed.has(entry),
      onRestoreOriginal: () => void this.restoreOriginal(entry.id),
      onCaptureFrame:
        entry.kind === "video"
          ? (canvas, time) => void this.addCapturedFrame(entry, canvas, time)
          : undefined,
      onExportGif:
        entry.kind === "video"
          ? (loop) => this.exportGifAndDownload(entry.id, { loop })
          : undefined,
      onSetPoster: entry.kind === "video" ? () => this.setPosterFrame(entry) : undefined,
      ai: this.options.ai,
      tools: this.options.tools,
      rail: this.options.rail,
      onAiEvent: (event) => {
        if (event.type === "start") {
          this.emitter.emit("ai:start", { id: entry.id, prompt: event.prompt });
        } else if (event.type === "applied") {
          this.emitter.emit("ai:applied", {
            id: entry.id,
            ops: event.ops,
            explanation: event.explanation,
          });
        } else {
          this.emitter.emit("ai:error", { id: entry.id, error: event.error });
        }
      },
    });
    document.body.appendChild(view.root);
    this.currentView = view;
  }

  /** Turn a captured video frame into a new image entry carrying the video's visual edits. */
  private async addCapturedFrame(
    source: VideoEntry,
    canvas: HTMLCanvasElement,
    time: number,
  ): Promise<void> {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;
    const file = new File([blob], frameFileName(source.file.name, time), { type: "image/png" });

    if (this.media.size >= this.options.maxFiles) {
      this.emitter.emit("file:rejected", { file, reason: "count" });
      this.toastRejections([{ file, reason: "count" }]);
      return;
    }

    const image = await loadImage(file);
    const {
      crop,
      rotation,
      keystoneV,
      keystoneH,
      lensDistortion,
      lensDevignette,
      seamWidth,
      liquify,
      orientation,
      flipH,
      flipV,
      adjustments,
      curves,
      hsl,
      masks,
      stylize,
      filter,
      filterStrength,
    } = structuredClone(source.edits);
    const entry: ImageEntry = {
      kind: "image",
      id: generateId(),
      file,
      image,
      thumbnailUrl: createThumbnailUrl(file),
      edits: {
        crop,
        rotation,
        keystoneV,
        keystoneH,
        lensDistortion,
        lensDevignette,
        seamWidth,
        liquify: structuredClone(liquify),
        orientation,
        flipH,
        flipV,
        adjustments,
        curves,
        hsl,
        masks,
        stylize,
        filter,
        filterStrength,
      },
      edited: false,
    };
    this.media.set(entry.id, entry);
    this.emitter.emit("images:add", { entries: [entry] });
    this.emitter.emit("frame:capture", { sourceId: source.id, entry });
  }
}
