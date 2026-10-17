import { Retouch } from "../src/retouch";
import type { MediaEntry } from "../src/types";
import { exportImage } from "../src/utils/image";
import { stubLayout } from "./editor-helpers";

// jsdom decodes no images, so files become entries here without loading.
vi.mock("../src/utils/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/image")>();
  const { DEFAULT_EDITS } = await import("../src/constants");
  return {
    ...actual,
    revokeThumbnailUrl: vi.fn(),
    exportImage: vi.fn(async () => new Blob(["out"], { type: "image/jpeg" })),
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

const png = (name: string) => new File(["x"], name, { type: "image/png" });

/** A stand-in for document.startViewTransition: it holds the update until the test runs it. */
function fakeViewTransitions() {
  let update: (() => Promise<void>) | null = null;
  let finish: () => void = () => {};
  const start = vi.fn((cb: () => Promise<void>) => {
    update = cb;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { ready: Promise.resolve(), finished };
  });
  Object.defineProperty(document, "startViewTransition", { value: start, configurable: true });
  return {
    start,
    /** Let the browser call the update, then end the animation. */
    async run() {
      await update?.();
      finish();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

function reducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("reduced-motion") ? reduce : false,
    addEventListener() {},
    removeEventListener() {},
  }));
}

describe("Retouch motion", () => {
  let container: HTMLDivElement;
  let retouch: Retouch;
  let restoreLayout: () => void;
  const rect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
    // Everything is "on screen", so the photo is worth morphing.
    Element.prototype.getBoundingClientRect = () => new DOMRect(10, 10, 120, 80);
    Object.defineProperty(URL, "createObjectURL", {
      value: vi.fn(() => "blob:fresh-thumbnail"),
      configurable: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    retouch.destroy();
    document.body.innerHTML = "";
    Element.prototype.getBoundingClientRect = rect;
    Reflect.deleteProperty(document, "startViewTransition");
    vi.unstubAllGlobals();
    restoreLayout();
    document.documentElement.className = "";
  });

  async function galleryWith(...names: string[]): Promise<void> {
    retouch = new Retouch({ target: container });
    await retouch.addFiles(names.map(png));
  }

  it("morphs the photo from its frame into the editor, swapping views inside the transition", async () => {
    reducedMotion(false);
    const vt = fakeViewTransitions();
    await galleryWith("a.png", "b.png");
    const frame = container.querySelector<HTMLElement>('[data-id="id-b.png"] img');

    retouch.openEditor("id-b.png");
    expect(vt.start).toHaveBeenCalledTimes(1);
    // The state is current at once; the view waits for the transition.
    expect(retouch.state).toBe("editor");
    expect(frame?.style.getPropertyValue("view-transition-name")).toBe("rt-photo");
    expect(document.documentElement.classList.contains("rt-morphing")).toBe(true);
    expect(document.querySelector(".rt-editor-overlay")).toBeNull();

    await vt.run();
    const overlay = document.querySelector(".rt-editor-overlay");
    expect(overlay?.classList.contains("rt-editor-overlay--morphed")).toBe(true);
    expect(container.querySelector(".rt-gallery")).toBeNull();
    // Named during the transition, and let go of after it.
    expect(document.documentElement.classList.contains("rt-morphing")).toBe(false);
    const stage = document.querySelector<HTMLElement>(".rt-editor__canvas-container");
    expect(stage?.style.getPropertyValue("view-transition-name")).toBe("");
  });

  it("settles the photo back into a frame that already shows the edits", async () => {
    reducedMotion(false);
    const vt = fakeViewTransitions();
    await galleryWith("a.png");
    retouch.openEditor("id-a.png");
    await vt.run();

    let release: (blob: Blob) => void = () => {};
    vi.mocked(exportImage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    retouch.closeEditor(true);
    expect(retouch.state).toBe("gallery");
    expect(document.querySelector(".rt-editor-overlay")).not.toBeNull();
    const done = vt.run();
    release(new Blob(["thumb"], { type: "image/jpeg" }));
    await done;
    const frame = container.querySelector<HTMLImageElement>('[data-id="id-a.png"] img');
    expect(frame?.getAttribute("src")).toBe("blob:fresh-thumbnail");
    expect(document.querySelector(".rt-editor-overlay")).toBeNull();
  });

  it("asks for reduced motion: no transition, and the swap is immediate", async () => {
    reducedMotion(true);
    const vt = fakeViewTransitions();
    await galleryWith("a.png");
    retouch.openEditor("id-a.png");
    expect(vt.start).not.toHaveBeenCalled();
    expect(document.querySelector(".rt-editor-overlay")).not.toBeNull();
    retouch.closeEditor(false);
    expect(document.querySelector(".rt-editor-overlay")).toBeNull();
    expect(container.querySelector(".rt-gallery__item--fresh")).toBeNull();
  });

  it("fades the editor out where there are no view transitions", async () => {
    reducedMotion(false);
    await galleryWith("a.png");
    retouch.openEditor("id-a.png");
    const overlay = document.querySelector(".rt-editor-overlay") as HTMLElement;
    retouch.closeEditor(false);
    expect(overlay.isConnected).toBe(true);
    expect(overlay.classList.contains("rt-editor-overlay--leaving")).toBe(true);
    expect(overlay.inert).toBe(true);
    expect(container.querySelector(".rt-gallery")).not.toBeNull();
    await new Promise((r) => setTimeout(r, 300));
    expect(overlay.isConnected).toBe(false);
  });

  it("cascades new frames in, once, and the gallery rises in from the drop zone", async () => {
    reducedMotion(false);
    await galleryWith("a.png", "b.png");
    const fresh = () =>
      [...container.querySelectorAll<HTMLElement>(".rt-gallery__item--fresh")].map((el) =>
        el.style.getPropertyValue("--i"),
      );
    expect(fresh()).toEqual(["0", "1"]);
    expect(container.querySelector(".rt-gallery--entering")).not.toBeNull();

    await retouch.addFiles([png("c.png")]);
    expect(fresh()).toEqual(["0"]);
    expect(container.querySelector('[data-id="id-c.png"]')?.classList).toContain(
      "rt-gallery__item--fresh",
    );
    expect(container.querySelector(".rt-gallery--entering")).toBeNull();
  });
});
