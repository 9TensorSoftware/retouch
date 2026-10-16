import type { ViewHandle } from "../types";
import { h } from "./h";
import { ICON_FOLDER, ICON_PASTE, iconElement } from "./icons";
import { shortcutLabel } from "./platform";

export interface DropZoneOptions {
  onFiles: (files: File[]) => void;
  /** The Paste button: read the clipboard and add what's on it. */
  onPaste: () => void;
  /** Comma-joined MIME list for the file input. */
  accept: string;
  /** The invitation, e.g. "Drop photos and videos". */
  title: string;
  /** Format names for the line under it, e.g. ["JPG", "PNG", "MP4"]. */
  formats: string[];
}

/** True when a drag carries files (not text, or an image from this page). */
export function dragHasFiles(e: DragEvent): boolean {
  return [...(e.dataTransfer?.types ?? [])].includes("Files");
}

/**
 * The empty state: a small stack of prints that fans out when something is
 * dragged over (or the pointer comes near), the formats that work, and two
 * ways in besides dropping — Choose files and Paste. Clicking anywhere else
 * on the table opens the file picker too.
 */
export function createDropZone(options: DropZoneOptions): ViewHandle {
  const abort = new AbortController();
  const signal = abort.signal;

  const input = h("input", {
    type: "file",
    accept: options.accept,
    multiple: true,
    hidden: true,
    tabindex: -1,
  });

  const title = h("div", { class: "rt-dropzone__title" }, options.title);
  const choose = h(
    "button",
    { type: "button", class: "rt-dropzone__choose" },
    iconElement(ICON_FOLDER),
    "Choose files",
  );
  const paste = h(
    "button",
    { type: "button", class: "rt-dropzone__paste" },
    iconElement(ICON_PASTE),
    "Paste",
    h("kbd", null, shortcutLabel("V")),
  );

  const zone = h(
    "div",
    { class: "rt-dropzone" },
    h(
      "div",
      { class: "rt-dropzone__stack", "aria-hidden": "true" },
      h("span", { class: "rt-dropzone__print rt-dropzone__print--1" }),
      h("span", { class: "rt-dropzone__print rt-dropzone__print--2" }),
      h("span", { class: "rt-dropzone__print rt-dropzone__print--3" }),
    ),
    title,
    h("div", { class: "rt-dropzone__formats" }, options.formats.join(" · ")),
    h("div", { class: "rt-dropzone__actions" }, choose, paste),
  );

  const root = h("div", { class: "rt-dropzone-wrapper" }, zone, input);

  choose.addEventListener("click", () => input.click(), { signal });
  paste.addEventListener("click", () => options.onPaste(), { signal });
  // The table itself is a big, forgiving target for the pointer; keyboards
  // and screen readers get the two buttons.
  zone.addEventListener(
    "click",
    (e) => {
      if (!(e.target as Element).closest("button")) input.click();
    },
    { signal },
  );

  input.addEventListener(
    "change",
    () => {
      if (input.files && input.files.length > 0) {
        options.onFiles(Array.from(input.files));
        input.value = "";
      }
    },
    { signal },
  );

  // Drag and drop, anywhere on the card.
  let depth = 0;
  const setActive = (on: boolean): void => {
    zone.classList.toggle("rt-dropzone--active", on);
    title.textContent = on ? "Release to add" : options.title;
  };
  root.addEventListener(
    "dragenter",
    (e) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      depth++;
      setActive(true);
    },
    { signal },
  );
  root.addEventListener(
    "dragover",
    (e) => {
      if (!dragHasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    { signal },
  );
  root.addEventListener(
    "dragleave",
    () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    },
    { signal },
  );
  root.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      depth = 0;
      setActive(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        options.onFiles(Array.from(e.dataTransfer.files));
      }
    },
    { signal },
  );

  return {
    root,
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
