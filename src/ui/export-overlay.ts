import { h } from "./h";
import { ICON_CHECK, iconElement } from "./icons";

export interface ExportOverlayItem {
  id: string;
  name: string;
  /** The gallery thumbnail, shown in the grid. */
  thumbnail?: string;
}

export interface ExportOverlayHandle {
  root: HTMLElement;
  /** Put the overlay on the page and move focus to Cancel. */
  attach(): void;
  /** Mark the item exporting now. Its ring spins until progress arrives. */
  setActive(id: string): void;
  setProgress(id: string, progress: number): void;
  setComplete(id: string): void;
  setError(id: string): void;
  /** Show the finished sheet for a moment, then leave. */
  finish(): void;
  destroy(): void;
}

export interface ExportOverlayOptions {
  items: ExportOverlayItem[];
  onCancel: () => void;
}

type ItemState = "waiting" | "active" | "done" | "error";

/** How long the finished sheet stays up, in ms. */
const FINISH_HOLD = 700;

let seq = 0;

/** "About 3 s left", "About 2 min left". */
export function etaText(seconds: number): string {
  if (seconds < 3) return "Almost done";
  if (seconds < 60) return `About ${Math.ceil(seconds)} s left`;
  return `About ${Math.round(seconds / 60)} min left`;
}

/**
 * The export sheet: every file as its thumbnail with a ring that fills as
 * it exports, a check when it's done (or a mark when it failed and the
 * original goes out instead), one bar for the whole run, a time estimate
 * and Cancel.
 */
export function createExportOverlay(options: ExportOverlayOptions): ExportOverlayHandle {
  const abort = new AbortController();
  const total = options.items.length;
  const titleId = `rt-export-title-${++seq}`;
  const plural = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;

  const items = new Map<
    string,
    { el: HTMLElement; ring: SVGCircleElement; state: ItemState; fraction: number }
  >();
  const grid = h("div", { class: "rt-export-overlay__grid" });
  for (const item of options.items) {
    const ext = item.name.split(".").pop()?.toUpperCase() ?? "";
    const picture = item.thumbnail
      ? h("img", { src: item.thumbnail, alt: "", draggable: "false" })
      : h("span", { class: "rt-export-overlay__ext" }, ext);
    const badge = h("span", { class: "rt-export-overlay__badge", "aria-hidden": "true" });
    badge.append(
      iconElement(
        '<svg class="rt-export-overlay__ring" viewBox="0 0 24 24"><circle class="rt-export-overlay__ring-track" cx="12" cy="12" r="9"/><circle class="rt-export-overlay__ring-fill" cx="12" cy="12" r="9" pathLength="100"/></svg>',
      ),
      iconElement(ICON_CHECK),
      h("span", { class: "rt-export-overlay__bang" }, "!"),
    );
    const el = h(
      "div",
      { class: "rt-export-overlay__item rt-export-overlay__item--waiting", title: item.name },
      picture,
      badge,
    );
    const ring = badge.querySelector(".rt-export-overlay__ring-fill") as SVGCircleElement;
    items.set(item.id, { el, ring, state: "waiting", fraction: 0 });
    grid.appendChild(el);
  }

  const title = h(
    "div",
    { class: "rt-export-overlay__title", id: titleId },
    `Exporting ${plural(total)}`,
  );
  const count = h("div", { class: "rt-export-overlay__count" }, `0 of ${total}`);
  const fill = h("div", { class: "rt-export-overlay__fill" });
  const bar = h(
    "div",
    {
      class: "rt-export-overlay__bar",
      role: "progressbar",
      "aria-label": "Export progress",
      "aria-valuemin": 0,
      "aria-valuemax": 100,
      "aria-valuenow": 0,
    },
    fill,
  );
  const eta = h("span", { class: "rt-export-overlay__eta" }, "Starting…");
  const cancelBtn = h("button", { type: "button", class: "rt-export-overlay__cancel" }, "Cancel");
  const cancel = (): void => {
    if (cancelBtn.disabled) return;
    cancelBtn.disabled = true;
    cancelBtn.textContent = "Canceling…";
    options.onCancel();
  };
  cancelBtn.addEventListener("click", cancel, { signal: abort.signal });

  const root = h(
    "div",
    {
      class: "rt-export-overlay",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
    },
    h(
      "div",
      { class: "rt-export-overlay__card" },
      h("div", { class: "rt-export-overlay__head" }, title, count),
      bar,
      grid,
      h("div", { class: "rt-export-overlay__foot" }, eta, cancelBtn),
    ),
  );
  root.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    },
    { signal: abort.signal },
  );

  const started = performance.now();
  let lastEta = 0;
  let returnFocus: HTMLElement | null = null;
  let destroyed = false;

  function set(id: string, state: ItemState, fraction: number): void {
    const item = items.get(id);
    if (!item) return;
    item.state = state;
    item.fraction = fraction;
    item.el.className = `rt-export-overlay__item rt-export-overlay__item--${state}`;
    update();
  }

  function update(): void {
    let sum = 0;
    let finished = 0;
    for (const item of items.values()) {
      sum += item.fraction;
      if (item.state === "done" || item.state === "error") finished++;
    }
    const progress = total > 0 ? sum / total : 1;
    const pct = Math.round(progress * 100);
    fill.style.width = `${pct}%`;
    bar.setAttribute("aria-valuenow", String(pct));
    bar.setAttribute("aria-valuetext", `${finished} of ${plural(total)}`);
    count.textContent = `${finished} of ${total}`;

    // An estimate once there's enough of the run to go on, at most twice a second.
    const now = performance.now();
    const elapsed = (now - started) / 1000;
    if (progress >= 0.05 && elapsed > 0.8 && now - lastEta > 500) {
      lastEta = now;
      eta.textContent = etaText((elapsed * (1 - progress)) / progress);
    }
  }

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    abort.abort();
    root.remove();
    if (returnFocus?.isConnected) returnFocus.focus();
  }

  return {
    root,
    attach() {
      if (root.isConnected || destroyed) return;
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      document.body.appendChild(root);
      cancelBtn.focus();
    },
    setActive(id) {
      const item = items.get(id);
      if (item && item.state === "waiting") set(id, "active", 0);
    },
    setProgress(id, progress) {
      const item = items.get(id);
      if (!item) return;
      const p = Math.min(1, Math.max(0, progress));
      item.el.classList.add("rt-export-overlay__item--measured");
      item.ring.style.strokeDasharray = `${Math.round(p * 100)} 100`;
      if (item.state === "waiting")
        item.el.classList.replace(
          "rt-export-overlay__item--waiting",
          "rt-export-overlay__item--active",
        );
      item.state = "active";
      item.fraction = p;
      update();
    },
    setComplete(id) {
      set(id, "done", 1);
    },
    setError(id) {
      set(id, "error", 1);
    },
    finish() {
      if (destroyed) return;
      if (!root.isConnected) {
        destroy();
        return;
      }
      const failed = [...items.values()].filter((item) => item.state === "error").length;
      title.textContent = `Exported ${plural(total)}`;
      eta.textContent = failed > 0 ? `${failed} sent unedited` : "Done";
      cancelBtn.disabled = true;
      root.classList.add("rt-export-overlay--finished");
      setTimeout(destroy, FINISH_HOLD);
    },
    destroy,
  };
}
