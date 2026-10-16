import { filesFromPaste, pastedName, readClipboardFiles } from "../src/utils/clipboard";
import { formatBytes, formatNames, formatSpan, listOr } from "../src/utils/formats";
import { pasteEvent } from "./shell-helpers";

describe("format names", () => {
  it("names formats the way people do, once each", () => {
    expect(
      formatNames([
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "video/quicktime",
        "image/x-portable-pixmap",
      ]),
    ).toEqual(["JPG", "PNG", "WebP", "MOV", "PORTABLE-PIXMAP"]);
    expect(listOr(["JPG"])).toBe("JPG");
    expect(listOr(["JPG", "PNG", "WebP"])).toBe("JPG, PNG or WebP");
  });

  it("reads sizes and spans naturally", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(formatBytes(3 * 1024 ** 3)).toBe("3 GB");
    expect(formatSpan(1)).toBe("1 second");
    expect(formatSpan(45)).toBe("45 seconds");
    expect(formatSpan(120)).toBe("2 minutes");
  });
});

describe("clipboard files", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("names pasted pixels", () => {
    expect(pastedName("image/png")).toBe("Pasted image.png");
    expect(pastedName("image/jpeg", 1)).toBe("Pasted image 2.jpg");
    expect(pastedName("image/svg+xml")).toBe("Pasted image.svg");
  });

  it("renames the browser's generic image.png, and keeps real names", () => {
    const event = pasteEvent([
      new File(["a"], "image.png", { type: "image/png" }),
      new File(["b"], "holiday.jpg", { type: "image/jpeg" }),
    ]);
    expect(filesFromPaste(event).map((f) => f.name)).toEqual(["Pasted image.png", "holiday.jpg"]);
  });

  it("reads images from the async clipboard, skipping text", async () => {
    const png = new Blob(["p"], { type: "image/png" });
    const read = vi.fn(async () => [
      { types: ["text/plain"], getType: async () => new Blob(["hi"]) },
      { types: ["text/html", "image/png"], getType: async () => png },
    ]);
    Object.defineProperty(navigator, "clipboard", { value: { read }, configurable: true });
    const files = await readClipboardFiles();
    expect(files.map((f) => [f.name, f.type])).toEqual([["Pasted image.png", "image/png"]]);
  });

  it("refuses when there's no Clipboard API", async () => {
    await expect(readClipboardFiles()).rejects.toThrow("isn't available");
  });
});
