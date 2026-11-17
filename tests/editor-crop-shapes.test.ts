import type { CropRect, ImageEntry, ViewHandle } from "../src/types";
import { createEditor } from "../src/ui/editor/editor";
import { boundsOf } from "../src/utils/crop-shape";
import { rotateCropCW } from "../src/utils/transform";
import { makeImageEntry, stubLayout } from "./editor-helpers";

/** The 1:1 frame centered on a 16:9 photo. */
const SQUARE: CropRect = { x: 0.21875, y: 0, width: 0.5625, height: 1 };
const FULL: CropRect = { x: 0, y: 0, width: 1, height: 1 };

function button(selector: string, text?: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>(selector)].find(
    (el) => text === undefined || el.textContent === text,
  );
  if (!found) throw new Error(`missing ${selector} ${text ?? ""}`);
  return found;
}

const shapeButton = (label: string) => button(`.rt-crop-shapes__btn[aria-label="${label}"]`);
const apply = () => button(".rt-crop-pane__actions .rt-dock__chip", "Apply");
const cancel = () => button(".rt-crop-pane__actions .rt-dock__chip", "Cancel");
const key = (k: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: k }));
const question = () => document.querySelector(".rt-confirm");
const activeTool = () => document.querySelector(".rt-inspector__title")?.textContent;

function expectRect(actual: CropRect, expected: CropRect): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.width).toBeCloseTo(expected.width, 6);
  expect(actual.height).toBeCloseTo(expected.height, 6);
}

// jsdom has no PointerEvent: a MouseEvent carrying the pointer fields stands in.
function click(target: Element, x: number, y: number): void {
  for (const type of ["pointerdown", "pointerup"]) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    (type === "pointerdown" ? target : document).dispatchEvent(
      Object.assign(event, { pointerId: 1, pointerType: "mouse" }),
    );
  }
}

describe("shaped crops in the editor", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle;
  let entry: ImageEntry;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
    entry = makeImageEntry();
    onCancel = vi.fn();
    editor = createEditor({ entry, onDone: vi.fn(), onCancel });
    document.body.appendChild(editor.root);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  /** Where the photo sits on the stage, from the outline layer laid over it. */
  function photo(): { x: number; y: number; width: number; height: number } {
    const layer = document.querySelector<HTMLElement>(".rt-crop__draw");
    if (!layer) throw new Error("no outline layer");
    return {
      x: Number.parseFloat(layer.style.left),
      y: Number.parseFloat(layer.style.top),
      width: Number.parseFloat(layer.style.width),
      height: Number.parseFloat(layer.style.height),
    };
  }

  /** Place points at fractions of the photo. */
  function place(points: [number, number][]): void {
    const layer = document.querySelector(".rt-crop__draw") as Element;
    const p = photo();
    for (const [fx, fy] of points) click(layer, p.x + fx * p.width, p.y + fy * p.height);
  }

  it("closes the frame on an ellipse and keeps the shape over it", () => {
    shapeButton("Ellipse").click();
    button(".rt-aspect", "Square").click();
    apply().click();
    expectRect(entry.edits.crop, SQUARE);
    expect(entry.edits.cropShapes).toHaveLength(1);
    expectRect(boundsOf(entry.edits.cropShapes[0].points), FULL);
    // Back to a plain frame, nothing waiting.
    expect(shapeButton("Rectangle").getAttribute("aria-pressed")).toBe("true");
    expect(apply().disabled).toBe(true);
  });

  it("cuts a second crop inside the first: the shape is restated over the new frame", () => {
    shapeButton("Ellipse").click();
    apply().click();
    expectRect(entry.edits.crop, FULL);
    button(".rt-aspect", "Square").click();
    apply().click();
    expectRect(entry.edits.crop, SQUARE);
    expect(entry.edits.cropShapes).toHaveLength(1);
    expectRect(boundsOf(entry.edits.cropShapes[0].points), {
      x: -SQUARE.x / SQUARE.width,
      y: 0,
      width: 1 / SQUARE.width,
      height: 1,
    });
  });

  it("keeps the frame for a shape punched out, and turns it with the photo", () => {
    shapeButton("Ellipse").click();
    button(".rt-segmented__btn", "Outside").click();
    button(".rt-aspect", "Square").click();
    apply().click();
    expectRect(entry.edits.crop, FULL);
    expect(entry.edits.cropShapes[0].invert).toBe(true);
    expectRect(boundsOf(entry.edits.cropShapes[0].points), SQUARE);

    button('.rt-crop-pane [aria-label="Rotate right"]').click();
    expectRect(boundsOf(entry.edits.cropShapes[0].points), rotateCropCW(SQUARE));
  });

  it("carries the soft edge onto the shape", () => {
    shapeButton("Heart").click();
    const soft = document.querySelector<HTMLInputElement>('input[aria-label="Soft edge"]');
    if (!soft) throw new Error("no soft edge slider");
    soft.value = "35";
    soft.dispatchEvent(new Event("input", { bubbles: true }));
    apply().click();
    expect(entry.edits.cropShapes[0].feather).toBe(35);
  });

  it("clears shapes on Reset, brings them back on Undo, and calls the step a crop", () => {
    shapeButton("Star").click();
    apply().click();
    expect(entry.edits.cropShapes).toHaveLength(1);

    button('[aria-label="Edit history"]').click();
    const labels = [...document.querySelectorAll(".rt-history-menu__item")].map(
      (el) => el.textContent,
    );
    expect(labels[0]).toBe("Crop");

    button(".rt-inspector__reset").click();
    expect(entry.edits.cropShapes).toEqual([]);
    button('[aria-label="Undo"]').click();
    expect(entry.edits.cropShapes).toHaveLength(1);
  });

  it("applies an outline placed point by point, with Enter closing it", () => {
    shapeButton("Points").click();
    place([
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.75],
    ]);
    key("Enter");
    expectRect(entry.edits.crop, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 });
    expect(entry.edits.cropShapes[0].points).toEqual([0, 0, 1, 0, 0.5, 1]);
  });

  it("takes points back with Backspace, and all of them with Esc, not the editor", () => {
    shapeButton("Points").click();
    place([
      [0.25, 0.25],
      [0.75, 0.25],
    ]);
    expect(document.querySelectorAll(".rt-crop__vertex")).toHaveLength(2);
    key("Backspace");
    expect(document.querySelectorAll(".rt-crop__vertex")).toHaveLength(1);
    expect(cancel().disabled).toBe(false);
    key("Escape");
    expect(document.querySelectorAll(".rt-crop__vertex")).toHaveLength(0);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("leaves Crop without asking when too few points were placed to crop", () => {
    shapeButton("Points").click();
    place([
      [0.25, 0.25],
      [0.75, 0.25],
    ]);
    button('.rt-toolbar__btn[aria-label="Adjust"]').click();
    expect(question()).toBeNull();
    expect(activeTool()).toBe("Adjust");
    expect(entry.edits.cropShapes).toEqual([]);
  });
});
