import { Retouch } from "../src/retouch";
import type { MediaEntry } from "../src/types";
import {
  canvasHasTransparency,
  downloadName,
  formatInfo,
  formatOfMime,
} from "../src/utils/image-formats";
import { stubLayout } from "./editor-helpers";

const encodeImage = vi.fn(
  async (_canvas: HTMLCanvasElement, options: { format?: string } = {}) =>
    new Blob(["x"], { type: `image/${options.format ?? "png"}` }),
);
const transparent = { value: false };

// jsdom decodes and encodes no images: files become entries without loading,
// rendering hands back a blank canvas, and encoding records what it was asked.
vi.mock("../src/utils/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/image")>();
  const { DEFAULT_EDITS } = await import("../src/constants");
  return {
    ...actual,
    revokeThumbnailUrl: vi.fn(),
    renderEditedImage: vi.fn(async () => document.createElement("canvas")),
    encodeImage: (...args: Parameters<typeof encodeImage>) => encodeImage(...args),
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

vi.mock("../src/utils/image-formats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/image-formats")>();
  return {
    ...actual,
    // This browser writes WebP but not AVIF.
    encodableFormats: async () => ["png", "jpeg", "webp"],
    canvasHasTransparency: () => transparent.value,
  };
});

describe("image formats", () => {
  it("names formats and files", () => {
    expect(formatOfMime("image/jpeg")).toBe("jpeg");
    expect(formatOfMime("image/JPG")).toBe("jpeg");
    expect(formatOfMime("image/gif")).toBeNull();
    expect(downloadName("corgi.jpeg", "png")).toBe("corgi.png");
    expect(downloadName("my.corgi.png", "jpeg")).toBe("my.corgi.jpg");
    expect(downloadName("corgi", "webp")).toBe("corgi.webp");
    expect(formatInfo("jpeg").alpha).toBe(false);
    expect(formatInfo("webp").alpha).toBe(true);
  });

  it("finds a pixel that isn't fully opaque", async () => {
    const { canvasHasTransparency: real } = await vi.importActual<
      typeof import("../src/utils/image-formats")
    >("../src/utils/image-formats");
    expect(canvasHasTransparency).not.toBe(real);
    const canvasWith = (alpha: number[]): HTMLCanvasElement => {
      const data = new Uint8ClampedArray(alpha.flatMap((a) => [9, 9, 9, a]));
      return {
        width: alpha.length,
        height: 1,
        getContext: () => ({ getImageData: () => ({ data }) }),
      } as unknown as HTMLCanvasElement;
    };
    expect(real(canvasWith([255, 255, 255]))).toBe(false);
    expect(real(canvasWith([255, 254, 255]))).toBe(true);
  });
});

describe("downloading a photo", () => {
  let restoreLayout: () => void;
  let retouch: Retouch;
  let saved: string[];

  const lastFormat = () => encodeImage.mock.lastCall?.[1]?.format;

  async function open(file: string, type: string, options = {}): Promise<void> {
    const container = document.createElement("div");
    document.body.appendChild(container);
    retouch = new Retouch({ target: container, ...options });
    await retouch.addFiles([new File(["x"], file, { type })]);
  }

  beforeEach(() => {
    restoreLayout = stubLayout(800, 600);
    saved = [];
    transparent.value = false;
    encodeImage.mockClear();
    URL.createObjectURL = vi.fn(() => "blob:out");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      saved.push(this.download);
    });
  });

  afterEach(() => {
    retouch.destroy();
    document.body.innerHTML = "";
    restoreLayout();
    vi.restoreAllMocks();
  });

  it("keeps the photo's own format unless asked for another", async () => {
    await open("corgi.jpg", "image/jpeg");
    await retouch.downloadImage("id-corgi.jpg");
    expect(lastFormat()).toBe("jpeg");
    await retouch.downloadImage("id-corgi.jpg", { format: "webp" });
    expect(lastFormat()).toBe("webp");
    // A format this browser can't write would come out as PNG named .avif.
    await retouch.downloadImage("id-corgi.jpg", { format: "avif" });
    expect(lastFormat()).toBe("png");
    expect(saved).toEqual(["corgi.jpg", "corgi.webp", "corgi.png"]);
  });

  it("uses the host's export format, and the photo's new name", async () => {
    await open("corgi.png", "image/png", { export: { format: "webp" } });
    const entry = retouch.getMedia()[0];
    if (entry?.kind === "image") entry.edits.metadata = { fileName: "best-dog.png" };
    await retouch.downloadImage("id-corgi.png");
    expect(saved).toEqual(["best-dog.webp"]);
  });

  it("saves transparency as PNG by default, and fills it in when JPG is asked for", async () => {
    await open("corgi.jpg", "image/jpeg");
    transparent.value = true;
    await retouch.downloadImage("id-corgi.jpg");
    expect(lastFormat()).toBe("png");
    await retouch.downloadImage("id-corgi.jpg", { format: "jpeg" });
    expect(lastFormat()).toBe("jpeg");
    expect(saved).toEqual(["corgi.png", "corgi.jpg"]);
  });

  describe("from the editor", () => {
    const button = (name: string) =>
      [...document.querySelectorAll<HTMLButtonElement>(".rt-download button")].find(
        (b) => b.getAttribute("aria-label") === name,
      );
    const settle = () => new Promise((r) => setTimeout(r, 0));

    async function openEditor(): Promise<void> {
      await open("corgi.jpg", "image/jpeg");
      retouch.openEditor("id-corgi.jpg");
      await settle();
    }

    it("downloads in the photo's format, or one picked from the menu", async () => {
      await openEditor();
      expect(document.querySelector(".rt-download__format")?.textContent).toBe("JPG");
      button("Download as JPG")?.click();
      await settle();
      expect(saved).toEqual(["corgi.jpg"]);

      button("Download as another format")?.click();
      const menu = document.querySelector<HTMLElement>(".rt-download-menu");
      expect(menu?.hidden).toBe(false);
      const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      expect(items.map((i) => i.querySelector(".rt-flyout__name")?.textContent)).toEqual([
        "PNG",
        "JPG",
        "WebP",
      ]);
      expect(items[1].querySelector(".rt-flyout__badge")?.textContent).toBe("Original");
      expect(document.activeElement).toBe(items[1]);
      items[2].click();
      await settle();
      expect(menu?.hidden).toBe(true);
      expect(saved).toEqual(["corgi.jpg", "corgi.webp"]);
    });

    it("applies or discards a crop frame first, as Done does", async () => {
      await openEditor();
      const square = [...document.querySelectorAll<HTMLButtonElement>(".rt-aspect")].find(
        (b) => b.textContent === "Square",
      );
      square?.click();
      button("Download as JPG")?.click();
      await settle();
      const card = document.querySelector(".rt-confirm__card");
      expect(card?.textContent).toContain("Apply the crop?");
      expect(saved).toEqual([]);
      [...(card?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
        .find((b) => b.textContent === "Apply")
        ?.click();
      await settle();
      await settle();
      expect(saved).toEqual(["corgi.jpg"]);
      expect(retouch.getMedia()[0].edits.crop.width).toBeLessThan(1);
    });

    it("asks before filling transparent areas with white", async () => {
      await openEditor();
      transparent.value = true;
      const ask = async () => {
        button("Download as JPG")?.click();
        await settle();
        await settle();
        const card = document.querySelector(".rt-confirm__card");
        expect(card?.textContent).toContain("Fill the transparent areas with white?");
        return [...(card?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
      };

      (await ask()).find((b) => b.textContent === "Download JPG")?.click();
      await settle();
      expect(lastFormat()).toBe("jpeg");

      (await ask()).find((b) => b.textContent === "Download PNG")?.click();
      await settle();
      expect(lastFormat()).toBe("png");

      await ask();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await settle();
      expect(saved).toEqual(["corgi.jpg", "corgi.png"]);
      // Escape answered the question, and left the editor open.
      expect(retouch.state).toBe("editor");
    });
  });
});
