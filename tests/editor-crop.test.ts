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

describe("editor crop commit", () => {
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
    // Images open on Crop; shaping a 1:1 marquee leaves a pending selection,
    // which the inspector's Reset already counts as a change.
    button(".rt-aspect", "Square").click();
    expect(button(".rt-inspector__reset").hidden).toBe(false);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  it("commits a pending marquee when Done is pressed", () => {
    button(".rt-editor__btn-done").click();
    expect(onDone).toHaveBeenCalledOnce();
    expect(entry.edits.crop).toEqual(
      Object.fromEntries(Object.entries(SQUARE_ON_16_9).map(([k, v]) => [k, expect.closeTo(v, 6)])),
    );
  });

  it("commits a pending marquee on ⌘/Ctrl+Enter", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true }));
    expect(onDone).toHaveBeenCalledOnce();
    expect(entry.edits.crop.width).toBeCloseTo(SQUARE_ON_16_9.width, 6);
  });

  it("commits a pending marquee when switching to another tool", () => {
    button('.rt-toolbar__btn[aria-label="Adjust"]').click();
    expect(onDone).not.toHaveBeenCalled();
    expect(entry.edits.crop.x).toBeCloseTo(SQUARE_ON_16_9.x, 6);
    expect(entry.edits.crop.width).toBeCloseTo(SQUARE_ON_16_9.width, 6);
  });

  it("drops the marquee on Cancel", () => {
    button(".rt-editor__btn-cancel").click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(entry.edits.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
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
