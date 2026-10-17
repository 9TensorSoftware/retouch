import { createDefaultCurves } from "../src/constants";
import type { Curves, EditMask } from "../src/types";
import { AXIS_DECIDE_PX, createAxisLock, pickAxis } from "../src/ui/editor/axis-lock";
import type { CanvasRenderer } from "../src/ui/editor/canvas-renderer";
import { createCropTool } from "../src/ui/editor/crop-tool";
import { createCurvesTool } from "../src/ui/editor/curves-tool";
import { createMasksOverlay } from "../src/ui/editor/masks-overlay";

// jsdom has no PointerEvent: a MouseEvent carrying the pointer fields stands in.
function pointer(type: string, x: number, y: number): Event {
  return Object.assign(
    new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }),
    { pointerId: 1, pointerType: "mouse" },
  );
}

/** Press on `target` at (x, y), move through `path` (each point absolute), then release. */
function drag(target: Element, x: number, y: number, path: [number, number][]): void {
  target.dispatchEvent(pointer("pointerdown", x, y));
  const moveOn = target instanceof HTMLCanvasElement ? target : document;
  for (const [px, py] of path) moveOn.dispatchEvent(pointer("pointermove", px, py));
  const [ex, ey] = path[path.length - 1];
  moveOn.dispatchEvent(pointer("pointerup", ex, ey));
}

/** A 400 × 300 photo at the stage's origin, unzoomed. */
const renderer = {
  getImageRect: () => ({ x: 0, y: 0, width: 400, height: 300 }),
  getScreenScale: () => 1,
} as unknown as CanvasRenderer;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("direction lock", () => {
  it("waits for the first few pixels, then locks to an axis or stays free", () => {
    expect(pickAxis(AXIS_DECIDE_PX - 1, 1)).toBeNull();
    expect(pickAxis(1, 40)).toBe("y");
    expect(pickAxis(-40, 3)).toBe("x");
    expect(pickAxis(30, 30)).toBe("free");
  });

  it("keeps a drag on its axis however far the hand drifts after", () => {
    const lock = createAxisLock();
    expect(lock.apply(1, 2)).toEqual({ dx: 1, dy: 2 }); // too short to tell
    expect(lock.apply(1, 20)).toEqual({ dx: 0, dy: 20 });
    expect(lock.apply(60, 30)).toEqual({ dx: 0, dy: 30 });
    expect(lock.axis).toBe("y");
  });
});

describe("crop drags", () => {
  function cropTool() {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const tool = createCropTool({ container, renderer, onChange: () => {} });
    const handle = (pos: string) => container.querySelector(`.rt-crop__handle--${pos}`) as Element;
    return { tool, handle, selection: container.querySelector(".rt-crop__selection") as Element };
  }

  it("a corner pulled straight down changes only the height, drift and all", () => {
    const { tool, handle } = cropTool();
    // A diagonal pull is free: both sides shrink.
    drag(handle("se"), 400, 300, [
      [350, 262],
      [300, 225],
    ]);
    expect(tool.getSelection()).toEqual({ x: 0, y: 0, width: 0.75, height: 0.75 });

    drag(handle("se"), 300, 225, [
      [301, 235],
      [304, 250],
      [309, 255],
    ]);
    const sel = tool.getSelection();
    expect(sel.width).toBe(0.75);
    expect(sel.height).toBeCloseTo(0.85, 6);
  });

  it("a frame moved sideways stays at its height", () => {
    const { tool, handle, selection } = cropTool();
    drag(handle("se"), 400, 300, [[300, 225]]);
    drag(selection, 150, 110, [
      [140, 111],
      [110, 114],
    ]);
    expect(tool.getSelection()).toEqual({ x: 0, y: 0, width: 0.75, height: 0.75 });
    drag(selection, 150, 110, [
      [170, 111],
      [190, 115],
    ]);
    expect(tool.getSelection().x).toBeCloseTo(0.1, 6);
    expect(tool.getSelection().y).toBe(0);
  });

  it("with a fixed shape, a top-left corner grows the frame and the opposite corner stays put", () => {
    const { tool, handle } = cropTool();
    tool.setAspectRatio("1:1");
    const start = tool.getSelection();
    // An uneven diagonal: wider than tall, so the width sets the size.
    drag(handle("nw"), 0, 0, [
      [30, 20],
      [60, 40],
    ]);
    const sel = tool.getSelection();
    expect(sel.x + sel.width).toBeCloseTo(start.x + start.width, 6);
    expect(sel.y + sel.height).toBeCloseTo(start.y + start.height, 6);
    // Still square on screen: 400 × 300 photo, so width/height = 300/400.
    expect((sel.width * 400) / (sel.height * 300)).toBeCloseTo(1, 6);
    expect(sel.width).toBeLessThan(start.width);
  });

  it("with a fixed shape, a corner pulled straight down sizes the frame by its height", () => {
    const { tool, handle } = cropTool();
    tool.setAspectRatio("1:1");
    drag(handle("se"), 0, 0, [
      [-30, -30],
      [-60, -60],
    ]);
    const before = tool.getSelection();
    drag(handle("se"), 0, 0, [
      [1, 10],
      [3, 30],
    ]);
    const sel = tool.getSelection();
    expect(sel.height).toBeCloseTo(before.height + 30 / 300, 6);
    expect((sel.width * 400) / (sel.height * 300)).toBeCloseTo(1, 6);
    expect(sel.x).toBe(before.x);
    expect(sel.y).toBe(before.y);
  });
});

describe("mask handle drags", () => {
  function overlay(mask: EditMask) {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const changes: EditMask[] = [];
    const handle = createMasksOverlay({
      container,
      renderer,
      onGeometryChange: (m) => changes.push(m),
    });
    handle.update([mask], mask.id);
    const dot = (role: string) =>
      container.querySelector(`.rt-mask-overlay__handle--${role}`) as Element;
    return { changes, dot };
  }

  const adjust = {
    exposure: 20,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
  };

  it("a radial mask's handle pulled straight down changes one radius", () => {
    const { changes, dot } = overlay({
      id: "m",
      kind: "radial",
      x0: 0.5,
      y0: 0.5,
      x1: 0.7,
      y1: 0.6,
      invert: false,
      adjust,
    });
    drag(dot("end"), 280, 180, [
      [281, 195],
      [285, 210],
    ]);
    const last = changes[changes.length - 1];
    expect(last.x1).toBe(0.7);
    expect(last.y1).toBeCloseTo(0.6 + 30 / 300, 6);
  });

  it("a linear mask's end pulled straight down keeps the gradient level", () => {
    const { changes, dot } = overlay({
      id: "m",
      kind: "linear",
      x0: 0.5,
      y0: 0.2,
      x1: 0.5,
      y1: 0.5,
      invert: false,
      adjust,
    });
    drag(dot("end"), 200, 150, [
      [202, 170],
      [206, 190],
    ]);
    const last = changes[changes.length - 1];
    expect(last.x1).toBe(0.5);
    expect(last.y1).toBeCloseTo(0.5 + 40 / 300, 6);
  });
});

describe("curve point drags", () => {
  it("a point pulled straight up keeps its input value", () => {
    let latest: Curves | null = null;
    const tool = createCurvesTool({
      curves: createDefaultCurves(),
      onChange: (c) => {
        latest = c;
      },
      getHistogram: () => new Uint32Array(256),
    });
    document.body.appendChild(tool.root);
    const canvas = tool.root.querySelector("canvas") as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => new DOMRect(0, 0, 200, 200);
    // Click the middle of the empty curve to add a point, then pull it up.
    drag(canvas, 100, 100, [
      [101, 90],
      [104, 60],
    ]);
    const added = (latest as Curves | null)?.master.find((p) => p.x > 0 && p.x < 1);
    expect(added?.x).toBe(0.5);
    expect(added?.y).toBeCloseTo(0.7, 6);
  });
});
