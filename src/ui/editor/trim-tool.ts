import type { TrimRange, VideoEdits } from "../../types";
import { formatTime } from "../../utils/video";
import { h } from "../h";
import type { TransportBarHandle } from "./transport-bar";

export interface TrimToolOptions {
  edits: VideoEdits;
  duration: number;
  transport: TransportBarHandle;
}

export interface TrimToolHandle {
  root: HTMLElement;
  getTrim(): TrimRange;
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

  const root = h(
    "div",
    { class: "rt-dock__row rt-trim" },
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
  );

  refresh();

  return {
    root,
    getTrim: () => ({ ...edits.trim }),
    destroy() {
      unsubscribe();
      abort.abort();
    },
  };
}
