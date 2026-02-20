import type { ImageEntry, ViewHandle } from "../types";
import { h } from "./h";

export interface GalleryOptions {
  images: ImageEntry[];
  onEdit: (id: string) => void;
  onRemove: (id: string) => void;
  onAddMore: (files: File[]) => void;
  onDone: () => void;
}

export function createGallery(options: GalleryOptions): ViewHandle {
  const abort = new AbortController();
  const signal = abort.signal;

  // Hidden file input for "Add more"
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
    { signal },
  );

  // Count display
  const countEl = h("div", { class: "rt-gallery__count" });
  const updateCount = () => {
    const n = grid.children.length;
    countEl.innerHTML = `<strong>${n}</strong> image${n !== 1 ? "s" : ""}`;
  };

  // Add more button
  const addMoreBtn = h("button", {
    class: "rt-btn",
    onClick: () => input.click(),
  }, createPlusIcon(), "Add more");

  // Done button
  const doneBtn = h("button", {
    class: "rt-btn rt-btn--accent",
    onClick: () => options.onDone(),
  }, "Done");

  // Grid
  const grid = h("div", { class: "rt-gallery__grid" });

  // Add initial images
  for (const entry of options.images) {
    grid.appendChild(createGridItem(entry, options, signal));
  }

  // Toolbar
  const toolbar = h(
    "div",
    { class: "rt-gallery__toolbar" },
    countEl,
    h("div", { class: "rt-gallery__actions" }, addMoreBtn, input),
  );

  // Footer
  const footer = h("div", { class: "rt-gallery__footer" }, doneBtn);

  const root = h("div", { class: "rt-gallery" }, toolbar, grid, footer);

  updateCount();

  return {
    root,
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}

function createGridItem(
  entry: ImageEntry,
  options: GalleryOptions,
  signal: AbortSignal,
): HTMLElement {
  const img = h("img", { src: entry.thumbnailUrl, alt: entry.file.name });

  const statusClass = entry.edited
    ? "rt-gallery__item-status--edited"
    : "rt-gallery__item-status--pending";
  const status = h("div", { class: `rt-gallery__item-status ${statusClass}` });

  const removeBtn = h("button", { class: "rt-gallery__item-remove" });
  removeBtn.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l8 8M10 2l-8 8"/></svg>';

  const editBtn = h("button", { class: "rt-gallery__item-edit" });
  editBtn.innerHTML =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 1.5a1.414 1.414 0 012 2L4 10l-2.5.5L2 8l6.5-6.5z"/></svg> Edit';

  const overlay = h(
    "div",
    { class: "rt-gallery__item-overlay" },
    h(
      "div",
      { class: "rt-gallery__item-info" },
      h("span", { class: "rt-gallery__item-name" }, entry.file.name),
      editBtn,
    ),
  );

  const item = h(
    "div",
    { class: "rt-gallery__item", "data-id": entry.id },
    img,
    status,
    removeBtn,
    overlay,
  );

  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    options.onEdit(entry.id);
  }, { signal });

  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    item.remove();
    options.onRemove(entry.id);
  }, { signal });

  return item;
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
