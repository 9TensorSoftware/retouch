import type { GalleryViewMode, MediaEntry, ViewHandle } from "../types";
import { formatBytes } from "../utils/formats";
import { formatDuration } from "../utils/video";
import { dragHasFiles } from "./drop-zone";
import { h } from "./h";
import {
  ICON_CHECK,
  ICON_CLOSE,
  ICON_DOWNLOAD,
  ICON_EDIT,
  ICON_PLAY_BADGE,
  ICON_PLUS,
  ICON_REMOVE,
  ICON_TRASH,
  ICON_UPLOAD,
  ICON_VIEW_GRID,
  ICON_VIEW_LIST,
  ICON_VIEW_ROWS,
  ICON_VIEW_STRIP,
  iconElement,
} from "./icons";
import { isTouchFirst } from "./platform";

export interface GalleryOptions {
  images: MediaEntry[];
  /** Comma-joined MIME list for the add-more file input. */
  accept: string;
  onEdit: (id: string) => void;
  /** Remove entries: one from its tile, or a whole selection at once. */
  onRemove: (ids: string[]) => void;
  onAddMore: (files: File[]) => void;
  onDownload: (id: string) => void | Promise<void>;
  /** Finish the session — export everything. Omit to hide the Done button. */
  onDone?: () => Promise<void> | void;
  /** The layout to open in. Defaults to justified rows. */
  view?: GalleryViewMode;
  onViewChange?: (view: GalleryViewMode) => void;
  /** Selected ids. The caller owns the set, so a selection survives a re-render. */
  selection?: Set<string>;
}

/** The four layouts the switch offers. */
type Layout = "rows" | "grid" | "height-fit" | "list";

const VIEWS: { layout: Layout; label: string; svg: string }[] = [
  { layout: "rows", label: "Rows", svg: ICON_VIEW_ROWS },
  { layout: "grid", label: "Grid", svg: ICON_VIEW_GRID },
  { layout: "height-fit", label: "Filmstrip", svg: ICON_VIEW_STRIP },
  { layout: "list", label: "List", svg: ICON_VIEW_LIST },
];

/** The 0.1 column layouts open as the grid; width-fit as rows. */
function layoutOf(view: GalleryViewMode | undefined): Layout {
  if (view === "grid" || view === "height-fit" || view === "list") return view;
  if (view?.startsWith("cols-")) return "grid";
  return "rows";
}

const VIEW_KEY = "rt-gallery-view";

/** The layout this browser last used, if any. */
export function loadGalleryView(): GalleryViewMode | undefined {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    return VIEWS.some((v) => v.layout === saved) ? (saved as GalleryViewMode) : undefined;
  } catch {
    return undefined;
  }
}

export function saveGalleryView(view: GalleryViewMode): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage can be off (private windows, blocked site data); the layout just won't stick.
  }
}

/** Width ÷ height of what the tile shows, before its thumbnail has loaded. */
function ratioOf(entry: MediaEntry): number {
  const [w, hgt] =
    entry.kind === "video"
      ? [entry.width, entry.height]
      : [entry.image.naturalWidth, entry.image.naturalHeight];
  return clampRatio(w / hgt);
}

/** Keep panoramas and slivers from swallowing or vanishing from a row. */
function clampRatio(ratio: number): number {
  return Number.isFinite(ratio) && ratio > 0 ? Math.min(4, Math.max(0.33, ratio)) : 1.5;
}

/** "01", "02" … like the frame numbers along a contact sheet. */
function frameNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}

/** The space between frames in a row; keep in step with the stylesheet. */
const ROW_GAP = 12;

/**
 * Justified rows. Frames fill a row at about the target height, then the
 * row is scaled to the width exactly — ending it before a frame rather than
 * after when that lands nearer the target, so no row balloons around one
 * wide frame. The last row keeps the target height. Returns each frame's height.
 */
export function layoutRows(
  ratios: number[],
  width: number,
  target: number,
  gap = ROW_GAP,
): number[] {
  // Half a pixel of slack keeps rounding from wrapping a row's last frame.
  const heightFor = (count: number, sum: number) => (width - 0.5 - gap * (count - 1)) / sum;
  const heights = new Array<number>(ratios.length);
  let start = 0;
  let sum = 0;
  for (let i = 0; i < ratios.length; i++) {
    sum += ratios[i];
    const count = i - start + 1;
    if (sum * target + gap * (count - 1) < width) continue;
    const withIt = heightFor(count, sum);
    const without = count > 1 ? heightFor(count - 1, sum - ratios[i]) : Number.POSITIVE_INFINITY;
    const end = Math.abs(without - target) < Math.abs(withIt - target) ? i - 1 : i;
    heights.fill(end === i ? withIt : without, start, end + 1);
    start = end + 1;
    sum = end === i ? 0 : ratios[i];
  }
  if (start < ratios.length) {
    heights.fill(Math.min(target, heightFor(ratios.length - start, sum)), start);
  }
  return heights;
}

/** A grease-pencil loop drawn around a selected frame (it overshoots its start). */
const LOOP = `<svg class="rt-gallery__loop" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M56 5C81 5 97 21 97 48C97 75 79 95 50 95C22 95 4 77 4 50C4 24 22 5 47 4.5C58 4 68 6 77 10"/></svg>`;

/**
 * The gallery as a contact sheet: frames at their true aspect ratios in
 * justified rows (or a square grid, a filmstrip, a list), numbered, with
 * an Edited badge on what's been worked on. Click a frame to edit it, or
 * select frames (the circle, or ⌘/Ctrl-click; Shift extends) to download
 * or remove them together. Files dropped or pasted anywhere on it are added.
 */
export function createGallery(options: GalleryOptions): ViewHandle {
  const rootAbort = new AbortController();
  const rootSignal = rootAbort.signal;
  let contentAbort: AbortController | null = null;

  let layout = layoutOf(options.view);
  const items = [...options.images];
  const selected = options.selection ?? new Set<string>();
  for (const id of selected) if (!items.some((e) => e.id === id)) selected.delete(id);
  let anchor: string | null = null;
  const touch = isTouchFirst();
  /** Each frame's width ÷ height, refined as thumbnails load. */
  const ratios = new Map<string, number>();

  const input = h("input", {
    type: "file",
    accept: options.accept,
    multiple: true,
    hidden: true,
    tabindex: -1,
  });
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

  // ── Header: what's here, the layout switch, and what to do next ──

  const countTitle = h("strong", { class: "rt-gallery__count-title" });
  const countMeta = h("span", { class: "rt-gallery__count-meta" });
  const clearBtn = h(
    "button",
    {
      type: "button",
      class: "rt-gallery__clear",
      "aria-label": "Clear selection",
      title: "Clear selection (Esc)",
    },
    iconElement(ICON_CLOSE),
  );
  clearBtn.addEventListener("click", () => clearSelection(), { signal: rootSignal });

  const viewBtns = VIEWS.map((def) => {
    const btn = h("button", {
      type: "button",
      class: "rt-gallery__view-btn",
      "aria-label": def.label,
      title: def.label,
      "aria-pressed": String(def.layout === layout),
    });
    btn.innerHTML = def.svg;
    btn.addEventListener(
      "click",
      () => {
        if (layout === def.layout) return;
        layout = def.layout;
        for (const [i, b] of viewBtns.entries()) {
          b.setAttribute("aria-pressed", String(VIEWS[i].layout === layout));
        }
        options.onViewChange?.(layout);
        render();
      },
      { signal: rootSignal },
    );
    return btn;
  });

  const addBtn = h(
    "button",
    { type: "button", class: "rt-gallery__add", title: "Add photos and videos" },
    iconElement(ICON_PLUS),
    h("span", null, "Add"),
  );
  addBtn.addEventListener("click", () => input.click(), { signal: rootSignal });
  const actions = h("div", { class: "rt-gallery__actions" }, addBtn);

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
    actions.appendChild(doneBtn);
  }

  // With a selection, the actions apply to it instead.
  const downloadSel = h(
    "button",
    {
      type: "button",
      class: "rt-gallery__batch",
      "aria-label": "Download selected",
      title: "Download selected",
    },
    iconElement(ICON_DOWNLOAD),
    h("span", null, "Download"),
  );
  downloadSel.addEventListener(
    "click",
    async () => {
      downloadSel.disabled = true;
      for (const entry of items.filter((e) => selected.has(e.id))) await download(entry.id);
      downloadSel.disabled = false;
    },
    { signal: rootSignal },
  );
  const removeSel = h(
    "button",
    {
      type: "button",
      class: "rt-gallery__batch rt-gallery__batch--danger",
      "aria-label": "Remove selected",
      title: "Remove selected",
    },
    iconElement(ICON_TRASH),
    h("span", null, "Remove"),
  );
  removeSel.addEventListener("click", () => remove([...selected]), { signal: rootSignal });
  const batch = h(
    "div",
    { class: "rt-gallery__actions rt-gallery__actions--batch" },
    downloadSel,
    removeSel,
  );

  const toolbar = h(
    "div",
    { class: "rt-gallery__toolbar" },
    h(
      "div",
      { class: "rt-gallery__summary" },
      clearBtn,
      h("div", { class: "rt-gallery__count", "aria-live": "polite" }, countTitle, countMeta),
    ),
    h("div", { class: "rt-gallery__views", role: "group", "aria-label": "Layout" }, ...viewBtns),
    actions,
    batch,
  );

  const content = h("div", { class: "rt-gallery__content" });
  const drop = h(
    "div",
    { class: "rt-gallery__drop", "aria-hidden": "true" },
    h("span", { class: "rt-gallery__drop-label" }, iconElement(ICON_UPLOAD), "Drop to add"),
  );
  const root = h("div", { class: "rt-gallery" }, toolbar, content, drop, input);

  // ── Selection ──

  /** Each rendered item's parts that follow the selection. */
  type ItemView = { item: HTMLElement; select: HTMLElement; media: HTMLElement };
  const views = new Map<string, ItemView>();

  function toggle(id: string, extend: boolean): void {
    if (extend && anchor !== null && anchor !== id) {
      const a = items.findIndex((e) => e.id === anchor);
      const b = items.findIndex((e) => e.id === id);
      if (a >= 0 && b >= 0) {
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) selected.add(items[i].id);
      }
    } else if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    anchor = id;
    syncSelection();
  }

  function clearSelection(): void {
    if (selected.size === 0) return;
    selected.clear();
    anchor = null;
    syncSelection();
  }

  /** Mark an item selected or not: the class, the checkbox, and the pencil loop. */
  function mark(view: ItemView, on: boolean): void {
    if (view.item.classList.contains("rt-gallery__item--selected") === on) return;
    view.item.classList.toggle("rt-gallery__item--selected", on);
    view.select.setAttribute("aria-checked", String(on));
    if (on) view.media.appendChild(iconElement(LOOP));
    else view.media.querySelector(".rt-gallery__loop")?.remove();
  }

  function syncSelection(): void {
    for (const [id, view] of views) mark(view, selected.has(id));
    refreshHeader();
  }

  function refreshHeader(): void {
    const n = items.length;
    const count = selected.size;
    const total = `${n} ${n === 1 ? "item" : "items"}`;
    // A selection's controls leave with it; focus on one moves to Add, not the page.
    const active = document.activeElement;
    const stranded = count === 0 && (active === clearBtn || batch.contains(active));
    root.classList.toggle("rt-gallery--selecting", count > 0);
    clearBtn.hidden = count === 0;
    actions.hidden = count > 0;
    batch.hidden = count === 0;
    if (stranded) addBtn.focus();
    if (count > 0) {
      countTitle.textContent = `${count} selected`;
      countMeta.textContent = `of ${total}`;
      return;
    }
    const edited = items.filter((e) => e.edited).length;
    const videos = items.filter((e) => e.kind === "video").length;
    const parts = [
      edited > 0 ? `${edited} edited` : "",
      videos > 0 ? `${videos} ${videos === 1 ? "video" : "videos"}` : "",
    ].filter(Boolean);
    countTitle.textContent = total;
    countMeta.textContent =
      parts.length > 0 ? parts.join(" · ") : `${touch ? "Tap" : "Click"} one to edit it`;
  }

  /** One download; a failure is reported, and never stops the others. */
  async function download(id: string): Promise<void> {
    try {
      await options.onDownload(id);
    } catch (error) {
      console.error("[Retouch] Download failed", error);
    }
  }

  function remove(ids: string[]): void {
    const gone = new Set(ids);
    if (gone.size === 0) return;
    for (let i = items.length - 1; i >= 0; i--) if (gone.has(items[i].id)) items.splice(i, 1);
    for (const id of gone) selected.delete(id);
    if (anchor !== null && gone.has(anchor)) anchor = null;
    // Re-render first: removing the last item unmounts the gallery.
    if (items.length > 0) render();
    options.onRemove(ids);
  }

  // ── Items ──

  /** Click a frame: edit it — or, while selecting (or with ⌘/Ctrl), select it. */
  function onOpen(e: MouseEvent, id: string): void {
    if (selected.size > 0 || e.metaKey || e.ctrlKey || e.shiftKey) {
      toggle(id, e.shiftKey);
    } else {
      options.onEdit(id);
    }
  }

  function selectButton(entry: MediaEntry, signal: AbortSignal): HTMLElement {
    const btn = h(
      "button",
      {
        type: "button",
        class: "rt-gallery__select",
        role: "checkbox",
        "aria-checked": String(selected.has(entry.id)),
        "aria-label": `Select ${entry.file.name}`,
      },
      h("span", { class: "rt-gallery__mark" }, iconElement(ICON_CHECK)),
    );
    btn.addEventListener("click", (e) => toggle(entry.id, e.shiftKey), { signal });
    return btn;
  }

  function openButton(entry: MediaEntry, signal: AbortSignal, hint: boolean): HTMLElement {
    const btn = h("button", {
      type: "button",
      class: "rt-gallery__open",
      "aria-label": `Edit ${entry.file.name}`,
    });
    if (hint) {
      btn.appendChild(
        h(
          "span",
          { class: "rt-gallery__open-hint", "aria-hidden": "true" },
          iconElement(ICON_EDIT),
          "Edit",
        ),
      );
    }
    btn.addEventListener("click", (e) => onOpen(e, entry.id), { signal });
    return btn;
  }

  /** A small icon button; pointer-only (the keyboard path is select, then the header). */
  function iconButton(
    cls: string,
    svg: string,
    label: string,
    onClick: () => void,
    signal: AbortSignal,
  ): HTMLElement {
    const btn = h("button", {
      type: "button",
      class: cls,
      "aria-label": label,
      title: label,
      tabindex: -1,
    });
    btn.innerHTML = svg;
    btn.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        onClick();
      },
      { signal },
    );
    return btn;
  }

  function createTile(entry: MediaEntry, index: number, signal: AbortSignal): HTMLElement {
    const name = entry.file.name;
    const img = h("img", {
      src: entry.thumbnailUrl,
      alt: "",
      draggable: "false",
      decoding: "async",
    });
    const tile = h("figure", { class: "rt-gallery__item rt-gallery__tile", "data-id": entry.id });
    const ratio = ratios.get(entry.id) ?? ratioOf(entry);
    ratios.set(entry.id, ratio);
    tile.style.setProperty("--r", ratio.toFixed(4));
    // The thumbnail shows the edits (a crop changes its shape), so it has the last word.
    img.addEventListener(
      "load",
      () => {
        if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
        const actual = clampRatio(img.naturalWidth / img.naturalHeight);
        if (Math.abs(actual - (ratios.get(entry.id) ?? 0)) < 0.001) return;
        ratios.set(entry.id, actual);
        tile.style.setProperty("--r", actual.toFixed(4));
        relayout();
      },
      { signal },
    );

    const frame = h("div", { class: "rt-gallery__frame" }, img);
    if (entry.edited) frame.appendChild(h("span", { class: "rt-gallery__badge" }, "Edited"));
    if (entry.kind === "video") {
      frame.appendChild(
        h("span", { class: "rt-gallery__duration" }, formatDuration(entry.duration)),
      );
      const play = h("span", { class: "rt-gallery__play", "aria-hidden": "true" });
      play.innerHTML = ICON_PLAY_BADGE;
      frame.appendChild(play);
    }
    frame.appendChild(openButton(entry, signal, true));

    const quick = h(
      "div",
      { class: "rt-gallery__quick" },
      iconButton(
        "rt-gallery__quick-btn",
        ICON_DOWNLOAD,
        `Download ${name}`,
        () => void download(entry.id),
        signal,
      ),
      iconButton(
        "rt-gallery__quick-btn rt-gallery__quick-btn--danger",
        ICON_REMOVE,
        `Remove ${name}`,
        () => remove([entry.id]),
        signal,
      ),
    );
    const select = selectButton(entry, signal);
    const media = h("div", { class: "rt-gallery__media" }, frame, quick, select);

    tile.append(
      media,
      h(
        "figcaption",
        { class: "rt-gallery__caption" },
        h("span", { class: "rt-gallery__num" }, frameNumber(index)),
        h("span", { class: "rt-gallery__name", title: name }, name),
      ),
    );
    const view = { item: tile, select, media };
    views.set(entry.id, view);
    mark(view, selected.has(entry.id));
    return tile;
  }

  function createRow(entry: MediaEntry, index: number, signal: AbortSignal): HTMLElement {
    const name = entry.file.name;
    const [w, hgt] =
      entry.kind === "video"
        ? [entry.width, entry.height]
        : [entry.image.naturalWidth, entry.image.naturalHeight];
    const meta = [
      formatBytes(entry.file.size),
      w > 0 && hgt > 0 ? `${w} × ${hgt}` : "",
      entry.kind === "video" ? formatDuration(entry.duration) : "",
    ].filter(Boolean);

    const thumb = h("img", {
      class: "rt-gallery__row-thumb",
      src: entry.thumbnailUrl,
      alt: "",
      draggable: "false",
      decoding: "async",
    });
    const select = selectButton(entry, signal);
    const media = h("div", { class: "rt-gallery__row-media" }, thumb);
    const title = h(
      "span",
      { class: "rt-gallery__row-title" },
      h("span", { class: "rt-gallery__name", title: name }, name),
    );
    if (entry.edited) title.appendChild(h("span", { class: "rt-gallery__badge" }, "Edited"));
    const row = h(
      "div",
      { class: "rt-gallery__item rt-gallery__row", "data-id": entry.id },
      openButton(entry, signal, false),
      select,
      media,
      h("span", { class: "rt-gallery__num" }, frameNumber(index)),
      h(
        "span",
        { class: "rt-gallery__row-text" },
        title,
        h("span", { class: "rt-gallery__row-meta" }, meta.join(" · ")),
      ),
      h(
        "span",
        { class: "rt-gallery__row-actions" },
        iconButton(
          "rt-gallery__row-btn",
          ICON_EDIT,
          `Edit ${name}`,
          () => options.onEdit(entry.id),
          signal,
        ),
        iconButton(
          "rt-gallery__row-btn",
          ICON_DOWNLOAD,
          `Download ${name}`,
          () => void download(entry.id),
          signal,
        ),
        iconButton(
          "rt-gallery__row-btn rt-gallery__row-btn--danger",
          ICON_REMOVE,
          `Remove ${name}`,
          () => remove([entry.id]),
          signal,
        ),
      ),
    );
    const view = { item: row, select, media };
    views.set(entry.id, view);
    mark(view, selected.has(entry.id));
    return row;
  }

  function render(): void {
    contentAbort?.abort();
    contentAbort = new AbortController();
    const signal = contentAbort.signal;
    views.clear();
    const list = h("div", { class: `rt-gallery__${layout === "height-fit" ? "strip" : layout}` });
    for (const [i, entry] of items.entries()) {
      list.appendChild(
        layout === "list" ? createRow(entry, i, signal) : createTile(entry, i, signal),
      );
    }
    content.replaceChildren(list);
    refreshHeader();
    relayout();
  }

  // ── Sizing: rows and the strip scale with the gallery's width ──

  /** Size the strip, and lay the rows out, for the gallery's current width. */
  function relayout(): void {
    const width = content.clientWidth;
    if (width <= 0) return; // not on the page yet: the resize observer calls back
    const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
    const target = clamp(width / 4.2, 110, 220);
    content.style.setProperty("--rt-row-h", `${target}px`);
    content.style.setProperty("--rt-strip-h", `${clamp(width / 3.4, 150, 300)}px`);
    const list = content.firstElementChild;
    if (layout !== "rows" || !list) return;
    const tiles = [...list.children] as HTMLElement[];
    const heights = layoutRows(
      tiles.map((tile) => ratios.get(tile.dataset.id ?? "") ?? 1.5),
      width,
      target,
    );
    for (const [i, tile] of tiles.entries()) {
      tile.style.setProperty("--h", `${heights[i].toFixed(2)}px`);
    }
    list.classList.add("rt-gallery__rows--laid");
  }

  if (typeof ResizeObserver !== "undefined") {
    let lastWidth = 0;
    const resize = new ResizeObserver(([e]) => {
      if (e.contentRect.width === lastWidth) return;
      lastWidth = e.contentRect.width;
      relayout();
    });
    resize.observe(content);
    rootSignal.addEventListener("abort", () => resize.disconnect());
  }

  // ── Keys: Esc clears the selection, ⌘/Ctrl+A selects everything ──

  root.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && selected.size > 0) {
        e.preventDefault();
        clearSelection();
      } else if (e.key.toLowerCase() === "a" && (e.metaKey || e.ctrlKey) && !e.altKey) {
        e.preventDefault();
        for (const entry of items) selected.add(entry.id);
        syncSelection();
      }
    },
    { signal: rootSignal },
  );

  // ── Drop files anywhere on the gallery ──

  let depth = 0;
  root.addEventListener(
    "dragenter",
    (e) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depth++;
      root.classList.add("rt-gallery--dropping");
    },
    { signal: rootSignal },
  );
  root.addEventListener(
    "dragover",
    (e) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    { signal: rootSignal },
  );
  root.addEventListener(
    "dragleave",
    () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) root.classList.remove("rt-gallery--dropping");
    },
    { signal: rootSignal },
  );
  root.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      depth = 0;
      root.classList.remove("rt-gallery--dropping");
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        options.onAddMore(Array.from(e.dataTransfer.files));
      }
    },
    { signal: rootSignal },
  );

  render();

  return {
    root,
    destroy() {
      contentAbort?.abort();
      rootAbort.abort();
      root.remove();
    },
  };
}
