import type { ViewHandle } from "../types";
import { h } from "./h";

export interface DropZoneOptions {
  onFiles: (files: File[]) => void;
}

export function createDropZone(options: DropZoneOptions): ViewHandle {
  const input = h("input", {
    type: "file",
    accept: "image/*",
    multiple: true,
    style: "display:none",
  }) as HTMLInputElement;

  const zone = h(
    "div",
    { class: "rt-dropzone" },
    h("div", { class: "rt-dropzone__icon" }, createUploadIcon()),
    h("div", { class: "rt-dropzone__text" }, "Drop images here or ", h("strong", null, "browse")),
    h("div", { class: "rt-dropzone__hint" }, "PNG, JPG, WebP"),
    input,
  );

  const root = h("div", { class: "rt-dropzone-wrapper" }, zone);

  const abort = new AbortController();
  const signal = abort.signal;

  // Click to browse
  zone.addEventListener("click", () => input.click(), { signal });

  // File input change
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

  // Drag & drop
  let dragCounter = 0;

  zone.addEventListener(
    "dragenter",
    (e) => {
      e.preventDefault();
      dragCounter++;
      zone.classList.add("rt-dropzone--active");
    },
    { signal },
  );

  zone.addEventListener(
    "dragover",
    (e) => {
      e.preventDefault();
    },
    { signal },
  );

  zone.addEventListener(
    "dragleave",
    (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        zone.classList.remove("rt-dropzone--active");
      }
    },
    { signal },
  );

  zone.addEventListener(
    "drop",
    (e) => {
      e.preventDefault();
      dragCounter = 0;
      zone.classList.remove("rt-dropzone--active");
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

function createUploadIcon(): SVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");

  const p1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p1.setAttribute("d", "M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242");

  const p2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p2.setAttribute("d", "M12 12v9m0-9l-3 3m3-3 3 3");

  svg.appendChild(p1);
  svg.appendChild(p2);
  return svg;
}
