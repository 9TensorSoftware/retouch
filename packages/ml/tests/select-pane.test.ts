import type { EditorToolPlugin, ToolContext } from "@9tensor/retouch";
import { DEFAULT_EDITS } from "../../../src/constants";
import { createObjectLayer } from "../../../src/ui/editor/object-layer";
import { createToolUi } from "../../../src/ui/editor/tool-ui";
import { installMlTools } from "../src/plugin";
import type { SamCandidates, SamPoint } from "../src/sam";
import { DEFAULT_SAM_DECODER_URL, DEFAULT_SAM_ENCODER_URL } from "../src/sam";

const SIDE = 256;
const decodes: SamPoint[][] = [];

/** Shapes on a 10×10 grid: a click offers three, a click taking a part away one. */
function fakeCandidates(points: SamPoint[]): SamCandidates {
  const boxes: [number, number, number, number][] = points.some((p) => p.label === 0)
    ? [[2, 2, 5, 5]]
    : [
        [3, 3, 5, 5],
        [2, 2, 6, 6],
        [0, 0, 9, 9],
      ];
  const masks = new Float32Array(boxes.length * SIDE * SIDE).fill(-5);
  boxes.forEach(([x0, y0, x1, y1], i) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) masks[i * SIDE * SIDE + y * SIDE + x] = 5;
    }
  });
  return {
    masks,
    region: { width: 10, height: 10, stride: SIDE },
    // The model likes the middle one best.
    order: boxes.length === 3 ? [1, 0, 2] : [0],
    iou: new Float32Array(boxes.length).fill(0.9),
    width: 800,
    height: 600,
  };
}

vi.mock("../src/sam", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/sam")>();
  return {
    ...actual,
    encodeSamImage: vi.fn(async () => ({
      image: new Float32Array(0),
      positional: new Float32Array(0),
      width: 800,
      height: 600,
    })),
    decodeSamCandidates: vi.fn(async (_embeddings: unknown, points: SamPoint[]) => {
      decodes.push(points);
      return fakeCandidates(points);
    }),
  };
});

function register(): Map<string, EditorToolPlugin> {
  const tools = new Map<string, EditorToolPlugin>();
  installMlTools({
    constructor: { registerTool: (plugin: EditorToolPlugin) => tools.set(plugin.id, plugin) },
  } as never);
  return tools;
}

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

/** The model is saved, so the tool reads the photo as soon as it opens. */
function modelSaved(): void {
  const saved = [DEFAULT_SAM_ENCODER_URL, DEFAULT_SAM_DECODER_URL];
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      open: async () => ({
        match: async (url: RequestInfo | URL) =>
          saved.includes(String(url)) ? new Response("w") : undefined,
      }),
    },
  });
}

const flush = async (times = 4) => {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("Select", () => {
  let ctx: ToolContext;
  let pane: ReturnType<EditorToolPlugin["mount"]>;
  let overlay: HTMLElement;

  const guide = () => pane.root.firstElementChild?.textContent;
  const sections = () =>
    [...pane.root.querySelectorAll<HTMLElement>(".rt-section")]
      .filter((s) => !s.hidden)
      .map((s) => s.querySelector(".rt-section__title")?.textContent);
  const tiles = () => [...pane.root.querySelectorAll(".rt-tile__label")].map((l) => l.textContent);
  const pressed = () =>
    pane.root.querySelector('.rt-tile[aria-pressed="true"] .rt-tile__label')?.textContent;
  const button = (label: string) =>
    [...pane.root.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === label,
    ) as HTMLButtonElement;
  const pointer = (type: string, x: number, y: number, pointerType = "mouse") => {
    const event = new MouseEvent(type, { bubbles: true, clientX: x * 400, clientY: y * 300 });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    overlay.dispatchEvent(event);
  };

  beforeEach(async () => {
    decodes.length = 0;
    modelSaved();
    ctx = context();
    pane = register().get("select")?.mount(ctx) as ReturnType<EditorToolPlugin["mount"]>;
    document.body.appendChild(pane.root);
    pane.onActivate?.();
    overlay = ctx.canvasArea.querySelector(".rt-ml-select-overlay") as HTMLElement;
    overlay.getBoundingClientRect = () => new DOMRect(0, 0, 400, 300);
    await flush();
  });

  afterEach(() => {
    pane.destroy?.();
    document.body.innerHTML = "";
  });

  it("reads the photo on its own once the model is saved, then says what to do", () => {
    expect(guide()).toBe("Point at something in the photo, then click it.");
    expect(sections()).toEqual([]);
  });

  it("outlines what's under the mouse before anything is clicked", async () => {
    pointer("pointermove", 0.5, 0.5);
    await flush();
    expect(decodes).toEqual([[{ x: 0.5, y: 0.5, label: 1 }]]);
  });

  it("selects with a click, offers each shape, and a new click starts over", async () => {
    pointer("pointerdown", 0.4, 0.4);
    await flush();
    expect(guide()).toBe("Selected. Click something else to select that instead.");
    expect(sections()).toEqual(["Selected", "Use it", "Fix it"]);
    expect(tiles()).toEqual(["Small", "Medium", "Large"]);
    expect(pressed()).toBe("Medium");

    pointer("pointerdown", 0.6, 0.6);
    await flush();
    // Still one click: the new one replaced the old.
    expect(decodes.at(-1)).toEqual([{ x: 0.6, y: 0.6, label: 1 }]);
  });

  it("takes back a shape pick, a click and Start over, one at a time", async () => {
    pointer("pointerdown", 0.4, 0.4);
    await flush();
    button("Large").click();
    expect(pressed()).toBe("Large");
    button("Undo").click();
    await flush();
    expect(pressed()).toBe("Medium");

    button("Remove").click();
    expect(guide()).toBe("Click a part of the selection to take it out.");
    pointer("pointerdown", 0.45, 0.45);
    await flush();
    expect(decodes.at(-1)?.map((p) => p.label)).toEqual([1, 0]);
    expect(tiles()).toEqual(["Selected"]);
    button("Undo").click();
    await flush();
    expect(tiles()).toEqual(["Small", "Medium", "Large"]);

    button("Start over").click();
    await flush();
    expect(sections()).toEqual(["Fix it"]);
    expect(guide()).toBe("Point at something in the photo, then click it.");
    button("Undo").click();
    await flush();
    expect(sections()).toEqual(["Selected", "Use it", "Fix it"]);
  });
});
