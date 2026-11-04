import type { ImageEntry, ViewHandle } from "../src/types";
import { createEditor } from "../src/ui/editor/editor";
import type { ToolContext } from "../src/ui/editor/tool-registry";
import { registerEditorTool } from "../src/ui/editor/tool-registry";
import { makeImageEntry, stubLayout } from "./editor-helpers";

let probe: ToolContext | undefined;
registerEditorTool({
  id: "inspector-probe-looks",
  label: "Probe looks",
  icon: "<svg></svg>",
  mount(ctx) {
    probe = ctx;
    const tiles = ctx.ui.tiles({
      label: "Look",
      options: [
        { value: "noir", label: "Noir", preview: ctx.preview({ filter: "bw" }) },
        { value: "warm", label: "Warm", preview: ctx.preview({ filter: "warm" }) },
      ],
      value: null,
      onChange: (look) => {
        ctx.edits.filter = look === "noir" ? "bw" : "warm";
        ctx.render();
        ctx.record();
        tiles.set(look);
      },
    });
    return { root: tiles.root, sync: () => tiles.set(null) };
  },
});

function key(k: string, init: KeyboardEventInit = {}): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
}

describe("editor inspector", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle;
  let entry: ImageEntry;

  const reset = () =>
    document.querySelector<HTMLButtonElement>(".rt-inspector__reset") as HTMLButtonElement;
  const tool = (label: string) =>
    document.querySelector<HTMLButtonElement>(`.rt-toolbar__btn[aria-label="${label}"]`)?.click();

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
    entry = makeImageEntry();
    editor = createEditor({ entry, onDone: vi.fn(), onCancel: vi.fn() });
    document.body.appendChild(editor.root);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  it("offers Reset for the active tool only while it has changes", () => {
    tool("Adjust");
    expect(reset().hidden).toBe(true);
    const exposure = [
      ...document.querySelectorAll<HTMLInputElement>('.rt-adjust input[type="range"]'),
    ][0];
    exposure.value = "40";
    exposure.dispatchEvent(new Event("input"));
    expect(entry.edits.adjustments.exposure).toBe(40);
    expect(reset().hidden).toBe(false);
    expect(reset().getAttribute("aria-label")).toBe("Reset Adjust");

    reset().click();
    expect(entry.edits.adjustments.exposure).toBe(0);
    expect(reset().hidden).toBe(true);
    expect(exposure.value).toBe("0");
  });

  it("resets Crop's framing: the crop, straighten, and turns", () => {
    tool("Crop");
    document
      .querySelector<HTMLButtonElement>('.rt-dock__icon-btn[aria-label="Rotate right"]')
      ?.click();
    const ruler = document.querySelector(".rt-ruler") as HTMLElement;
    ruler.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true }));
    expect(entry.edits.orientation).toBe(90);
    expect(entry.edits.rotation).toBe(1);
    reset().click();
    expect(entry.edits.orientation).toBe(0);
    expect(entry.edits.rotation).toBe(0);
    expect(entry.edits.crop).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(document.querySelector(".rt-ruler__value")?.textContent).toBe("0.0°");
  });

  describe("Compare", () => {
    const compare = () => document.querySelector(".rt-editor__compare-btn") as HTMLButtonElement;
    const split = () => document.querySelector(".rt-split") as HTMLElement;
    const pane = () => document.querySelector(".rt-compare-pane");
    const views = () => document.querySelector(".rt-editor__compare-views") as HTMLElement;
    const view = (label: string) =>
      document.querySelector(
        `.rt-editor__compare-view[aria-label="${label}"]`,
      ) as HTMLButtonElement;

    beforeEach(() => localStorage.removeItem("rt-compare-view"));
    afterEach(() => localStorage.removeItem("rt-compare-view"));

    it("toggles the divider with the button and \\, offering the views while on", () => {
      tool("Adjust");
      expect(views().hidden).toBe(true);
      compare().click();
      expect(compare().getAttribute("aria-pressed")).toBe("true");
      expect(split().hidden).toBe(false);
      expect(pane()).toBeNull();
      expect(views().hidden).toBe(false);
      expect(view("Divider").getAttribute("aria-pressed")).toBe("true");
      key("\\");
      expect(compare().getAttribute("aria-pressed")).toBe("false");
      expect(split().hidden).toBe(true);
      expect(views().hidden).toBe(true);
    });

    it("switches between the divider and side by side", () => {
      tool("Adjust");
      compare().click();
      view("Side by side").click();
      expect(pane()).not.toBeNull();
      expect(split().hidden).toBe(true);
      expect(view("Side by side").getAttribute("aria-pressed")).toBe("true");
      view("Divider").click();
      expect(pane()).toBeNull();
      expect(split().hidden).toBe(false);
      key("\\");
      view("Side by side").click();
      key("\\");
      expect(pane()).not.toBeNull();
      key("\\");
      expect(pane()).toBeNull();
    });

    it("has only side by side in Crop, and comes back to the divider after", () => {
      tool("Adjust");
      compare().click();
      tool("Crop");
      expect(pane()).not.toBeNull();
      expect(split().hidden).toBe(true);
      expect(view("Divider").disabled).toBe(true);
      expect(view("Side by side").getAttribute("aria-pressed")).toBe("true");
      tool("Filters");
      expect(pane()).toBeNull();
      expect(split().hidden).toBe(false);
      expect(view("Divider").disabled).toBe(false);
    });

    it("starts side by side when the framing changed, until a view is picked", () => {
      tool("Adjust");
      entry.edits.orientation = 90;
      compare().click();
      expect(pane()).not.toBeNull();
      view("Divider").click();
      expect(split().hidden).toBe(false);
      key("\\");
      key("\\");
      expect(split().hidden).toBe(false);
    });

    it("remembers the picked view for the next editor", () => {
      tool("Adjust");
      compare().click();
      view("Side by side").click();
      editor.destroy();
      document.body.innerHTML = "";
      entry = makeImageEntry();
      editor = createEditor({ entry, onDone: vi.fn(), onCancel: vi.fn() });
      document.body.appendChild(editor.root);
      tool("Adjust");
      compare().click();
      expect(pane()).not.toBeNull();
    });
  });

  it("falls back to side by side when the original no longer lines up", () => {
    editor.destroy();
    document.body.innerHTML = "";
    entry = makeImageEntry();
    entry.original = { file: entry.file, image: entry.image };
    editor = createEditor({
      entry,
      onDone: vi.fn(),
      onCancel: vi.fn(),
      hasOriginal: () => true,
      originalAligned: () => false,
    });
    document.body.appendChild(editor.root);
    key("\\");
    expect(document.querySelector(".rt-compare-pane")).not.toBeNull();
    expect((document.querySelector(".rt-split") as HTMLElement).hidden).toBe(true);
    const divider = document.querySelector(
      '.rt-editor__compare-view[aria-label="Divider"]',
    ) as HTMLButtonElement;
    expect(divider.disabled).toBe(true);
    key("\\");
    expect(document.querySelector(".rt-compare-pane")).toBeNull();
  });

  it("resizes the liquify brush with [ and ]", () => {
    tool("Liquify");
    const size = () =>
      (document.querySelector('.rt-liquify input[aria-label="Brush size"]') as HTMLInputElement)
        .value;
    expect(size()).toBe("20");
    key("]");
    key("]");
    expect(size()).toBe("26");
    key("[");
    expect(size()).toBe("23");
  });

  it("gives plugins preview tiles drawn from the photo", () => {
    expect(typeof probe?.preview()).toBe("string");
    expect(probe?.preview({ filter: "bw" })).toMatch(/^data:image\//);
    tool("Probe looks");
    const [noir] = [
      ...document.querySelectorAll<HTMLButtonElement>('[aria-label="Look"] .rt-tile'),
    ];
    noir.click();
    expect(entry.edits.filter).toBe("bw");
    expect(noir.getAttribute("aria-pressed")).toBe("true");
  });
});
