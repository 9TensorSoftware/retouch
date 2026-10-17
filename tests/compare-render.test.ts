import { DEFAULT_EDITS } from "../src/constants";
import { CanvasRenderer } from "../src/ui/editor/canvas-renderer";
import { applyDetailToContext } from "../src/utils/detail";

// Count the most expensive 2D pass (Dehaze/Clarity) without running it.
vi.mock("../src/utils/detail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/detail")>();
  return { ...actual, applyDetailToContext: vi.fn() };
});

type FabricCanvas = { renderAll(): void; requestRenderAll(): void };

function setup() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const image = new Image();
  Object.defineProperty(image, "naturalWidth", { value: 400 });
  Object.defineProperty(image, "naturalHeight", { value: 300 });
  const edits = structuredClone(DEFAULT_EDITS);
  edits.adjustments.dehaze = 40;
  const renderer = new CanvasRenderer(container, image, edits);
  // The fabric canvas renders on the next frame; tests paint it on demand.
  const fabric = (renderer as unknown as { fabricCanvas: FabricCanvas }).fabricCanvas;
  return { renderer, fabric, edits };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.mocked(applyDetailToContext).mockClear();
});

describe("compare divider rendering", () => {
  it("moves the divider without running the edits over the photo again", () => {
    const { renderer, fabric } = setup();
    renderer.render();
    renderer.setSplit(0.5);
    fabric.renderAll();
    const passes = vi.mocked(applyDetailToContext).mock.calls.length;
    expect(passes).toBeGreaterThan(0);

    const request = vi.spyOn(fabric, "requestRenderAll");
    for (const fraction of [0.3, 0.45, 0.7, 0.2]) renderer.setSplit(fraction);
    expect(request).not.toHaveBeenCalled();
    expect(vi.mocked(applyDetailToContext).mock.calls.length).toBe(passes);
  });

  it("still renders in full when an edit changes while comparing", () => {
    const { renderer, fabric, edits } = setup();
    renderer.render();
    renderer.setSplit(0.5);
    fabric.renderAll();
    const request = vi.spyOn(fabric, "requestRenderAll");
    renderer.setAdjustments({ ...edits.adjustments, dehaze: 60 });
    renderer.render();
    expect(request).toHaveBeenCalled();
  });
});
