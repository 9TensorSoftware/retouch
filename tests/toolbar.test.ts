import { registerEditorTool, resolveToolDef } from "../src/ui/editor/tool-registry";
import { createToolbar } from "../src/ui/editor/toolbar";

const pane = () => ({ root: document.createElement("div") });

registerEditorTool({
  id: "test-ai-a",
  label: "Cutout",
  icon: "<svg></svg>",
  group: "ai",
  description: "Remove the background",
  badge: "25 MB",
  mount: pane,
});
registerEditorTool({
  id: "test-ai-b",
  label: "Upscale",
  icon: "<svg></svg>",
  group: "ai",
  mount: pane,
});
registerEditorTool({
  id: "test-stamp",
  label: "Stamp",
  icon: "<svg></svg>",
  shortcut: "K",
  mount: pane,
});

function mount(tools: string[], activeTool = tools[0]) {
  const onToolChange = vi.fn();
  const tb = createToolbar({ tools, activeTool, onToolChange });
  document.body.appendChild(tb.root);
  return { tb, onToolChange };
}

/** jsdom has no PointerEvent; the toolbar only reads `pointerType`. */
function pointer(type: string, pointerType = "mouse"): Event {
  return Object.assign(new MouseEvent(type, { bubbles: true }), { pointerType });
}

function press(el: Element, key: string): KeyboardEvent {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e;
}

describe("toolbar rail groups", () => {
  it("orders tools by group, separated, whatever order they were given in", () => {
    const { tb } = mount(["filters", "adjust", "crop", "curves", "transform"], "crop");
    const rail = [...tb.root.children]
      .filter((el) => el.matches(".rt-toolbar__btn, .rt-toolbar__sep"))
      .map((el) => el.getAttribute("aria-label") ?? "|");
    expect(rail).toEqual(["Crop", "Transform", "|", "Adjust", "Curves", "|", "Filters"]);
    expect(tb.order).toEqual(["crop", "transform", "adjust", "curves", "filters"]);
    tb.destroy();
  });

  it("puts plugins without a group after the built-in groups", () => {
    const { tb } = mount(["test-stamp", "filters", "crop"], "crop");
    expect(tb.order).toEqual(["crop", "filters", "test-stamp"]);
    tb.destroy();
  });
});

describe("toolbar AI tools", () => {
  it("gathers two or more behind one launcher, listed last in the key order", () => {
    const { tb } = mount(["test-ai-b", "crop", "test-ai-a"], "crop");
    const launcher = tb.root.querySelector(".rt-toolbar__btn--ai");
    expect(launcher?.getAttribute("aria-haspopup")).toBe("menu");
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
    const menu = tb.root.querySelector<HTMLElement>(".rt-flyout");
    expect(menu?.hidden).toBe(true);
    const items = [...tb.root.querySelectorAll(".rt-flyout__item")];
    expect(items.map((i) => i.querySelector(".rt-flyout__name")?.textContent)).toEqual([
      "Upscale",
      "Cutout",
    ]);
    expect(items[1].querySelector(".rt-flyout__desc")?.textContent).toBe("Remove the background");
    expect(items[1].querySelector(".rt-flyout__badge")?.textContent).toBe("25 MB");
    expect(tb.order).toEqual(["crop", "test-ai-b", "test-ai-a"]);
    tb.destroy();
  });

  it("keeps a lone AI tool on the rail", () => {
    const { tb } = mount(["crop", "test-ai-a"]);
    expect(tb.root.querySelector(".rt-toolbar__btn--ai")).toBeNull();
    expect(tb.root.querySelectorAll(".rt-toolbar__btn")).toHaveLength(2);
    expect(tb.openAiMenu()).toBe(false);
    tb.destroy();
  });

  it("opens on demand, moves with the arrow keys, and Escape closes only the menu", () => {
    const { tb } = mount(["crop", "test-ai-a", "test-ai-b"]);
    const launcher = tb.root.querySelector<HTMLElement>(".rt-toolbar__btn--ai");
    const menu = tb.root.querySelector<HTMLElement>(".rt-flyout");
    const [first, second] = [...tb.root.querySelectorAll<HTMLElement>(".rt-flyout__item")];

    expect(tb.openAiMenu()).toBe(true);
    expect(menu?.hidden).toBe(false);
    expect(launcher?.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(first);

    press(first, "ArrowDown");
    expect(document.activeElement).toBe(second);
    press(second, "ArrowDown");
    expect(document.activeElement).toBe(first);
    press(first, "ArrowUp");
    expect(document.activeElement).toBe(second);
    press(second, "Home");
    expect(document.activeElement).toBe(first);
    press(first, "End");
    expect(document.activeElement).toBe(second);

    // The editor closes on Escape at the document; the menu must swallow it.
    const editorEscape = vi.fn();
    document.addEventListener("keydown", editorEscape);
    press(second, "Escape");
    document.removeEventListener("keydown", editorEscape);
    expect(editorEscape).not.toHaveBeenCalled();
    expect(menu?.hidden).toBe(true);
    expect(launcher?.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(launcher);
    tb.destroy();
  });

  it("selecting an item closes the menu and marks the launcher active", () => {
    const { tb, onToolChange } = mount(["crop", "test-ai-a", "test-ai-b"]);
    const launcher = tb.root.querySelector(".rt-toolbar__btn--ai");
    const items = [...tb.root.querySelectorAll<HTMLElement>(".rt-flyout__item")];
    tb.openAiMenu();
    items[1].click();
    expect(onToolChange).toHaveBeenCalledWith("test-ai-b");
    expect(tb.root.querySelector<HTMLElement>(".rt-flyout")?.hidden).toBe(true);
    expect(launcher?.classList.contains("rt-toolbar__btn--active")).toBe(true);
    expect(items[1].classList.contains("rt-flyout__item--active")).toBe(true);
    expect(items[1].getAttribute("aria-current")).toBe("true");

    // Reopening focuses the active tool, not the first.
    tb.openAiMenu();
    expect(document.activeElement).toBe(items[1]);

    tb.setActiveTool("crop");
    expect(launcher?.classList.contains("rt-toolbar__btn--active")).toBe(false);
    expect(items[1].hasAttribute("aria-current")).toBe(false);
    tb.destroy();
  });

  it("closes when you press outside it", () => {
    const { tb } = mount(["crop", "test-ai-a", "test-ai-b"]);
    tb.openAiMenu();
    document.body.dispatchEvent(pointer("pointerdown"));
    expect(tb.root.querySelector<HTMLElement>(".rt-flyout")?.hidden).toBe(true);
    tb.destroy();
  });
});

describe("toolbar shortcuts", () => {
  it("maps letters to tools, ignoring case", () => {
    const { tb } = mount(["crop", "adjust", "test-stamp"]);
    expect(tb.toolForKey("c")).toBe("crop");
    expect(tb.toolForKey("A")).toBe("adjust");
    expect(tb.toolForKey("k")).toBe("test-stamp");
    expect(tb.toolForKey("v")).toBeUndefined(); // curves isn't in this toolbar
    expect(tb.root.querySelector('[aria-label="Stamp"]')?.getAttribute("aria-keyshortcuts")).toBe(
      "K",
    );
    tb.destroy();
  });

  it("drops plugin shortcuts that collide with the editor's keys", () => {
    for (const [id, shortcut] of [
      ["test-key-i", "i"],
      ["test-key-digit", "5"],
      ["test-key-zoom", "+"],
      ["test-key-crop", "c"],
      ["test-key-long", "ab"],
    ]) {
      registerEditorTool({ id, label: id, icon: "", shortcut, mount: pane });
      expect(resolveToolDef(id).shortcut).toBeUndefined();
    }
  });
});

describe("toolbar tooltip", () => {
  it("shows the label and key on mouse hover, not on touch", () => {
    const { tb } = mount(["crop", "adjust"]);
    const tip = tb.root.querySelector<HTMLElement>(".rt-tooltip");
    const crop = tb.root.querySelector('[aria-label="Crop"]');
    crop?.dispatchEvent(pointer("pointerenter"));
    expect(tip?.hidden).toBe(false);
    expect(tip?.firstChild?.textContent).toBe("Crop");
    expect(tip?.querySelector("kbd")?.textContent).toBe("C");
    crop?.dispatchEvent(pointer("pointerleave"));
    expect(tip?.hidden).toBe(true);

    crop?.dispatchEvent(pointer("pointerenter", "touch"));
    expect(tip?.hidden).toBe(true);
    tb.destroy();
  });
});
