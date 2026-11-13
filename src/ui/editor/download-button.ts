import {
  type FlattenChoice,
  formatInfo,
  IMAGE_FORMATS,
  type ImageFormat,
} from "../../utils/image-formats";
import { h } from "../h";
import { ICON_CHEVRON_DOWN, ICON_DOWNLOAD } from "../icons";

/** How the editor downloads the photo it has open. */
export interface EditorDownload {
  /** The formats this browser can write, in menu order. */
  formats(): Promise<ImageFormat[]>;
  /** What the Download button saves as. */
  defaultFormat(): Promise<ImageFormat>;
  /**
   * Save the photo as it is now. `confirmFlatten` is asked before
   * transparent areas go into a format that can't keep them. False when
   * nothing was saved (the question was cancelled).
   */
  save(
    format: ImageFormat,
    confirmFlatten: (format: ImageFormat) => Promise<FlattenChoice>,
  ): Promise<boolean>;
  /** A format picked from the menu and saved in: the default from now on. */
  remember(format: ImageFormat): void;
}

export interface DownloadButtonOptions {
  download: EditorDownload;
  /** The photo's own format, marked in the menu. */
  ownFormat: ImageFormat | null;
  /** Where the menu goes: above the bar, so nothing in the bar clips it. */
  menuHost: () => HTMLElement;
  confirmFlatten: (format: ImageFormat) => Promise<FlattenChoice>;
  /** Settles anything half-done first (a crop frame not applied); false stops the save. */
  beforeSave?: () => Promise<boolean>;
  signal: AbortSignal;
}

export interface DownloadButtonHandle {
  root: HTMLElement;
  /** Save in the default format, as the button does. */
  download(): Promise<void>;
}

/**
 * Download, split in two: the button saves in the default format (the
 * photo's own, until another is picked); the format beside it opens a menu
 * of every format this browser writes, and picking one saves in it and
 * makes it the default.
 */
export function createDownloadButton(options: DownloadButtonOptions): DownloadButtonHandle {
  const { download, signal } = options;
  let formats: ImageFormat[] = ["png", "jpeg"];
  let defaultFormat: ImageFormat = options.ownFormat ?? "png";
  let busy = false;

  const label = h("span", { class: "rt-download__label" }, "Download");
  const main = h("button", { type: "button", class: "rt-download__main" });
  main.innerHTML = ICON_DOWNLOAD;
  main.appendChild(label);
  const formatTag = h("span", { class: "rt-download__format" });
  const more = h("button", {
    type: "button",
    class: "rt-download__more",
    "aria-haspopup": "menu",
    "aria-expanded": "false",
    "aria-label": "Download as another format",
    title: "Download as another format",
  });
  more.appendChild(formatTag);
  more.insertAdjacentHTML("beforeend", ICON_CHEVRON_DOWN);
  const root = h(
    "div",
    { class: "rt-download", role: "group", "aria-label": "Download" },
    main,
    more,
  );

  const list = h("div", { class: "rt-flyout__list" });
  const menu = h(
    "div",
    { class: "rt-flyout rt-download-menu", role: "menu", "aria-label": "Download as" },
    h("div", { class: "rt-flyout__head" }, h("span", { class: "rt-flyout__title" }, "Download as")),
    list,
  );
  menu.hidden = true;

  function paint(): void {
    const { label: name } = formatInfo(defaultFormat);
    formatTag.textContent = name;
    main.title = `Download as ${name}`;
    main.setAttribute("aria-label", `Download as ${name}`);
    list.replaceChildren(
      ...IMAGE_FORMATS.filter((f) => formats.includes(f.id)).map((f) => {
        const item = h(
          "button",
          { type: "button", class: "rt-flyout__item", role: "menuitem", tabindex: "-1" },
          h(
            "span",
            { class: "rt-flyout__text" },
            h("span", { class: "rt-flyout__name" }, f.label),
            h("span", { class: "rt-flyout__desc" }, f.note),
          ),
        );
        item.dataset.format = f.id;
        if (f.id === options.ownFormat) {
          item.appendChild(h("span", { class: "rt-flyout__badge" }, "Original"));
        }
        item.addEventListener(
          "click",
          () => {
            closeMenu(true);
            void run(f.id, true);
          },
          { signal },
        );
        return item;
      }),
    );
  }

  void Promise.all([download.formats(), download.defaultFormat()])
    .then(([written, preferred]) => {
      if (signal.aborted) return;
      formats = written;
      defaultFormat = preferred;
      paint();
    })
    .catch(() => {
      // Keep PNG and JPG, which every browser writes.
    });
  paint();

  async function run(format: ImageFormat, picked = false): Promise<void> {
    if (busy) return;
    busy = true;
    root.classList.add("rt-download--busy");
    root.setAttribute("aria-busy", "true");
    label.textContent = "Saving…";
    try {
      if (options.beforeSave && !(await options.beforeSave())) return;
      const saved = await download.save(format, options.confirmFlatten);
      // A pick from the menu is a choice, even of the format already on the button.
      if (saved && picked) {
        download.remember(format);
        if (format !== defaultFormat) {
          defaultFormat = format;
          paint();
        }
      }
    } catch (error) {
      console.error("[Retouch] Download failed", error);
    } finally {
      busy = false;
      if (!signal.aborted) {
        root.classList.remove("rt-download--busy");
        root.removeAttribute("aria-busy");
        label.textContent = "Download";
      }
    }
  }

  // ── The menu ──

  const items = (): HTMLButtonElement[] => [...list.querySelectorAll<HTMLButtonElement>("button")];

  function openMenu(): void {
    if (busy) return;
    const host = options.menuHost();
    if (menu.parentElement !== host) host.appendChild(menu);
    menu.hidden = false;
    more.setAttribute("aria-expanded", "true");
    const r = root.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth || innerWidth;
    const width = menu.offsetWidth;
    menu.style.left = `${Math.max(8, Math.min(r.left, viewport - width - 8))}px`;
    menu.style.top = `${r.bottom + 6}px`;
    const current = items().find((i) => i.dataset.format === defaultFormat) ?? items()[0];
    current?.focus();
  }

  function closeMenu(refocus = false): void {
    if (menu.hidden) return;
    menu.hidden = true;
    more.setAttribute("aria-expanded", "false");
    if (refocus) more.focus({ preventScroll: true });
  }

  main.addEventListener("click", () => void run(defaultFormat), { signal });
  more.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()), { signal });
  more.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu();
      }
    },
    { signal },
  );
  menu.addEventListener(
    "keydown",
    (e) => {
      const all = items();
      const at = all.indexOf(document.activeElement as HTMLButtonElement);
      const step = (to: number) => all[(to + all.length) % all.length]?.focus();
      if (e.key === "ArrowDown") step(at + 1);
      else if (e.key === "ArrowUp") step(at - 1);
      else if (e.key === "Home") step(0);
      else if (e.key === "End") step(all.length - 1);
      else if (e.key === "Escape") closeMenu(true);
      else if (e.key === "Tab") {
        closeMenu();
        return;
      } else return;
      // Handled here: Esc closes the menu, not the editor.
      e.preventDefault();
      e.stopPropagation();
    },
    { signal },
  );
  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Node;
      if (!menu.hidden && !menu.contains(target) && !more.contains(target)) closeMenu();
    },
    { signal, capture: true },
  );
  window.addEventListener("resize", () => closeMenu(), { signal });
  signal.addEventListener("abort", () => menu.remove());

  return { root, download: () => run(defaultFormat) };
}
