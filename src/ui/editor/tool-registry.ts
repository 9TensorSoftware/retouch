import type { BuiltinEditorTool, ImageEdits, MediaEntry, VideoEdits } from "../../types";
import {
  ICON_TOOL_ADJUST,
  ICON_TOOL_CROP,
  ICON_TOOL_CURVES,
  ICON_TOOL_FALLBACK,
  ICON_TOOL_FILTERS,
  ICON_TOOL_HSL,
  ICON_TOOL_LIQUIFY,
  ICON_TOOL_MASKS,
  ICON_TOOL_STYLIZE,
  ICON_TOOL_TRANSFORM,
  ICON_TOOL_TRIM,
} from "../icons";

/** What a custom tool gets to work with. Mutate `edits`, then render + record. */
export interface ToolContext {
  kind: "image" | "video";
  /** The entry being edited — source media, file, and edit state. */
  entry: MediaEntry;
  /** The live, shared edit state (a `VideoEdits` when `kind` is "video"). */
  edits: ImageEdits | VideoEdits;
  /** Push the current edits to the canvas and every tool UI. */
  render(): void;
  /** Record an undoable history step (call after a user-driven change). */
  record(): void;
  /** The element hosting the canvas, for overlays. */
  canvasArea: HTMLElement;
}

/** The dock pane a custom tool mounts into the editor. */
export interface ToolPaneHandle {
  root: HTMLElement;
  /** Called after undo/redo/reset/AI changed the edits — refresh your UI. */
  sync?(): void;
  onActivate?(): void;
  onDeactivate?(): void;
  destroy?(): void;
}

/**
 * A pluggable editor feature group: a tab in the toolbar plus a contextual
 * pane in the dock. Custom tools drive the same non-destructive edit model
 * the built-ins use, so their changes preview, undo, and export for free.
 */
export interface EditorToolPlugin {
  /** Unique id; also usable in the `tools` option. */
  id: string;
  label: string;
  /** Inline SVG for the tab. */
  icon: string;
  /** Media kinds the tool applies to. Defaults to both. */
  kinds?: Array<"image" | "video">;
  mount(ctx: ToolContext): ToolPaneHandle;
}

export interface ToolDef {
  id: string;
  label: string;
  icon: string;
}

export const BUILTIN_TOOL_DEFS: Record<BuiltinEditorTool, ToolDef> = {
  trim: { id: "trim", label: "Trim", icon: ICON_TOOL_TRIM },
  crop: { id: "crop", label: "Crop", icon: ICON_TOOL_CROP },
  transform: { id: "transform", label: "Transform", icon: ICON_TOOL_TRANSFORM },
  liquify: { id: "liquify", label: "Liquify", icon: ICON_TOOL_LIQUIFY },
  curves: { id: "curves", label: "Curves", icon: ICON_TOOL_CURVES },
  hsl: { id: "hsl", label: "Color mix", icon: ICON_TOOL_HSL },
  masks: { id: "masks", label: "Masks", icon: ICON_TOOL_MASKS },
  stylize: { id: "stylize", label: "Stylize", icon: ICON_TOOL_STYLIZE },
  adjust: { id: "adjust", label: "Adjust", icon: ICON_TOOL_ADJUST },
  filters: { id: "filters", label: "Filters", icon: ICON_TOOL_FILTERS },
};

const FALLBACK_ICON = ICON_TOOL_FALLBACK;

const customTools: EditorToolPlugin[] = [];

/** Register a custom editor feature group. Call before instantiating Retouch. */
export function registerEditorTool(plugin: EditorToolPlugin): void {
  if (plugin.id in BUILTIN_TOOL_DEFS || customTools.some((t) => t.id === plugin.id)) {
    throw new Error(`[Retouch] A tool with id "${plugin.id}" is already registered`);
  }
  customTools.push(plugin);
}

export function getCustomTools(): readonly EditorToolPlugin[] {
  return customTools;
}

/** Tab metadata for any tool id — built-in or registered. */
export function resolveToolDef(id: string): ToolDef {
  if (id in BUILTIN_TOOL_DEFS) return BUILTIN_TOOL_DEFS[id as BuiltinEditorTool];
  const custom = customTools.find((t) => t.id === id);
  if (custom) return { id: custom.id, label: custom.label, icon: custom.icon };
  return { id, label: id, icon: FALLBACK_ICON };
}
