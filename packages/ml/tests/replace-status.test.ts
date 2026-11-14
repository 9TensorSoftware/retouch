import type { EditorToolPlugin, ToolContext } from "@9tensor/retouch";
import { DEFAULT_EDITS } from "../../../src/constants";
import { createObjectLayer } from "../../../src/ui/editor/object-layer";
import { createTaskRegistry } from "../../../src/ui/editor/tasks";
import { createToolUi } from "../../../src/ui/editor/tool-ui";
import { DEFAULT_DENOISE_DATA_URL, DEFAULT_DENOISE_MODEL_URL } from "../src/denoise";
import { installMlTools } from "../src/plugin";

vi.mock("../src/denoise", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/denoise")>();
  return {
    ...actual,
    denoiseImage: vi.fn(
      async (
        _image: unknown,
        options: { onTileProgress?: (done: number, total: number) => void },
      ) => {
        options.onTileProgress?.(1, 1);
        return document.createElement("canvas");
      },
    ),
  };
});

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
    objects: (options) =>
      createObjectLayer(options, {
        host: () => container,
        area: canvasArea,
        signal: new AbortController().signal,
      }),
    preview: () => "",
    reveal: async () => () => {},
    tasks: createTaskRegistry().tasksFor(entry),
  };
}

const flush = async (times = 4) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("a tool that replaces the photo", () => {
  const toBlob = HTMLCanvasElement.prototype.toBlob;

  beforeEach(() => {
    HTMLCanvasElement.prototype.toBlob = (callback: BlobCallback) => {
      callback(new Blob(["x"], { type: "image/jpeg" }));
    };
    // The model is on this device, so Remove the noise is on.
    const saved = [DEFAULT_DENOISE_MODEL_URL, DEFAULT_DENOISE_DATA_URL];
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        open: async () => ({
          match: async (url: RequestInfo | URL) =>
            saved.includes(String(url)) ? new Response("w") : undefined,
        }),
      },
    });
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.toBlob = toBlob;
    document.body.innerHTML = "";
  });

  it("says it's done in the pane the editor remounts with", async () => {
    const tools = new Map<string, EditorToolPlugin>();
    const ctx = context();
    let remounted: ReturnType<EditorToolPlugin["mount"]> | null = null;
    installMlTools({
      constructor: { registerTool: (plugin: EditorToolPlugin) => tools.set(plugin.id, plugin) },
      // As the editor does: swapping the photo mounts every pane afresh.
      replaceImageSource: async () => {
        remounted = tools.get("denoise")?.mount(ctx) ?? null;
        document.body.appendChild(remounted?.root as HTMLElement);
      },
    } as never);
    const denoise = tools.get("denoise") as EditorToolPlugin;
    const status = (pane: ReturnType<EditorToolPlugin["mount"]> | null) =>
      pane?.root.querySelector<HTMLElement>(".rt-status");

    // A pane opened any other way has nothing to report.
    const pane = denoise.mount(ctx);
    document.body.appendChild(pane.root);
    await flush();
    expect(status(pane)?.hidden).toBe(true);

    [...pane.root.querySelectorAll("button")]
      .find((b) => b.textContent === "Remove the noise")
      ?.click();
    await flush();

    expect(remounted).not.toBeNull();
    expect(status(remounted)?.dataset.state).toBe("done");
    expect(status(remounted)?.textContent).toContain("Noise removed");
    // Only for that swap: the next time it opens, it's a fresh pane again.
    const later = denoise.mount(ctx);
    expect(status(later)?.hidden).toBe(true);
  });
});
