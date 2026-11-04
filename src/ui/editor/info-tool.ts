import type { MediaEntry, MetadataEdits, MetadataKey } from "../../types";
import {
  describeMetadata,
  type FileFacts,
  fieldLabel,
  type InfoSection,
  type PhotoMetadata,
  readMetadata,
  SOURCE_LABELS,
} from "../../utils/metadata";
import {
  applyMetadataEdits,
  fieldKey,
  metadataEdited,
  metadataHint,
  metadataTakesLines,
  parseFileName,
  parseMetadataValue,
} from "../../utils/metadata-edit";
import { formatDuration } from "../../utils/video";
import { h } from "../h";
import { createSection } from "./controls";
import type { ToolPaneHandle } from "./tool-registry";
import { createToolUi } from "./tool-ui";

/** Past this many characters, a read-only value folds. */
const LONG_VALUE = 280;

const withoutName = (edits: MetadataEdits | undefined): MetadataEdits => {
  const { fileName: _name, ...rest } = edits ?? {};
  return rest;
};

/**
 * The Info tool: what the file says about the photo. The file itself,
 * camera and exposure, where it was taken, its caption and rights, how it
 * was generated, and its color — then every field, raw. Read once, the
 * first time the tool opens. What can be changed, changes where it stands:
 * the edits are undoable, and exports carry them.
 */
export function createInfoTool(
  entry: MediaEntry,
  signal: AbortSignal,
  onChange: () => void = () => {},
): ToolPaneHandle {
  const ui = createToolUi(signal);
  const body = h("div", { class: "rt-info" });
  const note = ui.note("");
  const copy = ui.button({ label: "Copy all", onClick: () => void copyAll() });
  copy.root.hidden = true;
  const root = h("div", { class: "rt-info-pane" }, body, note.root, ui.row(copy.root));
  let loaded = false;
  let text = "";
  /** What the file says, before any edits. */
  let original: PhotoMetadata | null = null;
  /** Each editable field's text as the file has it, to tell a real change. */
  let baseline = new Map<MetadataKey, string>();
  let sectionsOpen = new Map<string, HTMLDetailsElement>();
  let pending = 0;

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

  /** Videos carry nothing else to write it into; a name is a name. */
  const canEdit = (key: MetadataKey): boolean => entry.kind === "image" || key === "fileName";

  const edited = (key: MetadataKey): boolean =>
    !!entry.edits.metadata && key in entry.edits.metadata;

  function commit(key: MetadataKey, value: string): void {
    const edits = entry.edits.metadata ?? {};
    entry.edits.metadata = edits;
    const had = edits[key];
    const base = baseline.get(key) ?? "";
    const same = value === (key === "fileName" ? base : parseMetadataValue(key, base));
    if (same) delete edits[key];
    else edits[key] = value;
    if (edits[key] === had) return;
    onChange();
    // After focus has moved on, so the next field keeps it through the redraw.
    clearTimeout(pending);
    pending = window.setTimeout(() => {
      if (!signal.aborted && original) render(original);
    }, 0);
  }

  /** A value you can change where it stands: Enter finishes it, Esc puts it back. */
  function field(slot: string, key: MetadataKey, shown: string, input: string, label: string) {
    const area = h("textarea", {
      class: "rt-info__input",
      rows: 1,
      placeholder: "Add",
      spellcheck: "false",
      "aria-label": label,
      "data-slot": slot,
    });
    const cell = h("dd", { class: "rt-info__field" }, area);
    const hint = h("span", { class: "rt-info__hint" });
    const show = (value: string): void => {
      area.value = value;
      cell.dataset.value = value;
    };
    const invalid = (message: string | null): void => {
      if (message) {
        area.setAttribute("aria-invalid", "true");
        hint.textContent = message;
        cell.append(hint);
      } else {
        area.removeAttribute("aria-invalid");
        hint.remove();
      }
    };
    show(shown);
    area.addEventListener("focus", () => show(input), { signal });
    area.addEventListener(
      "input",
      () => {
        cell.dataset.value = area.value;
        invalid(null);
      },
      { signal },
    );
    area.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && !(metadataTakesLines(key) && e.shiftKey)) {
          e.preventDefault();
          e.stopPropagation();
          area.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          area.value = input;
          invalid(null);
          area.blur();
        }
      },
      { signal },
    );
    area.addEventListener(
      "blur",
      () => {
        if (area.value === input) {
          invalid(null);
          show(shown);
          return;
        }
        const value =
          key === "fileName"
            ? parseFileName(area.value, baseline.get("fileName") ?? entry.file.name)
            : parseMetadataValue(key, area.value);
        if (value === null) {
          invalid(key === "fileName" ? "A file needs a name." : metadataHint(key));
          return;
        }
        invalid(null);
        commit(key, value);
      },
      { signal },
    );
    return cell;
  }

  /** A value to read. One too long for the panel folds, with a way to unfold it. */
  function plain(value: string): HTMLElement {
    const cell = h("dd", {}, value);
    if (value.length <= LONG_VALUE) return cell;
    cell.classList.add("rt-info__long");
    const more = h("button", { type: "button", class: "rt-info__more" }, "Show all");
    more.addEventListener(
      "click",
      () => {
        const long = cell.classList.toggle("rt-info__long");
        more.textContent = long ? "Show all" : "Show less";
      },
      { signal },
    );
    return h("dd", { class: "rt-info__fold" }, cell, more);
  }

  function rows(section: InfoSection): HTMLElement {
    const list = h("dl", { class: "rt-info__rows" });
    for (const row of section.rows) {
      const key = row.key && canEdit(row.key) ? row.key : null;
      const dt = h("dt", {}, row.label);
      if (key && edited(key)) dt.classList.add("rt-info__edited");
      list.append(
        dt,
        key
          ? field(`row:${key}`, key, row.value, row.input ?? row.value, row.label)
          : plain(row.value),
      );
    }
    return list;
  }

  /** Every section's open state and the focused field survive a redraw. */
  function render(meta: PhotoMetadata): void {
    const active = document.activeElement;
    const focused =
      active instanceof HTMLTextAreaElement && body.contains(active)
        ? {
            slot: active.dataset.slot ?? "",
            start: active.selectionStart,
            end: active.selectionEnd,
          }
        : null;
    const wasOpen = new Map([...sectionsOpen].map(([title, el]) => [title, el.open]));
    sectionsOpen = new Map();
    const place = (title: string, section: { root: HTMLElement }): void => {
      if (section.root instanceof HTMLDetailsElement) {
        const open = wasOpen.get(title);
        if (open !== undefined) section.root.open = open;
        sectionsOpen.set(title, section.root);
      }
      body.append(section.root);
    };

    const applied = applyMetadataEdits(meta, entry.edits.metadata);
    const name = entry.edits.metadata?.fileName;
    const sections = describeMetadata(
      applied,
      name ? { ...facts(), name } : facts(),
      entry.kind === "image" ? { edits: entry.edits.metadata ?? {} } : {},
    );
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
      if (section.title === "Location" && applied.gps) {
        const { latitude: lat, longitude: lon } = applied.gps;
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
      place(section.title, s);
    }

    if (applied.fields.length) {
      const all = h("div", { class: "rt-info__all" });
      let source = "";
      const list = h("dl", { class: "rt-info__rows rt-info__rows--raw" });
      // One heading per source, in a fixed order (a JPEG's segments interleave them).
      const order = Object.keys(SOURCE_LABELS);
      const grouped = [...applied.fields].sort(
        (a, b) => order.indexOf(a.source) - order.indexOf(b.source),
      );
      grouped.forEach((f, i) => {
        if (f.source !== source) {
          source = f.source;
          list.append(h("div", { class: "rt-info__source" }, SOURCE_LABELS[f.source]));
        }
        const key = entry.kind === "image" ? fieldKey(f.name) : undefined;
        const label = fieldLabel(f.name);
        list.append(
          h("dt", { title: f.name }, label),
          key ? field(`raw:${i}:${f.name}`, key, f.value, f.value, label) : plain(f.value),
        );
      });
      all.append(list);
      place(
        "All fields",
        createSection(
          { title: `All fields · ${applied.fields.length}`, collapsible: true, open: false },
          all,
        ),
      );
    }

    // Exports are drawn from pixels, so only what's changed here leaves with them.
    if (entry.kind !== "image") {
      note.set("");
    } else if (metadataEdited(withoutName(entry.edits.metadata))) {
      note.set(
        `Exported copies carry what you changed, and only that${meta.gps ? ": the file's location stays out unless you edited it" : ""}.`,
      );
    } else if (meta.fields.length) {
      note.set(
        `Exported copies leave this metadata out${meta.gps ? " — the location included" : ""}. Whatever you change here goes with them.`,
      );
    } else {
      note.set(
        "The file carries no camera or description metadata. Whatever you add here goes with exported copies.",
      );
    }

    text = sections
      .map((s) =>
        [s.title, ...s.rows.filter((r) => r.value).map((r) => `${r.label}: ${r.value}`)].join("\n"),
      )
      .concat(
        applied.fields.length
          ? ["All fields", ...applied.fields.map((f) => `${f.name}: ${f.value}`)].join("\n")
          : [],
      )
      .join("\n\n");
    copy.root.hidden = false;

    if (focused) {
      const next = [...body.querySelectorAll("textarea")].find(
        (area) => area.dataset.slot === focused.slot,
      );
      next?.focus({ preventScroll: true });
      next?.setSelectionRange(focused.start, focused.end);
    }
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
    original = meta;
    baseline = new Map();
    for (const section of describeMetadata(meta, facts(), { edits: {} })) {
      for (const row of section.rows) {
        if (row.key) baseline.set(row.key, row.input ?? row.value);
      }
    }
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
    // Undo, redo or a reset changed what's on the row.
    sync: () => {
      if (original) render(original);
    },
  };
}
