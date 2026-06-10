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

  const inValue = h("span", { class: "rt-props__slider-value rt-props__trim-value" });
  const outValue = h("span", { class: "rt-props__slider-value rt-props__trim-value" });
  const lengthValue = h("span", { class: "rt-props__slider-value rt-props__trim-value" });

  function refresh(): void {
    inValue.textContent = formatTime(edits.trim.start);
    outValue.textContent = formatTime(edits.trim.end);
    lengthValue.textContent = formatTime(edits.trim.end - edits.trim.start);
  }

  const unsubscribe = transport.onTrimChange(refresh);

  const resetBtn = h("button", { class: "rt-props__aspect-btn" }, "Reset trim");
  resetBtn.addEventListener(
    "click",
    () => {
      transport.setTrim({ start: 0, end: duration });
    },
    { signal },
  );

  const row = (label: string, value: HTMLElement) =>
    h(
      "div",
      { class: "rt-props__row rt-props__trim-row" },
      h("div", { class: "rt-props__label" }, label),
      value,
    );

  const root = h(
    "div",
    null,
    h("div", { class: "rt-props__title" }, "Trim"),
    row("In", inValue),
    row("Out", outValue),
    row("Length", lengthValue),
    h("div", { class: "rt-props__row" }, resetBtn),
    h(
      "div",
      { class: "rt-props__hint" },
      "Drag the handles on the filmstrip. Arrow keys nudge by 0.1s, Shift for 1s.",
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
