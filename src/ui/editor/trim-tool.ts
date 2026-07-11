import type { TrimRange, VideoEdits } from "../../types";
import { formatTime } from "../../utils/video";
import { h } from "../h";
import type { TransportBarHandle } from "./transport-bar";

export interface TrimToolOptions {
  edits: VideoEdits;
  duration: number;
  transport: TransportBarHandle;
  /** Deflicker toggle changed (export-time smoothing). */
  onDeflickerChange: (deflicker: boolean) => void;
  /** Export the trimmed range as a GIF; resolves when the download starts. */
  onExportGif?: (loop: "forward" | "reverse" | "boomerang") => Promise<void>;
}

export interface TrimToolHandle {
  root: HTMLElement;
  getTrim(): TrimRange;
  /** Sync the deflicker chip after an external change (does not fire onDeflickerChange). */
  setDeflicker(deflicker: boolean): void;
  destroy(): void;
}

/**
 * Panel section for the Trim tool. The draggable in/out handles live on the
 * transport bar's filmstrip; this section shows the numbers and hosts Reset.
 */
export function createTrimTool(options: TrimToolOptions): TrimToolHandle {
  const { edits, duration, transport } = options;
  const abort = new AbortController();
  const signal = abort.signal;

  const inValue = h("span", { class: "rt-dock__stat-value" });
  const outValue = h("span", { class: "rt-dock__stat-value" });
  const lengthValue = h("span", { class: "rt-dock__stat-value" });

  function refresh(): void {
    inValue.textContent = formatTime(edits.trim.start);
    outValue.textContent = formatTime(edits.trim.end);
    lengthValue.textContent = formatTime(edits.trim.end - edits.trim.start);
  }

  const unsubscribe = transport.onTrimChange(refresh);

  const resetBtn = h("button", { class: "rt-dock__chip" }, "Reset trim");
  resetBtn.addEventListener(
    "click",
    () => {
      transport.setTrim({ start: 0, end: duration });
    },
    { signal },
  );

  const stat = (label: string, value: HTMLElement) =>
    h("div", { class: "rt-dock__stat" }, h("span", { class: "rt-dock__stat-label" }, label), value);

  // ── Row 2: deflicker + GIF-of-range export ──

  const deflickerBtn = h(
    "button",
    {
      class: `rt-dock__chip${edits.deflicker ? " rt-dock__chip--active" : ""}`,
      title: "Smooth frame-to-frame brightness flicker (applied on export)",
    },
    "Deflicker",
  );
  deflickerBtn.addEventListener(
    "click",
    () => {
      const next = !deflickerBtn.classList.contains("rt-dock__chip--active");
      deflickerBtn.classList.toggle("rt-dock__chip--active", next);
      options.onDeflickerChange(next);
    },
    { signal },
  );

  let gifLoop: "forward" | "reverse" | "boomerang" = "forward";
  const loopChips = new Map<string, HTMLElement>();
  const loopGroup = h("div", { class: "rt-dock__group" });
  for (const mode of ["forward", "reverse", "boomerang"] as const) {
    const chip = h(
      "button",
      { class: `rt-dock__chip${mode === gifLoop ? " rt-dock__chip--active" : ""}` },
      mode === "forward" ? "Forward" : mode === "reverse" ? "Reverse" : "Boomerang",
    );
    chip.addEventListener(
      "click",
      () => {
        loopChips.get(gifLoop)?.classList.remove("rt-dock__chip--active");
        gifLoop = mode;
        loopChips.get(gifLoop)?.classList.add("rt-dock__chip--active");
      },
      { signal },
    );
    loopChips.set(mode, chip);
    loopGroup.appendChild(chip);
  }

  const gifBtn = h(
    "button",
    { class: "rt-dock__chip rt-dock__chip--primary", title: "Export the trimmed range as a GIF" },
    "Export GIF",
  );
  gifBtn.addEventListener(
    "click",
    () => {
      if (!options.onExportGif || gifBtn.hasAttribute("disabled")) return;
      gifBtn.setAttribute("disabled", "");
      gifBtn.textContent = "Encoding…";
      options
        .onExportGif(gifLoop)
        .catch(() => {
          gifBtn.textContent = "GIF failed";
        })
        .then(() => {
          window.setTimeout(() => {
            gifBtn.textContent = "Export GIF";
            gifBtn.removeAttribute("disabled");
          }, 800);
        });
    },
    { signal },
  );

  const gifRow = options.onExportGif
    ? h(
        "div",
        { class: "rt-dock__row" },
        deflickerBtn,
        h("div", { class: "rt-dock__divider" }),
        gifBtn,
        loopGroup,
      )
    : h("div", { class: "rt-dock__row" }, deflickerBtn);

  const root = h(
    "div",
    { class: "rt-dock__stack rt-trim" },
    h(
      "div",
      { class: "rt-dock__row" },
      stat("In", inValue),
      stat("Out", outValue),
      stat("Length", lengthValue),
      h("div", { class: "rt-dock__divider" }),
      resetBtn,
      h(
        "span",
        { class: "rt-dock__hint" },
        "Drag the handles on the filmstrip · arrows nudge 0.1s, Shift 1s",
      ),
    ),
    gifRow,
  );

  refresh();

  return {
    root,
    getTrim: () => ({ ...edits.trim }),
    setDeflicker(deflicker) {
      deflickerBtn.classList.toggle("rt-dock__chip--active", deflicker);
    },
    destroy() {
      unsubscribe();
      abort.abort();
    },
  };
}
