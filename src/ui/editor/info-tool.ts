import type { MediaEntry } from "../../types";
import {
  describeMetadata,
  type FileFacts,
  fieldLabel,
  type InfoSection,
  type PhotoMetadata,
  readMetadata,
  SOURCE_LABELS,
} from "../../utils/metadata";
import { formatDuration } from "../../utils/video";
import { h } from "../h";
import { createSection } from "./controls";
import type { ToolPaneHandle } from "./tool-registry";
import { createToolUi } from "./tool-ui";

/**
 * The Info tool: what the file says about the photo. The file itself,
 * camera and exposure, where it was taken, its caption and rights, how it
 * was generated, and its color — then every field, raw. Read once, the
 * first time the tool opens.
 */
export function createInfoTool(entry: MediaEntry, signal: AbortSignal): ToolPaneHandle {
  const ui = createToolUi(signal);
  const body = h("div", { class: "rt-info" });
  const note = ui.note("");
  const copy = ui.button({ label: "Copy all", onClick: () => void copyAll() });
  copy.root.hidden = true;
  const root = h("div", { class: "rt-info-pane" }, body, note.root, ui.row(copy.root));
  let loaded = false;
  let text = "";

  function facts(): FileFacts {
    return entry.kind === "image"
      ? {
          name: entry.file.name,
          type: entry.file.type,
          size: entry.file.size,
          lastModified: entry.file.lastModified,
          width: entry.image.naturalWidth,
          height: entry.image.naturalHeight,
        }
      : {
          name: entry.file.name,
          type: entry.file.type,
          size: entry.file.size,
          lastModified: entry.file.lastModified,
          width: entry.width,
          height: entry.height,
        };
  }

  function rows(section: InfoSection): HTMLElement {
    const list = h("dl", { class: "rt-info__rows" });
    for (const row of section.rows) {
      list.append(h("dt", {}, row.label), h("dd", {}, row.value));
    }
    return list;
  }

  function render(meta: PhotoMetadata): void {
    const sections = describeMetadata(meta, facts());
    if (entry.kind === "video") {
      sections[0]?.rows.push({ label: "Duration", value: formatDuration(entry.duration) });
    }
    if (meta.contentCredentials) {
      sections.push({
        title: "Provenance",
        rows: [{ label: "Content Credentials", value: "Present (C2PA)" }],
      });
    }
    body.replaceChildren();
    for (const section of sections) {
      const s = createSection({ title: section.title, collapsible: true }, rows(section));
      if (section.title === "Location" && meta.gps) {
        const { latitude: lat, longitude: lon } = meta.gps;
        const map = h(
          "a",
          {
            class: "rt-info__link",
            href: `https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lon.toFixed(6)}#map=15/${lat.toFixed(5)}/${lon.toFixed(5)}`,
            target: "_blank",
            rel: "noopener noreferrer",
          },
          "Show on a map ↗",
        );
        s.body.append(map);
      }
      body.append(s.root);
    }

    if (meta.fields.length) {
      const all = h("div", { class: "rt-info__all" });
      let source = "";
      const list = h("dl", { class: "rt-info__rows rt-info__rows--raw" });
      // One heading per source, in a fixed order (a JPEG's segments interleave them).
      const order = Object.keys(SOURCE_LABELS);
      const grouped = [...meta.fields].sort(
        (a, b) => order.indexOf(a.source) - order.indexOf(b.source),
      );
      for (const field of grouped) {
        if (field.source !== source) {
          source = field.source;
          list.append(h("div", { class: "rt-info__source" }, SOURCE_LABELS[field.source]));
        }
        list.append(
          h("dt", { title: field.name }, fieldLabel(field.name)),
          h("dd", {}, field.value),
        );
      }
      all.append(list);
      body.append(
        createSection(
          { title: `All fields · ${meta.fields.length}`, collapsible: true, open: false },
          all,
        ).root,
      );
    }

    // Exports are drawn from pixels, so nothing here leaves with them.
    const where = meta.gps ? " — the location included" : "";
    note.set(
      meta.fields.length
        ? `Exported copies leave this metadata out${where}.`
        : "The file carries no camera or description metadata.",
    );

    text = sections
      .map((s) => [s.title, ...s.rows.map((r) => `${r.label}: ${r.value}`)].join("\n"))
      .concat(
        meta.fields.length
          ? ["All fields", ...meta.fields.map((f) => `${f.name}: ${f.value}`)].join("\n")
          : [],
      )
      .join("\n\n");
    copy.root.hidden = false;
  }

  async function load(): Promise<void> {
    if (loaded) return;
    loaded = true;
    note.set("Reading the file…");
    // A replaced or committed photo keeps its camera's metadata on the original.
    const source = entry.kind === "image" ? (entry.original?.file ?? entry.file) : null;
    const meta: PhotoMetadata = source
      ? await readMetadata(source)
      : { format: "unknown", fields: [], contentCredentials: false, thumbnail: false };
    if (signal.aborted) return;
    render(meta);
  }

  async function copyAll(): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copy.setLabel("Copied");
    } catch {
      copy.setLabel("Couldn't copy");
    }
    setTimeout(() => copy.setLabel("Copy all"), 1600);
  }

  return {
    root,
    onActivate: () => void load(),
  };
}
