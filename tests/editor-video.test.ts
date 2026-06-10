import { createDefaultVideoEdits } from "../src/constants";
import { createToolbar } from "../src/ui/editor/toolbar";
import { createTransportBar } from "../src/ui/editor/transport-bar";

function makeTransport(duration = 10) {
  const video = document.createElement("video");
  const edits = createDefaultVideoEdits(duration);
  const seekQueue = { seek: vi.fn(async () => {}), destroy: vi.fn() };
  const transport = createTransportBar({
    video,
    edits,
    seekQueue,
    videoUrl: "blob:test",
    duration,
    videoWidth: 640,
    videoHeight: 360,
    onMuteChange: vi.fn(),
  });
  document.body.appendChild(transport.root);
  return { video, edits, transport, seekQueue };
}

function key(el: Element, keyName: string, shiftKey = false): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, shiftKey, bubbles: true }));
}

describe("transport bar trim handles", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("nudges the in-handle with arrow keys and clamps at 0", () => {
    const { edits, transport } = makeTransport(10);
    const inHandle = transport.root.querySelector(".rt-filmstrip__handle--in");
    if (!inHandle) throw new Error("missing in handle");

    key(inHandle, "ArrowRight");
    expect(edits.trim.start).toBeCloseTo(0.1);
    key(inHandle, "ArrowRight", true);
    expect(edits.trim.start).toBeCloseTo(1.1);
    key(inHandle, "ArrowLeft", true);
    key(inHandle, "ArrowLeft");
    key(inHandle, "ArrowLeft");
    expect(edits.trim.start).toBe(0);
  });

  it("clamps the out-handle to the duration and the minimum length", () => {
    const { edits, transport } = makeTransport(10);
    const outHandle = transport.root.querySelector(".rt-filmstrip__handle--out");
    if (!outHandle) throw new Error("missing out handle");

    key(outHandle, "ArrowRight");
    expect(edits.trim.end).toBe(10);

    // Walk the out-handle down toward the in-handle; it must stop 0.1s above it.
    for (let i = 0; i < 12; i++) key(outHandle, "ArrowLeft", true);
    expect(edits.trim.end).toBeCloseTo(0.1);
    expect(edits.trim.end - edits.trim.start).toBeGreaterThanOrEqual(0.1 - 1e-9);
  });

  it("seeks to the nudged handle position for live preview", () => {
    const { transport, seekQueue } = makeTransport(10);
    const inHandle = transport.root.querySelector(".rt-filmstrip__handle--in");
    if (!inHandle) throw new Error("missing in handle");
    key(inHandle, "ArrowRight");
    expect(seekQueue.seek).toHaveBeenCalledWith(expect.closeTo(0.1, 5));
  });

  it("setTrim clamps and notifies subscribers; aria values track the range", () => {
    const { edits, transport } = makeTransport(10);
    const fn = vi.fn();
    transport.onTrimChange(fn);
    transport.setTrim({ start: -5, end: 50 });
    expect(edits.trim).toEqual({ start: 0, end: 10 });
    expect(fn).toHaveBeenCalledWith({ start: 0, end: 10 });

    const inHandle = transport.root.querySelector(".rt-filmstrip__handle--in");
    expect(inHandle?.getAttribute("aria-valuenow")).toBe("0.00");
    expect(inHandle?.getAttribute("role")).toBe("slider");
  });

  it("toggles handle visibility via setTrimEditable", () => {
    const { transport } = makeTransport(10);
    const strip = transport.root.querySelector(".rt-filmstrip");
    expect(strip?.classList.contains("rt-filmstrip--editable")).toBe(false);
    transport.setTrimEditable(true);
    expect(strip?.classList.contains("rt-filmstrip--editable")).toBe(true);
  });
});

describe("toolbar tool list", () => {
  it("renders exactly the given tools in order", () => {
    const tb = createToolbar({
      tools: ["trim", "crop", "adjust", "filters"],
      activeTool: "trim",
      onToolChange: vi.fn(),
    });
    const btns = [...tb.root.querySelectorAll(".rt-toolbar__btn")];
    expect(btns.map((b) => b.getAttribute("title"))).toEqual(["Trim", "Crop", "Adjust", "Filters"]);
    expect(tb.root.querySelector(".rt-toolbar__btn--active")?.getAttribute("title")).toBe("Trim");
    tb.destroy();
  });

  it("renders the image tool set without trim", () => {
    const tb = createToolbar({
      tools: ["crop", "adjust", "filters"],
      activeTool: "crop",
      onToolChange: vi.fn(),
    });
    expect(tb.root.querySelectorAll(".rt-toolbar__btn")).toHaveLength(3);
    tb.destroy();
  });
});
