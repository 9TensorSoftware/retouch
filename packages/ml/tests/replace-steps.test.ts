import type { EditorToolPlugin, ToolContext } from "@9tensor/retouch";
import { DEFAULT_EDITS } from "../../../src/constants";
import { createObjectLayer } from "../../../src/ui/editor/object-layer";
import { createToolUi } from "../../../src/ui/editor/tool-ui";
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
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.toBlob = toBlob;
    document.body.innerHTML = "";
  });

  it("shows every step done in the pane the editor remounts with", async () => {
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
    const states = (pane: ReturnType<EditorToolPlugin["mount"]> | null) =>
      [...(pane?.root.querySelectorAll<HTMLElement>(".rt-step") ?? [])].map(
        (step) => step.dataset.state,
      );

    // A pane opened any other way starts with its steps out of sight.
    const pane = denoise.mount(ctx);
    document.body.appendChild(pane.root);
    expect(pane.root.querySelector<HTMLElement>(".rt-steps-wrap")?.hidden).toBe(true);

    [...pane.root.querySelectorAll("button")]
      .find((b) => b.textContent?.startsWith("Remove the noise"))
      ?.click();
    await flush();

    expect(remounted).not.toBeNull();
    expect(states(remounted)).toEqual(["done", "done", "done"]);
    // Only for that swap: the next time it opens, it's a fresh pane again.
    const later = denoise.mount(ctx);
    expect(later.root.querySelector<HTMLElement>(".rt-steps-wrap")?.hidden).toBe(true);
  });
});
