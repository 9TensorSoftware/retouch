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
    mode: "cols-2",
    title: "2 Columns",
    svg: '<rect x="1" y="1" width="5" height="12" rx="0.5"/><rect x="8" y="1" width="5" height="12" rx="0.5"/>',
  },
  {
    mode: "cols-3",
    title: "3 Columns",
    svg: '<rect x="0.5" y="1" width="3.5" height="12" rx="0.5"/><rect x="5.25" y="1" width="3.5" height="12" rx="0.5"/><rect x="10" y="1" width="3.5" height="12" rx="0.5"/>',
  },
  {
    mode: "cols-4",
    title: "4 Columns",
    svg: '<rect x="0.5" y="1" width="2.5" height="12" rx="0.5"/><rect x="4" y="1" width="2.5" height="12" rx="0.5"/><rect x="7.5" y="1" width="2.5" height="12" rx="0.5"/><rect x="11" y="1" width="2.5" height="12" rx="0.5"/>',
  },
  {
    mode: "width-fit",
    title: "Width Fit",
    svg: '<rect x="1" y="3" width="12" height="8" rx="0.5"/>',
  },
  {
    mode: "height-fit",
    title: "Height Fit",
    svg: '<rect x="1" y="3.5" width="7" height="7" rx="0.5"/><rect x="9" y="3.5" width="4" height="7" rx="0.5"/>',
  },
  {
    mode: "list",
    title: "List",
    svg: '<rect x="1" y="2" width="12" height="2" rx="0.5"/><rect x="1" y="6" width="12" height="2" rx="0.5"/><rect x="1" y="10" width="12" height="2" rx="0.5"/>',
  },
];

type GallerySize = "big" | "medium" | "small";

const SIZE_ICONS: { size: GallerySize; svg: string; title: string }[] = [
  {
    size: "big",
    title: "Big",
    svg: '<rect x="1.5" y="2.5" width="11" height="9" rx="0.5"/>',
  },
  {
    size: "medium",
    title: "Medium",
    svg: '<rect x="3" y="3.5" width="8" height="7" rx="0.5"/>',
  },
  {
    size: "small",
    title: "Small",
    svg: '<rect x="4.5" y="5" width="5" height="4" rx="0.5"/>',
  },
];

export function createGallery(options: GalleryOptions): ViewHandle {
  const rootAbort = new AbortController();
  const rootSignal = rootAbort.signal;
  let contentAbort: AbortController | null = null;

  let currentMode: GalleryViewMode = "cols-3";
  let currentSize: GallerySize = "big";

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

  // Size icon buttons
  const sizeBtns: { size: GallerySize; el: HTMLElement }[] = [];
  for (const def of SIZE_ICONS) {
    const btn = h("button", {
      class: `rt-gallery__view-btn${def.size === currentSize ? " rt-gallery__view-btn--active" : ""}`,
      title: def.title,
    });
    btn.innerHTML = `<svg viewBox="0 0 14 14" fill="currentColor">${def.svg}</svg>`;
    btn.addEventListener(
      "click",
      () => {
        if (currentSize === def.size) return;
        currentSize = def.size;
        for (const b of sizeBtns) {
          b.el.classList.toggle("rt-gallery__view-btn--active", b.size === currentSize);
        }
        root.className = `rt-gallery rt-gallery--${currentSize}`;
      },
      { signal: rootSignal },
    );
    sizeBtns.push({ size: def.size, el: btn });
  }

  const toolbar = h(
    "div",
    { class: "rt-gallery__toolbar" },
    h("div", { class: "rt-gallery__views" }, ...iconBtns.map((b) => b.el)),
    h("div", { style: "flex:1" }), // spacer
    h("div", { class: "rt-gallery__toolbar-divider" }),
    h("div", { class: "rt-gallery__views" }, ...sizeBtns.map((b) => b.el)),
  );

  const content = h("div", { class: "rt-gallery__content" });

  function renderContent(): void {
    contentAbort?.abort();
    contentAbort = new AbortController();
    const signal = contentAbort.signal;
    content.innerHTML = "";

    switch (currentMode) {
      case "cols-2":
        renderColumnsView(content, options, input, signal, 2);
        break;
      case "cols-3":
        renderColumnsView(content, options, input, signal, 3);
        break;
      case "cols-4":
        renderColumnsView(content, options, input, signal, 4);
        break;
      case "width-fit":
        renderWidthFitView(content, options, input, signal);
        break;
      case "height-fit":
        renderHeightFitView(content, options, input, signal);
        break;
      case "list":
        renderListView(content, options, input, signal);
        break;
    }
  }

  const root = h(
    "div",
    { class: `rt-gallery rt-gallery--${currentSize}` },
    toolbar,
    content,
    input,
  );
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
  input: HTMLInputElement,
  signal: AbortSignal,
  columns: number,
): void {
  const grid = h("div", {
    class: `rt-gallery__cols rt-gallery__cols--${columns}`,
  });

  for (const entry of options.images) {
    grid.appendChild(createFlowCard(entry, options, signal));
  }

  grid.appendChild(createAddCell(input, options, signal));
  container.appendChild(grid);
}

// ── Width-Fit View (single column, full width) ─

function renderWidthFitView(
  container: HTMLElement,
  options: GalleryOptions,
  input: HTMLInputElement,
  signal: AbortSignal,
): void {
  const stack = h("div", { class: "rt-gallery__width-fit" });

  for (const entry of options.images) {
    stack.appendChild(createFlowCard(entry, options, signal));
  }

  stack.appendChild(createAddCell(input, options, signal));
  container.appendChild(stack);
}

// ── Height-Fit View (horizontal filmstrip) ─────

function renderHeightFitView(
  container: HTMLElement,
  options: GalleryOptions,
  input: HTMLInputElement,
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
    strip.appendChild(item);
  }

  strip.appendChild(createAddCell(input, options, signal));
  container.appendChild(strip);
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

function createFlowCard(
  entry: ImageEntry,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const item = h("div", { class: "rt-gallery__flow-item", "data-id": entry.id });
  const img = h("img", { src: entry.thumbnailUrl, alt: entry.file.name });
  const status = createStatusDot(entry);
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
      const idx = options.images.findIndex((img) => img.id === entry.id);
      if (idx !== -1) options.images.splice(idx, 1);
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
      h("span", null, "Drop images here or ", h("strong", null, "browse")),
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
      const idx = options.images.findIndex((img) => img.id === entry.id);
      if (idx !== -1) options.images.splice(idx, 1);
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
