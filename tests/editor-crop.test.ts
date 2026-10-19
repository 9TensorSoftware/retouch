import type { ImageEntry, ViewHandle } from "../src/types";
import { createEditor } from "../src/ui/editor/editor";
import { makeImageEntry, stubLayout } from "./editor-helpers";

/** The 1:1 marquee centered on a 16:9 frame. */
const SQUARE_ON_16_9 = { x: 0.21875, y: 0, width: 0.5625, height: 1 };

function button(selector: string, text?: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>(selector)].find(
    (el) => text === undefined || el.textContent === text,
  );
  if (!found) throw new Error(`missing ${selector} ${text ?? ""}`);
  return found;
}

/** Let the confirm question's answer run through. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const FULL = { x: 0, y: 0, width: 1, height: 1 };

function expectSquareCrop(entry: ImageEntry): void {
  expect(entry.edits.crop).toEqual(
    Object.fromEntries(Object.entries(SQUARE_ON_16_9).map(([k, v]) => [k, expect.closeTo(v, 6)])),
  );
}

const question = () => document.querySelector(".rt-confirm");
const activeTool = () => document.querySelector(".rt-inspector__title")?.textContent;
const railActive = () =>
  document.querySelector(".rt-toolbar__btn--active")?.getAttribute("aria-label");

describe("editor crop confirmation", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle;
  let entry: ImageEntry;
  let onDone: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
    entry = makeImageEntry();
    onDone = vi.fn();
    onCancel = vi.fn();
    editor = createEditor({ entry, onDone, onCancel });
    document.body.appendChild(editor.root);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  /** Images open on Crop; a 1:1 shape leaves a frame waiting to be applied. */
  function proposeSquare(): void {
    button(".rt-aspect", "Square").click();
    expect(button(".rt-inspector__reset").hidden).toBe(false);
  }

  it("applies only from Apply, which waits for a frame to apply", () => {
    expect(button(".rt-crop-pane__actions .rt-dock__chip", "Apply").disabled).toBe(true);
    expect(button(".rt-crop-pane__actions .rt-dock__chip", "Cancel").disabled).toBe(true);
    proposeSquare();
    expect(entry.edits.crop).toEqual(FULL);
    const apply = button(".rt-crop-pane__actions .rt-dock__chip", "Apply");
    expect(apply.disabled).toBe(false);
    apply.click();
    expectSquareCrop(entry);
    expect(apply.disabled).toBe(true);
    expect(question()).toBeNull();
  });

  it("applies on Enter, an explicit OK from the keyboard", () => {
    proposeSquare();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expectSquareCrop(entry);
  });

  it("puts the frame back on Cancel without cropping", () => {
    proposeSquare();
    button(".rt-crop-pane__actions .rt-dock__chip", "Cancel").click();
    expect(entry.edits.crop).toEqual(FULL);
    expect(button(".rt-crop-pane__actions .rt-dock__chip", "Apply").disabled).toBe(true);
    expect(button(".rt-aspect", "Free").getAttribute("aria-pressed")).toBe("true");
  });

  it("asks before switching tools with a frame nobody applied", async () => {
    proposeSquare();
    button('.rt-toolbar__btn[aria-label="Adjust"]').click();
    expect(question()).not.toBeNull();
    expect(activeTool()).toBe("Crop");
    expect(railActive()).toBe("Crop");
    expect(entry.edits.crop).toEqual(FULL);

    button(".rt-confirm__btn", "Apply").click();
    await settle();
    expect(question()).toBeNull();
    expectSquareCrop(entry);
    expect(activeTool()).toBe("Adjust");
    expect(railActive()).toBe("Adjust");
  });

  it("switches without cropping when the frame is discarded", async () => {
    proposeSquare();
    button('.rt-toolbar__btn[aria-label="Adjust"]').click();
    button(".rt-confirm__btn", "Discard").click();
    await settle();
    expect(entry.edits.crop).toEqual(FULL);
    expect(activeTool()).toBe("Adjust");
  });

  it("stays in Crop, frame and all, when the question is dismissed with Esc", async () => {
    proposeSquare();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" })); // Adjust's key
    expect(question()).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    expect(question()).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
    expect(activeTool()).toBe("Crop");
    expect(railActive()).toBe("Crop");
    expect(button(".rt-crop-pane__actions .rt-dock__chip", "Apply").disabled).toBe(false);
    expect(entry.edits.crop).toEqual(FULL);
  });

  it("asks before Done, then finishes with the crop applied", async () => {
    proposeSquare();
    button(".rt-editor__btn-done").click();
    expect(onDone).not.toHaveBeenCalled();
    button(".rt-confirm__btn", "Apply").click();
    await settle();
    expect(onDone).toHaveBeenCalledOnce();
    expectSquareCrop(entry);
  });

  it("asks on ⌘/Ctrl+Enter too, and can finish without the crop", async () => {
    proposeSquare();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    expect(question()).not.toBeNull();
    button(".rt-confirm__btn", "Discard").click();
    await settle();
    expect(onDone).toHaveBeenCalledOnce();
    expect(entry.edits.crop).toEqual(FULL);
  });

  it("finishes at once when there's no frame waiting", async () => {
    button(".rt-editor__btn-done").click();
    await settle();
    expect(question()).toBeNull();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("puts an unapplied frame back on Esc; the next Esc cancels", () => {
    proposeSquare();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).not.toHaveBeenCalled();
    expect(button(".rt-crop-pane__actions .rt-dock__chip", "Apply").disabled).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("drops the frame on the editor's Cancel", () => {
    proposeSquare();
    button(".rt-editor__btn-cancel").click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(entry.edits.crop).toEqual(FULL);
  });
});

describe("editor crop on touch", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle;
  let entry: ImageEntry;

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
    entry = makeImageEntry();
    editor = createEditor({ entry, onDone: vi.fn(), onCancel: vi.fn() });
    document.body.appendChild(editor.root);
    button(".rt-aspect", "Square").click();
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  /** jsdom has no PointerEvent: a MouseEvent carrying the pointer's id. */
  function pointer(el: EventTarget, type: string, id: number, x: number, y: number): void {
    el.dispatchEvent(
      Object.assign(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }),
        {
          pointerId: id,
          pointerType: "touch",
        },
      ),
    );
  }

  it("moves the frame with the finger that took it, not with another", () => {
    const frame = document.querySelector(".rt-crop__selection") as HTMLElement;
    const before = frame.style.left;
    pointer(frame, "pointerdown", 1, 300, 300);
    pointer(document, "pointermove", 2, 380, 300); // another finger
    expect(frame.style.left).toBe(before);
    pointer(document, "pointermove", 1, 240, 300);
    expect(frame.style.left).not.toBe(before);
    pointer(document, "pointerup", 2, 380, 300); // the other finger lifting doesn't end it
    pointer(document, "pointermove", 1, 200, 300);
    const moved = frame.style.left;
    pointer(document, "pointercancel", 1, 200, 300);
    pointer(document, "pointermove", 1, 100, 300);
    expect(frame.style.left).toBe(moved);
  });
});
