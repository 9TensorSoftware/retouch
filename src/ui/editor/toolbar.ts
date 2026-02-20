import type { EditorTool, ViewHandle } from "../../types";
import { h } from "../h";

export interface ToolbarOptions {
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}

export interface ToolbarHandle extends ViewHandle {
  setActiveTool(tool: EditorTool): void;
}

const TOOLS: { id: EditorTool; label: string; icon: string }[] = [
  {
    id: "crop",
    label: "Crop",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18"/></svg>',
  },
  {
    id: "adjust",
    label: "Adjust",
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
  },
];

export function createToolbar(options: ToolbarOptions): ToolbarHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let active = options.activeTool;

  const buttons = new Map<EditorTool, HTMLElement>();

  const root = h("div", { class: "rt-toolbar" });

  for (const tool of TOOLS) {
    const btn = h("button", {
      class: `rt-toolbar__btn${tool.id === active ? " rt-toolbar__btn--active" : ""}`,
      title: tool.label,
    });
    btn.innerHTML = `${tool.icon}<span>${tool.label}</span>`;

    btn.addEventListener(
      "click",
      () => {
        if (active === tool.id) return;
        buttons.get(active)?.classList.remove("rt-toolbar__btn--active");
        btn.classList.add("rt-toolbar__btn--active");
        active = tool.id;
        options.onToolChange(tool.id);
      },
      { signal },
    );

    buttons.set(tool.id, btn);
    root.appendChild(btn);
  }

  return {
    root,
    setActiveTool(tool) {
      buttons.get(active)?.classList.remove("rt-toolbar__btn--active");
      buttons.get(tool)?.classList.add("rt-toolbar__btn--active");
      active = tool;
    },
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
