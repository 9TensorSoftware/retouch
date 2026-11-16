import { DEFAULT_EDITS } from "../src/constants";
import type { ViewHandle } from "../src/types";
import { createEditor } from "../src/ui/editor/editor";
import { registerEditorTool, type ToolContext } from "../src/ui/editor/tool-registry";
import { makeImageEntry, stubLayout } from "./editor-helpers";

/** A tool with a pick of its own, kept in the editor's history as Select keeps its selection. */
let picked = "nothing";
let probe: ToolContext;
registerEditorTool({
  id: "picker",
  label: "Picker",
  icon: "<svg></svg>",
  mount(ctx) {
    probe = ctx;
    picked = "nothing";
    ctx.undoable<string>({
      tool: "picker",
      get: () => picked,
      set: (state) => {
        picked = state;
      },
    });
    return { root: document.createElement("div") };
  },
});

const pick = (what: string): void => {
  picked = what;
  probe.record(`Pick ${what}`);
};

describe("a tool's own state in the editor's history", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle;

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
  });

  afterEach(() => {
    editor.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  function open(history?: Parameters<typeof createEditor>[0]["history"]): void {
    editor = createEditor({ entry: makeImageEntry(), onDone: vi.fn(), onCancel: vi.fn(), history });
    document.body.appendChild(editor.root);
  }

  const button = (label: string) =>
    document.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement;
  /** The history menu's steps, newest first. */
  function steps(): HTMLButtonElement[] {
    button("Edit history").click();
    return [...document.querySelectorAll<HTMLButtonElement>(".rt-history-menu__item")];
  }
  const labels = () => steps().map((s) => s.textContent);

  it("names its steps in the menu, and Undo, Redo and the menu take its state back", () => {
    open();
    pick("dog");
    pick("cat");
    expect(labels()).toEqual(["Pick cat", "Pick dog", "Original"]);
    expect(button("Undo").disabled).toBe(false);

    button("Undo").click();
    expect(picked).toBe("dog");
    button("Redo").click();
    expect(picked).toBe("cat");
    steps()[2].click();
    expect(picked).toBe("nothing");
  });

  it("takes a named step at once, apart from an edit still settling", () => {
    open();
    probe.edits.adjustments.exposure = 0.5;
    probe.record();
    pick("dog");
    const [last, edit, first] = labels();
    expect([last, first]).toEqual(["Pick dog", "Original"]);
    expect(edit).not.toBe("Pick dog");

    button("Undo").click();
    expect(picked).toBe("nothing");
    expect(probe.edits.adjustments.exposure).toBe(0.5);
  });

  it("takes no step when nothing changed", () => {
    open();
    pick("dog");
    pick("dog");
    expect(labels()).toEqual(["Pick dog", "Original"]);
  });

  it("picks the state up from the step it remounts on, or its first for an older step", () => {
    const edits = structuredClone(DEFAULT_EDITS);
    open({
      steps: [{ edits }, { edits, label: "Pick dog", tools: { picker: "dog" } }],
      cursor: 1,
    });
    expect(picked).toBe("dog");
    // The first step came before the tool kept anything: it had nothing picked.
    button("Undo").click();
    expect(picked).toBe("nothing");
  });
});
