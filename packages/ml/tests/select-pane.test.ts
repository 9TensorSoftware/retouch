import type { EditorToolPlugin, ToolContext } from "@9tensor/retouch";
import { DEFAULT_EDITS } from "../../../src/constants";
import { createObjectLayer } from "../../../src/ui/editor/object-layer";
import { createTaskRegistry } from "../../../src/ui/editor/tasks";
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
    tasks: createTaskRegistry().tasksFor(entry),
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

  const guide = () => pane.root.querySelector(".rt-dock__status")?.textContent;
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

  const key = (k: string, mods: KeyboardEventInit = {}) => {
    const event = new KeyboardEvent("keydown", {
      key: k,
      bubbles: true,
      cancelable: true,
      ...mods,
    });
    document.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("reads the photo on its own once the model is saved, then says what to do", () => {
    expect(guide()).toBe("Click something in the photo.");
    expect(sections()).toEqual(["Selection"]);
    expect(button("Cut out").disabled).toBe(true);
    expect(button("Deselect").disabled).toBe(true);
    // The model's state leads, as in every other tool.
    const card = pane.root.firstElementChild;
    expect(card?.classList.contains("rt-card")).toBe(true);
    expect(card?.querySelector(".rt-model")?.getAttribute("data-state")).toBe("ready");
  });

  it("outlines what's under the mouse before anything is clicked", async () => {
    pointer("pointermove", 0.5, 0.5);
    await flush();
    expect(decodes).toEqual([[{ x: 0.5, y: 0.5, label: 1 }]]);
  });

  it("selects with a click, offers each shape, and a new click starts over", async () => {
    pointer("pointerdown", 0.4, 0.4);
    await flush();
    expect(guide()).toBe("Esc deselects.");
    expect(tiles()).toEqual(["Small", "Medium", "Large"]);
    expect(pressed()).toBe("Medium");
    expect(button("Cut out").disabled).toBe(false);

    pointer("pointerdown", 0.6, 0.6);
    await flush();
    // Still one click: the new one replaced the old.
    expect(decodes.at(-1)).toEqual([{ x: 0.6, y: 0.6, label: 1 }]);
  });

  it("deselects with Esc or the button, without closing the editor, and Undo brings it back", async () => {
    pointer("pointerdown", 0.4, 0.4);
    await flush();
    expect(key("Escape")).toBe(true);
    await flush();
    expect(tiles()).toEqual([]);
    expect(guide()).toBe("Click something in the photo.");
    // Nothing selected: Esc is the editor's again.
    expect(key("Escape")).toBe(false);

    button("Undo").click();
    await flush();
    expect(tiles()).toEqual(["Small", "Medium", "Large"]);
    button("Deselect").click();
    await flush();
    expect(tiles()).toEqual([]);
  });

  it("steps through the selection with ⌘Z and ⇧⌘Z, then leaves ⌘Z to the editor", async () => {
    pointer("pointerdown", 0.4, 0.4);
    await flush();
    button("Large").click();
    expect(key("z", { metaKey: true })).toBe(true);
    await flush();
    expect(pressed()).toBe("Medium");
    expect(key("z", { metaKey: true, shiftKey: true })).toBe(true);
    await flush();
    expect(pressed()).toBe("Large");
    key("z", { metaKey: true });
    key("z", { metaKey: true });
    await flush();
    expect(tiles()).toEqual([]);
    expect(key("z", { metaKey: true })).toBe(false);
  });

  it("makes every click a new selection with its own shapes, Shift or not, and draws no dot", async () => {
    pointer("pointerdown", 0.4, 0.4);
    await flush();
    const event = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 0.6 * 400,
      clientY: 0.6 * 300,
      shiftKey: true,
    });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    overlay.dispatchEvent(event);
    await flush();
    expect(decodes.at(-1)).toEqual([{ x: 0.6, y: 0.6, label: 1 }]);
    expect(tiles()).toEqual(["Small", "Medium", "Large"]);
    expect(pane.root.querySelector('[aria-label="What a click does"]')).toBeNull();
  });

  it("lets go of the selection once an erase swaps the photo, and reads the new one", async () => {
    pointer("pointerdown", 0.4, 0.4);
    await flush();
    const swapped = new Image();
    Object.defineProperty(swapped, "naturalWidth", { value: 800 });
    Object.defineProperty(swapped, "naturalHeight", { value: 600 });
    (ctx.entry as { image: HTMLImageElement }).image = swapped;
    // Any refresh of the panel notices, as Erase's own does when it's done.
    button("Large").click();
    await flush();
    expect(tiles()).toEqual([]);
    expect(button("Cut out").disabled).toBe(true);
    expect(guide()).toBe("Click something in the photo.");
  });
});
