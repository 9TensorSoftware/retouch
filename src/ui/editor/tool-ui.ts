import { h } from "../h";
import { refreshRangeFill } from "../range-fill";

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
   * The resting value: the track fills outward from it, and double-clicking
   * the label returns to it. Defaults to 0 when the range spans zero,
   * otherwise `min`.
   */
  neutral?: number;
  /** Readout text. Defaults to the number, signed when the range spans zero. */
  format?: (value: number) => string;
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
  /** A labeled slider with a value readout, a filled track and double-click reset. */
  slider(options: UiSliderOptions): UiSlider;
  /** A pill button. */
  button(options: UiButtonOptions): UiButton;
  /** One of several options, shown as pills. */
  choice<T extends string>(options: UiChoiceOptions<T>): UiChoice<T>;
  /** A line of status or hint text; updates are announced to screen readers. */
  note(text: string): UiNote;
}

/** Listeners are bound to `signal`, so they go away with the editor. */
export function createToolUi(signal?: AbortSignal): ToolUi {
  const listen = signal ? { signal } : undefined;

  return {
    row: (...children) => h("div", { class: "rt-dock__row" }, ...children),

    section: (title, ...children) =>
      h(
        "div",
        { class: "rt-dock__row" },
        h("span", { class: "rt-dock__slider-label rt-dock__row-title" }, title),
        ...children,
      ),

    slider(options) {
      const { label, min, max, onInput, onChange } = options;
      const neutral = options.neutral ?? (min < 0 ? 0 : min);
      const format = options.format ?? ((v: number) => (min < 0 && v > 0 ? `+${v}` : String(v)));
      const input = h("input", {
        type: "range",
        min,
        max,
        step: options.step ?? 1,
        value: options.value,
        "aria-label": label,
      });
      const labelEl = h(
        "span",
        { class: "rt-dock__slider-label", title: "Double-click to reset" },
        label,
      );
      const valueEl = h("span", { class: "rt-dock__slider-value", "aria-hidden": "true" });
      const paint = (): void => {
        const text = format(Number(input.value));
        valueEl.textContent = text;
        input.setAttribute("aria-valuetext", text);
        refreshRangeFill(input, neutral);
      };
      paint();

      input.addEventListener(
        "input",
        () => {
          paint();
          onInput(Number(input.value));
        },
        listen,
      );
      input.addEventListener("change", () => onChange?.(Number(input.value)), listen);
      labelEl.addEventListener(
        "dblclick",
        () => {
          if (Number(input.value) === neutral) return;
          input.value = String(neutral);
          paint();
          onInput(neutral);
          onChange?.(neutral);
        },
        listen,
      );

      return {
        root: h("div", { class: "rt-dock__group rt-dock__slider" }, labelEl, input, valueEl),
        get value() {
          return Number(input.value);
        },
        set(value) {
          input.value = String(value);
          paint();
        },
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
