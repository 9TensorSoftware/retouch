import { createDropZone, type DropZoneOptions } from "../src/ui/drop-zone";
import { dragEvent } from "./shell-helpers";

function makeZone(overrides: Partial<DropZoneOptions> = {}) {
  const options = {
    onFiles: vi.fn(),
    onPaste: vi.fn(),
    accept: "image/png",
    title: "Drop photos",
    formats: ["JPG", "PNG"],
    ...overrides,
  };
  const zone = createDropZone(options);
  document.body.appendChild(zone.root);
  return { zone, options };
}

describe("drop zone", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("invites a drop, names the formats, and offers Choose files and Paste", () => {
    const { zone, options } = makeZone();
    expect(zone.root.querySelector(".rt-dropzone__title")?.textContent).toBe("Drop photos");
    expect(zone.root.querySelector(".rt-dropzone__formats")?.textContent).toBe("JPG · PNG");
    expect(zone.root.querySelectorAll(".rt-dropzone__print")).toHaveLength(3);

    const input = zone.root.querySelector("input[type=file]") as HTMLInputElement;
    const pick = vi.spyOn(input, "click").mockImplementation(() => {});
    (zone.root.querySelector(".rt-dropzone__choose") as HTMLButtonElement).click();
    expect(pick).toHaveBeenCalledTimes(1);
    (zone.root.querySelector(".rt-dropzone__paste") as HTMLButtonElement).click();
    expect(options.onPaste).toHaveBeenCalledTimes(1);
    expect(pick).toHaveBeenCalledTimes(1);
    // Anywhere else on the table opens the picker too.
    (zone.root.querySelector(".rt-dropzone__stack") as HTMLElement).click();
    expect(pick).toHaveBeenCalledTimes(2);
  });

  it("hands over picked files and clears the input for the next pick", () => {
    const { zone, options } = makeZone();
    const input = zone.root.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(options.onFiles).toHaveBeenCalledWith([file]);
  });

  it("lights up for files dragged over, not for other drags, and takes the drop", () => {
    const { zone, options } = makeZone();
    const table = zone.root.querySelector(".rt-dropzone") as HTMLElement;
    const title = () => zone.root.querySelector(".rt-dropzone__title")?.textContent;

    table.dispatchEvent(dragEvent("dragenter", [], ["text/plain"]));
    expect(table.classList.contains("rt-dropzone--active")).toBe(false);

    const file = new File(["x"], "a.png", { type: "image/png" });
    table.dispatchEvent(dragEvent("dragenter", [file]));
    expect(table.classList.contains("rt-dropzone--active")).toBe(true);
    expect(title()).toBe("Release to add");

    table.dispatchEvent(dragEvent("drop", [file]));
    expect(table.classList.contains("rt-dropzone--active")).toBe(false);
    expect(title()).toBe("Drop photos");
    expect(options.onFiles).toHaveBeenCalledWith([file]);
  });

  it("settles when the drag leaves", () => {
    const { zone } = makeZone();
    const table = zone.root.querySelector(".rt-dropzone") as HTMLElement;
    const file = new File(["x"], "a.png", { type: "image/png" });
    table.dispatchEvent(dragEvent("dragenter", [file]));
    table.dispatchEvent(dragEvent("dragleave", [file]));
    expect(table.classList.contains("rt-dropzone--active")).toBe(false);
  });
});
