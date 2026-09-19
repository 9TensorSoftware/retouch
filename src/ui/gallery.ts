import type { GalleryViewMode, MediaEntry, ViewHandle } from "../types";
import { formatDuration } from "../utils/video";
import { h } from "./h";
import {
  ICON_DOWNLOAD,
  ICON_EDIT,
  ICON_PLAY_BADGE,
  ICON_REMOVE,
  ICON_UPLOAD,
  ICON_VIEW_COLS_2,
  ICON_VIEW_COLS_3,
  ICON_VIEW_COLS_4,
  ICON_VIEW_HEIGHT_FIT,
  ICON_VIEW_LIST,
  ICON_VIEW_WIDTH_FIT,
  iconElement,
} from "./icons";

export interface GalleryOptions {
  images: MediaEntry[];
  /** Comma-joined MIME list for the add-more file input. */
  accept: string;
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onAddMore: (files: File[]) => void;
  onDownload: (id: string) => void;
  /** Finish the session — export everything. Omit to hide the Done button. */
  onDone?: () => Promise<void> | void;
}

const VIEW_ICONS: { mode: GalleryViewMode; svg: string; title: string }[] = [
  { mode: "cols-2", title: "2 Columns", svg: ICON_VIEW_COLS_2 },
  { mode: "cols-3", title: "3 Columns", svg: ICON_VIEW_COLS_3 },
  { mode: "cols-4", title: "4 Columns", svg: ICON_VIEW_COLS_4 },
  { mode: "width-fit", title: "Width Fit", svg: ICON_VIEW_WIDTH_FIT },
  { mode: "height-fit", title: "Height Fit", svg: ICON_VIEW_HEIGHT_FIT },
  { mode: "list", title: "List", svg: ICON_VIEW_LIST },
];

export function createGallery(options: GalleryOptions): ViewHandle {
  const rootAbort = new AbortController();
  const rootSignal = rootAbort.signal;
  let contentAbort: AbortController | null = null;

  let currentMode: GalleryViewMode = "cols-3";

  // Shared hidden file input
  const input = h("input", {
    type: "file",
    accept: options.accept,
    multiple: true,
    style: "display:none",
  }) as HTMLInputElement;

  input.addEventListener(
    "change",
    () => {
      if (input.files && input.files.length > 0) {
        options.onAddMore(Array.from(input.files));
        input.value = "";
      }
    },
    { signal: rootSignal },
  );

  // View mode icon buttons
  const iconBtns: { mode: GalleryViewMode; el: HTMLElement }[] = [];
  for (const def of VIEW_ICONS) {
    const btn = h("button", {
      class: `rt-gallery__view-btn${def.mode === currentMode ? " rt-gallery__view-btn--active" : ""}`,
      title: def.title,
    });
    btn.innerHTML = def.svg;
    btn.addEventListener(
      "click",
      () => {
        if (currentMode === def.mode) return;
        currentMode = def.mode;
        for (const b of iconBtns) {
          b.el.classList.toggle("rt-gallery__view-btn--active", b.mode === currentMode);
        }
        renderContent();
      },
      { signal: rootSignal },
    );
    iconBtns.push({ mode: def.mode, el: btn });
  }

  // Compact echo of the initial drop zone: click to browse or drag files on.
  const addZone = h(
    "div",
    { class: "rt-gallery__add-zone", role: "button", tabindex: 0, title: "Add more files" },
    iconElement(ICON_UPLOAD),
    h("span", null, "Drop files or ", h("strong", null, "browse")),
  );
  addZone.addEventListener("click", () => input.click(), { signal: rootSignal });
  addZone.addEventListener(
    "keydown",
    (e) => {
      if ((e as KeyboardEvent).key === "Enter" || (e as KeyboardEvent).key === " ") {
        e.preventDefault();
        input.click();
      }
    },
    { signal: rootSignal },
  );
  let zoneDrag = 0;
  addZone.addEventListener(
    "dragenter",
    (e) => {
      e.preventDefault();
      zoneDrag++;
      addZone.classList.add("rt-gallery__add-zone--active");
    },
    { signal: rootSignal },
  );
  addZone.addEventListener("dragover", (e) => e.preventDefault(), { signal: rootSignal });
  addZone.addEventListener(
    "dragleave",
    (e) => {
      e.preventDefault();
      zoneDrag = Math.max(0, zoneDrag - 1);
      if (zoneDrag === 0) addZone.classList.remove("rt-gallery__add-zone--active");
    },
    { signal: rootSignal },
  );
  addZone.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      zoneDrag = 0;
      addZone.classList.remove("rt-gallery__add-zone--active");
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        options.onAddMore(Array.from(e.dataTransfer.files));
      }
    },
    { signal: rootSignal },
  );

  const toolbar = h(
    "div",
    { class: "rt-gallery__toolbar" },
    h("div", { class: "rt-gallery__views" }, ...iconBtns.map((b) => b.el)),
    h("div", { style: "flex:1" }), // spacer
    addZone,
  );

  // Done is the host's exit: it only exists when there is somewhere to go.
  if (options.onDone) {
    const onDone = options.onDone;
    const doneBtn = h("button", { type: "button", class: "rt-gallery__done" }, "Done");
    doneBtn.addEventListener(
      "click",
      async () => {
        // One export run at a time — the button waits it out.
        doneBtn.disabled = true;
        try {
          await onDone();
        } catch (error) {
          console.error("[Retouch] Done failed", error);
        } finally {
          doneBtn.disabled = false;
        }
      },
      { signal: rootSignal },
    );
    toolbar.appendChild(doneBtn);
  }

  const content = h("div", { class: "rt-gallery__content" });

  // The whole gallery stays a drop target even without a dashed tile.
  let dragCount = 0;
  content.addEventListener(
    "dragenter",
    (e) => {
      e.preventDefault();
      dragCount++;
      content.classList.add("rt-gallery__content--dropping");
    },
    { signal: rootSignal },
  );
  content.addEventListener("dragover", (e) => e.preventDefault(), { signal: rootSignal });
  content.addEventListener(
    "dragleave",
    (e) => {
      e.preventDefault();
      dragCount = Math.max(0, dragCount - 1);
      if (dragCount === 0) content.classList.remove("rt-gallery__content--dropping");
    },
    { signal: rootSignal },
  );
  content.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      dragCount = 0;
      content.classList.remove("rt-gallery__content--dropping");
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        options.onAddMore(Array.from(e.dataTransfer.files));
      }
    },
    { signal: rootSignal },
  );

  function renderContent(): void {
    contentAbort?.abort();
    contentAbort = new AbortController();
    const signal = contentAbort.signal;
    content.innerHTML = "";

    switch (currentMode) {
      case "cols-2":
        renderColumnsView(content, options, signal, 2);
        break;
      case "cols-3":
        renderColumnsView(content, options, signal, 3);
        break;
      case "cols-4":
        renderColumnsView(content, options, signal, 4);
        break;
      case "width-fit":
        renderWidthFitView(content, options, signal);
        break;
      case "height-fit":
        renderHeightFitView(content, options, signal);
        break;
      case "list":
        renderListView(content, options, signal);
        break;
    }
  }

  const root = h("div", { class: "rt-gallery" }, toolbar, content, input);
  renderContent();

  return {
    root,
    destroy() {
      contentAbort?.abort();
      rootAbort.abort();
      root.remove();
    },
  };
}

// ── Columns View (2, 3, 4 columns) ────────────

function renderColumnsView(
  container: HTMLElement,
  options: GalleryOptions,
  signal: AbortSignal,
  columns: number,
): void {
  const grid = h("div", {
    class: `rt-gallery__cols rt-gallery__cols--${columns}`,
  });

  for (const entry of options.images) {
    grid.appendChild(createFlowCard(entry, options, signal));
  }

  container.appendChild(grid);
}

// ── Width-Fit View (single column, full width) ─

function renderWidthFitView(
  container: HTMLElement,
  options: GalleryOptions,
  signal: AbortSignal,
): void {
  const stack = h("div", { class: "rt-gallery__width-fit" });

  for (const entry of options.images) {
    stack.appendChild(createFlowCard(entry, options, signal));
  }

  container.appendChild(stack);
}

// ── Height-Fit View (horizontal filmstrip) ─────

function renderHeightFitView(
  container: HTMLElement,
  options: GalleryOptions,
  signal: AbortSignal,
): void {
  const strip = h("div", { class: "rt-gallery__height-fit" });

  for (const entry of options.images) {
    const item = h("div", { class: "rt-gallery__height-fit-item" });
    const img = h("img", { src: entry.thumbnailUrl, alt: entry.file.name });
    const status = createStatusDot(entry);
    const removeBtn = createRemoveButton(entry, item, options, signal);
    const overlay = createOverlay(entry, options, signal);

    item.append(img, status, removeBtn, overlay);
    appendVideoBadges(item, entry);
    strip.appendChild(item);
  }

  container.appendChild(strip);
}

// ── List View ─────────────────────────────────

function renderListView(
  container: HTMLElement,
  options: GalleryOptions,
  signal: AbortSignal,
): void {
  const list = h("div", { class: "rt-gallery__names" });

  for (const entry of options.images) {
    list.appendChild(createNameRow(entry, options, signal));
  }

  container.appendChild(list);
}

// ── Shared Helpers ────────────────────────────

function createFlowCard(
  entry: MediaEntry,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const item = h("div", { class: "rt-gallery__flow-item", "data-id": entry.id });
  const img = h("img", { src: entry.thumbnailUrl, alt: entry.file.name });
  const status = createStatusDot(entry);
  const removeBtn = createRemoveButton(entry, item, options, signal);
  const overlay = createOverlay(entry, options, signal);

  item.append(img, status, removeBtn, overlay);
  appendVideoBadges(item, entry);
  return item;
}

/** Duration pill + play glyph on video cards. */
function appendVideoBadges(item: HTMLElement, entry: MediaEntry): void {
  if (entry.kind !== "video") return;
  item.appendChild(
    h("span", { class: "rt-gallery__item-duration" }, formatDuration(entry.duration)),
  );
  const play = h("div", { class: "rt-gallery__item-play" });
  play.innerHTML = ICON_PLAY_BADGE;
  item.appendChild(play);
}

function createOverlay(
  entry: MediaEntry,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const downloadBtn = h("button", {
    class: "rt-gallery__item-download",
    "aria-label": "Download",
    title: "Download",
  });
  downloadBtn.innerHTML = ICON_DOWNLOAD;
  downloadBtn.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      options.onDownload(entry.id);
    },
    { signal },
  );

  const editBtn = h("button", { class: "rt-gallery__item-edit" });
  editBtn.innerHTML = `${ICON_EDIT} Edit`;
  editBtn.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      options.onEdit(entry.id);
    },
    { signal },
  );

  const actions = h("div", { class: "rt-gallery__item-actions" }, downloadBtn, editBtn);

  return h(
    "div",
    { class: "rt-gallery__item-overlay" },
    h(
      "div",
      { class: "rt-gallery__item-info" },
      h("span", { class: "rt-gallery__item-name" }, entry.file.name),
      actions,
    ),
  );
}

function createStatusDot(entry: MediaEntry): HTMLElement {
  const cls = entry.edited ? "rt-gallery__item-status--edited" : "rt-gallery__item-status--pending";
  return h("div", { class: `rt-gallery__item-status ${cls}` });
}

function createRemoveButton(
  entry: MediaEntry,
  parentEl: HTMLElement,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const btn = h("button", {
    class: "rt-gallery__item-remove",
    "aria-label": "Remove",
    title: "Remove",
  });
  btn.innerHTML = ICON_REMOVE;
  btn.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      parentEl.remove();
      const idx = options.images.findIndex((img) => img.id === entry.id);
      if (idx !== -1) options.images.splice(idx, 1);
      options.onRemove(entry.id);
    },
    { signal },
  );
  return btn;
}

function createNameRow(
  entry: MediaEntry,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const thumb = h("img", {
    class: "rt-gallery__names-thumb",
    src: entry.thumbnailUrl,
    alt: entry.file.name,
  });

  const statusCls = entry.edited
    ? "rt-gallery__item-status--edited"
    : "rt-gallery__item-status--pending";
  const status = h("div", { class: `rt-gallery__item-status ${statusCls}` });

  const downloadBtn = h("button", {
    class: "rt-gallery__names-btn",
    "aria-label": "Download",
    title: "Download",
  });
  downloadBtn.innerHTML = ICON_DOWNLOAD;
  downloadBtn.addEventListener("click", () => options.onDownload(entry.id), { signal });

  const editBtn = h("button", {
    class: "rt-gallery__names-btn",
    "aria-label": "Edit",
    title: "Edit",
  });
  editBtn.innerHTML = ICON_EDIT;
  editBtn.addEventListener("click", () => options.onEdit(entry.id), { signal });

  const removeBtn = h("button", {
    class: "rt-gallery__names-btn",
    "aria-label": "Remove",
    title: "Remove",
  });
  removeBtn.innerHTML = ICON_REMOVE;

  const sizeText =
    entry.kind === "video"
      ? `${formatFileSize(entry.file.size)} · ${formatDuration(entry.duration)}`
      : formatFileSize(entry.file.size);

  const actions = h("div", { class: "rt-gallery__names-actions" }, downloadBtn, editBtn, removeBtn);

  const row = h(
    "div",
    { class: "rt-gallery__names-item", "data-id": entry.id },
    thumb,
    h(
      "div",
      { class: "rt-gallery__names-details" },
      h("span", { class: "rt-gallery__names-filename" }, entry.file.name),
      h("span", { class: "rt-gallery__names-size" }, sizeText),
    ),
    h("div", { class: "rt-gallery__names-status" }, status),
    actions,
  );

  removeBtn.addEventListener(
    "click",
    () => {
      row.remove();
      const idx = options.images.findIndex((img) => img.id === entry.id);
      if (idx !== -1) options.images.splice(idx, 1);
      options.onRemove(entry.id);
    },
    { signal },
  );

  return row;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
