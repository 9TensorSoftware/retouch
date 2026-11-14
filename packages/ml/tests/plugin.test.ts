import type { EditorToolPlugin, ToolContext } from "@9tensor/retouch";
import { DEFAULT_EDITS } from "../../../src/constants";
import { createObjectLayer } from "../../../src/ui/editor/object-layer";
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
function context(kind: "image" | "video" = "image"): ToolContext {
  if (kind === "video") return videoContext();
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
    objects: (options) =>
      createObjectLayer(options, {
        host: () => container,
        area: canvasArea,
        signal: new AbortController().signal,
      }),
    preview: () => "",
    reveal: async () => () => {},
  };
}

function videoContext(): ToolContext {
  const base = context();
  const video = document.createElement("video");
  const edits = {
    ...structuredClone(DEFAULT_EDITS),
    trim: { start: 0, end: 12 },
    mute: false,
    speed: 1,
    deflicker: false,
  };
  const entry = {
    id: "v1",
    kind: "video",
    file: new File(["x"], "clip.mp4", { type: "video/mp4" }),
    video,
    videoUrl: "blob:clip",
    duration: 12,
    width: 960,
    height: 540,
    edits,
  };
  return { ...base, kind: "video", entry: entry as never, edits };
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

  const model = (pane: { root: HTMLElement }) => {
    const root = pane.root.querySelector<HTMLElement>(".rt-model");
    return {
      state: root?.dataset.state,
      label: root?.querySelector(".rt-model__label")?.textContent,
      detail: root?.querySelector(".rt-model__detail")?.textContent,
      main: root?.querySelector<HTMLButtonElement>(".rt-model__main"),
      info: root?.querySelector<HTMLButtonElement>(".rt-model__info"),
      about: root?.querySelector<HTMLElement>(".rt-model__about"),
    };
  };
  const action = (pane: { root: HTMLElement }) =>
    pane.root.querySelector<HTMLButtonElement>(".rt-dock__chip--ai");

  it("registers nine AI tools, each leading with its model and naming it only under the info button", () => {
    const tools = register();
    expect([...tools.keys()]).toEqual([
      "cutout",
      "erase",
      "select",
      "depth",
      "detect",
      "track",
      "text",
      "upscale",
      "denoise",
    ]);
    for (const tool of tools.values()) {
      expect(tool.group).toBe("ai");
      const pane = tool.mount(context(tool.kinds?.[0]));
      const { about, info } = model(pane);
      expect(about?.hidden).toBe(true);
      info?.click();
      expect(about?.hidden).toBe(false);
      expect(info?.getAttribute("aria-expanded")).toBe("true");
      const facts = [...(about?.querySelectorAll("dt") ?? [])].map((dt) => dt.textContent);
      expect(facts).toEqual(expect.arrayContaining(["Model", "Saved", "Runs with"]));
      // Out of the info panel, nobody has to read a model's name.
      const name = about?.querySelector("dd")?.textContent ?? "";
      about?.remove();
      expect(pane.root.textContent).not.toContain(name);
      pane.destroy?.();
    }
  });

  it("offers the download with its size, and keeps the action off until the model is here", async () => {
    const cutout = register().get("cutout") as EditorToolPlugin;
    useCaches([]);
    let pane = cutout.mount(context());
    await flush();
    expect(model(pane)).toMatchObject({ state: "missing", label: "Download", detail: "26 MB" });
    expect(action(pane)?.textContent).toBe("Remove the background");
    expect(action(pane)?.disabled).toBe(true);
    pane.destroy?.();

    useCaches([DEFAULT_CUTOUT_MODEL_URL]);
    pane = cutout.mount(context());
    await flush();
    expect(model(pane).state).toBe("ready");
    expect(pane.root.querySelector(".rt-model__ready")?.textContent).toBe("Ready");
    expect(action(pane)?.disabled).toBe(false);
    pane.destroy?.();
  });

  it("downloads on Download, showing how far along it is, then turns the action on", async () => {
    const cutout = register().get("cutout") as EditorToolPlugin;
    const stored = new Map<string, Response>();
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        open: async () => ({
          match: async (url: RequestInfo | URL) => stored.get(String(url))?.clone(),
          put: async (url: RequestInfo | URL, response: Response) => {
            stored.set(String(url), response);
          },
        }),
      },
    });
    const body: { push?: ReadableStreamDefaultController<Uint8Array> } = {};
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              body.push = controller;
            },
          }),
          { headers: { "Content-Length": "2000000" } },
        ),
    );
    const pane = cutout.mount(context());
    await flush();
    model(pane).main?.click();
    await flush();
    body.push?.enqueue(new Uint8Array(500_000));
    await new Promise((r) => setTimeout(r, 150));
    expect(model(pane).state).toBe("downloading");
    expect(model(pane)).toMatchObject({ label: "0.5 of 2 MB", detail: "" });
    expect(action(pane)?.disabled).toBe(true);

    body.push?.enqueue(new Uint8Array(1_500_000));
    body.push?.close();
    await flush();
    await flush();
    expect(fetchSpy).toHaveBeenCalledWith(DEFAULT_CUTOUT_MODEL_URL);
    expect(model(pane).state).toBe("ready");
    expect(action(pane)?.disabled).toBe(false);
    expect(cutout.ready?.()).toBe(true);
    fetchSpy.mockRestore();
    pane.destroy?.();
  });

  it("offers to try again when the download fails", async () => {
    const cutout = register().get("cutout") as EditorToolPlugin;
    useCaches([]);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 503 }));
    const pane = cutout.mount(context());
    await flush();
    vi.spyOn(console, "error").mockImplementation(() => {});
    model(pane).main?.click();
    await flush();
    await flush();
    expect(model(pane)).toMatchObject({
      state: "failed",
      label: "Try again",
      detail: "Download failed",
    });
    fetchSpy.mockRestore();
    vi.mocked(console.error).mockRestore();
    pane.destroy?.();
  });

  it("Read text names its action plainly and keeps its output hidden until it has read something", async () => {
    const text = register().get("text") as EditorToolPlugin;
    useCaches([]);
    const pane = text.mount(context());
    await flush();
    expect(model(pane).detail).toBe("13 MB");
    expect(action(pane)?.textContent).toBe("Read the text");
    const output = pane.root.querySelector(".rt-output");
    expect(output?.getAttribute("aria-label")).toBe("Text in the photo");
    expect(output?.textContent).toBe("");
    pane.destroy?.();
  });

  it("keeps Erase's 208 MB in plain sight, on its Download", async () => {
    const erase = register().get("erase") as EditorToolPlugin;
    useCaches([]);
    const pane = erase.mount(context());
    await flush();
    expect(model(pane)).toMatchObject({ state: "missing", detail: "208 MB" });
    expect(action(pane)?.textContent).toBe("Erase");
    pane.destroy?.();
  });

  it("won't start Select's download from a click on the photo", async () => {
    const select = register().get("select") as EditorToolPlugin;
    useCaches([]);
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
    expect(pane.root.querySelector(".rt-dock__status")?.textContent).toBe("Download it first.");
    expect(model(pane)).toMatchObject({ state: "missing", detail: "40 MB" });
    fetchSpy.mockRestore();
    pane.destroy?.();
  });

  it("says Ready in the AI tools menu once a model is on this device", async () => {
    useCaches([DEFAULT_CUTOUT_MODEL_URL]);
    const tools = register();
    await flush();
    expect(tools.get("cutout")?.badge).toBe("26 MB");
    expect(tools.get("cutout")?.ready?.()).toBe(true);
    expect(tools.get("upscale")?.ready?.()).toBe(false);
  });

  it("Track is for videos: it names its download and shows no tracks before a run", async () => {
    const track = register().get("track") as EditorToolPlugin;
    expect(track.kinds).toEqual(["video"]);
    useCaches([]);
    const ctx = context("video");
    const pane = track.mount(ctx);
    pane.onActivate?.();
    await flush();
    expect(action(pane)?.textContent).toBe("Track objects");
    expect(model(pane).detail).toBe("3.7 MB");
    expect(pane.root.querySelector<HTMLElement>(".rt-list")?.hidden).toBe(true);
    expect(
      [...pane.root.querySelectorAll(".rt-dock__group .rt-dock__chip")].map((b) => b.textContent),
    ).toEqual(["Everything", "People", "Vehicles", "Animals"]);
    expect(ctx.canvasArea.querySelector(".rt-objects")).not.toBeNull();
    pane.destroy?.();
    expect(ctx.canvasArea.querySelector(".rt-objects")).toBeNull();
  });
});
