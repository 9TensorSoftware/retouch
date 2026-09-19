import { describe, expect, it, vi } from "vitest";
import { DEFAULT_EDITS } from "../src/constants";
import type { ImageEntry } from "../src/types";
import { createGallery, type GalleryOptions } from "../src/ui/gallery";

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
