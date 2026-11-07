import { DEFAULT_EDITS } from "../src/constants";
import { CanvasRenderer } from "../src/ui/editor/canvas-renderer";
import { applyDetailToContext } from "../src/utils/detail";

// Count the most expensive 2D pass (Dehaze/Clarity) without running it.
vi.mock("../src/utils/detail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/detail")>();
  return { ...actual, applyDetailToContext: vi.fn() };
});

type FabricCanvas = {
  renderAll(): void;
  requestRenderAll(): void;
  setDimensions(size: { width: number; height: number }): void;
};

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

describe("canvas sizing", () => {
  // Resizing a canvas blanks it until the next paint, so an edit that keeps
  // the size mustn't resize: a Liquify stroke would flash the stage through.
  it("resizes the canvas only when its size changes", () => {
    const { renderer, fabric, edits } = setup();
    const resize = vi.spyOn(fabric, "setDimensions");
    renderer.render();
    expect(resize).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenLastCalledWith({ width: 400, height: 300 });

    renderer.setAdjustments({ ...edits.adjustments, dehaze: 60 });
    renderer.render();
    renderer.render();
    expect(resize).toHaveBeenCalledTimes(1);

    renderer.setCrop({ x: 0, y: 0, width: 0.5, height: 1 });
    renderer.render();
    expect(resize).toHaveBeenCalledTimes(2);
    // Half the picture, enlarged to fill the stage rather than kept at its own pixels.
    expect(resize).toHaveBeenLastCalledWith({ width: 360, height: 540 });
  });
});
