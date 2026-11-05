import { h } from "../h";
import { ICON_CROSSHAIR } from "../icons";

const GUIDES_KEY = "rt-pixel-guides";
/** Between the cursor and the position beside it. */
const READOUT_GAP = 14;

/** Whether the crosshair shows; every zoom bar's button flips the same switch. */
export interface GuidesSwitch {
  readonly on: boolean;
  /** A button for a zoom bar, showing and flipping the switch. */
  button(signal: AbortSignal): HTMLButtonElement;
  /** Hear flips, until the signal aborts. */
  listen(listener: () => void, signal: AbortSignal): void;
}

/** On until this browser's user turns it off, and remembered (if storage allows). */
export function createGuidesSwitch(): GuidesSwitch {
  let on = true;
  try {
    on = localStorage.getItem(GUIDES_KEY) !== "off";
  } catch {
    // Storage unavailable: the pick lasts for this editor only.
  }
  const listeners = new Set<() => void>();

  function listen(listener: () => void, signal: AbortSignal): void {
    listeners.add(listener);
    signal.addEventListener("abort", () => listeners.delete(listener), { once: true });
  }

  function flip(): void {
    on = !on;
    try {
      localStorage.setItem(GUIDES_KEY, on ? "on" : "off");
    } catch {
      // As above.
    }
    for (const listener of listeners) listener();
  }

  return {
    get on() {
      return on;
    },
    listen,
    button(signal) {
      const button = h("button", {
        type: "button",
        class: "rt-zoom__btn rt-zoom__guides",
        "aria-label": "Crosshair and pixel position",
        title: "Crosshair and pixel position",
      });
      button.innerHTML = ICON_CROSSHAIR;
      const sync = (): void => button.setAttribute("aria-pressed", String(on));
      sync();
      listen(sync, signal);
      button.addEventListener("click", flip, { signal });
      return button;
    },
  };
}

/** The whole pixel at a point inside `box`, or null off it. Pixels count from 0. */
export function pixelAt(
  point: { x: number; y: number },
  box: { left: number; top: number; width: number; height: number },
  pixels: { width: number; height: number },
): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const u = (point.x - box.left) / box.width;
  const v = (point.y - box.top) / box.height;
  if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
  return { x: Math.floor(u * pixels.width), y: Math.floor(v * pixels.height) };
}

export interface PixelGuidesOptions {
  /** Where the mouse is heard. */
  area: HTMLElement;
  /** What the lines span and are clipped to. */
  host: () => HTMLElement;
  /** The photo as shown, zoom and pan included. */
  photo: () => HTMLElement;
  /** The size of the photo the position counts in. */
  pixels: () => { width: number; height: number };
  /** Over these the guides stand aside. */
  ignore?: string;
  control: GuidesSwitch;
  signal: AbortSignal;
}

export interface PixelGuides {
  /** Measure again: the photo moved under a still mouse. */
  refresh(): void;
}

/**
 * Lines across the stage through the mouse, and which pixel of the photo it's
 * on, while it's on the photo. They count in the photo as it'll come out:
 * crop, turns and all.
 */
export function createPixelGuides(options: PixelGuidesOptions): PixelGuides {
  const { area, signal, control } = options;
  const across = h("div", { class: "rt-guides__line rt-guides__line--across" });
  const down = h("div", { class: "rt-guides__line rt-guides__line--down" });
  const readout = h("div", { class: "rt-guides__readout" });
  const root = h("div", { class: "rt-guides", "aria-hidden": "true" }, across, down, readout);

  let mouse: { x: number; y: number } | null = null;

  function hide(): void {
    root.remove();
  }

  function refresh(): void {
    const at =
      mouse && control.on && !area.classList.contains("rt-stage--panning")
        ? pixelAt(mouse, options.photo().getBoundingClientRect(), options.pixels())
        : null;
    if (!mouse || !at) {
      hide();
      return;
    }
    const host = options.host();
    if (root.parentElement !== host) host.appendChild(root);
    const box = host.getBoundingClientRect();
    const x = mouse.x - box.left;
    const y = mouse.y - box.top;
    across.style.transform = `translateY(${y}px)`;
    down.style.transform = `translateX(${x}px)`;
    readout.textContent = `${at.x}, ${at.y}`;
    // Beside the cursor, on whichever side has the room.
    const left = x + READOUT_GAP + readout.offsetWidth > box.width;
    const up = y + READOUT_GAP + readout.offsetHeight > box.height;
    readout.style.transform = `translate(${left ? `calc(${x - READOUT_GAP}px - 100%)` : `${x + READOUT_GAP}px`}, ${up ? `calc(${y - READOUT_GAP}px - 100%)` : `${y + READOUT_GAP}px`})`;
  }

  area.addEventListener(
    "pointermove",
    (e) => {
      const away =
        e.pointerType === "touch" ||
        (options.ignore && (e.target as Element).closest(options.ignore));
      mouse = away ? null : { x: e.clientX, y: e.clientY };
      refresh();
    },
    { capture: true, signal },
  );
  area.addEventListener(
    "pointerleave",
    () => {
      mouse = null;
      hide();
    },
    { signal },
  );
  control.listen(refresh, signal);
  signal.addEventListener("abort", hide, { once: true });

  return { refresh };
}
