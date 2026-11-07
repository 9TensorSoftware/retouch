import { h } from "../h";
import { createList } from "./controls";
import { STAGE_BACKGROUND } from "./stage-view";
import type { UiListItem } from "./tool-ui";

const SVG_NS = "http://www.w3.org/2000/svg";
/** A press that travels this far (px) was a pan, not a click. */
const CLICK_SLOP_PX = 4;
/** Between one finding and the next as a fresh run's arrive. */
const STAGGER_MS = 70;

/** A point on the source frame, each axis from 0 to 1. */
export type LayerPoint = readonly [x: number, y: number];

/** One thing on the layer, at this moment. */
export interface LayerObject<T extends string = string> {
  /** Its row's `value`, when it has one. */
  id: T;
  /** Its corners on the source frame, clockwise from top-left. */
  quad: readonly LayerPoint[];
  /** Any CSS color. */
  color: string;
  /** A name flag at its top-left corner. */
  tag?: string;
  /** Where it has been, oldest first, drawn as a dotted line. */
  trail?: readonly LayerPoint[];
}

/** The part of the source frame on screen, each from 0 to 1. */
export interface LayerFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ObjectLayerOptions<T extends string = string> {
  /** Names the rows for assistive tech. */
  label: string;
  /** Rows, if they're known up front; `setItems()` replaces them. */
  items?: ReadonlyArray<UiListItem<T>>;
  /** The pick changed, by a click on the photo or a row. Null lets go. */
  onSelect?: (id: T | null, from: "layer" | "list") => void;
}

/** `ctx.objects()`: things found in the media, on a layer of their own over it. */
export interface ObjectLayer<T extends string = string> {
  /** The rows, to place in the pane. Optional: the layer works without them. */
  list: HTMLElement;
  /** Replace the rows. The pick is kept if its row still exists. */
  setItems(items: ReadonlyArray<UiListItem<T>>): void;
  /** Light the rows that are current, such as what's in the frame now. */
  setCurrent(ids: Iterable<T>): void;
  /** A playhead across the rows' spans, from 0 to 1; null hides it. */
  setTime(time: number | null): void;
  /** What's on the layer now. Call it per frame for video: same ids, new places. */
  show(objects: ReadonlyArray<LayerObject<T>>, options?: { animate?: boolean }): void;
  /** The picked object, or null. */
  readonly selected: T | null;
  /** Pick one, or none, without firing `onSelect`. */
  select(id: T | null): void;
  /** The part of the frame on screen, usually the crop. Null hides the layer. */
  setFrame(frame: LayerFrame | null): void;
  /** Off while the tool is away. The layer starts off. */
  setVisible(visible: boolean): void;
  destroy(): void;
}

interface Shape {
  polygon: SVGPolygonElement;
  trail: SVGPolylineElement;
  tag: HTMLElement | null;
  area: number;
  /** The flag's size in layer px, once measured. */
  tagSize: { width: number; height: number } | null;
}

/** Shoelace area, in frame units: smaller objects sit on top, so they can be reached. */
function areaOf(quad: readonly LayerPoint[]): number {
  let twice = 0;
  for (let i = 0; i < quad.length; i++) {
    const [ax, ay] = quad[i];
    const [bx, by] = quad[(i + 1) % quad.length];
    twice += ax * by - bx * ay;
  }
  return Math.abs(twice) / 2;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

const points = (list: readonly LayerPoint[]): string => list.map(([x, y]) => `${x},${y}`).join(" ");

export interface ObjectLayerContext {
  /** Hosts the layer: the same size as the media on screen. */
  host: () => HTMLElement | null;
  /** The stage, where clicks on the bare photo are heard. */
  area: HTMLElement;
  signal: AbortSignal;
}

/**
 * What a model found, kept apart from the pixels: an SVG of shapes over the
 * media, its flags, and the rows that list the same things. Pointing at a
 * shape or a row brings it forward and dims the rest. Clicking picks it,
 * and clicking again, on the bare photo, or Esc lets go. Hovering outranks
 * the pick, which comes back when the pointer leaves.
 */
export function createObjectLayer<T extends string = string>(
  options: ObjectLayerOptions<T>,
  context: ObjectLayerContext,
): ObjectLayer<T> {
  const { area } = context;
  const abort = new AbortController();
  const { signal } = abort;
  context.signal.addEventListener("abort", () => abort.abort(), { once: true, signal });

  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "rt-objects__marks");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("viewBox", "0 0 1 1");
  svg.setAttribute("aria-hidden", "true");
  const trails = document.createElementNS(SVG_NS, "g");
  const polygons = document.createElementNS(SVG_NS, "g");
  svg.append(trails, polygons);
  const tags = h("div", { class: "rt-objects__tags", "aria-hidden": "true" });
  const root = h("div", { class: "rt-objects" });
  root.append(svg, tags);
  root.hidden = true;
  context.host()?.appendChild(root);

  const shapes = new Map<T, Shape>();
  let current: ReadonlyArray<LayerObject<T>> = [];
  let selected: T | null = null;
  let hovered: T | null = null;
  /** Whether `hovered` came from a shape, which can leave the frame under a still mouse. */
  let hoveredShape = false;
  let frame: LayerFrame | null = { x: 0, y: 0, width: 1, height: 1 };
  let visible = false;
  let down: { x: number; y: number } | null = null;

  const list = createList<T>(
    {
      label: options.label,
      items: options.items ?? [],
      onChange: (value) => {
        selected = value;
        focus();
        options.onSelect?.(value, "list");
      },
      onHover: (value) => hover(value, false),
    },
    signal,
  );

  function focus(): void {
    const id = hovered ?? selected;
    // Only dim for something on the layer: a track that's left the frame has nothing to show.
    root.toggleAttribute("data-focus", id !== null && shapes.has(id));
    for (const [key, shape] of shapes) {
      const on = key === id;
      shape.polygon.classList.toggle("is-focus", on);
      shape.polygon.classList.toggle("is-selected", key === selected);
      shape.trail.classList.toggle("is-focus", on);
      shape.tag?.classList.toggle("is-focus", on);
    }
    list.setHighlight(hoveredShape ? hovered : null);
  }

  function hover(id: T | null, fromShape: boolean): void {
    hovered = id;
    hoveredShape = id !== null && fromShape;
    focus();
  }

  function pick(id: T | null): void {
    selected = id;
    list.set(id);
    focus();
    options.onSelect?.(id, "layer");
  }

  /** A click, unless the press wandered off and panned the photo instead. */
  function isClick(e: MouseEvent): boolean {
    return !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) < CLICK_SLOP_PX;
  }

  function create(object: LayerObject<T>): Shape {
    const polygon = document.createElementNS(SVG_NS, "polygon");
    polygon.setAttribute("class", "rt-objects__shape");
    polygon.setAttribute("vector-effect", "non-scaling-stroke");
    polygon.addEventListener("pointerenter", () => hover(object.id, true), { signal });
    polygon.addEventListener("pointerleave", () => hover(null, false), { signal });
    polygon.addEventListener(
      "click",
      (e) => {
        if (isClick(e)) pick(selected === object.id ? null : object.id);
      },
      { signal },
    );
    const trail = document.createElementNS(SVG_NS, "polyline");
    trail.setAttribute("class", "rt-objects__trail");
    trail.setAttribute("vector-effect", "non-scaling-stroke");
    trails.append(trail);

    const area = areaOf(object.quad);
    // Biggest first, so a person's backpack stays reachable inside the person.
    const smaller = [...shapes.values()].find((shape) => shape.area < area);
    polygons.insertBefore(polygon, smaller?.polygon ?? null);

    const tag = object.tag ? h("span", { class: "rt-objects__tag" }, object.tag) : null;
    if (tag) tags.append(tag);
    return { polygon, trail, tag, area, tagSize: null };
  }

  /** Flags sit above their box, turned inward where that would leave the frame. */
  function placeTag(shape: Shape, object: LayerObject<T>): void {
    const { tag } = shape;
    if (!tag || !frame) return;
    const view = frame;
    const xs = object.quad.map((p) => (p[0] - view.x) / view.width);
    const ys = object.quad.map((p) => (p[1] - view.y) / view.height);
    const gone =
      Math.max(...xs) <= 0 || Math.min(...xs) >= 1 || Math.max(...ys) <= 0 || Math.min(...ys) >= 1;
    tag.hidden = gone;
    if (gone) return;
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (!shape.tagSize && tag.offsetWidth > 0) {
      shape.tagSize = { width: tag.offsetWidth, height: tag.offsetHeight };
    }
    const scale = viewScale();
    const tagWidth = (shape.tagSize?.width ?? 0) / scale;
    const tagHeight = (shape.tagSize?.height ?? 0) / scale;
    const maxX = width > 0 ? Math.max(0, 1 - tagWidth / width) : 1;
    const [x, y] = [xs[0], ys[0]];
    tag.toggleAttribute("data-inside", height > 0 && y < tagHeight / height);
    tag.style.left = `${clamp(x, 0, maxX) * 100}%`;
    tag.style.top = `${clamp(y, 0, 1) * 100}%`;
  }

  function viewScale(): number {
    const raw = getComputedStyle(root).getPropertyValue("--rt-view-scale");
    return Number.parseFloat(raw) || 1;
  }

  function place(): void {
    for (const object of current) {
      const shape = shapes.get(object.id);
      if (shape) placeTag(shape, object);
    }
  }

  function syncShown(): void {
    root.hidden = !visible || !frame;
    if (root.hidden && hovered !== null) hover(null, false);
    if (!root.hidden) place();
  }

  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (!root.hidden) place();
        })
      : null;
  observer?.observe(root);

  // Clicks on the bare photo let go. Heard from the stage, in the capture
  // phase: a zoomed stage keeps the press from going any further.
  area.addEventListener(
    "pointerdown",
    (e) => {
      down = { x: e.clientX, y: e.clientY };
    },
    { capture: true, signal },
  );
  area.addEventListener(
    "click",
    (e) => {
      if (root.hidden || selected === null || !isClick(e)) return;
      const over = e.target as Element;
      if (over.matches(STAGE_BACKGROUND) && !over.closest(".rt-objects__shape")) pick(null);
    },
    { signal },
  );
  // Before the editor's own Esc, which would close it.
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape" || root.hidden || selected === null) return;
      const over = e.target instanceof Element ? e.target : null;
      if (over?.closest('input, textarea, select, [contenteditable], [role="alertdialog"]')) return;
      e.preventDefault();
      e.stopPropagation();
      pick(null);
    },
    { capture: true, signal },
  );

  return {
    list: list.root,
    setItems: list.setItems,
    setCurrent: list.setCurrent,
    setTime: list.setTime,
    show(objects, { animate = false } = {}) {
      root.classList.toggle("rt-objects--live", animate);
      current = objects;
      const here = new Set(objects.map((object) => object.id));
      for (const [id, shape] of shapes) {
        if (here.has(id)) continue;
        shape.polygon.remove();
        shape.trail.remove();
        shape.tag?.remove();
        shapes.delete(id);
        if (hoveredShape && hovered === id) {
          hovered = null;
          hoveredShape = false;
        }
      }
      objects.forEach((object, i) => {
        let shape = shapes.get(object.id);
        if (!shape) {
          shape = create(object);
          shapes.set(object.id, shape);
          for (const el of [shape.polygon, shape.trail, shape.tag]) {
            el?.style.setProperty("--rt-object", object.color);
            el?.style.setProperty("--rt-object-delay", `${animate ? i * STAGGER_MS : 0}ms`);
          }
        }
        shape.polygon.setAttribute("points", points(object.quad));
        shape.trail.setAttribute("points", object.trail ? points(object.trail) : "");
        if (!root.hidden) placeTag(shape, object);
      });
      focus();
    },
    get selected() {
      return selected;
    },
    select(id) {
      selected = id;
      list.set(id);
      focus();
    },
    setFrame(next) {
      frame = next && { ...next };
      if (frame) {
        svg.setAttribute("viewBox", `${frame.x} ${frame.y} ${frame.width} ${frame.height}`);
      }
      syncShown();
    },
    setVisible(next) {
      visible = next;
      syncShown();
    },
    destroy() {
      abort.abort();
      observer?.disconnect();
      root.remove();
    },
  };
}
