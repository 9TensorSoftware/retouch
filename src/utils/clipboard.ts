/** "Pasted image.png", then "Pasted image 2.png" and on. */
export function pastedName(type: string, index = 0): string {
  const subtype = (type.split("/")[1] ?? "png").replace(/\+.*$/, "");
  const ext = subtype === "jpeg" ? "jpg" : subtype;
  return `Pasted image${index > 0 ? ` ${index + 1}` : ""}.${ext}`;
}

/** Browsers hand pasted pixels over as "image.png"; give those a better name. */
function named(file: File, index: number): File {
  const generic = !file.name || /^image\.\w+$/.test(file.name);
  return generic ? new File([file], pastedName(file.type, index), { type: file.type }) : file;
}

/** The files in a paste event (⌘V or Ctrl+V). */
export function filesFromPaste(event: ClipboardEvent): File[] {
  return [...(event.clipboardData?.files ?? [])].map(named);
}

/**
 * The images on the clipboard, read through the async Clipboard API for a
 * Paste button. The browser asks first (a permission or a paste prompt);
 * this rejects when the API is missing or the person says no.
 */
export async function readClipboardFiles(): Promise<File[]> {
  if (!navigator.clipboard?.read) throw new Error("The Clipboard API isn't available");
  const files: File[] = [];
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((t) => t.startsWith("image/"));
    if (!type) continue;
    const blob = await item.getType(type);
    files.push(new File([blob], pastedName(type, files.length), { type }));
  }
  return files;
}
