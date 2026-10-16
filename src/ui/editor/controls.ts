import { h } from "../h";
import { ICON_CHEVRON_DOWN } from "../icons";

type Content = Node | string;

// ── Section ───────────────────────────────────────────────────────────────

export interface SectionOptions {
  title: string;
  /** Collapsible sections fold with their header; others are just titled. */
  collapsible?: boolean;
  /** Initial state of a collapsible section. Defaults to open. */
  open?: boolean;
}

export interface SectionHandle {
  root: HTMLElement;
  /** Where the controls go. */
  body: HTMLElement;
  /** Badge counting the changed controls inside (hidden at 0). */
  setCount(count: number): void;
}

/**
 * A titled group of controls in the inspector. Collapsible ones are a
 * native <details>, so they open and close with the keyboard for free.
 */
export function createSection(options: SectionOptions, ...children: Content[]): SectionHandle {
  const count = h("span", { class: "rt-section__count", "aria-hidden": "true" });
  count.hidden = true;
  const titleEl = h("span", { class: "rt-dock__row-title rt-section__title" }, options.title);
  const body = h("div", { class: "rt-section__body" }, ...children);

  let root: HTMLElement;
  if (options.collapsible) {
    const chevron = h("span", { class: "rt-section__chevron", "aria-hidden": "true" });
    chevron.innerHTML = ICON_CHEVRON_DOWN;
    const summary = h("summary", { class: "rt-section__head" }, titleEl, count, chevron);
    const details = h("details", { class: "rt-section rt-section--collapsible" }, summary, body);
    details.open = options.open ?? true;
    root = details;
  } else {
    root = h(
      "div",
      { class: "rt-section" },
      h("div", { class: "rt-section__head" }, titleEl, count),
      body,
    );
  }

  return {
    root,
    body,
    setCount(n) {
      count.hidden = n === 0;
      count.textContent = String(n);
      titleEl.setAttribute("aria-label", n ? `${options.title}, ${n} changed` : options.title);
    },
  };
}

// ── Tiles ─────────────────────────────────────────────────────────────────

export interface TileOption<T extends string> {
  value: T;
  label: string;
  /** Image URL (often a data URL) shown in the tile. */
  preview?: string;
}

export interface TilesOptions<T extends string> {
  /** Names the group for assistive tech. */
  label: string;
  options: ReadonlyArray<TileOption<T>>;
  /** The pressed tile, or null for none. */
  value: T | null;
  onChange: (value: T) => void;
  /** Tiles per row. Defaults to 3. */
  columns?: number;
}

export interface TilesHandle<T extends string> {
  root: HTMLElement;
  readonly value: T | null;
  /** Press a tile (or none) without firing `onChange`. */
  set(value: T | null): void;
  /** Swap a tile's preview image. */
  setPreview(value: T, src: string): void;
}

/**
 * Preview tiles: a grid of pictures you choose between (filters, effects,
 * looks). Each tile is a toggle button; the pressed one gets the accent ring.
 */
export function createTiles<T extends string>(
  options: TilesOptions<T>,
  signal?: AbortSignal,
): TilesHandle<T> {
  let current = options.value;
  const tiles = new Map<T, { button: HTMLButtonElement; img: HTMLImageElement }>();
  const root = h("div", { class: "rt-tiles", role: "group", "aria-label": options.label });
  root.style.setProperty("--rt-tile-cols", String(options.columns ?? 3));

  const paint = (): void => {
    for (const [value, { button }] of tiles) {
      button.setAttribute("aria-pressed", String(value === current));
    }
  };

  for (const option of options.options) {
    const img = h("img", { class: "rt-tile__img", alt: "", draggable: "false" });
    if (option.preview) img.src = option.preview;
    const button = h(
      "button",
      { type: "button", class: "rt-tile" },
      h("span", { class: "rt-tile__frame" }, img),
      h("span", { class: "rt-tile__label" }, option.label),
    );
    button.addEventListener(
      "click",
      () => {
        if (option.value === current) return;
        current = option.value;
        paint();
        options.onChange(option.value);
      },
      signal ? { signal } : undefined,
    );
    tiles.set(option.value, { button, img });
    root.appendChild(button);
  }
  paint();

  return {
    root,
    get value() {
      return current;
    },
    set(value) {
      current = value;
      paint();
    },
    setPreview(value, src) {
      const tile = tiles.get(value);
      if (tile) tile.img.src = src;
    },
  };
}

// ── Segmented control ─────────────────────────────────────────────────────

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Accessible name when the label is terse ("R" → "Red channel"). */
  title?: string;
  /** A color dot before the label. */
  color?: string;
}

export interface SegmentedHandle<T extends string> {
  root: HTMLElement;
  readonly value: T;
  set(value: T): void;
}

/** A row of mutually exclusive buttons sharing one track. */
export function createSegmented<T extends string>(
  options: {
    label: string;
    options: ReadonlyArray<SegmentedOption<T>>;
    value: T;
    onChange: (value: T) => void;
  },
  signal?: AbortSignal,
): SegmentedHandle<T> {
  let current = options.value;
  const buttons = new Map<T, HTMLButtonElement>();
  const root = h("div", { class: "rt-segmented", role: "group", "aria-label": options.label });
  const paint = (): void => {
    for (const [value, button] of buttons) {
      button.setAttribute("aria-pressed", String(value === current));
    }
  };
  for (const option of options.options) {
    const button = h("button", { type: "button", class: "rt-segmented__btn" });
    if (option.color) {
      const swatch = h("span", { class: "rt-segmented__dot", "aria-hidden": "true" });
      swatch.style.background = option.color;
      button.appendChild(swatch);
    }
    button.appendChild(document.createTextNode(option.label));
    if (option.title) {
      button.title = option.title;
      button.setAttribute("aria-label", option.title);
    }
    button.addEventListener(
      "click",
      () => {
        if (option.value === current) return;
        current = option.value;
        paint();
        options.onChange(current);
      },
      signal ? { signal } : undefined,
    );
    buttons.set(option.value, button);
    root.appendChild(button);
  }
  paint();
  return {
    root,
    get value() {
      return current;
    },
    set(value) {
      current = value;
      paint();
    },
  };
}
