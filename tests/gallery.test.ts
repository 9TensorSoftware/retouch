import { describe, expect, it, vi } from "vitest";
import { createDefaultVideoEdits, DEFAULT_EDITS } from "../src/constants";
import type { ImageEntry, VideoEntry } from "../src/types";
import {
  createGallery,
  type GalleryOptions,
  layoutRows,
  loadGalleryView,
  saveGalleryView,
} from "../src/ui/gallery";
import { dragEvent, texts } from "./shell-helpers";

function makeEntry(id = "img-1"): ImageEntry {
  return {
    id,
    kind: "image",
    file: new File(["x"], `${id}.png`, { type: "image/png" }),
    image: document.createElement("img"),
    thumbnailUrl: `blob:${id}`,
    edited: false,
    edits: structuredClone(DEFAULT_EDITS),
  };
}

function makeVideo(id: string): VideoEntry {
  return {
    id,
    kind: "video",
    file: new File(["x"], `${id}.mp4`, { type: "video/mp4" }),
    video: document.createElement("video"),
    videoUrl: `blob:${id}-video`,
    thumbnailUrl: `blob:${id}`,
    duration: 4,
    width: 640,
    height: 360,
    edits: createDefaultVideoEdits(4),
    edited: false,
  };
}

function makeGallery(overrides: Partial<GalleryOptions> = {}) {
  const gallery = createGallery({
    images: [makeEntry()],
    accept: "image/png",
    onEdit: vi.fn(),
    onRemove: vi.fn(),
    onAddMore: vi.fn(),
    onDownload: vi.fn(),
    ...overrides,
  });
  document.body.appendChild(gallery.root);
  return gallery;
}

type Gallery = ReturnType<typeof makeGallery>;

const part = (g: Gallery, id: string, selector: string) =>
  g.root.querySelector(`[data-id="${id}"] ${selector}`) as HTMLElement;
const select = (g: Gallery, id: string, init: MouseEventInit = {}) =>
  part(g, id, ".rt-gallery__select").dispatchEvent(
    new MouseEvent("click", { bubbles: true, ...init }),
  );
const open = (g: Gallery, id: string, init: MouseEventInit = {}) =>
  part(g, id, ".rt-gallery__open").dispatchEvent(
    new MouseEvent("click", { bubbles: true, ...init }),
  );
const isSelected = (g: Gallery, id: string) =>
  part(g, id, ".rt-gallery__select").getAttribute("aria-checked") === "true";
const viewButton = (g: Gallery, label: string) =>
  g.root.querySelector(`.rt-gallery__view-btn[aria-label="${label}"]`) as HTMLButtonElement;
const headline = (g: Gallery) => g.root.querySelector(".rt-gallery__count-title")?.textContent;

describe("gallery Done button", () => {
  it("is absent when no onDone handler is configured", () => {
    const gallery = makeGallery();
    expect(gallery.root.querySelector(".rt-gallery__done")).toBeNull();
    gallery.destroy();
  });

  it("invokes onDone and stays disabled until the run settles", async () => {
    let finish: () => void = () => {};
    const onDone = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const gallery = makeGallery({ onDone });
    const btn = gallery.root.querySelector(".rt-gallery__done") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe("Done");
    expect(btn.disabled).toBe(false);

    btn.click();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(btn.disabled).toBe(true);

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(btn.disabled).toBe(false);
    gallery.destroy();
  });

  it("re-enables after a failed run and reports the error", async () => {
    const error = new Error("export exploded");
    const onDone = vi.fn(async () => {
      throw error;
    });
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const gallery = makeGallery({ onDone });
    const btn = gallery.root.querySelector(".rt-gallery__done") as HTMLButtonElement;
    btn.click();
    expect(btn.disabled).toBe(true);
    await vi.waitFor(() => expect(btn.disabled).toBe(false));
    expect(report).toHaveBeenCalledWith("[Retouch] Done failed", error);
    report.mockRestore();
    gallery.destroy();
  });
});

describe("gallery contact sheet", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("numbers every frame, badges what's been edited, and tallies the sheet", () => {
    const edited = { ...makeEntry("b"), edited: true };
    const g = makeGallery({ images: [makeEntry("a"), edited, makeVideo("c")] });
    expect(texts(g.root, ".rt-gallery__num")).toEqual(["01", "02", "03"]);
    expect(texts(g.root, ".rt-gallery__name")).toEqual(["a.png", "b.png", "c.mp4"]);
    expect(texts(g.root, ".rt-gallery__badge")).toEqual(["Edited"]);
    expect(part(g, "b", ".rt-gallery__badge")).not.toBeNull();
    expect(part(g, "c", ".rt-gallery__duration").textContent).toBe("0:04");
    expect(part(g, "c", ".rt-gallery__play")).not.toBeNull();
    expect(headline(g)).toBe("3 items");
    expect(g.root.querySelector(".rt-gallery__count-meta")?.textContent).toBe("1 edited · 1 video");
  });

  it("opens a frame in the editor, and switches layouts", () => {
    const onEdit = vi.fn();
    const onViewChange = vi.fn();
    const g = makeGallery({ images: [makeEntry("a"), makeEntry("b")], onEdit, onViewChange });
    expect(g.root.querySelector(".rt-gallery__rows")).not.toBeNull();
    expect(viewButton(g, "Rows").getAttribute("aria-pressed")).toBe("true");
    expect(part(g, "b", ".rt-gallery__open").getAttribute("aria-label")).toBe("Edit b.png");
    open(g, "b");
    expect(onEdit).toHaveBeenCalledWith("b");

    viewButton(g, "List").click();
    expect(onViewChange).toHaveBeenCalledWith("list");
    expect(g.root.querySelector(".rt-gallery__list")).not.toBeNull();
    expect(viewButton(g, "List").getAttribute("aria-pressed")).toBe("true");
    expect(viewButton(g, "Rows").getAttribute("aria-pressed")).toBe("false");
    open(g, "a");
    expect(onEdit).toHaveBeenLastCalledWith("a");
  });

  it("opens in the layout it's given; the 0.1 column layouts open the grid", () => {
    const strip = makeGallery({ view: "height-fit" });
    expect(strip.root.querySelector(".rt-gallery__strip")).not.toBeNull();
    const grid = makeGallery({ view: "cols-4" });
    expect(grid.root.querySelector(".rt-gallery__grid")).not.toBeNull();
    expect(viewButton(grid, "Grid").getAttribute("aria-pressed")).toBe("true");
    const rows = makeGallery({ view: "width-fit" });
    expect(rows.root.querySelector(".rt-gallery__rows")).not.toBeNull();
  });

  it("selects with the circle, then with a click; Shift extends, Esc clears, ⌘A takes all", () => {
    const onEdit = vi.fn();
    const g = makeGallery({ images: ["a", "b", "c", "d"].map(makeEntry), onEdit });
    select(g, "a");
    expect(isSelected(g, "a")).toBe(true);
    expect(part(g, "a", ".rt-gallery__loop")).not.toBeNull();
    expect(g.root.classList.contains("rt-gallery--selecting")).toBe(true);
    expect(headline(g)).toBe("1 selected");

    // While selecting, a click on a frame selects it instead of opening it.
    open(g, "b");
    expect(onEdit).not.toHaveBeenCalled();
    expect(isSelected(g, "b")).toBe(true);

    open(g, "d", { shiftKey: true });
    expect(["a", "b", "c", "d"].map((id) => isSelected(g, id))).toEqual([true, true, true, true]);

    g.root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(g.root.querySelectorAll(".rt-gallery__item--selected")).toHaveLength(0);
    expect(g.root.querySelector(".rt-gallery__loop")).toBeNull();
    expect(headline(g)).toBe("4 items");

    g.root.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true }));
    expect(headline(g)).toBe("4 selected");
  });

  it("hands focus to Add when the selection's controls leave", () => {
    const g = makeGallery({ images: ["a", "b"].map(makeEntry) });
    select(g, "a");
    const clear = g.root.querySelector(".rt-gallery__clear") as HTMLButtonElement;
    clear.focus();
    clear.click();
    expect(clear.hidden).toBe(true);
    expect(document.activeElement).toBe(g.root.querySelector(".rt-gallery__add"));

    select(g, "b");
    const remove = g.root.querySelector(".rt-gallery__batch--danger") as HTMLButtonElement;
    remove.focus();
    remove.click();
    expect(document.activeElement).toBe(g.root.querySelector(".rt-gallery__add"));
  });

  it("⌘/Ctrl-click selects without opening", () => {
    const onEdit = vi.fn();
    const g = makeGallery({ images: ["a", "b"].map(makeEntry), onEdit });
    open(g, "b", { ctrlKey: true });
    expect(onEdit).not.toHaveBeenCalled();
    expect(isSelected(g, "b")).toBe(true);
  });

  it("downloads a selection in order, carrying on past a failure, and removes it in one go", async () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const onRemove = vi.fn();
    const onDownload = vi.fn(async (id: string) => {
      if (id === "b") throw new Error("nope");
    });
    const g = makeGallery({ images: ["a", "b", "c"].map(makeEntry), onRemove, onDownload });
    for (const id of ["a", "b", "c"]) select(g, id);
    const [download, remove] = g.root.querySelectorAll<HTMLButtonElement>(".rt-gallery__batch");
    expect(download.getAttribute("aria-label")).toBe("Download selected");
    download.click();
    await vi.waitFor(() => expect(onDownload).toHaveBeenCalledTimes(3));
    expect(onDownload.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
    await vi.waitFor(() => expect(download.disabled).toBe(false));
    expect(report).toHaveBeenCalledWith("[Retouch] Download failed", expect.any(Error));

    select(g, "c"); // deselect
    remove.click();
    expect(onRemove).toHaveBeenCalledWith(["a", "b"]);
    expect(texts(g.root, ".rt-gallery__name")).toEqual(["c.png"]);
    expect(texts(g.root, ".rt-gallery__num")).toEqual(["01"]);
    expect(g.root.classList.contains("rt-gallery--selecting")).toBe(false);
    report.mockRestore();
  });

  it("removes one frame from its own button", () => {
    const onRemove = vi.fn();
    const g = makeGallery({ images: ["a", "b"].map(makeEntry), onRemove });
    part(g, "a", ".rt-gallery__quick-btn--danger").click();
    expect(onRemove).toHaveBeenCalledWith(["a"]);
    expect(texts(g.root, ".rt-gallery__name")).toEqual(["b.png"]);
    expect(headline(g)).toBe("1 item");
  });

  it("shares its selection with the caller, so it survives a re-render", () => {
    const selection = new Set(["b", "gone"]);
    const g = makeGallery({ images: ["a", "b"].map(makeEntry), selection });
    expect(isSelected(g, "b")).toBe(true);
    expect([...selection]).toEqual(["b"]); // ids that left are dropped
    select(g, "a");
    expect([...selection]).toEqual(["b", "a"]);
  });

  it("takes files dropped anywhere on it, and ignores drags that carry none", () => {
    const onAddMore = vi.fn();
    const g = makeGallery({ onAddMore });
    g.root.dispatchEvent(dragEvent("dragenter", [], ["text/plain"]));
    expect(g.root.classList.contains("rt-gallery--dropping")).toBe(false);

    const file = new File(["x"], "new.png", { type: "image/png" });
    g.root.dispatchEvent(dragEvent("dragenter", [file]));
    expect(g.root.classList.contains("rt-gallery--dropping")).toBe(true);
    g.root.dispatchEvent(dragEvent("drop", [file]));
    expect(g.root.classList.contains("rt-gallery--dropping")).toBe(false);
    expect(onAddMore).toHaveBeenCalledWith([file]);
  });

  it("remembers the last layout in this browser", () => {
    expect(loadGalleryView()).toBeUndefined();
    saveGalleryView("grid");
    expect(loadGalleryView()).toBe("grid");
    localStorage.setItem("rt-gallery-view", "mosaic");
    expect(loadGalleryView()).toBeUndefined();
  });
});

describe("layoutRows", () => {
  it("fills each row to the width at one height, and leaves the last at the target", () => {
    const heights = layoutRows([1.5, 1.5, 1.5, 1.5, 1], 1000, 200, 10);
    // A fourth frame would shrink the first row to 162 px; stopping at three
    // stretches it to 218 px, which is nearer the target.
    for (const h of heights.slice(0, 3)) expect(h).toBeCloseTo(217.67, 2);
    expect(1.5 * 3 * heights[0] + 2 * 10).toBeCloseTo(999.5, 5);
    expect(heights.slice(3)).toEqual([200, 200]);
  });

  it("takes the frame into the row when that lands nearer the target", () => {
    const [a, b] = layoutRows([0.5, 5], 1000, 200, 10);
    expect(a).toBeCloseTo(179.91, 2);
    expect(b).toBe(a);
  });

  it("shrinks a frame wider than the page to fit it", () => {
    expect(layoutRows([6], 600, 200, 10)[0]).toBeCloseTo(99.92, 2);
    expect(layoutRows([2, 2, 6], 1000, 200, 10)[2]).toBeCloseTo(166.58, 2);
  });
});
