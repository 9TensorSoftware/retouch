import { h } from "../h";
import type { CanvasRenderer } from "./canvas-renderer";

export interface CompareSplitOptions {
  /** The canvas container; the divider lives inside it, so it zooms and pans with the photo. */
  container: HTMLElement;
  renderer: CanvasRenderer;
  signal: AbortSignal;
}

export interface CompareSplitHandle {
  root: HTMLElement;
  /** Show the divider (and the renderer's "before" side), or hide both. */
  setVisible(visible: boolean): void;
  readonly fraction: number;
}

/** Arrow-key step, as a fraction of the width (Shift: five times as far). */
const KEY_STEP = 0.02;

/**
 * The before/after divider: a line across the photo with a grip you drag
 * (or move with the arrow keys). Left of it the renderer draws the photo
 * without its look edits; right of it, as edited.
 */
export function createCompareSplit(options: CompareSplitOptions): CompareSplitHandle {
  const { container, renderer, signal } = options;
  let fraction = 0.5;
  let visible = false;

  const grip = h("button", {
    type: "button",
    class: "rt-split__grip",
    role: "slider",
    "aria-label": "Before and after divider",
    "aria-valuemin": 0,
    "aria-valuemax": 100,
  });
  grip.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7l-4 5 4 5M15 7l4 5-4 5"/></svg>';
  const line = h("div", { class: "rt-split__line" }, grip);
  const root = h(
    "div",
    { class: "rt-split" },
    h("span", { class: "rt-split__tag rt-split__tag--before", "aria-hidden": "true" }, "Before"),
    h("span", { class: "rt-split__tag rt-split__tag--after", "aria-hidden": "true" }, "After"),
    line,
  );
  root.hidden = true;
  container.appendChild(root);

  function set(next: number): void {
    fraction = Math.min(1, Math.max(0, next));
    root.style.setProperty("--rt-split", `${fraction * 100}%`);
    const percent = Math.round(fraction * 100);
    grip.setAttribute("aria-valuenow", String(percent));
    grip.setAttribute("aria-valuetext", `${percent}% before, ${100 - percent}% after`);
    if (visible) renderer.setSplit(fraction);
  }
  set(fraction);

  let drag: number | null = null;
  const fromPointer = (e: PointerEvent): number => {
    // The canvas's own box: it already includes any zoom and pan.
    const rect = renderer.getCanvasElement().getBoundingClientRect();
    return rect.width > 0 ? (e.clientX - rect.left) / rect.width : fraction;
  };
  line.addEventListener(
    "pointerdown",
    (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      drag = e.pointerId;
      grip.focus({ preventScroll: true });
      try {
        line.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers can't be captured
      }
      root.classList.add("rt-split--dragging");
    },
    { signal },
  );
  line.addEventListener(
    "pointermove",
    (e) => {
      if (drag === e.pointerId) set(fromPointer(e));
    },
    { signal },
  );
  const end = (e: PointerEvent): void => {
    if (drag !== e.pointerId) return;
    drag = null;
    root.classList.remove("rt-split--dragging");
  };
  line.addEventListener("pointerup", end, { signal });
  line.addEventListener("pointercancel", end, { signal });

  grip.addEventListener(
    "keydown",
    (e) => {
      const step = KEY_STEP * (e.shiftKey ? 5 : 1);
      const keys: Record<string, number> = {
        ArrowLeft: fraction - step,
        ArrowDown: fraction - step,
        ArrowRight: fraction + step,
        ArrowUp: fraction + step,
        Home: 0,
        End: 1,
      };
      if (!(e.key in keys)) return;
      e.preventDefault();
      e.stopPropagation();
      set(keys[e.key]);
    },
    { signal },
  );

  return {
    root,
    setVisible(next) {
      visible = next;
      root.hidden = !next;
      renderer.setSplit(next ? fraction : null);
    },
    get fraction() {
      return fraction;
    },
  };
}
