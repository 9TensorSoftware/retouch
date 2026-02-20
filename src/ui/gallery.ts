import type { GalleryViewMode, ImageEntry, ViewHandle } from "../types";
import { h } from "./h";

export interface GalleryOptions {
  images: ImageEntry[];
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onAddMore: (files: File[]) => void;
  onDownload: (id: string) => void;
}

// SVG path data for view mode icons
const VIEW_ICONS: { mode: GalleryViewMode; svg: string; title: string }[] = [
  {
    mode: "grid",
    title: "Grid",
    svg: '<rect x="1" y="1" width="4.5" height="4.5" rx="0.5"/><rect x="7.5" y="1" width="4.5" height="4.5" rx="0.5"/><rect x="1" y="7.5" width="4.5" height="4.5" rx="0.5"/><rect x="7.5" y="7.5" width="4.5" height="4.5" rx="0.5"/>',
  },
  {
    mode: "masonry",
    title: "Masonry",
    svg: '<rect x="1" y="1" width="4.5" height="6" rx="0.5"/><rect x="7.5" y="1" width="4.5" height="3.5" rx="0.5"/><rect x="1" y="8.5" width="4.5" height="3.5" rx="0.5"/><rect x="7.5" y="6" width="4.5" height="6" rx="0.5"/>',
  },
  {
    mode: "list",
    title: "List",
    svg: '<rect x="1" y="2" width="12" height="2" rx="0.5"/><rect x="1" y="6" width="12" height="2" rx="0.5"/><rect x="1" y="10" width="12" height="2" rx="0.5"/>',
  },
];

export function createGallery(options: GalleryOptions): ViewHandle {
  const rootAbort = new AbortController();
  const rootSignal = rootAbort.signal;
  let contentAbort: AbortController | null = null;

  let currentMode: GalleryViewMode = "grid";

  // Shared hidden file input
  const input = h("input", {
    type: "file",
    accept: "image/*",
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
    btn.innerHTML = `<svg viewBox="0 0 14 14" fill="currentColor">${def.svg}</svg>`;
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

  const toolbar = h(
    "div",
    { class: "rt-gallery__toolbar" },
    h("div", { style: "flex:1" }), // spacer
    h("div", { class: "rt-gallery__views" }, ...iconBtns.map((b) => b.el)),
  );

  const content = h("div", { class: "rt-gallery__content" });

  function renderContent(): void {
    contentAbort?.abort();
    contentAbort = new AbortController();
    const signal = contentAbort.signal;
    content.innerHTML = "";

    switch (currentMode) {
      case "grid":
        renderGridView(content, options, input, signal);
        break;
      case "masonry":
        renderMasonryView(content, options, input, signal);
        break;
      case "list":
        renderListView(content, options, input, signal);
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

// ── Grid View ─────────────────────────────────

function renderGridView(
  container: HTMLElement,
  options: GalleryOptions,
  input: HTMLInputElement,
  signal: AbortSignal,
): void {
  const grid = h("div", { class: "rt-gallery__grid" });

  for (const entry of options.images) {
    grid.appendChild(createItemCard(entry, options, signal));
  }

  grid.appendChild(createAddCell(input, options, signal));
  container.appendChild(grid);
}

// ── Masonry View ──────────────────────────────

function renderMasonryView(
  container: HTMLElement,
  options: GalleryOptions,
  input: HTMLInputElement,
  signal: AbortSignal,
): void {
  const masonry = h("div", { class: "rt-gallery__masonry" });

  for (const entry of options.images) {
    const item = h("div", { class: "rt-gallery__masonry-item" });
    const img = h("img", { src: entry.thumbnailUrl, alt: entry.file.name });
    const status = createStatusDot(entry);
    const removeBtn = createRemoveButton(entry, item, options, signal);
    const overlay = createOverlay(entry, options, signal);

    item.append(img, status, removeBtn, overlay);
    masonry.appendChild(item);
  }

  container.appendChild(masonry);
  container.appendChild(createAddCell(input, options, signal));
}

// ── List View ─────────────────────────────────

function renderListView(
  container: HTMLElement,
  options: GalleryOptions,
  input: HTMLInputElement,
  signal: AbortSignal,
): void {
  const list = h("div", { class: "rt-gallery__names" });

  for (const entry of options.images) {
    list.appendChild(createNameRow(entry, options, signal));
  }

  const addRow = h("button", { class: "rt-gallery__names-add" });
  addRow.appendChild(createPlusIcon());
  addRow.appendChild(h("span", null, "Add more images"));
  addRow.addEventListener("click", () => input.click(), { signal });

  list.appendChild(addRow);
  container.appendChild(list);
}

// ── Shared Helpers ────────────────────────────

function createItemCard(
  entry: ImageEntry,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const img = h("img", { src: entry.thumbnailUrl, alt: entry.file.name });
  const status = createStatusDot(entry);

  const item = h("div", { class: "rt-gallery__item", "data-id": entry.id });
  const removeBtn = createRemoveButton(entry, item, options, signal);
  const overlay = createOverlay(entry, options, signal);

  item.append(img, status, removeBtn, overlay);
  return item;
}

function createOverlay(
  entry: ImageEntry,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const downloadBtn = h("button", { class: "rt-gallery__item-download" });
  downloadBtn.innerHTML =
    '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 2v8M4 8l3 3 3-3"/><path d="M2 12h10"/></svg>';
  downloadBtn.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      options.onDownload(entry.id);
    },
    { signal },
  );

  const editBtn = h("button", { class: "rt-gallery__item-edit" });
  editBtn.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 1.5a1.414 1.414 0 012 2L4 10l-2.5.5L2 8l6.5-6.5z"/></svg> Edit';
  editBtn.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      options.onEdit(entry.id);
    },
    { signal },
  );

  return h(
    "div",
    { class: "rt-gallery__item-overlay" },
    h(
      "div",
      { class: "rt-gallery__item-info" },
      h("span", { class: "rt-gallery__item-name" }, entry.file.name),
      h("div", { class: "rt-gallery__item-actions" }, downloadBtn, editBtn),
    ),
  );
}

function createStatusDot(entry: ImageEntry): HTMLElement {
  const cls = entry.edited ? "rt-gallery__item-status--edited" : "rt-gallery__item-status--pending";
  return h("div", { class: `rt-gallery__item-status ${cls}` });
}

function createRemoveButton(
  entry: ImageEntry,
  parentEl: HTMLElement,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const btn = h("button", { class: "rt-gallery__item-remove" });
  btn.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l8 8M10 2l-8 8"/></svg>';
  btn.addEventListener(
    "click",
    (e) => {
      e.stopPropagation();
      parentEl.remove();
      options.onRemove(entry.id);
    },
    { signal },
  );
  return btn;
}

function createAddCell(
  input: HTMLInputElement,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const cell = h(
    "div",
    { class: "rt-gallery__add-cell" },
    h(
      "div",
      { class: "rt-gallery__add-cell-inner" },
      createUploadIcon(),
      h("span", null, "Drop images here or browse"),
    ),
  );

  cell.addEventListener("click", () => input.click(), { signal });

  let dragCounter = 0;

  cell.addEventListener(
    "dragenter",
    (e) => {
      e.preventDefault();
      dragCounter++;
      cell.classList.add("rt-gallery__add-cell--active");
    },
    { signal },
  );

  cell.addEventListener("dragover", (e) => e.preventDefault(), { signal });

  cell.addEventListener(
    "dragleave",
    (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        cell.classList.remove("rt-gallery__add-cell--active");
      }
    },
    { signal },
  );

  cell.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      dragCounter = 0;
      cell.classList.remove("rt-gallery__add-cell--active");
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        options.onAddMore(Array.from(e.dataTransfer.files));
      }
    },
    { signal },
  );

  return cell;
}

function createNameRow(
  entry: ImageEntry,
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

  const downloadBtn = h("button", null);
  downloadBtn.innerHTML =
    '<svg viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 2v8M4 8l3 3 3-3"/><path d="M2 12h10"/></svg>';
  downloadBtn.addEventListener("click", () => options.onDownload(entry.id), { signal });

  const editBtn = h("button", null);
  editBtn.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 1.5a1.414 1.414 0 012 2L4 10l-2.5.5L2 8l6.5-6.5z"/></svg>';
  editBtn.addEventListener("click", () => options.onEdit(entry.id), { signal });

  const removeBtn = h("button", null);
  removeBtn.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

  const row = h(
    "div",
    { class: "rt-gallery__names-item", "data-id": entry.id },
    thumb,
    h(
      "div",
      { class: "rt-gallery__names-details" },
      h("span", { class: "rt-gallery__names-filename" }, entry.file.name),
      h("span", { class: "rt-gallery__names-size" }, formatFileSize(entry.file.size)),
    ),
    h("div", { class: "rt-gallery__names-status" }, status),
    h("div", { class: "rt-gallery__names-actions" }, downloadBtn, editBtn, removeBtn),
  );

  removeBtn.addEventListener(
    "click",
    () => {
      row.remove();
      options.onRemove(entry.id);
    },
    { signal },
  );

  return row;
}

function createPlusIcon(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", "M8 3v10M3 8h10");
  svg.appendChild(p);
  return svg;
}

function createUploadIcon(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p1.setAttribute("d", "M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242");
  const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p2.setAttribute("d", "M12 12v9m0-9l-3 3m3-3 3 3");
  svg.append(p1, p2);
  return svg;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
