import { createDefaultVideoEdits } from "../src/constants";
import type { ViewHandle } from "../src/types";
import { createEditor } from "../src/ui/editor/editor";
import { registerEditorTool } from "../src/ui/editor/tool-registry";
import { makeImageEntry, stubLayout } from "./editor-helpers";

const pane = () => ({ root: document.createElement("div") });
for (const [id, label] of [
  ["rail-ai-1", "Cutout"],
  ["rail-ai-2", "Erase"],
  ["rail-ai-3", "Select"],
  ["rail-ai-4", "Depth"],
] as const) {
  registerEditorTool({
    id,
    label,
    icon: "<svg></svg>",
    group: "ai",
    kinds: ["image"],
    mount: pane,
  });
}

function railAi(): string[] {
  return [...document.querySelectorAll(".rt-toolbar__group--ai .rt-toolbar__btn")].map(
    (b) => b.getAttribute("aria-label") ?? "",
  );
}

describe("editor rail layout", () => {
  let restoreLayout: () => void;
  let editor: ViewHandle | null = null;

  beforeEach(() => {
    restoreLayout = stubLayout(1200, 800);
    localStorage.clear();
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    document.body.innerHTML = "";
    restoreLayout();
  });

  function open(rail?: { pinned?: string[]; expanded?: boolean }): void {
    editor?.destroy();
    editor = createEditor({ entry: makeImageEntry(), onDone: vi.fn(), onCancel: vi.fn(), rail });
    document.body.appendChild(editor.root);
  }

  it("pins the first three AI tools until the host or the user says otherwise", () => {
    open();
    expect(railAi()).toEqual(["Cutout", "Erase", "Select", "All AI tools"]);
    open({ pinned: ["rail-ai-4"], expanded: true });
    expect(railAi()).toEqual(["Depth", "All AI tools"]);
    expect(document.querySelector(".rt-toolbar--expanded")).not.toBeNull();
  });

  it("remembers the user's pins and names across editors, over the host's defaults", () => {
    open({ pinned: ["rail-ai-1"] });
    const pins = [...document.querySelectorAll<HTMLButtonElement>(".rt-flyout__pin")];
    pins[3].click(); // pin Depth
    (document.querySelector(".rt-toolbar__toggle") as HTMLButtonElement).click();
    expect(JSON.parse(localStorage.getItem("rt-rail") ?? "{}")).toEqual({
      pinned: ["rail-ai-1", "rail-ai-4"],
      expanded: true,
    });

    open({ pinned: ["rail-ai-2"] });
    expect(railAi()).toEqual(["Cutout", "Depth", "All AI tools"]);
    expect(document.querySelector(".rt-toolbar--expanded")).not.toBeNull();
  });

  it("keeps the saved pins when a rail without AI tools changes the names setting", () => {
    localStorage.setItem("rt-rail", JSON.stringify({ pinned: ["rail-ai-2"], expanded: false }));
    const video = document.createElement("video");
    Object.defineProperty(video, "videoWidth", { value: 640 });
    Object.defineProperty(video, "videoHeight", { value: 360 });
    // jsdom doesn't implement media playback (the transport makes videos of its own).
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const load = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    editor = createEditor({
      entry: {
        id: "v1",
        kind: "video",
        file: new File(["x"], "clip.mp4", { type: "video/mp4" }),
        video,
        videoUrl: "blob:clip",
        duration: 4,
        width: 640,
        height: 360,
        edits: createDefaultVideoEdits(4),
        edited: false,
      } as never,
      onDone: vi.fn(),
      onCancel: vi.fn(),
    });
    document.body.appendChild(editor.root);
    expect(document.querySelector(".rt-toolbar__group--ai")).toBeNull();
    (document.querySelector(".rt-toolbar__toggle") as HTMLButtonElement).click();
    expect(JSON.parse(localStorage.getItem("rt-rail") ?? "{}")).toEqual({
      pinned: ["rail-ai-2"],
      expanded: true,
    });
    editor.destroy();
    editor = null;
    pause.mockRestore();
    load.mockRestore();
  });
});
