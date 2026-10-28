import type { CanvasRenderer } from "../src/ui/editor/canvas-renderer";
import { clampPan, createStageView, pinchView, zoomAround } from "../src/ui/editor/stage-view";

describe("zoomAround", () => {
  it("keeps the point under the cursor still", () => {
    const pan = { x: 20, y: -10 };
    const cursor = { x: 100, y: 50 };
    const next = zoomAround(pan, cursor, 1, 2);
    // The content point under the cursor, before and after.
    expect((cursor.x - pan.x) / 1).toBeCloseTo((cursor.x - next.x) / 2);
    expect((cursor.y - pan.y) / 1).toBeCloseTo((cursor.y - next.y) / 2);
  });

  it("is a no-op when the zoom doesn't change", () => {
    expect(zoomAround({ x: 5, y: 6 }, { x: 100, y: 50 }, 1.5, 1.5)).toEqual({ x: 5, y: 6 });
  });
});

describe("pinchView", () => {
  it("zooms with the fingers' spread, keeping the photo under their midpoint", () => {
    const start = { zoom: 1, pan: { x: 0, y: 0 }, mid: { x: 100, y: 0 }, distance: 100 };
    const view = pinchView(start, { x: 100, y: 0 }, 200, 8);
    expect(view.zoom).toBe(2);
    expect((100 - view.pan.x) / 2).toBeCloseTo((100 - 0) / 1);
  });

  it("follows the midpoint as the fingers travel, between fit and the most zoom", () => {
    const start = { zoom: 2, pan: { x: 10, y: 0 }, mid: { x: 0, y: 0 }, distance: 100 };
    expect(pinchView(start, { x: 30, y: -20 }, 100, 8)).toEqual({
      zoom: 2,
      pan: { x: 40, y: -20 },
    });
    expect(pinchView(start, { x: 0, y: 0 }, 10, 8).zoom).toBe(1);
    expect(pinchView(start, { x: 0, y: 0 }, 1000, 8).zoom).toBe(8);
  });
});

describe("clampPan", () => {
  it("centers content that fits", () => {
    const pan = clampPan(
      { x: 80, y: -40 },
      { width: 300, height: 200 },
      { width: 800, height: 600 },
    );
    expect(pan).toEqual({ x: 0, y: 0 });
  });

  it("lets larger content slide until its edge meets the viewport's, plus slack", () => {
    const content = { width: 1800, height: 1000 };
    const viewport = { width: 800, height: 600 };
    expect(clampPan({ x: 5000, y: -5000 }, content, viewport, 48)).toEqual({ x: 548, y: -248 });
    expect(clampPan({ x: 100, y: 50 }, content, viewport, 48)).toEqual({ x: 100, y: 50 });
  });
});

/**
 * Renderer stand-in with the real draw-scale rule: at fit, the fit; zoomed,
 * fit × zoom capped at the preview's own resolution (`detail`), drawn 1.5×
 * ahead and kept while sharp enough and at most 2× what is shown.
 */
function fakeRenderer(fit = 0.5, detail = 1) {
  let zoom = 1;
  let draw = fit;
  let screen = 1;
  let listener: (() => void) | null = null;
  const next = () => {
    if (zoom === 1) return fit;
    const cap = Math.max(fit, detail);
    const needed = Math.min(cap, fit * zoom);
    if (draw >= needed && draw <= Math.min(cap, needed * 2)) return draw;
    return Math.min(cap, needed * 1.5);
  };
  const renderer = {
    getViewScales: () => ({ fit, draw }),
    getImageRect: () => ({ left: 0, top: 0, width: 1600 * draw, height: 900 * draw }),
    setScreenScale: (s: number) => {
      screen = s;
    },
    getScreenScale: () => screen,
    setViewZoom: vi.fn((z: number) => {
      zoom = z;
      return next() !== draw;
    }),
    render: vi.fn(() => {
      draw = next();
      listener?.();
    }),
    onRender: (l: (() => void) | null) => {
      listener = l;
    },
  };
  return renderer;
}

function setup(fit = 0.5, detail = 1) {
  vi.useFakeTimers();
  const area = document.createElement("div");
  Object.defineProperty(area, "clientWidth", { value: 1000 });
  Object.defineProperty(area, "clientHeight", { value: 700 });
  const target = document.createElement("div");
  area.appendChild(target);
  document.body.appendChild(area);
  const renderer = fakeRenderer(fit, detail);
  const abort = new AbortController();
  const onChange = vi.fn();
  const view = createStageView({
    area,
    target,
    renderer: renderer as unknown as CanvasRenderer,
    spacePan: true,
    onChange,
    signal: abort.signal,
  });
  area.appendChild(view.root);
  // The editor renders once on open; the view writes its readout from that.
  renderer.render();
  renderer.render.mockClear();
  const label = () => view.root.querySelector(".rt-zoom__value")?.textContent;
  const button = (name: string) =>
    [...view.root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => (b.getAttribute("aria-label") ?? b.textContent) === name,
    );
  const cleanup = () => {
    abort.abort();
    area.remove();
    vi.useRealTimers();
  };
  return { area, target, renderer, view, onChange, label, button, cleanup };
}

describe("stage view", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("scales with CSS at once, then redraws sharp once input settles", () => {
    const { target, renderer, view, label, area, cleanup } = setup();
    view.zoomBy(2);
    expect(label()).toBe("100%");
    expect(target.style.transform).toBe("translate(0px, 0px) scale(2)");
    expect(renderer.getScreenScale()).toBe(2);
    expect(area.classList.contains("rt-stage--zoomed")).toBe(true);
    expect(renderer.render).not.toHaveBeenCalled();

    vi.advanceTimersByTime(160);
    expect(renderer.setViewZoom).toHaveBeenCalledWith(2);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    // Drawn at the new size: no CSS scale left.
    expect(target.style.transform).toBe("");
    expect(renderer.getScreenScale()).toBe(1);
    cleanup();
  });

  it("draws ahead of the zoom, and redraws only when the canvas needs another size", () => {
    const { target, renderer, view, cleanup } = setup(0.25, 2);
    view.zoomBy(2); // needs 0.5: drawn at 0.75, shown at two thirds
    vi.advanceTimersByTime(160);
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(target.style.transform).toBe(`translate(0px, 0px) scale(${0.5 / 0.75})`);

    view.zoomBy(1.4); // needs 0.7: the canvas is still sharp enough
    vi.advanceTimersByTime(160);
    expect(renderer.render).toHaveBeenCalledTimes(1);

    view.zoomBy(0.5); // needs 0.35: the canvas is over twice that, so it shrinks
    vi.advanceTimersByTime(160);
    expect(renderer.render).toHaveBeenCalledTimes(2);
    expect(renderer.getViewScales().draw).toBeCloseTo(0.525);
    cleanup();
  });

  it("keeps the CSS scale past the preview's resolution", () => {
    const { target, view, label, cleanup } = setup(0.5, 1);
    view.zoomBy(4); // 200%: the canvas stops at 100%
    vi.advanceTimersByTime(160);
    expect(label()).toBe("200%");
    expect(target.style.transform).toBe("translate(0px, 0px) scale(2)");
    expect(target.style.getPropertyValue("--rt-view-scale")).toBe("2");
    cleanup();
  });

  it("clamps between fit and 800%", () => {
    const { view, label, button, cleanup } = setup(0.5);
    view.zoomBy(0.5);
    expect(label()).toBe("50%");
    expect(button("Zoom out")?.disabled).toBe(true);
    view.zoomBy(1000);
    expect(label()).toBe("800%");
    expect(button("Zoom in")?.disabled).toBe(true);
    cleanup();
  });

  it("fits and shows actual pixels from the controls", () => {
    const { label, button, target, cleanup } = setup(0.25);
    button("1:1")?.click();
    expect(label()).toBe("100%");
    button("Fit")?.click();
    expect(label()).toBe("25%");
    vi.advanceTimersByTime(160);
    expect(target.style.transform).toBe("");
    cleanup();
  });

  it("handles + / - / 0 and leaves other keys alone", () => {
    const { view, label, cleanup } = setup(0.5);
    const key = (k: string) => view.handleKey(new KeyboardEvent("keydown", { key: k }));
    expect(key("+")).toBe(true);
    expect(label()).toBe("63%");
    expect(key("=")).toBe(true);
    expect(key("-")).toBe(true);
    expect(label()).toBe("63%");
    expect(key("0")).toBe(true);
    expect(label()).toBe("50%");
    expect(key("x")).toBe(false);
    cleanup();
  });

  it("zooms with ⌘/Ctrl + wheel and pans with the plain wheel only when zoomed", () => {
    const { area, target, label, cleanup } = setup(0.5);
    const wheel = (init: WheelEventInit) => {
      const e = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
      area.dispatchEvent(e);
      return e;
    };
    expect(wheel({ deltaY: 40 }).defaultPrevented).toBe(false);
    expect(wheel({ deltaY: -200, ctrlKey: true }).defaultPrevented).toBe(true);
    expect(label()).not.toBe("50%");
    vi.advanceTimersByTime(160);
    const before = target.style.transform;
    expect(wheel({ deltaX: 30, deltaY: 0 }).defaultPrevented).toBe(true);
    expect(target.style.transform).not.toBe(before);
    cleanup();
  });

  it("turns off (back to fit) while disabled", () => {
    const { view, label, cleanup } = setup(0.5);
    view.zoomBy(2);
    view.setEnabled(false);
    expect(view.root.hidden).toBe(true);
    expect(label()).toBe("50%");
    expect(view.handleKey(new KeyboardEvent("keydown", { key: "+" }))).toBe(false);
    view.zoomBy(2);
    expect(label()).toBe("50%");
    view.setEnabled(true);
    expect(view.root.hidden).toBe(false);
    cleanup();
  });

  /** jsdom has no PointerEvent: a MouseEvent carrying a touch pointer's fields. */
  function touch(el: Element, type: string, id: number, x: number, y: number): Event {
    const e = Object.assign(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }),
      { pointerId: id, pointerType: "touch" },
    );
    el.dispatchEvent(e);
    return e;
  }

  it("pinches to zoom, and the tools hear neither finger until both lift", () => {
    const { target, label, cleanup } = setup(0.5);
    target.className = "rt-editor__canvas-container";
    const heard = vi.fn();
    document.addEventListener("pointermove", heard);
    const tool = vi.fn();
    target.addEventListener("pointerdown", tool);

    touch(target, "pointerdown", 1, 100, 100);
    expect(tool).toHaveBeenCalledTimes(1); // one finger is the tool's
    const second = touch(target, "pointerdown", 2, 200, 100);
    expect(tool).toHaveBeenCalledTimes(1); // the second never reaches it
    expect(second.defaultPrevented).toBe(true);

    touch(target, "pointermove", 2, 300, 100); // spread 100 → 200
    expect(label()).toBe("100%");
    touch(target, "pointerup", 2, 300, 100);
    touch(target, "pointermove", 1, 120, 130); // still part of the pinch
    expect(heard).not.toHaveBeenCalled();
    touch(target, "pointerup", 1, 120, 130);
    touch(target, "pointerdown", 3, 100, 100);
    touch(target, "pointermove", 3, 102, 101);
    expect(heard).toHaveBeenCalledTimes(1); // a fresh touch is the tools' again
    document.removeEventListener("pointermove", heard);
    cleanup();
  });

  it("pans with one finger on the photo once zoomed, and double-tap zooms in or fits", () => {
    const { target, view, label, cleanup } = setup(0.5);
    target.className = "rt-editor__canvas-container";
    const tap = (id: number) => {
      touch(target, "pointerdown", id, 400, 300);
      touch(target, "pointerup", id, 400, 300);
    };

    touch(target, "pointerdown", 1, 100, 100);
    touch(target, "pointermove", 1, 160, 130);
    touch(target, "pointerup", 1, 160, 130);
    expect(target.style.transform).toBe(""); // at fit, one finger doesn't pan

    view.zoomBy(2);
    vi.advanceTimersByTime(160);
    touch(target, "pointerdown", 2, 100, 100);
    touch(target, "pointermove", 2, 140, 120);
    touch(target, "pointerup", 2, 140, 120);
    expect(target.style.transform).toBe("translate(40px, 20px) scale(1)");

    tap(3);
    tap(4);
    expect(label()).toBe("50%");
    tap(5);
    tap(6);
    expect(label()).toBe("125%");
    cleanup();
  });

  it("leaves touches on the tools' own handles alone", () => {
    const { target, label, cleanup } = setup(0.5);
    target.className = "rt-editor__canvas-container";
    const handle = document.createElement("div");
    handle.className = "rt-crop__handle";
    target.appendChild(handle);
    const tap = () => {
      touch(handle, "pointerdown", 7, 400, 300);
      touch(handle, "pointerup", 7, 400, 300);
    };
    tap();
    tap();
    expect(label()).toBe("50%");
    cleanup();
  });
});
