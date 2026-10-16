import { createSheet, sheetSizes, snapSheet } from "../src/ui/editor/sheet";

describe("sheetSizes", () => {
  it("keeps half a little under half, and leaves the stage room at full", () => {
    expect(sheetSizes(600, 70)).toEqual({ peek: 70, half: 264, full: 456 });
  });

  it("never lets half drop below the header and a few rows, or reach past full", () => {
    expect(sheetSizes(300, 70)).toEqual({ peek: 70, half: 166, full: 180 });
    expect(sheetSizes(500, 70, 300).full).toBe(200);
  });
});

describe("snapSheet", () => {
  const sizes = { peek: 70, half: 264, full: 456 };

  it("settles at the nearest height when let go slowly", () => {
    expect(snapSheet(100, 0, sizes)).toBe("peek");
    expect(snapSheet(300, 0.1, sizes)).toBe("half");
    expect(snapSheet(420, -0.2, sizes)).toBe("full");
  });

  it("carries a fling on to the next height in its direction", () => {
    expect(snapSheet(280, 0.8, sizes)).toBe("full");
    expect(snapSheet(250, 0.8, sizes)).toBe("half");
    expect(snapSheet(250, -0.8, sizes)).toBe("peek");
    expect(snapSheet(456, 1, sizes)).toBe("full");
    expect(snapSheet(70, -1, sizes)).toBe("peek");
  });
});

/** jsdom has no PointerEvent: a MouseEvent carrying the pointer fields the sheet reads. */
function pointer(type: string, y: number, t: number, id = 1): Event {
  const e = Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y }), {
    pointerId: id,
    pointerType: "touch",
  });
  Object.defineProperty(e, "timeStamp", { value: t });
  return e;
}

function setup() {
  vi.useFakeTimers();
  const onChange = new Set<() => void>();
  const media = {
    matches: true,
    addEventListener: (_type: string, fn: () => void) => onChange.add(fn),
    removeEventListener: () => {},
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => media),
  );

  const stage = document.createElement("div");
  const panel = document.createElement("aside");
  const grab = document.createElement("button");
  const head = document.createElement("div");
  const reset = document.createElement("button");
  const field = document.createElement("input");
  head.appendChild(reset);
  panel.append(grab, head, field);
  const body = document.createElement("div");
  body.append(stage, panel);
  document.body.appendChild(body);

  // jsdom has no layout: the stage and the sheet share 600 px; the bar and
  // the header take 66 of the sheet, so peek is 70 (sizes as above).
  const sheetHeight = () => Number.parseFloat(panel.style.height) || 250;
  Object.defineProperty(panel, "offsetHeight", { get: sheetHeight });
  Object.defineProperty(stage, "offsetHeight", { get: () => 600 - sheetHeight() });
  Object.defineProperty(grab, "offsetHeight", { value: 20 });
  Object.defineProperty(head, "offsetHeight", { value: 46 });

  const onSettle = vi.fn();
  const abort = new AbortController();
  const sheet = createSheet({ panel, grab, head, stage, onSettle, signal: abort.signal });
  const cleanup = () => {
    abort.abort();
    body.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  };
  const changeLayout = (stacked: boolean) => {
    media.matches = stacked;
    for (const fn of onChange) fn();
  };
  return { sheet, panel, grab, head, reset, field, onSettle, sheetHeight, cleanup, changeLayout };
}

describe("bottom sheet", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens at half, steps up from the bar, and lets the stage refit once it rests", () => {
    const { sheet, panel, grab, onSettle, sheetHeight, cleanup } = setup();
    expect(sheet.active).toBe(true);
    expect(sheet.state).toBe("half");
    expect(panel.dataset.sheet).toBe("half");
    expect(sheetHeight()).toBe(264);
    vi.advanceTimersByTime(0);
    expect(onSettle).toHaveBeenCalledTimes(1);

    grab.click();
    expect(sheet.state).toBe("full");
    expect(sheetHeight()).toBe(456);
    expect(sheet.moving).toBe(true);
    expect(grab.getAttribute("aria-label")).toBe("Show less of the controls");
    vi.advanceTimersByTime(400);
    expect(sheet.moving).toBe(false);
    expect(onSettle).toHaveBeenCalledTimes(2);

    grab.click();
    expect(sheet.state).toBe("half");
    cleanup();
  });

  it("follows a drag, settles at the nearest height, and a fling carries on", () => {
    const { sheet, grab, sheetHeight, cleanup } = setup();
    // A slow drag up by 200 px: past full, so it settles there.
    grab.dispatchEvent(pointer("pointerdown", 400, 0));
    grab.dispatchEvent(pointer("pointermove", 300, 500));
    expect(sheetHeight()).toBe(364);
    expect(sheet.moving).toBe(true);
    grab.dispatchEvent(pointer("pointermove", 200, 1000));
    grab.dispatchEvent(pointer("pointerup", 200, 1000));
    expect(sheet.state).toBe("full");

    // A quick flick down from full: on to half, though full is nearer.
    grab.dispatchEvent(pointer("pointerdown", 200, 2000));
    grab.dispatchEvent(pointer("pointermove", 230, 2030));
    grab.dispatchEvent(pointer("pointerup", 250, 2050));
    expect(sheet.state).toBe("half");
    expect(sheetHeight()).toBe(264);

    // The click a drag leaves behind doesn't step the sheet again.
    grab.click();
    expect(sheet.state).toBe("half");
    cleanup();
  });

  it("drags from the header, but leaves its buttons their clicks", () => {
    const { sheet, head, reset, sheetHeight, cleanup } = setup();
    reset.dispatchEvent(pointer("pointerdown", 400, 0));
    reset.dispatchEvent(pointer("pointermove", 300, 100));
    expect(sheetHeight()).toBe(264);
    head.dispatchEvent(pointer("pointerdown", 400, 0));
    head.dispatchEvent(pointer("pointermove", 600, 1000));
    head.dispatchEvent(pointer("pointerup", 600, 1000));
    expect(sheet.state).toBe("peek");
    cleanup();
  });

  it("folds to its header and back, and opens for a tool or a tab into it", () => {
    const { sheet, panel, field, grab, sheetHeight, cleanup } = setup();
    sheet.toggle();
    expect(sheet.state).toBe("peek");
    expect(sheetHeight()).toBe(70);
    expect(grab.getAttribute("aria-expanded")).toBe("false");
    sheet.open();
    expect(sheet.state).toBe("half");
    sheet.toggle();
    field.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(panel.dataset.sheet).toBe("half");
    cleanup();
  });

  it("is a plain side panel when the layout isn't stacked", () => {
    const { sheet, panel, cleanup, changeLayout } = setup();
    changeLayout(false);
    expect(sheet.active).toBe(false);
    expect(panel.style.height).toBe("");
    expect(panel.dataset.sheet).toBeUndefined();
    sheet.toggle();
    expect(panel.style.height).toBe("");
    changeLayout(true);
    expect(panel.style.height).toBe("264px");
    cleanup();
  });
});
