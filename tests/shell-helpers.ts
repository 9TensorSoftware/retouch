/**
 * A drag event as the browser would send it. jsdom has no DragEvent or
 * DataTransfer, so a plain event carries a stand-in: the drag's types
 * ("Files" whenever it holds files) and its files.
 */
export function dragEvent(
  type: string,
  files: File[],
  types = files.length > 0 ? ["Files"] : [],
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types, files, dropEffect: "none" },
  });
  return event;
}

/** A paste event whose clipboard holds these files. */
export function pasteEvent(files: File[]): ClipboardEvent {
  const event = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: { files } });
  return event;
}

/** The text of every element matching a selector, in order. */
export function texts(root: ParentNode, selector: string): string[] {
  return [...root.querySelectorAll(selector)].map((el) => el.textContent ?? "");
}
