import type { EditorTool } from "../../types";
import type { RailLayout } from "./toolbar";

const KEY = "rt-rail";

/**
 * The rail layout this browser's user chose (pins, names), or nothing yet.
 * Storage can be missing or blocked; the rail then starts from defaults.
 */
export function loadRailLayout(): Partial<RailLayout> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const out: Partial<RailLayout> = {};
    if (Array.isArray(raw.pinned)) {
      out.pinned = raw.pinned.filter((id): id is EditorTool => typeof id === "string");
    }
    if (typeof raw.expanded === "boolean") out.expanded = raw.expanded;
    return out;
  } catch {
    return {};
  }
}

export function saveRailLayout(layout: Partial<RailLayout>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Storage unavailable: the layout lasts for this session only.
  }
}
