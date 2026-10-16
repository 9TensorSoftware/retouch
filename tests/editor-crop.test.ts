import { DEFAULT_EDITS } from "../src/constants";
import type { ImageEntry, ViewHandle } from "../src/types";
import { createEditor } from "../src/ui/editor/editor";

// jsdom has no layout, and the crop marquee is sized against the rendered
// image rect, so give every element a plausible box for these tests.
function stubLayout(width: number, height: number): () => void {
  const proto = HTMLElement.prototype;
  const saved = (["clientWidth", "clientHeight"] as const).map(
    (key) => [key, Object.getOwnPropertyDescriptor(proto, key)] as const,
  );
  Object.defineProperty(proto, "clientWidth", { configurable: true, get: () => width });
  Object.defineProperty(proto, "clientHeight", { configurable: true, get: () => height });
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(proto, key, descriptor);
      else Reflect.deleteProperty(proto, key);
    }
  };
}

function makeEntry(): ImageEntry {
  const image = new Image();
  Object.defineProperty(image, "naturalWidth", { value: 1600 });
  Object.defineProperty(image, "naturalHeight", { value: 900 });
  return {
    id: "fjord",
    kind: "image",
    file: new File(["x"], "fjord.jpg", { type: "image/jpeg" }),
    image,
    edits: structuredClone(DEFAULT_EDITS),
    edited: false,
  } as unknown as ImageEntry;
}

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
    entry = makeEntry();
    onDone = vi.fn();
    onCancel = vi.fn();
    editor = createEditor({ entry, onDone, onCancel });
    document.body.appendChild(editor.root);
    // Images open on Crop; shaping a 1:1 marquee leaves a pending selection.
    button(".rt-dock__chip", "1:1").click();
    expect(button(".rt-dock__chip", "Apply crop").disabled).toBe(false);
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
