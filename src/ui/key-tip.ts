import { h } from "./h";

/** Space between a control and its tooltip, as on the rail. */
const GAP = 8;
/** How close a tooltip may come to the edge of the window. */
const EDGE = 8;
/** Where the theme's fonts and colors reach; a tooltip outside them loses both. */
const THEMED = ".rt-editor-overlay, .rt-root";

let open: { tip: HTMLElement; frame: number } | null = null;

function hide(): void {
  if (!open) return;
  cancelAnimationFrame(open.frame);
  open.tip.remove();
  open = null;
}

function show(control: HTMLElement, label: string, key: string): void {
  hide();
  const tip = h("div", { class: "rt-tooltip", role: "tooltip" }, label, h("kbd", null, key));
  (control.closest(THEMED) ?? document.body).appendChild(tip);

  const r = control.getBoundingClientRect();
  const half = tip.offsetWidth / 2;
  const center = Math.min(
    Math.max(r.left + r.width / 2, EDGE + half),
    window.innerWidth - EDGE - half,
  );
  const above = r.top - GAP - tip.offsetHeight >= EDGE;
  tip.dataset.side = above ? "top" : "bottom";
  tip.style.left = `${center}px`;
  tip.style.top = `${above ? r.top - GAP : r.bottom + GAP}px`;

  // A key can hide or remove the control under a resting mouse, and then no
  // pointerleave ever comes to take the tooltip with it.
  const session = { tip, frame: 0 };
  const watch = (): void => {
    if (!control.isConnected || control.getClientRects().length === 0) hide();
    else session.frame = requestAnimationFrame(watch);
  };
  session.frame = requestAnimationFrame(watch);
  open = session;
}

/**
 * The rail's tooltip for a control with a key of its own, where a `title`
 * would be drawn by the browser and show the key as plain text.
 */
export function keyTip(
  control: HTMLElement,
  label: string,
  key: string,
  signal: AbortSignal,
): void {
  control.addEventListener(
    "pointerenter",
    (e) => {
      if (e.pointerType === "mouse") show(control, label, key);
    },
    { signal },
  );
  control.addEventListener("pointerleave", hide, { signal });
  control.addEventListener("pointerdown", hide, { signal });
  control.addEventListener(
    "focus",
    () => {
      if (control.matches(":focus-visible")) show(control, label, key);
    },
    { signal },
  );
  control.addEventListener("blur", hide, { signal });
  signal.addEventListener("abort", hide, { once: true });
}
