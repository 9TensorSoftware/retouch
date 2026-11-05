import type { Point } from "../../utils/framing";
import { h } from "../h";
import { createPixelGuides, type GuidesSwitch } from "./pixel-guides";
import { createStageView, type StageRenderer, type StageView } from "./stage-view";

/** The longest side the original is drawn at, however far it's zoomed. */
const MAX_SIDE = 8192;

const SVG_NS = "http://www.w3.org/2000/svg";

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
  /** Trace where the result comes from, in fractions of the original; null for nothing. */
  setOutline(points: Point[] | null): void;
}

/**
 * The result's edge over the original, with what it left out dimmed. It's
 * drawn over the pane rather than inside the zoomed canvas, so the line stays
 * the same weight at any zoom; the inner svg clips it to the photo.
 */
function createOutline(content: HTMLElement, canvas: HTMLElement) {
  const root = document.createElementNS(SVG_NS, "svg");
  const photo = document.createElementNS(SVG_NS, "svg");
  const dim = document.createElementNS(SVG_NS, "path");
  const edge = document.createElementNS(SVG_NS, "path");
  root.setAttribute("class", "rt-outline");
  root.setAttribute("aria-hidden", "true");
  dim.setAttribute("class", "rt-outline__dim");
  edge.setAttribute("class", "rt-outline__edge");
  photo.append(dim, edge);
  root.append(photo);
  content.append(root);

  let points: Point[] | null = null;

  function draw(): void {
    root.style.display = points ? "" : "none";
    if (!points) return;
    const box = content.getBoundingClientRect();
    const shown = canvas.getBoundingClientRect();
    photo.setAttribute("x", String(shown.left - box.left));
    photo.setAttribute("y", String(shown.top - box.top));
    photo.setAttribute("width", String(shown.width));
    photo.setAttribute("height", String(shown.height));
    const line = `M${points.map((p) => `${p.x * shown.width} ${p.y * shown.height}`).join("L")}Z`;
    dim.setAttribute("d", `M0 0H${shown.width}V${shown.height}H0Z${line}`);
    edge.setAttribute("d", line);
  }

  return {
    draw,
    set(next: Point[] | null) {
      points = next;
      draw();
    },
  };
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
  const outline = createOutline(content, canvas);

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
    onChange: () => {
      guides.refresh();
      outline.draw();
    },
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

  return { pane, stage, render: () => renderer.render(), setOutline: outline.set };
}
