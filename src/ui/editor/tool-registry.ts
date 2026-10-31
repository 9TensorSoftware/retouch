import type { BuiltinEditorTool, ImageEdits, MediaEntry, VideoEdits } from "../../types";
import {
  ICON_TOOL_ADJUST,
  ICON_TOOL_CROP,
  ICON_TOOL_CURVES,
  ICON_TOOL_FALLBACK,
  ICON_TOOL_FILTERS,
  ICON_TOOL_HSL,
  ICON_TOOL_INFO,
  ICON_TOOL_LIQUIFY,
  ICON_TOOL_MASKS,
  ICON_TOOL_STYLIZE,
  ICON_TOOL_TRANSFORM,
  ICON_TOOL_TRIM,
} from "../icons";
import type { ToolUi } from "./tool-ui";

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
  /** Builders for pane controls that match the built-in tools. */
  ui: ToolUi;
  /**
   * A small picture of the photo with `edits` applied over the current ones,
   * as an image URL — for preview tiles (`ui.tiles`). It shows the tone,
   * color and effect edits: adjustments, filter, curves, color mix, stylize.
   */
  preview(edits?: PreviewEdits): string;
  /**
   * Wipe a new version of the photo in over the stage, with the photo's
   * current look — how a tool shows its result just before committing it
   * (replacing the pixels, or opening the new image). Resolves when the wipe
   * ends; call the function it resolves with to take the result back off if
   * you don't commit. Instant under reduced motion, and skipped while a
   * crop or warp means the result wouldn't line up.
   */
  reveal(result: HTMLCanvasElement | HTMLImageElement): Promise<() => void>;
}

/** The edits `ctx.preview()` can show. */
export type PreviewEdits = Partial<
  Pick<ImageEdits, "adjustments" | "filter" | "filterStrength" | "curves" | "hsl" | "stylize">
>;

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
 * Where a tool sits in the rail. Groups appear in this order, separated;
 * "ai" tools collapse into one launcher when there are two or more.
 */
export type ToolGroup = "frame" | "tone" | "looks" | "plugins" | "ai" | "about";

export const TOOL_GROUP_ORDER: readonly ToolGroup[] = [
  "frame",
  "tone",
  "looks",
  "plugins",
  "ai",
  "about",
];

/**
 * A pluggable editor feature group: a tab in the rail plus a pane in the
 * inspector. Custom tools drive the same non-destructive edit model the
 * built-ins use, so their changes preview, undo, and export for free.
 */
export interface EditorToolPlugin {
  /** Unique id; also usable in the `tools` option. */
  id: string;
  label: string;
  /** Inline SVG for the tab. */
  icon: string;
  /** Media kinds the tool applies to. Defaults to both. */
  kinds?: Array<"image" | "video">;
  /** Rail group. Defaults to "plugins". */
  group?: ToolGroup;
  /**
   * Single-key shortcut: a letter not taken by a built-in tool or the editor
   * (I opens the AI menu). A taken key is ignored, so the tool has none.
   */
  shortcut?: string;
  /** One line on what the tool does, shown in the AI tools menu. */
  description?: string;
  /** A short tag shown beside it in that menu, e.g. a model's download size. */
  badge?: string;
  mount(ctx: ToolContext): ToolPaneHandle;
}

export interface ToolDef {
  id: string;
  label: string;
  icon: string;
  group: ToolGroup;
  shortcut?: string;
  description?: string;
  badge?: string;
}

export const BUILTIN_TOOL_DEFS: Record<BuiltinEditorTool, ToolDef> = {
  trim: { id: "trim", label: "Trim", icon: ICON_TOOL_TRIM, group: "frame", shortcut: "r" },
  crop: { id: "crop", label: "Crop", icon: ICON_TOOL_CROP, group: "frame", shortcut: "c" },
  transform: {
    id: "transform",
    label: "Transform",
    icon: ICON_TOOL_TRANSFORM,
    group: "frame",
    shortcut: "t",
  },
  liquify: {
    id: "liquify",
    label: "Liquify",
    icon: ICON_TOOL_LIQUIFY,
    group: "frame",
    shortcut: "l",
  },
  curves: { id: "curves", label: "Curves", icon: ICON_TOOL_CURVES, group: "tone", shortcut: "v" },
  hsl: { id: "hsl", label: "Color mix", icon: ICON_TOOL_HSL, group: "tone", shortcut: "h" },
  masks: { id: "masks", label: "Masks", icon: ICON_TOOL_MASKS, group: "tone", shortcut: "m" },
  stylize: {
    id: "stylize",
    label: "Stylize",
    icon: ICON_TOOL_STYLIZE,
    group: "looks",
    shortcut: "s",
  },
  adjust: { id: "adjust", label: "Adjust", icon: ICON_TOOL_ADJUST, group: "tone", shortcut: "a" },
  filters: {
    id: "filters",
    label: "Filters",
    icon: ICON_TOOL_FILTERS,
    group: "looks",
    shortcut: "f",
  },
  info: {
    id: "info",
    label: "Info",
    icon: ICON_TOOL_INFO,
    group: "about",
    description: "What the file says about the photo",
  },
};

/**
 * Keys the editor itself uses (AI menu, zoom, Space-pan, compare, brush
 * size); plugin shortcuts can't take them.
 */
const RESERVED_KEYS = new Set(["i", " ", "+", "-", "_", "=", "\\", "[", "]"]);

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
  if (custom) {
    return {
      id: custom.id,
      label: custom.label,
      icon: custom.icon,
      group: custom.group ?? "plugins",
      shortcut: pluginShortcut(custom.shortcut),
      description: custom.description,
      badge: custom.badge,
    };
  }
  return { id, label: id, icon: FALLBACK_ICON, group: "plugins" };
}

/** A plugin's shortcut, unless it collides with the editor's or a built-in tool's key. */
function pluginShortcut(key: string | undefined): string | undefined {
  const k = key?.toLowerCase();
  // Digits pick tools by rail position (0 fits the view).
  if (!k || k.length !== 1 || RESERVED_KEYS.has(k) || /\d/.test(k)) return undefined;
  const builtins = Object.values(BUILTIN_TOOL_DEFS);
  return builtins.some((d) => d.shortcut === k) ? undefined : k;
}
