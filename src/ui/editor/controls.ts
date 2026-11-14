import { createEta, formatDownload, formatProgress, formatTimeLeft } from "../../utils/eta";
import { h } from "../h";
import { ICON_CHECK, ICON_CHEVRON_DOWN, ICON_CLOSE, ICON_DOWNLOAD, ICON_INFO } from "../icons";
import type {
  UiCard,
  UiCardOptions,
  UiList,
  UiListItem,
  UiListOptions,
  UiModel,
  UiModelOptions,
  UiModelState,
  UiStatus,
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

// ── List ──────────────────────────────────────────────────────────────────

/** Rows to pick from: swatch, label, an optional span on a timeline, a note. */
export function createList<T extends string>(
  options: UiListOptions<T>,
  signal?: AbortSignal,
): UiList<T> {
  let current = options.value ?? null;
  const rows = new Map<T, HTMLButtonElement>();
  const root = h("div", { class: "rt-list", role: "group", "aria-label": options.label });
  const listen = signal ? { signal } : undefined;

  const paint = (): void => {
    for (const [value, row] of rows) row.setAttribute("aria-pressed", String(value === current));
  };

  function rowFor(item: UiListItem<T>): HTMLButtonElement {
    const swatch = h("span", { class: "rt-list__swatch", "aria-hidden": "true" });
    if (item.color) swatch.style.background = item.color;
    const row = h(
      "button",
      { type: "button", class: "rt-list__item" },
      swatch,
      h("span", { class: "rt-list__label" }, item.label),
    );
    if (item.span) {
      const [start, end] = item.span;
      const bar = h("span", { class: "rt-list__span", "aria-hidden": "true" }, h("i"));
      bar.style.setProperty("--rt-span-a", String(Math.max(0, start)));
      bar.style.setProperty("--rt-span-b", String(Math.min(1, Math.max(start, end))));
      if (item.color) bar.style.setProperty("--rt-span-c", item.color);
      row.appendChild(bar);
    } else row.classList.add("rt-list__item--plain");
    row.appendChild(h("span", { class: "rt-list__detail" }, item.detail ?? ""));
    row.addEventListener(
      "click",
      () => {
        current = current === item.value ? null : item.value;
        paint();
        options.onChange(current);
      },
      listen,
    );
    if (options.onHover) {
      const enter = () => options.onHover?.(item.value);
      const leave = () => options.onHover?.(null);
      row.addEventListener("pointerenter", enter, listen);
      row.addEventListener("pointerleave", leave, listen);
      row.addEventListener("focus", enter, listen);
      row.addEventListener("blur", leave, listen);
    }
    return row;
  }

  function setItems(items: ReadonlyArray<UiListItem<T>>): void {
    rows.clear();
    for (const item of items) rows.set(item.value, rowFor(item));
    root.replaceChildren(...rows.values());
    if (current !== null && !rows.has(current)) current = null;
    paint();
  }

  setItems(options.items);
  return {
    root,
    get value() {
      return current;
    },
    set(value) {
      current = value;
      paint();
    },
    setItems,
    setCurrent(values) {
      const on = new Set(values);
      for (const [value, row] of rows) row.toggleAttribute("data-current", on.has(value));
    },
    setTime(time) {
      root.toggleAttribute("data-time", time !== null);
      if (time !== null)
        root.style.setProperty("--rt-list-t", String(Math.min(1, Math.max(0, time))));
    },
    setHighlight(value) {
      for (const [key, row] of rows) row.toggleAttribute("data-highlight", key === value);
      const row = value === null ? undefined : rows.get(value);
      if (!row) return;
      // Within the list only: the pane around it stays where it is.
      const top = row.offsetTop - root.offsetTop;
      if (top < root.scrollTop) root.scrollTop = top;
      else if (top + row.offsetHeight > root.scrollTop + root.clientHeight) {
        root.scrollTop = top + row.offsetHeight - root.clientHeight;
      }
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

// ── Model ─────────────────────────────────────────────────────────────────

let modelIds = 0;

/**
 * Where an AI tool's model stands. Missing, it's a Download button with the
 * size; downloading, the same button fills up, says how much is in and the
 * time left; ready, a quiet line. The info button opens what the model is.
 */
export function createModel(options: UiModelOptions, signal?: AbortSignal): UiModel {
  const listen = signal ? { signal } : undefined;
  const eta = createEta();
  let state: UiModelState | null = null;
  let timeLeft = "";
  let timeLeftAt = Number.NEGATIVE_INFINITY;
  const name = options.name ? ` ${options.name}` : "";

  const fill = h("i", { class: "rt-model__fill", "aria-hidden": "true" });
  const icon = h("span", { class: "rt-model__icon", "aria-hidden": "true" });
  const label = h("span", { class: "rt-model__label" });
  const detail = h("span", { class: "rt-model__detail" });
  const main = h("button", { type: "button", class: "rt-model__main" }, fill, icon, label, detail);
  main.addEventListener(
    "click",
    () => {
      if (state === "missing" || state === "failed") options.onDownload();
    },
    listen,
  );

  const ready = h(
    "span",
    { class: "rt-model__ready" },
    h("span", { class: "rt-model__dot", "aria-hidden": "true" }),
    options.name ? `${options.name} is ready` : "Ready",
  );

  const facts = h("dl", { class: "rt-card__facts" });
  const values = new Map<string, HTMLElement>();
  const setFact = (key: string, value: string): void => {
    const existing = values.get(key);
    if (existing) {
      existing.textContent = value;
      return;
    }
    const dd = h("dd", null, value);
    values.set(key, dd);
    facts.append(h("dt", null, key), dd);
  };
  for (const [key, value] of options.about?.facts ?? []) setFact(key, value);
  const aboutId = `rt-model-about-${++modelIds}`;
  const about = h(
    "div",
    { class: "rt-model__about", id: aboutId },
    ...(options.about?.text ? [h("p", null, options.about.text)] : []),
    facts,
  );
  about.hidden = true;
  const info = h("button", {
    type: "button",
    class: "rt-model__info",
    "aria-expanded": "false",
    "aria-controls": aboutId,
    "aria-label": "About this",
    title: "About this",
  });
  info.innerHTML = ICON_INFO;
  info.addEventListener(
    "click",
    () => {
      about.hidden = !about.hidden;
      info.setAttribute("aria-expanded", String(!about.hidden));
    },
    listen,
  );

  const announcer = h("span", { class: "rt-visually-hidden", "aria-live": "polite" });
  const root = h(
    "div",
    { class: "rt-model" },
    h("div", { class: "rt-model__row" }, main, ready, info),
    about,
    announcer,
  );
  root.hidden = true;

  const size = options.bytes ? formatDownload(options.bytes) : "";

  function paint(next: UiModelState): void {
    const changed = next !== state;
    state = next;
    root.hidden = false;
    root.dataset.state = next;
    main.hidden = next === "ready";
    ready.hidden = next !== "ready";
    // Still focusable while it downloads, so focus doesn't drop to the page.
    main.setAttribute("aria-disabled", String(next === "downloading"));
    if (!changed) return;
    icon.innerHTML = next === "downloading" ? "" : ICON_DOWNLOAD;
    if (next === "missing") {
      label.textContent = `Download${name}`;
      detail.textContent = size;
    } else if (next === "failed") {
      label.textContent = "Try again";
      detail.textContent = "Download failed";
    } else if (next === "downloading") {
      label.textContent = `Downloading${name}`;
      detail.textContent = "";
      fill.style.width = "0%";
      eta.reset();
      timeLeft = "";
      timeLeftAt = Number.NEGATIVE_INFINITY;
    }
    const words = {
      missing: "",
      downloading: `Downloading${name}`,
      ready: options.name ? `${options.name} is ready` : "Ready",
      failed: "Download failed",
    };
    announcer.textContent = words[next];
  }

  return {
    root,
    get state() {
      return state;
    },
    set: (next) => paint(next),
    progress(loaded, total) {
      paint("downloading");
      const whole = total > 0 ? total : (options.bytes ?? 0);
      const known = whole > 0;
      root.classList.toggle("rt-model--unknown", !known);
      fill.style.width = known ? `${Math.min(100, (loaded / whole) * 100)}%` : "";
      const left = eta.push(loaded, whole);
      // Once a second: a time that changes every chunk can't be read.
      const now = performance.now();
      if (left !== null && now - timeLeftAt >= 1000) {
        timeLeft = formatTimeLeft(left);
        timeLeftAt = now;
      }
      // The ring and the fill say it's downloading; the words say how far.
      label.textContent = known ? formatProgress(loaded, whole) : formatDownload(loaded);
      detail.textContent = timeLeft;
    },
    setFact,
  };
}

// ── Status ────────────────────────────────────────────────────────────────

/** A run on one line: working with a bar, done with a check, or failed with why. */
export function createStatus(): UiStatus {
  const mark = h("span", { class: "rt-step__mark", "aria-hidden": "true" });
  const label = h("span", { class: "rt-status__label" });
  const detail = h("span", { class: "rt-step__detail" });
  const fill = h("i");
  const bar = h("span", { class: "rt-step__bar", "aria-hidden": "true" }, fill);
  const announcer = h("span", { class: "rt-visually-hidden", "aria-live": "polite" });
  const root = h("div", { class: "rt-status rt-step" }, mark, label, detail, bar, announcer);
  root.hidden = true;

  function show(
    state: "active" | "done" | "failed",
    text: string,
    note = "",
    progress?: number,
  ): void {
    const changed = root.hidden || root.dataset.state !== state || label.textContent !== text;
    root.hidden = false;
    root.dataset.state = state;
    mark.innerHTML = state === "done" ? ICON_CHECK : state === "failed" ? ICON_CLOSE : "";
    label.textContent = text;
    detail.textContent = note;
    bar.hidden = progress === undefined;
    if (progress !== undefined) {
      fill.style.width = `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
    }
    if (changed) announcer.textContent = text;
  }

  return {
    root,
    working: (text, update = {}) => show("active", text, update.detail, update.progress),
    done: (text, note) => show("done", text, note),
    failed: (text) => show("failed", text),
    clear() {
      root.hidden = true;
      delete root.dataset.state;
      announcer.textContent = "";
    },
  };
}
