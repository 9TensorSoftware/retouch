import { createExportOverlay, etaText } from "../src/ui/export-overlay";

const ITEMS = [
  { id: "a", name: "a.jpg", thumbnail: "blob:a" },
  { id: "b", name: "b.mp4" },
  { id: "c", name: "c.png", thumbnail: "blob:c" },
];

function makeSheet(onCancel = vi.fn()) {
  const sheet = createExportOverlay({ items: ITEMS, onCancel });
  const item = (id: string) =>
    sheet.root.querySelectorAll(".rt-export-overlay__item")[ITEMS.findIndex((i) => i.id === id)];
  const text = (selector: string) => sheet.root.querySelector(selector)?.textContent;
  return { sheet, item, text, onCancel };
}

describe("export sheet", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("shows every file as its picture, with a ring, a check or a mark", () => {
    const { sheet, item, text } = makeSheet();
    sheet.attach();
    expect(sheet.root.querySelectorAll(".rt-export-overlay__item img")).toHaveLength(2);
    expect(text(".rt-export-overlay__ext")).toBe("MP4");
    expect(text(".rt-export-overlay__title")).toBe("Exporting 3 files");
    expect(item("a").classList.contains("rt-export-overlay__item--waiting")).toBe(true);

    sheet.setActive("a");
    expect(item("a").classList.contains("rt-export-overlay__item--active")).toBe(true);
    sheet.setComplete("a");
    expect(item("a").classList.contains("rt-export-overlay__item--done")).toBe(true);

    sheet.setProgress("b", 0.5);
    expect(item("b").classList.contains("rt-export-overlay__item--measured")).toBe(true);
    expect(item("b").classList.contains("rt-export-overlay__item--active")).toBe(true);
    const bar = sheet.root.querySelector("[role=progressbar]");
    expect(bar?.getAttribute("aria-valuenow")).toBe("50"); // (1 + 0.5) of 3
    expect(text(".rt-export-overlay__count")).toBe("1 of 3");

    sheet.setError("b");
    expect(item("b").classList.contains("rt-export-overlay__item--error")).toBe(true);
    expect(bar?.getAttribute("aria-valuetext")).toBe("2 of 3 files");
  });

  it("takes focus to Cancel, cancels once (Escape too), and gives focus back", () => {
    const before = document.createElement("button");
    document.body.appendChild(before);
    before.focus();
    const { sheet, onCancel } = makeSheet();
    sheet.attach();
    expect(sheet.root.getAttribute("aria-modal")).toBe("true");
    const cancel = sheet.root.querySelector(".rt-export-overlay__cancel") as HTMLButtonElement;
    expect(document.activeElement).toBe(cancel);

    sheet.root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    cancel.click();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(cancel.disabled).toBe(true);
    expect(cancel.textContent).toBe("Canceling…");

    sheet.destroy();
    expect(document.activeElement).toBe(before);
  });

  it("holds the finished sheet a moment, then leaves", () => {
    vi.useFakeTimers();
    const { sheet, text } = makeSheet();
    sheet.attach();
    sheet.setComplete("a");
    sheet.setComplete("b");
    sheet.setError("c");
    sheet.finish();
    expect(text(".rt-export-overlay__title")).toBe("Exported 3 files");
    expect(text(".rt-export-overlay__eta")).toBe("1 sent unedited");
    expect(sheet.root.isConnected).toBe(true);
    vi.advanceTimersByTime(700);
    expect(sheet.root.isConnected).toBe(false);
  });

  it("finishing before it was ever shown just tidies up", () => {
    const { sheet } = makeSheet();
    sheet.finish();
    sheet.attach();
    expect(document.querySelector(".rt-export-overlay")).toBeNull();
  });

  it("estimates the time left in words", () => {
    expect(etaText(1)).toBe("Almost done");
    expect(etaText(12.2)).toBe("About 13 s left");
    expect(etaText(150)).toBe("About 3 min left");
  });
});
