import type { BuiltinEditorTool, ImageEdits, MediaEntry, VideoEdits } from "../../types";

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
  trim: {
    id: "trim",
    label: "Trim",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8L21 19M8.5 16L21 5"/></svg>',
  },
  crop: {
    id: "crop",
    label: "Crop",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18"/></svg>',
  },
  transform: {
    id: "transform",
    label: "Transform",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9V5a2 2 0 012-2h4M21 15v4a2 2 0 01-2 2h-4M3 15v4a2 2 0 002 2h4M21 9V5a2 2 0 00-2-2h-4"/><path d="M9 15l6-6"/></svg>',
  },
  liquify: {
    id: "liquify",
    label: "Liquify",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21M3 21c3-1 4.5-3 5-6"/></svg>',
  },
  curves: {
    id: "curves",
    label: "Curves",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 21C10 21 14 3 21 3"/><circle cx="8.2" cy="14.8" r="1.6" fill="currentColor" stroke="none"/><circle cx="15.8" cy="6.4" r="1.6" fill="currentColor" stroke="none"/></svg>',
  },
  hsl: {
    id: "hsl",
    label: "Color mix",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 010 18M12 3a9 9 0 00-4.5 16.8M12 12l6.4-6.4M12 12l-8.5 3"/></svg>',
  },
  masks: {
    id: "masks",
    label: "Masks",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18z" fill="currentColor" stroke="none" opacity="0.55"/></svg>',
  },
  stylize: {
    id: "stylize",
    label: "Stylize",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 4V2M15 10V8M11 6h2M19 6h2M17.5 7.5L21 11l-9.5 9.5a1.77 1.77 0 01-2.5-2.5L18.5 8.5z"/></svg>',
  },
  adjust: {
    id: "adjust",
    label: "Adjust",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
  },
  filters: {
    id: "filters",
    label: "Filters",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/></svg>',
  },
};

const FALLBACK_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6"/></svg>';

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
