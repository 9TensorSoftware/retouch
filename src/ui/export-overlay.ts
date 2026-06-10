import { h } from "./h";

export interface ExportOverlayItem {
  id: string;
  name: string;
}

export interface ExportOverlayHandle {
  root: HTMLElement;
  setProgress(id: string, progress: number): void;
  setComplete(id: string): void;
  setError(id: string): void;
  destroy(): void;
}

export interface ExportOverlayOptions {
  items: ExportOverlayItem[];
  onCancel: () => void;
}

/** Modal progress card shown while exports (videos take a while) run. */
export function createExportOverlay(options: ExportOverlayOptions): ExportOverlayHandle {
  const abort = new AbortController();
  const rows = new Map<string, { fill: HTMLElement; pct: HTMLElement }>();

  const list = h("div");
  for (const item of options.items) {
    const pct = h("span", { class: "rt-export-overlay__pct" }, "0%");
    const fill = h("div", { class: "rt-export-overlay__fill" });
    const row = h(
      "div",
      { class: "rt-export-overlay__row" },
      h("div", { class: "rt-export-overlay__name" }, h("span", null, item.name), pct),
      h("div", { class: "rt-export-overlay__bar" }, fill),
    );
    rows.set(item.id, { fill, pct });
    list.appendChild(row);
  }

  const cancelBtn = h("button", { class: "rt-export-overlay__cancel" }, "Cancel");
  cancelBtn.addEventListener("click", () => options.onCancel(), { signal: abort.signal });

  const root = h(
    "div",
    { class: "rt-export-overlay", role: "dialog", "aria-label": "Exporting" },
    h(
      "div",
      { class: "rt-export-overlay__card" },
      h("div", { class: "rt-export-overlay__title" }, "Exporting…"),
      list,
      cancelBtn,
    ),
  );

  return {
    root,
    setProgress(id, progress) {
      const row = rows.get(id);
      if (!row) return;
      const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
      row.fill.style.width = `${pct}%`;
      row.pct.textContent = `${pct}%`;
    },
    setComplete(id) {
      const row = rows.get(id);
      if (!row) return;
      row.fill.style.width = "100%";
      row.pct.textContent = "Done";
    },
    setError(id) {
      const row = rows.get(id);
      if (!row) return;
      row.fill.classList.add("rt-export-overlay__fill--error");
      row.fill.style.width = "100%";
      row.pct.textContent = "Failed";
    },
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
