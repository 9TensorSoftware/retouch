import { Retouch } from "../src/retouch";
import type { MediaEntry } from "../src/types";
import { exportImage, revokeThumbnailUrl } from "../src/utils/image";
import { pasteEvent, texts } from "./shell-helpers";

// jsdom decodes no images, so files become entries here without loading.
vi.mock("../src/utils/image", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/image")>();
  const { DEFAULT_EDITS } = await import("../src/constants");
  return {
    ...actual,
    revokeThumbnailUrl: vi.fn(),
    exportImage: vi.fn(async () => new Blob(["out"], { type: "image/png" })),
    processFiles: async (files: File[]) => {
      const entries: MediaEntry[] = [];
      const rejected: { file: File; reason: "type" }[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          rejected.push({ file, reason: "type" });
          continue;
        }
        const image = new Image();
        Object.defineProperty(image, "naturalWidth", { value: 1200 });
        Object.defineProperty(image, "naturalHeight", { value: 800 });
        entries.push({
          kind: "image",
          id: `id-${file.name}`,
          file,
          image,
          thumbnailUrl: `blob:${file.name}`,
          edits: structuredClone(DEFAULT_EDITS),
          edited: false,
        });
      }
      return { entries, rejected };
    },
  };
});

const png = (name: string) => new File(["x"], name, { type: "image/png" });
const toastTexts = () => texts(document, ".rt-toast__text");

describe("Retouch shell", () => {
  let container: HTMLDivElement;
  let retouch: Retouch;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    retouch = new Retouch({ target: container });
  });

  afterEach(() => {
    retouch.destroy();
    document.body.innerHTML = "";
    localStorage.clear();
    vi.mocked(revokeThumbnailUrl).mockClear();
    vi.useRealTimers();
  });

  const names = () => retouch.getMedia().map((e) => e.file.name);
  const tile = (name: string) =>
    container.querySelector(`[data-id="id-${name}"]`) as HTMLElement | null;
  const click = (el: Element | null) => (el as HTMLElement).click();

  it("says what went wrong in one toast per batch, with what would work", async () => {
    const rejected = vi.fn();
    retouch.on("file:rejected", rejected);
    await retouch.addFiles([new File(["x"], "notes.txt", { type: "text/plain" })]);
    expect(toastTexts()).toEqual(['"notes.txt" is an unsupported file type']);
    expect(texts(document, ".rt-toast__detail")).toEqual(["Use JPG, PNG, WebP, MP4, WebM or MOV."]);

    await retouch.addFiles([
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.csv", { type: "text/csv" }),
    ]);
    expect(toastTexts()).toHaveLength(2);
    expect(toastTexts()[1]).toBe("2 files couldn't be added");
    expect(rejected).toHaveBeenCalledTimes(3); // events still fire per file
  });

  it("removing from the gallery offers Undo, which puts things back where they were", async () => {
    const removed = vi.fn();
    const added = vi.fn();
    retouch.on("images:remove", removed);
    retouch.on("images:add", added);
    await retouch.addFiles([png("a.png"), png("b.png"), png("c.png")]);
    expect(retouch.state).toBe("gallery");

    click(tile("a.png")?.querySelector(".rt-gallery__select") ?? null);
    click(tile("c.png")?.querySelector(".rt-gallery__select") ?? null);
    click(container.querySelector(".rt-gallery__batch--danger"));
    expect(names()).toEqual(["b.png"]);
    expect(removed).toHaveBeenCalledTimes(2);
    expect(toastTexts()).toEqual(["Removed 2 items"]);

    click(document.querySelector(".rt-toast__action"));
    expect(names()).toEqual(["a.png", "b.png", "c.png"]);
    expect(added).toHaveBeenLastCalledWith({ entries: expect.any(Array) });
    expect(added.mock.lastCall?.[0].entries).toHaveLength(2);
    expect(texts(container, ".rt-gallery__name")).toEqual(["a.png", "b.png", "c.png"]);
    expect(revokeThumbnailUrl).not.toHaveBeenCalled();
  });

  it("lets a removal go for good once its toast is gone", async () => {
    await retouch.addFiles([png("a.png"), png("b.png")]);
    vi.useFakeTimers();
    click(tile("a.png")?.querySelector(".rt-gallery__quick-btn--danger") ?? null);
    expect(revokeThumbnailUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(8000);
    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:a.png");
  });

  it("a second removal ends the first one's Undo", async () => {
    await retouch.addFiles([png("a.png"), png("b.png"), png("c.png")]);
    click(tile("a.png")?.querySelector(".rt-gallery__quick-btn--danger") ?? null);
    click(tile("b.png")?.querySelector(".rt-gallery__quick-btn--danger") ?? null);
    expect(revokeThumbnailUrl).toHaveBeenCalledWith("blob:a.png");
    const undo = [...document.querySelectorAll(".rt-toast")].find((t) =>
      t.textContent?.includes("b.png"),
    );
    click(undo?.querySelector(".rt-toast__action") ?? null);
    expect(names()).toEqual(["b.png", "c.png"]);
  });

  it("emptying the gallery goes back to the drop zone, and Undo comes back from it", async () => {
    await retouch.addFiles([png("a.png")]);
    click(tile("a.png")?.querySelector(".rt-gallery__quick-btn--danger") ?? null);
    expect(retouch.state).toBe("dropzone");
    click(document.querySelector(".rt-toast__action"));
    expect(retouch.state).toBe("gallery");
    expect(names()).toEqual(["a.png"]);
  });

  it("keeps the gallery's layout and selection when it re-renders", async () => {
    await retouch.addFiles([png("a.png"), png("b.png")]);
    click(container.querySelector('.rt-gallery__view-btn[aria-label="Grid"]'));
    click(tile("a.png")?.querySelector(".rt-gallery__select") ?? null);
    await retouch.addFiles([png("c.png")]); // re-renders the gallery
    expect(container.querySelector(".rt-gallery__grid")).not.toBeNull();
    expect(tile("a.png")?.querySelector(".rt-gallery__select")?.getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(localStorage.getItem("rt-gallery-view")).toBe("grid");
  });

  it("adds pasted files, unless the paste was meant for something else", async () => {
    const add = vi.spyOn(retouch, "addFiles").mockResolvedValue();
    document.dispatchEvent(pasteEvent([new File(["x"], "image.png", { type: "image/png" })]));
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0].map((f) => f.name)).toEqual(["Pasted image.png"]);

    // Focus in the host's own field: its paste.
    const field = document.createElement("input");
    document.body.appendChild(field);
    field.focus();
    field.dispatchEvent(pasteEvent([png("a.png")]));
    // Focus on a host button: still not ours.
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    document.dispatchEvent(pasteEvent([png("b.png")]));
    // A paste without files.
    button.blur();
    document.dispatchEvent(pasteEvent([]));
    expect(add).toHaveBeenCalledTimes(1);
  });

  it("the Paste button reads the clipboard, and says so when it can't", async () => {
    click(container.querySelector(".rt-dropzone__paste"));
    await vi.waitFor(() => expect(toastTexts()).toEqual(["Couldn't read the clipboard"]));

    const read = vi.fn(async () => [{ types: ["text/plain"], getType: async () => new Blob() }]);
    Object.defineProperty(navigator, "clipboard", { value: { read }, configurable: true });
    click(container.querySelector(".rt-dropzone__paste"));
    await vi.waitFor(() => expect(toastTexts()).toContain("There's no photo on the clipboard"));

    read.mockResolvedValue([
      { types: ["image/png"], getType: async () => new Blob(["p"], { type: "image/png" }) },
    ]);
    click(container.querySelector(".rt-dropzone__paste"));
    await vi.waitFor(() => expect(names()).toEqual(["Pasted image.png"]));
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("shows the export sheet only for a run that lasts, and reports failures once", async () => {
    await retouch.addFiles([png("a.png"), png("b.png"), png("c.png")]);
    // Quick runs never flash the sheet.
    await retouch.exportAll();
    expect(document.querySelector(".rt-export-overlay")).toBeNull();

    vi.useFakeTimers();
    let release: () => void = () => {};
    vi.mocked(exportImage)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve(new Blob(["a"]));
          }),
      )
      .mockRejectedValueOnce(new Error("encoder broke"))
      .mockRejectedValueOnce(new Error("encoder broke"));
    const run = retouch.exportAll();
    vi.advanceTimersByTime(400);
    const sheet = document.querySelector(".rt-export-overlay");
    expect(sheet).not.toBeNull();
    expect(sheet?.querySelectorAll(".rt-export-overlay__item img")).toHaveLength(3);

    release();
    const blobs = await run;
    expect(blobs[1]).toBe(retouch.getMedia()[1].file); // the original went out instead
    expect(toastTexts()).toEqual(["2 files couldn't be exported"]);
    expect(texts(document, ".rt-toast__detail")).toEqual([
      "Their original files went out instead.",
    ]);
    expect(document.querySelector(".rt-export-overlay--finished")).not.toBeNull();
    vi.advanceTimersByTime(700);
    expect(document.querySelector(".rt-export-overlay")).toBeNull();
  });
});
