import { registerEditorTool, resolveToolDef } from "../src/ui/editor/tool-registry";
import type { RailLayout } from "../src/ui/editor/toolbar";
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

function mount(tools: string[], activeTool = tools[0], layout?: Partial<RailLayout>) {
  const onToolChange = vi.fn();
  const onLayoutChange = vi.fn();
  const tb = createToolbar({ tools, activeTool, onToolChange, layout, onLayoutChange });
  document.body.appendChild(tb.root);
  return { tb, onToolChange, onLayoutChange };
}

/** The rail, top to bottom: tool names, "|" between groups. */
function railOf(root: HTMLElement): string[] {
  return [...root.querySelectorAll(".rt-toolbar__groups .rt-toolbar__btn, .rt-toolbar__sep")].map(
    (el) => el.getAttribute("aria-label") ?? "|",
  );
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

describe("toolbar on phones", () => {
  it("hears the active tool picked again, without changing tools", () => {
    const onToolChange = vi.fn();
    const onToolReselect = vi.fn();
    const tb = createToolbar({
      tools: ["crop", "adjust"],
      activeTool: "crop",
      onToolChange,
      onToolReselect,
    });
    document.body.appendChild(tb.root);
    const crop = tb.root.querySelector<HTMLButtonElement>('[aria-label="Crop"]');
    crop?.click();
    expect(onToolReselect).toHaveBeenCalledWith("crop");
    expect(onToolChange).not.toHaveBeenCalled();
    tb.root.querySelector<HTMLButtonElement>('[aria-label="Adjust"]')?.click();
    expect(onToolChange).toHaveBeenCalledWith("adjust");
    tb.destroy();
  });

  it("keeps the AI menu and the tooltip out of the scroller, whose fade would clip them", () => {
    const { tb } = mount(["crop", "test-ai-a", "test-ai-b"]);
    const scroller = tb.root.querySelector(".rt-toolbar__scroll");
    expect(scroller?.querySelector(".rt-toolbar__groups")).not.toBeNull();
    expect(scroller?.querySelector(".rt-flyout, .rt-tooltip")).toBeNull();
    expect(tb.root.querySelector(":scope > .rt-flyout")).not.toBeNull();
    expect(tb.root.querySelector(":scope > .rt-tooltip")).not.toBeNull();
    tb.destroy();
  });
});

describe("toolbar rail groups", () => {
  it("orders tools by group, separated, whatever order they were given in", () => {
    const { tb } = mount(["filters", "adjust", "crop", "curves", "transform"], "crop");
    expect(railOf(tb.root)).toEqual(["Crop", "Transform", "|", "Adjust", "Curves", "|", "Filters"]);
    const groups = [...tb.root.querySelectorAll(".rt-toolbar__group")].map((g) =>
      g.getAttribute("aria-label"),
    );
    expect(groups).toEqual(["Frame", "Tone", "Looks"]);
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
  it("lists every AI tool in a menu behind one launcher, pinned or not", () => {
    const { tb } = mount(["test-ai-b", "crop", "test-ai-a"], "crop", { pinned: [] });
    const launcher = tb.root.querySelector(".rt-toolbar__btn--ai");
    expect(launcher?.getAttribute("aria-haspopup")).toBe("dialog");
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
    const { tb, onToolChange } = mount(["crop", "test-ai-a", "test-ai-b"], "crop", { pinned: [] });
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

  it("pins the first three AI tools by default, and pinning moves a tool onto the rail", () => {
    const { tb, onLayoutChange } = mount(["crop", "test-ai-a", "test-ai-b"]);
    expect(railOf(tb.root)).toEqual(["Crop", "|", "Cutout", "Upscale", "All AI tools"]);
    expect(tb.layout.pinned).toEqual(["test-ai-a", "test-ai-b"]);

    const pins = [...tb.root.querySelectorAll<HTMLButtonElement>(".rt-flyout__pin")];
    expect(pins.map((p) => p.getAttribute("aria-pressed"))).toEqual(["true", "true"]);
    pins[0].click(); // take Cutout off the rail
    expect(railOf(tb.root)).toEqual(["Crop", "|", "Upscale", "All AI tools"]);
    expect(pins[0].getAttribute("aria-pressed")).toBe("false");
    expect(pins[0].getAttribute("aria-label")).toBe("Keep Cutout on the rail");
    expect(onLayoutChange).toHaveBeenLastCalledWith({ pinned: ["test-ai-b"], expanded: false });
    // Number keys: rail first, then what's only in the menu.
    expect(tb.order).toEqual(["crop", "test-ai-b", "test-ai-a"]);

    tb.setPinned("test-ai-a", true);
    expect(railOf(tb.root)).toEqual(["Crop", "|", "Cutout", "Upscale", "All AI tools"]);
    tb.destroy();
  });

  it("starts from a given layout, and an active pinned tool lights its own button", () => {
    const { tb } = mount(["crop", "test-ai-a", "test-ai-b"], "test-ai-b", {
      pinned: ["test-ai-b"],
    });
    expect(railOf(tb.root)).toEqual(["Crop", "|", "Upscale", "All AI tools"]);
    const upscale = tb.root.querySelector('.rt-toolbar__btn[aria-label="Upscale"]');
    expect(upscale?.classList.contains("rt-toolbar__btn--active")).toBe(true);
    expect(upscale?.querySelector(".rt-toolbar__spark")).not.toBeNull();
    const launcher = tb.root.querySelector(".rt-toolbar__btn--ai");
    expect(launcher?.classList.contains("rt-toolbar__btn--active")).toBe(false);
    tb.destroy();
  });

  it("moves between a menu row's tool and its pin with the arrow keys", () => {
    const { tb } = mount(["crop", "test-ai-a", "test-ai-b"]);
    tb.openAiMenu();
    const [first] = [...tb.root.querySelectorAll<HTMLElement>(".rt-flyout__item")];
    const [pin] = [...tb.root.querySelectorAll<HTMLElement>(".rt-flyout__pin")];
    expect(document.activeElement).toBe(first);
    press(first, "ArrowRight");
    expect(document.activeElement).toBe(pin);
    press(pin, "ArrowLeft");
    expect(document.activeElement).toBe(first);
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

describe("toolbar names", () => {
  it("toggles tool names from the foot of the rail, and remembers through onLayoutChange", () => {
    const { tb, onLayoutChange } = mount(["crop", "adjust"]);
    const toggle = tb.root.querySelector(".rt-toolbar__toggle") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Show tool names");
    toggle.click();
    expect(tb.root.classList.contains("rt-toolbar--expanded")).toBe(true);
    expect(toggle.getAttribute("aria-label")).toBe("Hide tool names");
    expect(onLayoutChange).toHaveBeenLastCalledWith({ pinned: [], expanded: true });
    // Expanded rows show their key; the label text is there for sighted users.
    const crop = tb.root.querySelector('.rt-toolbar__btn[aria-label="Crop"]');
    expect(crop?.querySelector(".rt-toolbar__key")?.textContent).toBe("C");
    expect(crop?.querySelector(".rt-toolbar__label")?.textContent).toBe("Crop");
    tb.destroy();
  });

  it("starts expanded when the layout says so, and AI rows carry their one-liner", () => {
    const { tb } = mount(["crop", "test-ai-a", "test-ai-b"], "crop", { expanded: true });
    expect(tb.root.classList.contains("rt-toolbar--expanded")).toBe(true);
    const cutout = tb.root.querySelector('.rt-toolbar__btn[aria-label="Cutout"]');
    expect(cutout?.querySelector(".rt-toolbar__desc")?.textContent).toBe("Remove the background");
    tb.destroy();
  });
});
