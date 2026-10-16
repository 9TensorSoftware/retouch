import { h } from "../h";
import { ICON_CHECK, ICON_CHEVRON_DOWN, ICON_CLOSE } from "../icons";
import type {
  UiCard,
  UiCardOptions,
  UiStep,
  UiStepState,
  UiSteps,
  UiStepsOptions,
} from "./tool-ui";

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

// ── Card ──────────────────────────────────────────────────────────────────

/**
 * An AI tool's card: what it does and where the result goes, the facts
 * (model, download, device), then its controls. The prism edge marks
 * on-device AI.
 */
export function createCard(options: UiCardOptions): UiCard {
  const facts = h("dl", { class: "rt-card__facts" });
  const values = new Map<string, HTMLElement>();
  const setFact = (label: string, value: string): void => {
    const existing = values.get(label);
    if (existing) {
      existing.textContent = value;
      return;
    }
    const dd = h("dd", null, value);
    values.set(label, dd);
    facts.append(h("dt", null, label), dd);
  };
  for (const [label, value] of options.facts ?? []) setFact(label, value);

  const body = h("div", { class: "rt-card__body" });
  const root = h(
    "section",
    { class: "rt-card" },
    ...(options.description ? [h("p", { class: "rt-card__desc" }, options.description)] : []),
    facts,
    body,
  );
  return { root, body, setFact };
}

// ── Steps ─────────────────────────────────────────────────────────────────

/** A run's steps: each waiting, active (with an optional bar), done or failed. */
export function createSteps(options: UiStepsOptions): UiSteps {
  const announcer = h("span", { class: "rt-visually-hidden", "aria-live": "polite" });
  const rows = options.steps.map((step: UiStep) => {
    const mark = h("span", { class: "rt-step__mark", "aria-hidden": "true" });
    const detail = h("span", { class: "rt-step__detail" }, step.detail ?? "");
    const fill = h("i");
    const bar = h("span", { class: "rt-step__bar", "aria-hidden": "true" }, fill);
    bar.hidden = true;
    const li = h(
      "li",
      { class: "rt-step", "data-state": "waiting" },
      mark,
      h("span", { class: "rt-step__label" }, step.label),
      detail,
      bar,
    );
    return { step, li, mark, detail, bar, fill };
  });
  const list = h(
    "ol",
    { class: "rt-steps", "aria-label": options.label },
    ...rows.map((r) => r.li),
  );
  const root = h("div", { class: "rt-steps-wrap" }, list, announcer);

  const set = (
    index: number,
    state: UiStepState,
    update: { detail?: string; progress?: number } = {},
  ): void => {
    const row = rows[index];
    if (!row) return;
    const changed = row.li.dataset.state !== state;
    row.li.dataset.state = state;
    row.mark.innerHTML = state === "done" ? ICON_CHECK : state === "failed" ? ICON_CLOSE : "";
    if (update.detail !== undefined) row.detail.textContent = update.detail;
    const showBar = state === "active" && update.progress !== undefined;
    row.bar.hidden = !showBar;
    if (showBar) {
      const pct = Math.round(Math.min(1, Math.max(0, update.progress ?? 0)) * 100);
      row.fill.style.width = `${pct}%`;
    }
    if (changed && state !== "waiting") {
      const words = { active: "started", done: "done", failed: "failed" } as const;
      announcer.textContent = `${row.step.label}: ${words[state]}`;
    }
  };

  return {
    root,
    set,
    reset() {
      rows.forEach((row, i) => {
        set(i, "waiting", { detail: row.step.detail ?? "" });
      });
      announcer.textContent = "";
    },
  };
}
