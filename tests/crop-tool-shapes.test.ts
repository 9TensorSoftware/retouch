import type { CanvasRenderer } from "../src/ui/editor/canvas-renderer";
import { createCropTool } from "../src/ui/editor/crop-tool";
import { boundsOf } from "../src/utils/crop-shape";

// jsdom has no PointerEvent: a MouseEvent carrying the pointer fields stands in.
function pointer(type: string, x: number, y: number): Event {
  return Object.assign(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }),
    { pointerId: 1, pointerType: "mouse" },
  );
}

/** A 400 × 300 photo at the stage's origin, unzoomed. */
const renderer = {
  getImageRect: () => ({ x: 0, y: 0, width: 400, height: 300 }),
  getScreenScale: () => 1,
} as unknown as CanvasRenderer;

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const onChange = vi.fn();
  const tool = createCropTool({ container, renderer, onChange });
  const q = (selector: string) => container.querySelector(selector) as Element;
  return { tool, onChange, q, container };
}

/** Press, move through `path`, release: a drag on `target`. */
function drag(target: Element, path: [number, number][]): void {
  const [sx, sy] = path[0];
  target.dispatchEvent(pointer("pointerdown", sx, sy));
  for (const [x, y] of path.slice(1)) document.dispatchEvent(pointer("pointermove", x, y));
  const [ex, ey] = path[path.length - 1];
  document.dispatchEvent(pointer("pointerup", ex, ey));
}

/** A click on `target` at (x, y). */
function click(target: Element, x: number, y: number): void {
  target.dispatchEvent(pointer("pointerdown", x, y));
  document.dispatchEvent(pointer("pointerup", x, y));
}

/** A loop around (cx, cy), as a hand would draw one. */
function loop(cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: 41 }, (_, i) => {
    const t = (i / 40) * 2 * Math.PI;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as [number, number];
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("framed crop shapes", () => {
  it("proposes nothing as a plain frame on the whole photo, and a shape in any frame", () => {
    const { tool } = setup();
    expect(tool.hasPending()).toBe(false);
    expect(tool.getShape()).toBeNull();
    tool.setShapeMode("ellipse");
    expect(tool.canApply()).toBe(true);
    const shape = tool.getShape();
    expect(shape?.invert).toBe(false);
    const b = boundsOf(shape?.points ?? []);
    expect(b.width).toBeCloseTo(1, 6);
    expect(b.height).toBeCloseTo(1, 6);
  });

  it("keeps a circle round: a square frame the aspect tiles can't change", () => {
    const { tool } = setup();
    tool.setShapeMode("circle");
    const sel = tool.getSelection();
    expect(sel.width * 400).toBeCloseTo(sel.height * 300, 6);
    tool.setAspectRatio("16:9");
    expect(tool.getSelection()).toEqual(sel);
    // Leaving the circle frees the frame where it is.
    tool.setShapeMode("ellipse");
    expect(tool.getAspectRatio()).toBe("free");
    expect(tool.getSelection()).toEqual(sel);
  });

  it("starts a figure square, unless the frame was already set", () => {
    const { tool } = setup();
    tool.setShapeMode("star");
    expect(tool.getAspectRatio()).toBe("1:1");

    const second = setup();
    second.tool.setAspectRatio("16:9");
    const framed = second.tool.getSelection();
    second.tool.setShapeMode("heart");
    expect(second.tool.getSelection()).toEqual(framed);
  });

  it("makes a rectangle a shape once it's rounded or softened", () => {
    const { tool } = setup();
    tool.setShapeOptions({ radius: 30 });
    expect(tool.canApply()).toBe(true);
    expect(tool.getShape()?.points.length).toBeGreaterThan(8);
    tool.setShapeOptions({ radius: 0, feather: 20 });
    expect(tool.getShape()?.feather).toBe(20);
  });

  it("has nothing to punch out of the whole photo with a plain rectangle", () => {
    const { tool } = setup();
    tool.setShapeOptions({ invert: true });
    expect(tool.canApply()).toBe(false);
    tool.setAspectRatio("1:1");
    expect(tool.canApply()).toBe(true);
    expect(tool.getShape()?.invert).toBe(true);
  });

  it("dims what goes with the shape, inside it when it's punched out", () => {
    const { tool, q } = setup();
    tool.setShapeMode("ellipse");
    expect(q(".rt-crop__scrim").getAttribute("d")).toMatch(/^M0 0H/);
    expect((q(".rt-crop__mask") as HTMLElement).style.display).toBe("none");
    tool.setShapeOptions({ invert: true });
    expect(q(".rt-crop__scrim").getAttribute("d")).not.toMatch(/^M0 0H/);
  });

  it("goes back to a plain frame on reset", () => {
    const { tool } = setup();
    tool.setShapeMode("triangle");
    tool.setShapeOptions({ feather: 50, invert: true });
    tool.resetSelection();
    expect(tool.getShapeMode()).toBe("rect");
    expect(tool.getShapeOptions()).toEqual({ radius: 0, feather: 0, invert: false });
    expect(tool.hasPending()).toBe(false);
  });
});

describe("a hand-drawn crop", () => {
  it("closes the line into a smooth outline when it's let go", () => {
    const { tool, q, onChange } = setup();
    tool.setShapeMode("lasso");
    expect(tool.hasPending()).toBe(false);
    drag(q(".rt-crop__draw"), loop(200, 150, 60));
    const shape = tool.getShape();
    expect(shape?.smooth).toBe(true);
    const b = boundsOf(shape?.points ?? []);
    expect(b.x).toBeCloseTo(140 / 400, 2);
    expect(b.width).toBeCloseTo(120 / 400, 2);
    expect(onChange).toHaveBeenCalled();
    expect(q(".rt-crop__scrim").getAttribute("d")).not.toBe("");
  });

  it("drops a scribble too small to mean a shape", () => {
    const { tool, q } = setup();
    tool.setShapeMode("lasso");
    drag(q(".rt-crop__draw"), loop(200, 150, 3));
    expect(tool.hasPending()).toBe(false);
  });

  it("keeps the line on the photo when the pointer runs off it", () => {
    const { tool, q } = setup();
    tool.setShapeMode("lasso");
    drag(q(".rt-crop__draw"), loop(380, 150, 60));
    const b = boundsOf(tool.getShape()?.points ?? []);
    expect(b.x + b.width).toBeLessThanOrEqual(1);
  });

  it("moves the whole outline with a drag inside it, as far as the edges", () => {
    const { tool, q } = setup();
    tool.setShapeMode("lasso");
    drag(q(".rt-crop__draw"), loop(200, 150, 60));
    const before = boundsOf(tool.getShape()?.points ?? []);
    drag(q(".rt-crop__draw"), [
      [200, 150],
      [240, 150],
    ]);
    const after = boundsOf(tool.getShape()?.points ?? []);
    expect(after.x - before.x).toBeCloseTo(40 / 400, 6);
    expect(after.width).toBeCloseTo(before.width, 6);
    drag(q(".rt-crop__draw"), [
      [240, 150],
      [900, 150],
    ]);
    const end = boundsOf(tool.getShape()?.points ?? []);
    expect(end.x + end.width).toBeCloseTo(1, 6);
  });
});

describe("a crop outlined point by point", () => {
  const corners: [number, number][] = [
    [100, 50],
    [300, 50],
    [300, 250],
    [100, 250],
  ];

  it("takes a point per click, then joins up on the first point", () => {
    const { tool, q } = setup();
    tool.setShapeMode("polygon");
    const layer = q(".rt-crop__draw");
    for (const [x, y] of corners) click(layer, x, y);
    expect(q(".rt-crop").querySelectorAll(".rt-crop__vertex")).toHaveLength(4);
    expect(q(".rt-crop__vertex--close")).not.toBeNull();
    // Open, it's a line; nothing is dimmed until it closes.
    expect(q(".rt-crop__scrim").getAttribute("d")).toBe("");
    expect(tool.canApply()).toBe(true);
    click(layer, 102, 52);
    expect(q(".rt-crop__scrim").getAttribute("d")).not.toBe("");
    expect(tool.getShape()?.points).toEqual([
      0.25,
      50 / 300,
      0.75,
      50 / 300,
      0.75,
      250 / 300,
      0.25,
      250 / 300,
    ]);
    // A finished outline takes no more points.
    click(layer, 10, 10);
    expect(tool.getShape()?.points).toHaveLength(8);
  });

  it("closes on a double-click at the last point too", () => {
    const { tool, q } = setup();
    tool.setShapeMode("polygon");
    const layer = q(".rt-crop__draw");
    for (const [x, y] of corners.slice(0, 3)) click(layer, x, y);
    click(layer, 300, 250);
    expect(tool.removeLastPoint()).toBe(false);
    expect(tool.getShape()?.points).toHaveLength(6);
  });

  it("takes the last point back while it's open", () => {
    const { tool, q } = setup();
    tool.setShapeMode("polygon");
    const layer = q(".rt-crop__draw");
    click(layer, 100, 50);
    click(layer, 300, 50);
    expect(tool.hasPending()).toBe(true);
    expect(tool.canApply()).toBe(false);
    expect(tool.removeLastPoint()).toBe(true);
    expect(tool.removeLastPoint()).toBe(true);
    expect(tool.removeLastPoint()).toBe(false);
    expect(tool.hasPending()).toBe(false);
  });

  it("moves a point by its handle", () => {
    const { tool, q, container } = setup();
    tool.setShapeMode("polygon");
    const layer = q(".rt-crop__draw");
    for (const [x, y] of corners) click(layer, x, y);
    click(layer, 100, 50);
    const handle = container.querySelectorAll(".rt-crop__vertex")[2];
    drag(handle, [
      [300, 250],
      [340, 280],
    ]);
    expect(tool.getShape()?.points.slice(4, 6)).toEqual([340 / 400, 280 / 300]);
  });
});
