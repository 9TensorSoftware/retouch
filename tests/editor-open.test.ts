import type { ViewHandle } from "../src/types";
import { createEditor } from "../src/ui/editor/editor";
import { makeImageEntry, stubLayout } from "./editor-helpers";

/** The rail button marked as the open tool, by its label. */
const activeTool = () =>
  document.querySelector('.rt-toolbar__btn[aria-current="true"]')?.getAttribute("aria-label");
const inspectorTitle = () => document.querySelector(".rt-inspector__title")?.textContent;

describe("editor opening tool", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle | null = null;

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    document.body.innerHTML = "";
    restoreLayout();
  });

  function open(options: Partial<Parameters<typeof createEditor>[0]> = {}): void {
    editor = createEditor({
      entry: makeImageEntry(),
      onDone: vi.fn(),
      onCancel: vi.fn(),
      ...options,
    });
    document.body.appendChild(editor.root);
  }

  it("opens on the first tool by default", () => {
    open();
    expect(activeTool()).toBe("Crop");
    expect(inspectorTitle()).toBe("Crop");
  });

  it("opens on the tool it's asked for", () => {
    open({ tool: "adjust" });
    expect(activeTool()).toBe("Adjust");
    expect(inspectorTitle()).toBe("Adjust");
  });

  it("falls back to the first tool when the one asked for isn't offered", () => {
    open({ tools: ["crop", "filters"], tool: "adjust" });
    expect(activeTool()).toBe("Crop");
  });
});
