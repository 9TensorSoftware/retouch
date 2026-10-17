import { Retouch } from "../src/retouch";
import type { MediaEntry } from "../src/types";
import { stubLayout } from "./editor-helpers";

// jsdom decodes no images, so files become entries here without loading.
vi.mock("../src/utils/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/image")>();
  const { DEFAULT_EDITS } = await import("../src/constants");
  return {
    ...actual,
    revokeThumbnailUrl: vi.fn(),
    processFiles: async (files: File[]) => {
      const entries: MediaEntry[] = files.map((file) => {
        const image = new Image();
        Object.defineProperty(image, "naturalWidth", { value: 1200 });
        Object.defineProperty(image, "naturalHeight", { value: 800 });
        return {
          kind: "image",
          id: `id-${file.name}`,
          file,
          image,
          thumbnailUrl: `blob:${file.name}`,
          edits: structuredClone(DEFAULT_EDITS),
          edited: false,
        };
      });
      return { entries, rejected: [] };
    },
  };
});

const activeTool = () =>
  document.querySelector('.rt-toolbar__btn[aria-current="true"]')?.getAttribute("aria-label");

describe("Retouch.openEditor", () => {
  let restoreLayout: () => void;
  let retouch: Retouch;

  beforeEach(async () => {
    restoreLayout = stubLayout(800, 600);
    const container = document.createElement("div");
    document.body.appendChild(container);
    retouch = new Retouch({ target: container });
    await retouch.addFiles([new File(["x"], "a.png", { type: "image/png" })]);
  });

  afterEach(() => {
    retouch.destroy();
    document.body.innerHTML = "";
    restoreLayout();
  });

  it("opens on the tool asked for, and on the first tool next time", () => {
    retouch.openEditor("id-a.png", { tool: "adjust" });
    expect(activeTool()).toBe("Adjust");

    retouch.closeEditor(false);
    retouch.openEditor("id-a.png");
    expect(activeTool()).toBe("Crop");
  });
});
