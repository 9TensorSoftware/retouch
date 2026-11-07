import { createObjectLayer, type LayerObject } from "../src/ui/editor/object-layer";

const box = (id: string, x: number, y: number, w: number, h: number): LayerObject => ({
  id,
  quad: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ],
  color: "#5cc8ff",
  tag: id,
});

/** Each test's editor, closed after it so its Esc listener doesn't outlive it. */
const editors: AbortController[] = [];

function setup() {
  const abort = new AbortController();
  editors.push(abort);
  const area = document.createElement("div");
  area.className = "rt-editor__canvas-area";
  const host = document.createElement("div");
  host.className = "canvas-container";
  area.appendChild(host);
  document.body.appendChild(area);
  const onSelect = vi.fn();
  const layer = createObjectLayer<string>(
    {
      label: "Found",
      items: [
        { value: "big", label: "big" },
        { value: "small", label: "small" },
      ],
      onSelect,
    },
    { host: () => host, area, signal: abort.signal },
  );
  document.body.appendChild(layer.list);
  layer.show([box("big", 0.1, 0.1, 0.6, 0.6), box("small", 0.2, 0.2, 0.1, 0.1)]);
  layer.setVisible(true);
  const root = host.querySelector(".rt-objects") as HTMLElement;
  const shapes = () => [...root.querySelectorAll<SVGPolygonElement>(".rt-objects__shape")];
  /** Big goes in first, and small sits on top of it. */
  const shape = (id: "big" | "small") => shapes()[id === "big" ? 0 : 1];
  const row = (id: "big" | "small") => layer.list.children[id === "big" ? 0 : 1] as HTMLElement;
  return { abort, area, host, root, layer, onSelect, shapes, shape, row };
}

const fire = (el: Element, type: string, init: MouseEventInit = {}) =>
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, ...init }));
const enter = (el: Element) => el.dispatchEvent(new Event("pointerenter"));
const leave = (el: Element) => el.dispatchEvent(new Event("pointerleave"));

describe("createObjectLayer", () => {
  afterEach(() => {
    for (const editor of editors.splice(0)) editor.abort();
    document.body.innerHTML = "";
  });

  it("starts off, and shows when the tool turns it on", () => {
    const { root, layer } = setup();
    expect(root.hidden).toBe(false);
    layer.setVisible(false);
    expect(root.hidden).toBe(true);
  });

  it("puts smaller objects on top, whichever order they arrive in", () => {
    const { layer, shapes } = setup();
    layer.show([box("tiny", 0.3, 0.3, 0.01, 0.01), box("huge", 0, 0, 1, 1)]);
    const corners = shapes().map((s) => s.getAttribute("points")?.split(" ")[0]);
    expect(corners).toEqual(["0,0", "0.3,0.3"]);
  });

  it("brings a hovered shape forward, dims the rest and lights its row", () => {
    const { root, shape, row } = setup();
    enter(shape("small"));
    expect(root.hasAttribute("data-focus")).toBe(true);
    expect(shape("small").classList.contains("is-focus")).toBe(true);
    expect(shape("big").classList.contains("is-focus")).toBe(false);
    expect(row("small").hasAttribute("data-highlight")).toBe(true);
    leave(shape("small"));
    expect(root.hasAttribute("data-focus")).toBe(false);
    expect(row("small").hasAttribute("data-highlight")).toBe(false);
  });

  it("brings a shape forward from its row", () => {
    const { shape, row } = setup();
    enter(row("big"));
    expect(shape("big").classList.contains("is-focus")).toBe(true);
    leave(row("big"));
    expect(shape("big").classList.contains("is-focus")).toBe(false);
  });

  it("picks on a click, lets go on a second, and keeps the row in step", () => {
    const { layer, shape, row, onSelect } = setup();
    fire(shape("small"), "click");
    expect(layer.selected).toBe("small");
    expect(onSelect).toHaveBeenLastCalledWith("small", "layer");
    expect(row("small").getAttribute("aria-pressed")).toBe("true");
    expect(shape("small").classList.contains("is-selected")).toBe(true);
    fire(shape("small"), "click");
    expect(layer.selected).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(null, "layer");
    expect(row("small").getAttribute("aria-pressed")).toBe("false");
  });

  it("says when a pick came from a row", () => {
    const { layer, shape, row, onSelect } = setup();
    row("big").click();
    expect(layer.selected).toBe("big");
    expect(onSelect).toHaveBeenLastCalledWith("big", "list");
    expect(shape("big").classList.contains("is-selected")).toBe(true);
  });

  it("lets hovering outrank the pick, which comes back after", () => {
    const { shape } = setup();
    fire(shape("big"), "click");
    enter(shape("small"));
    expect(shape("small").classList.contains("is-focus")).toBe(true);
    expect(shape("big").classList.contains("is-focus")).toBe(false);
    expect(shape("big").classList.contains("is-selected")).toBe(true);
    leave(shape("small"));
    expect(shape("big").classList.contains("is-focus")).toBe(true);
  });

  it("lets go on a click on the bare photo, but not after a pan", () => {
    const { area, host, layer, shape, onSelect } = setup();
    fire(shape("big"), "click");
    fire(area, "pointerdown", { clientX: 10, clientY: 10 });
    fire(host, "click", { clientX: 60, clientY: 10 });
    expect(layer.selected).toBe("big");

    fire(area, "pointerdown", { clientX: 10, clientY: 10 });
    fire(host, "click", { clientX: 11, clientY: 10 });
    expect(layer.selected).toBeNull();
    expect(onSelect).toHaveBeenLastCalledWith(null, "layer");
  });

  it("doesn't take a pan across a shape for a click on it", () => {
    const { area, layer, shape } = setup();
    fire(area, "pointerdown", { clientX: 10, clientY: 10 });
    fire(shape("big"), "click", { clientX: 80, clientY: 10 });
    expect(layer.selected).toBeNull();
  });

  it("lets Esc let go before the editor hears it, and only with something picked", () => {
    const { layer, shape } = setup();
    const editor = vi.fn();
    document.addEventListener("keydown", editor);
    const esc = () =>
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    fire(shape("big"), "click");
    esc();
    expect(layer.selected).toBeNull();
    expect(editor).not.toHaveBeenCalled();
    esc();
    expect(editor).toHaveBeenCalledTimes(1);

    fire(shape("big"), "click");
    layer.setVisible(false);
    esc();
    expect(layer.selected).toBe("big");
    expect(editor).toHaveBeenCalledTimes(2);
    document.removeEventListener("keydown", editor);
  });

  it("keeps each object's shape from frame to frame, and removes the ones that leave", () => {
    const { layer, shape, root, shapes } = setup();
    const small = shape("small");
    enter(small);
    layer.show([box("small", 0.4, 0.4, 0.1, 0.1)]);
    expect(shapes()).toEqual([small]);
    expect(small.getAttribute("points")?.startsWith("0.4,0.4")).toBe(true);
    expect(small.classList.contains("is-focus")).toBe(true);
    expect(root.querySelectorAll(".rt-objects__tag")).toHaveLength(1);

    // It left under a still mouse, so no pointerleave is coming.
    layer.show([]);
    expect(root.hasAttribute("data-focus")).toBe(false);
  });

  it("doesn't dim everything for a pick that's out of the frame", () => {
    const { layer, shape, root } = setup();
    fire(shape("small"), "click");
    expect(root.hasAttribute("data-focus")).toBe(true);
    layer.show([box("big", 0.1, 0.1, 0.6, 0.6)]);
    expect(layer.selected).toBe("small");
    expect(root.hasAttribute("data-focus")).toBe(false);
    layer.show([box("big", 0.1, 0.1, 0.6, 0.6), box("small", 0.2, 0.2, 0.1, 0.1)]);
    expect(root.hasAttribute("data-focus")).toBe(true);
  });

  it("maps through the frame, and hides without one", () => {
    const { root, layer } = setup();
    layer.setFrame({ x: 0.5, y: 0.25, width: 0.5, height: 0.5 });
    expect(root.querySelector("svg")?.getAttribute("viewBox")).toBe("0.5 0.25 0.5 0.5");
    const [big, small] = [...root.querySelectorAll<HTMLElement>(".rt-objects__tag")];
    // Small is out of this frame altogether; big's corner is clamped to its edge.
    expect(small.hidden).toBe(true);
    expect(big.hidden).toBe(false);
    expect(big.style.left).toBe("0%");
    layer.setFrame(null);
    expect(root.hidden).toBe(true);
    layer.setFrame({ x: 0, y: 0, width: 1, height: 1 });
    expect(root.hidden).toBe(false);
  });

  it("turns a flag inward where it would leave the top of the frame", () => {
    const { root, host, layer } = setup();
    Object.defineProperty(root, "clientWidth", { value: 800 });
    Object.defineProperty(root, "clientHeight", { value: 400 });
    expect(host.contains(root)).toBe(true);
    const tags = () => [...root.querySelectorAll<HTMLElement>(".rt-objects__tag")];
    for (const tag of tags()) {
      Object.defineProperty(tag, "offsetWidth", { value: 40 });
      Object.defineProperty(tag, "offsetHeight", { value: 20 });
    }
    layer.show([box("big", 0.98, 0.01, 0.01, 0.2), box("small", 0.2, 0.5, 0.1, 0.1)]);
    const [big, small] = tags();
    expect(big.hasAttribute("data-inside")).toBe(true);
    expect(big.style.left).toBe("95%");
    expect(small.hasAttribute("data-inside")).toBe(false);
  });

  it("draws a trail where an object has one", () => {
    const { root, layer } = setup();
    layer.show([
      {
        ...box("big", 0, 0, 1, 1),
        trail: [
          [0.1, 0.1],
          [0.2, 0.2],
        ],
      },
    ]);
    expect(root.querySelector(".rt-objects__trail")?.getAttribute("points")).toBe(
      "0.1,0.1 0.2,0.2",
    );
  });

  it("leaves nothing behind", () => {
    const { host, layer, shape, onSelect } = setup();
    const small = shape("small");
    layer.destroy();
    expect(host.querySelector(".rt-objects")).toBeNull();
    fire(small, "click");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("stops listening when the editor closes", () => {
    const { abort, layer, shape } = setup();
    fire(shape("big"), "click");
    abort.abort();
    const editor = vi.fn();
    document.addEventListener("keydown", editor);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(editor).toHaveBeenCalled();
    expect(layer.selected).toBe("big");
    document.removeEventListener("keydown", editor);
  });
});
