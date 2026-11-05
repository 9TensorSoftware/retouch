import { h } from "../h";
import { createPixelGuides, type GuidesSwitch } from "./pixel-guides";
import { createStageView, type StageRenderer, type StageView } from "./stage-view";

/** The longest side the original is drawn at, however far it's zoomed. */
const MAX_SIDE = 8192;

export interface BeforeViewOptions {
  /** The photo as it was, before any edits. */
  source: HTMLImageElement;
  guides: GuidesSwitch;
  /** After someone zooms or moves this pane. */
  onView: () => void;
  signal: AbortSignal;
}

export interface BeforeView {
  pane: HTMLElement;
  stage: StageView;
  /** Fit the original to the pane, as it stands now. */
  render(): void;
}

/**
 * Side by side's left pane: the original, with a stage of its own to zoom and
 * move it. It's drawn only as sharp as it's shown, so it stays cheap until
 * someone zooms in; the edits never touch it, so it needs no renderer's passes.
 */
export function createBeforeView(options: BeforeViewOptions): BeforeView {
  const { source, signal } = options;
  const width = Math.max(1, source.naturalWidth);
  const height = Math.max(1, source.naturalHeight);
  const canvas = document.createElement("canvas");
  const content = h("div", { class: "rt-editor__pane-content" }, canvas);
  const pane = h(
    "div",
    { class: "rt-editor__canvas-pane rt-compare-pane" },
    h("div", { class: "rt-compare-header" }, "Original"),
    content,
  );

  let fit = 1;
  let viewZoom = 1;
  /** Canvas pixels per source pixel, so far. */
  let drawn = 0;
  let listener: (() => void) | null = null;

  const wanted = (): number =>
    Math.min(
      1,
      MAX_SIDE / Math.max(width, height),
      fit * viewZoom * (window.devicePixelRatio || 1),
    );

  const renderer: StageRenderer = {
    getViewScales: () => ({ fit, draw: fit }),
    getImageRect: () => ({ x: 0, y: 0, width: width * fit, height: height * fit }),
    setViewZoom(zoom) {
      viewZoom = zoom;
      return wanted() > drawn;
    },
    setScreenScale() {},
    onRender(next) {
      listener = next;
    },
    render() {
      // The same margin the renderer gives the edited side.
      const availWidth = content.clientWidth || 800;
      const availHeight = content.clientHeight || 600;
      fit = Math.min((availWidth * 0.9) / width, (availHeight * 0.9) / height, 1);
      canvas.style.width = `${Math.round(width * fit)}px`;
      canvas.style.height = `${Math.round(height * fit)}px`;
      const scale = wanted();
      if (scale > drawn) {
        drawn = scale;
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        }
      }
      listener?.();
    },
  };

  const guides = createPixelGuides({
    area: content,
    host: () => content,
    photo: () => canvas,
    pixels: () => ({ width, height }),
    control: options.guides,
    signal,
  });
  const stage = createStageView({
    area: content,
    target: canvas,
    renderer,
    spacePan: true,
    onChange: () => guides.refresh(),
    onView: options.onView,
    signal,
  });
  stage.root.classList.add("rt-zoom--before");
  stage.root.appendChild(options.guides.button(signal));

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => renderer.render());
    observer.observe(content);
    signal.addEventListener("abort", () => observer.disconnect(), { once: true });
  }

  return { pane, stage, render: () => renderer.render() };
}
