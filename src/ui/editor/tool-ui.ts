import { h } from "../h";
import { createSection, createTiles } from "./controls";
import { createSlider } from "./slider";

type Content = Node | string;

/** Options for `ctx.ui.slider()`. */
export interface UiSliderOptions {
  label: string;
  min: number;
  max: number;
  /** Defaults to 1. */
  step?: number;
  value: number;
  /**
   * The resting value: the track fills outward from it, a dot marks the
   * slider while it's elsewhere, and double-clicking returns to it. Defaults
   * to 0 when the range spans zero, otherwise `min`.
   */
  neutral?: number;
  /**
   * A track that shows what the slider does, as a CSS image — e.g.
   * `"linear-gradient(90deg, #3f86ff, #ffa53a)"` for a cool-to-warm control.
   * Replaces the fill.
   */
  track?: string;
  /** Readout text. Defaults to the number, signed when the range spans zero. */
  format?: (value: number) => string;
  /**
   * Reads a typed value back, the inverse of `format`. Defaults to the first
   * number in the text, so units and signs are fine.
   */
  parse?: (text: string) => number | null;
  /** Fires continuously while the value changes. */
  onInput: (value: number) => void;
  /** Fires once per gesture (release, key press, reset): the place to `record()` history. */
  onChange?: (value: number) => void;
}

export interface UiSlider {
  root: HTMLElement;
  readonly value: number;
  /** Move the slider without firing callbacks, e.g. from your pane's `sync()`. */
  set(value: number): void;
}

/** Options for `ctx.ui.button()`. */
export interface UiButtonOptions {
  label: string;
  onClick: () => void;
  /** "primary" marks the pane's main action. */
  variant?: "default" | "primary";
  /** Give it a pressed state (and make it a toggle for assistive tech). */
  active?: boolean;
  disabled?: boolean;
  /** Tooltip text. */
  title?: string;
}

export interface UiButton {
  root: HTMLButtonElement;
  setLabel(label: string): void;
  setActive(active: boolean): void;
  setDisabled(disabled: boolean): void;
}

/** Options for `ctx.ui.choice()`. */
export interface UiChoiceOptions<T extends string> {
  /** Names the group for assistive tech. */
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export interface UiChoice<T extends string> {
  root: HTMLElement;
  readonly value: T;
  /** Select an option without firing `onChange`. */
  set(value: T): void;
}

export interface UiNote {
  root: HTMLElement;
  set(text: string): void;
}

/** One tile for `ctx.ui.tiles()`. */
export interface UiTileOption<T extends string> {
  value: T;
  label: string;
  /** Image URL shown in the tile — typically `ctx.preview(…)`. */
  preview?: string;
}

/** Options for `ctx.ui.tiles()`. */
export interface UiTilesOptions<T extends string> {
  /** Names the group for assistive tech. */
  label: string;
  options: ReadonlyArray<UiTileOption<T>>;
  /** The pressed tile, or null for none. */
  value: T | null;
  onChange: (value: T) => void;
  /** Tiles per row. Defaults to 3. */
  columns?: number;
}

export interface UiTiles<T extends string> {
  root: HTMLElement;
  readonly value: T | null;
  /** Press a tile (or none) without firing `onChange`. */
  set(value: T | null): void;
  /** Swap a tile's picture, e.g. to redraw previews when your pane opens. */
  setPreview(value: T, src: string): void;
}

/**
 * Builders for custom tool panes, available as `ctx.ui`. What they return
 * looks and behaves like the built-in controls, and keeps doing so as the
 * editor's design changes, so a plugin never has to style anything itself.
 */
export interface ToolUi {
  /** A line of controls. A pane is usually one or more rows. */
  row(...children: Content[]): HTMLElement;
  /** A titled group of controls. */
  section(title: string, ...children: Content[]): HTMLElement;
  /**
   * A labeled slider: filled (or `track`) bar, a value you can type into, a
   * dot while it's off neutral, and double-click to reset.
   */
  slider(options: UiSliderOptions): UiSlider;
  /** A pill button. */
  button(options: UiButtonOptions): UiButton;
  /** One of several options, shown as pills. */
  choice<T extends string>(options: UiChoiceOptions<T>): UiChoice<T>;
  /** A line of status or hint text; updates are announced to screen readers. */
  note(text: string): UiNote;
  /** Preview tiles to choose between, like the built-in Filters. */
  tiles<T extends string>(options: UiTilesOptions<T>): UiTiles<T>;
}

/** Listeners are bound to `signal`, so they go away with the editor. */
export function createToolUi(signal?: AbortSignal): ToolUi {
  const listen = signal ? { signal } : undefined;

  return {
    row: (...children) => h("div", { class: "rt-dock__row" }, ...children),

    section: (title, ...children) => createSection({ title }, ...children).root,

    slider(options) {
      const slider = createSlider(options, signal);
      return {
        root: slider.root,
        get value() {
          return slider.value;
        },
        set: (value) => slider.set(value),
      };
    },

    button(options) {
      const root = h("button", { type: "button", class: "rt-dock__chip" }, options.label);
      if (options.variant === "primary") root.classList.add("rt-dock__chip--primary");
      if (options.title) root.title = options.title;
      root.disabled = options.disabled ?? false;
      const setActive = (active: boolean): void => {
        root.classList.toggle("rt-dock__chip--active", active);
        root.setAttribute("aria-pressed", String(active));
      };
      if (options.active !== undefined) setActive(options.active);
      root.addEventListener("click", () => options.onClick(), listen);
      return {
        root,
        setLabel: (label) => {
          root.textContent = label;
        },
        setActive,
        setDisabled: (disabled) => {
          root.disabled = disabled;
        },
      };
    },

    choice<T extends string>(options: UiChoiceOptions<T>): UiChoice<T> {
      let current = options.value;
      const buttons = new Map<T, HTMLButtonElement>();
      const root = h("div", {
        class: "rt-dock__group",
        role: "group",
        "aria-label": options.label,
      });
      const paint = (): void => {
        for (const [value, btn] of buttons) {
          btn.classList.toggle("rt-dock__chip--active", value === current);
          btn.setAttribute("aria-pressed", String(value === current));
        }
      };
      for (const option of options.options) {
        const btn = h("button", { type: "button", class: "rt-dock__chip" }, option.label);
        btn.addEventListener(
          "click",
          () => {
            if (option.value === current) return;
            current = option.value;
            paint();
            options.onChange(current);
          },
          listen,
        );
        buttons.set(option.value, btn);
        root.appendChild(btn);
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
    },

    tiles: (options) => createTiles(options, signal),

    note(text) {
      const root = h(
        "span",
        { class: "rt-dock__slider-label rt-dock__status", "aria-live": "polite" },
        text,
      );
      return {
        root,
        set: (next) => {
          root.textContent = next;
        },
      };
    },
  };
}
