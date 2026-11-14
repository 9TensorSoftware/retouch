import type { EditorToolPlugin, ToolContext } from "@9tensor/retouch";
import { DEFAULT_EDITS } from "../../../src/constants";
import type { ConfirmChoice } from "../../../src/ui/editor/confirm";
import { createObjectLayer } from "../../../src/ui/editor/object-layer";
import { createTaskRegistry, type TaskRegistry } from "../../../src/ui/editor/tasks";
import { getCustomTools, registerEditorTool } from "../../../src/ui/editor/tool-registry";
import { createToolUi } from "../../../src/ui/editor/tool-ui";
import { DEFAULT_DENOISE_DATA_URL, DEFAULT_DENOISE_MODEL_URL } from "../src/denoise";
import { DEFAULT_FACE_MODEL_URL, DEFAULT_OBJECT_MODEL_URL } from "../src/detect";
import { installMlTools } from "../src/plugin";

/** Denoise runs until the test lets it finish, a tile at a time. */
const denoising: { tile?: (done: number, total: number) => void; finish?: () => void } = {};

vi.mock("../src/denoise", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/denoise")>();
  return {
    ...actual,
    denoiseImage: vi.fn(
      (_image: unknown, options: { onTileProgress?: (done: number, total: number) => void }) =>
        new Promise<HTMLCanvasElement>((resolve, reject) => {
          denoising.tile = (done, total) => {
            try {
              options.onTileProgress?.(done, total);
            } catch (error) {
              reject(error);
            }
          };
          denoising.finish = () => resolve(document.createElement("canvas"));
        }),
    ),
  };
});

vi.mock("../src/detect", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/detect")>();
  return {
    ...actual,
    detectFaces: vi.fn(async () => [{ x: 0.4, y: 0.2, w: 0.2, h: 0.3, score: 0.9, label: "face" }]),
  };
});

const { detectFaces } = await import("../src/detect");

function context(tasks: TaskRegistry): ToolContext {
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
    tasks: tasks.tasksFor(entry),
  };
}

const flush = async (times = 4) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

const press = (pane: { root: HTMLElement }, label: string) =>
  [...pane.root.querySelectorAll("button")].find((b) => b.textContent === label)?.click();

describe("a run that changes the photo, and another tool meanwhile", () => {
  const toBlob = HTMLCanvasElement.prototype.toBlob;
  let saved: string[];

  beforeEach(() => {
    HTMLCanvasElement.prototype.toBlob = (callback: BlobCallback) => {
      callback(new Blob(["x"], { type: "image/jpeg" }));
    };
    saved = [
      DEFAULT_DENOISE_MODEL_URL,
      DEFAULT_DENOISE_DATA_URL,
      DEFAULT_FACE_MODEL_URL,
      DEFAULT_OBJECT_MODEL_URL,
    ];
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        open: async () => ({
          match: async (url: RequestInfo | URL) =>
            saved.includes(String(url)) ? new Response("w") : undefined,
        }),
      },
    });
    vi.mocked(detectFaces).mockClear();
  });

  afterEach(() => {
    HTMLCanvasElement.prototype.toBlob = toBlob;
    document.body.innerHTML = "";
  });

  function setUp(answer: ConfirmChoice) {
    const tools = new Map<string, EditorToolPlugin>();
    const tasks = createTaskRegistry();
    const asked: string[] = [];
    tasks.setAsk(async (question) => {
      asked.push(question.confirmLabel);
      return answer;
    });
    const replaced = vi.fn(async () => {});
    installMlTools({
      constructor: {
        // As Retouch.registerTool does, so tasks name their tool as the rail does.
        registerTool: (plugin: EditorToolPlugin) => {
          tools.set(plugin.id, plugin);
          if (!getCustomTools().some((t) => t.id === plugin.id)) registerEditorTool(plugin);
        },
      },
      replaceImageSource: replaced,
    } as never);
    const ctx = context(tasks);
    const denoise = (tools.get("denoise") as EditorToolPlugin).mount(ctx);
    const detect = (tools.get("detect") as EditorToolPlugin).mount(ctx);
    document.body.append(denoise.root, detect.root);
    return { tasks, asked, replaced, denoise, detect };
  }

  it("asks first, and finding faces waits if Denoise is to finish", async () => {
    const { tasks, asked, replaced, denoise, detect } = setUp("discard");
    await flush();
    press(denoise, "Remove the noise");
    await flush();
    denoising.tile?.(1, 4);
    expect(tasks.list()[0]).toMatchObject({ label: "Removing the noise…", detail: "25%" });

    press(detect, "Find faces");
    await flush();
    expect(asked).toEqual(["Stop Denoise and find faces"]);
    expect(detectFaces).not.toHaveBeenCalled();

    denoising.finish?.();
    await flush();
    expect(replaced).toHaveBeenCalledTimes(1);
    expect(tasks.list()[0]).toMatchObject({ state: "done", label: "Noise removed" });
  });

  it("stops Denoise without touching the photo, then finds the faces", async () => {
    const { tasks, replaced, denoise, detect } = setUp("confirm");
    await flush();
    press(denoise, "Remove the noise");
    await flush();
    press(detect, "Find faces");
    await flush();
    expect(detectFaces).toHaveBeenCalledTimes(1);
    const status = (pane: { root: HTMLElement }) =>
      pane.root.querySelector<HTMLElement>(".rt-status");
    expect(status(detect)?.textContent).toContain("1 face");
    // Denoise is off the header and out of its pane, and can run again.
    expect(status(denoise)?.hidden).toBe(true);
    expect(tasks.list().map((t) => t.tool)).toEqual(["detect"]);

    // Its next tile is where it stops; nothing it made lands on the photo.
    denoising.tile?.(2, 4);
    denoising.finish?.();
    await flush();
    expect(replaced).not.toHaveBeenCalled();
  });

  it("stops a download from the header: back to Download, not a failure", async () => {
    saved = [];
    const { tasks, denoise } = setUp("stay");
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
    await flush();
    const strip = denoise.root.querySelector<HTMLElement>(".rt-model") as HTMLElement;
    strip.querySelector<HTMLButtonElement>(".rt-model__main")?.click();
    await flush();
    body.push?.enqueue(new Uint8Array(500_000));
    await new Promise((r) => setTimeout(r, 150));
    const download = tasks.list()[0];
    expect(download).toMatchObject({ label: "Downloading Denoise", state: "running" });
    expect(strip.dataset.state).toBe("downloading");

    download.stop();
    await flush();
    expect(tasks.list()).toEqual([]);
    expect(strip.dataset.state).toBe("missing");
    expect(strip.querySelector(".rt-model__label")?.textContent).toBe("Download");
    // What came before the stop isn't kept as if it were the whole file.
    const { isModelSaved } = await import("../src/model-cache");
    expect(isModelSaved([DEFAULT_DENOISE_MODEL_URL])).toBe(false);
    fetchSpy.mockRestore();
  });
});
