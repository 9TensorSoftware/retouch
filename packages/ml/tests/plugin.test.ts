import type { EditorToolPlugin, ToolContext } from "@9tensor/retouch";
import { DEFAULT_EDITS } from "../../../src/constants";
import { createToolUi } from "../../../src/ui/editor/tool-ui";
import { DEFAULT_CUTOUT_MODEL_URL } from "../src/cutout";
import { installMlTools } from "../src/plugin";

/** installMlTools only needs registerTool, reached through the instance's constructor. */
function register(): Map<string, EditorToolPlugin> {
  const tools = new Map<string, EditorToolPlugin>();
  const registerTool = (plugin: EditorToolPlugin): void => {
    tools.set(plugin.id, plugin);
  };
  installMlTools({ constructor: { registerTool } } as never);
  return tools;
}

/** A stand-in editor context: real UI kit, a stage with a canvas in it. */
function context(): ToolContext {
  const image = new Image();
  Object.defineProperty(image, "naturalWidth", { value: 800 });
  Object.defineProperty(image, "naturalHeight", { value: 600 });
  const canvasArea = document.createElement("div");
  const container = document.createElement("div");
  container.appendChild(document.createElement("canvas"));
  canvasArea.appendChild(container);
  document.body.appendChild(canvasArea);
  const entry = {
    id: "e1",
    kind: "image",
    file: new File(["x"], "photo.jpg", { type: "image/jpeg" }),
    image,
    edits: structuredClone(DEFAULT_EDITS),
  };
  return {
    kind: "image",
    entry: entry as never,
    edits: entry.edits,
    render: vi.fn(),
    record: vi.fn(),
    canvasArea,
    ui: createToolUi(),
    preview: () => "",
    reveal: async () => () => {},
  };
}

function useCaches(saved: string[] | undefined): void {
  const value = saved && {
    open: async () => ({
      match: async (url: RequestInfo | URL) =>
        saved.includes(String(url)) ? new Response("w") : undefined,
    }),
  };
  Object.defineProperty(globalThis, "caches", { value, configurable: true });
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("ML tool panes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    useCaches(undefined);
  });

  it("registers seven AI tools, each describing its model before any run", () => {
    const tools = register();
    expect([...tools.keys()]).toEqual([
      "cutout",
      "erase",
      "select",
      "depth",
      "detect",
      "upscale",
      "denoise",
    ]);
    for (const tool of tools.values()) {
      expect(tool.group).toBe("ai");
      const pane = tool.mount(context());
      const facts = [...pane.root.querySelectorAll("dt")].map((dt) => dt.textContent);
      expect(facts).toContain("Runs on");
      expect(facts.some((f) => f === "Model" || f === "Models")).toBe(true);
      pane.destroy?.();
    }
  });

  it("names the download on the run button until the model is saved", async () => {
    const cutout = register().get("cutout") as EditorToolPlugin;
    useCaches([]);
    let pane = cutout.mount(context());
    await flush();
    const label = () => pane.root.querySelector(".rt-dock__chip--ai")?.textContent;
    expect(label()).toBe("Remove the background · 25 MB");
    expect(pane.root.textContent).toContain("25 MB, once, then saved");

    useCaches([DEFAULT_CUTOUT_MODEL_URL]);
    pane = cutout.mount(context());
    await flush();
    expect(label()).toBe("Remove the background");
    expect(pane.root.textContent).toContain("Saved on this device");
  });

  it("keeps Erase's 208 MB in plain sight", async () => {
    const erase = register().get("erase") as EditorToolPlugin;
    const pane = erase.mount(context());
    await flush();
    expect(pane.root.querySelector(".rt-dock__chip--ai")?.textContent).toBe("Erase · 208 MB");
    pane.destroy?.();
  });

  it("won't start Select's download from a click on the photo", async () => {
    const select = register().get("select") as EditorToolPlugin;
    const ctx = context();
    const pane = select.mount(ctx);
    pane.onActivate?.();
    await flush();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const overlay = ctx.canvasArea.querySelector(".rt-ml-select-overlay") as HTMLElement;
    // jsdom has no layout; the surface ignores clicks on a zero-size box.
    overlay.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
    overlay.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 150 }),
    );
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(pane.root.querySelector(".rt-dock__status")?.textContent).toBe(
      "Start selecting first: it downloads the model (38 MB) once.",
    );
    expect(pane.root.textContent).toContain("Start selecting · 38 MB");
    fetchSpy.mockRestore();
    pane.destroy?.();
  });
});
