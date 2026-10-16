import { STACKED_QUERY } from "./layout";

/** The sheet's resting heights: just its header, about half, or most of the screen. */
export type SheetState = "peek" | "half" | "full";

export type SheetSizes = Record<SheetState, number>;

const ORDER: SheetState[] = ["peek", "half", "full"];

/** A release faster than this (px/ms) flings the sheet on to the next height. */
const FLING = 0.45;

/** Movement under this many px is a tap, not a drag. */
const TAP_SLOP = 6;

/**
 * Resting heights for a sheet that shares `shared` px with the stage above
 * it: half is a little under half, and full leaves `minStage` for the stage
 * (by default about a quarter, and never under 120 px).
 */
export function sheetSizes(
  shared: number,
  peek: number,
  minStage = Math.max(120, Math.round(shared * 0.24)),
): SheetSizes {
  const full = Math.max(peek, shared - minStage);
  const half = Math.min(full, Math.max(peek + 96, Math.round(shared * 0.44)));
  return { peek, half, full };
}

/**
 * Where a drag lets go: a fling carries on to the next height in its
 * direction (positive velocity grows the sheet); otherwise the nearest.
 */
export function snapSheet(height: number, velocity: number, sizes: SheetSizes): SheetState {
  if (velocity > FLING) return ORDER.find((s) => sizes[s] > height + 1) ?? "full";
  if (velocity < -FLING) return [...ORDER].reverse().find((s) => sizes[s] < height - 1) ?? "peek";
  let best: SheetState = "half";
  for (const s of ORDER) {
    if (Math.abs(sizes[s] - height) < Math.abs(sizes[best] - height)) best = s;
  }
  return best;
}

export interface SheetOptions {
  /** The panel that becomes the sheet (the inspector). */
  panel: HTMLElement;
  /** The grab bar: drags the sheet, and a tap steps it up. */
  grab: HTMLElement;
  /** The panel's header, which drags the sheet too. */
  head: HTMLElement;
  /** What shares the height with the sheet (the stage column). */
  stage: HTMLElement;
  /** Height in the stage column that can't shrink (a video's transport bar). */
  reserve?: () => number;
  /** After the sheet comes to rest at a new height. */
  onSettle: () => void;
  signal: AbortSignal;
}

export interface SheetHandle {
  /** Whether the layout is stacked, so the panel is a sheet at all. */
  readonly active: boolean;
  /** True while it's dragged or animating to a height. */
  readonly moving: boolean;
  readonly state: SheetState;
  set(state: SheetState): void;
  /** Make sure the controls show: out of peek, if it's there. */
  open(): void;
  /** Fold to just the header, or back up to half. */
  toggle(): void;
}

/**
 * The inspector as a bottom sheet in the stacked (phone and upright tablet)
 * layout. Drag the grab bar or the header between three heights, fling it,
 * or tap the bar to step up. Elsewhere it's left alone as a side panel.
 */
export function createSheet(options: SheetOptions): SheetHandle {
  const { panel, grab, head, stage, signal } = options;
  const media = typeof matchMedia === "function" ? matchMedia(STACKED_QUERY) : null;
  let active = media?.matches ?? false;
  let state: SheetState = "half";
  let moving = false;
  let settleTimer = 0;

  function sizes(): SheetSizes {
    const shared = stage.offsetHeight + panel.offsetHeight;
    const peek = grab.offsetHeight + head.offsetHeight + 4;
    const minStage = Math.max(120, Math.round(shared * 0.24)) + (options.reserve?.() ?? 0);
    return sheetSizes(shared, peek, minStage);
  }

  function label(): void {
    grab.setAttribute(
      "aria-label",
      state === "full" ? "Show less of the controls" : "Show more of the controls",
    );
    grab.setAttribute("aria-expanded", String(state !== "peek"));
  }

  /** Done moving: let the stage refit once, now that its size is final. */
  function settle(): void {
    clearTimeout(settleTimer);
    if (!moving) return;
    moving = false;
    options.onSettle();
  }

  function set(next: SheetState, animate = true): void {
    state = next;
    panel.dataset.sheet = next;
    label();
    if (!active) return;
    const rest = sizes();
    // Not laid out yet (still being built, or hidden): the resize observer comes back.
    if (rest.full <= rest.peek) return;
    const height = `${rest[next]}px`;
    if (panel.style.height === height) {
      settle();
      return;
    }
    moving = true;
    panel.classList.toggle("rt-sheet--instant", !animate);
    panel.style.height = height;
    clearTimeout(settleTimer);
    // transitionend can be skipped (reduced motion, a hidden tab); time it out.
    settleTimer = window.setTimeout(settle, animate ? 400 : 0);
  }

  panel.addEventListener(
    "transitionend",
    (e) => {
      if (e.target === panel && e.propertyName === "height") settle();
    },
    { signal },
  );

  function apply(): void {
    active = media?.matches ?? false;
    panel.classList.toggle("rt-sheet", active);
    if (active) {
      set(state, false);
    } else {
      panel.style.height = "";
      delete panel.dataset.sheet;
    }
  }

  // ── Dragging the grab bar or the header ──

  let drag: {
    id: number;
    startY: number;
    startHeight: number;
    sizes: SheetSizes;
    samples: { t: number; y: number }[];
    moved: boolean;
  } | null = null;
  /** A drag that ends over the grab bar can still fire a click; ignore it for a moment. */
  let ignoreClicksUntil = 0;

  function onDown(e: PointerEvent): void {
    if (!active || drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Buttons in the header (Reset) keep their own clicks; the grab bar is the exception.
    const target = e.target as Element;
    if (target !== grab && target.closest("button, input, a")) return;
    drag = {
      id: e.pointerId,
      startY: e.clientY,
      startHeight: panel.offsetHeight,
      sizes: sizes(),
      samples: [{ t: e.timeStamp, y: e.clientY }],
      moved: false,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // synthetic pointers may not support capture
    }
  }

  function onMove(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < TAP_SLOP) return;
    if (!drag.moved) {
      drag.moved = true;
      moving = true;
      clearTimeout(settleTimer);
      panel.classList.add("rt-sheet--dragging");
    }
    e.preventDefault();
    const { peek, full } = drag.sizes;
    const height = Math.min(full, Math.max(peek, drag.startHeight - dy));
    panel.style.height = `${height}px`;
    drag.samples.push({ t: e.timeStamp, y: e.clientY });
    while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift();
  }

  function onUp(e: PointerEvent): void {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, samples, sizes: rest } = drag;
    drag = null;
    if (!moved) return; // a tap: the click handler has it
    ignoreClicksUntil = performance.now() + 350;
    panel.classList.remove("rt-sheet--dragging");
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = last.t - first.t;
    // Moving the pointer up grows the sheet.
    const velocity = e.type === "pointercancel" || dt <= 0 ? 0 : (first.y - last.y) / dt;
    set(snapSheet(panel.offsetHeight, velocity, rest));
  }

  for (const el of [grab, head]) {
    el.addEventListener("pointerdown", onDown, { signal });
    el.addEventListener("pointermove", onMove, { signal });
    el.addEventListener("pointerup", onUp, { signal });
    el.addEventListener("pointercancel", onUp, { signal });
  }

  // A tap (or Enter/Space) on the grab bar steps the sheet up: peek → half → full → half.
  grab.addEventListener(
    "click",
    () => {
      if (performance.now() < ignoreClicksUntil) return;
      set(state === "half" ? "full" : "half");
    },
    { signal },
  );

  // Tabbing into a folded sheet unfolds it.
  panel.addEventListener(
    "focusin",
    (e) => {
      if (active && state === "peek" && !head.contains(e.target as Node) && e.target !== grab) {
        set("half");
      }
    },
    { signal },
  );

  media?.addEventListener("change", apply, { signal });
  // The space the sheet shares changes when the editor is attached and when
  // the screen turns or resizes; keep the sheet at its height for it.
  if (typeof ResizeObserver !== "undefined" && stage.parentElement) {
    let lastHeight = -1;
    const observer = new ResizeObserver(([entry]) => {
      const height = Math.round(entry.contentRect.height);
      if (height === lastHeight) return;
      lastHeight = height;
      if (active && !drag) set(state, false);
    });
    observer.observe(stage.parentElement);
    signal.addEventListener("abort", () => observer.disconnect());
  }
  signal.addEventListener("abort", () => clearTimeout(settleTimer));
  label();
  apply();

  return {
    get active() {
      return active;
    },
    get moving() {
      return moving;
    },
    get state() {
      return state;
    },
    set,
    open() {
      if (active && state === "peek") set("half");
    },
    toggle() {
      if (active) set(state === "peek" ? "half" : "peek");
    },
  };
}
