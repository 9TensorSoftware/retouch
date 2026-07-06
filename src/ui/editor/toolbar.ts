import type { EditorTool, ViewHandle } from "../../types";
import { h } from "../h";
import { resolveToolDef } from "./tool-registry";

export interface ToolbarOptions {
  /** Tool ids to show, in order (built-in or registered). */
  tools: EditorTool[];
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}

export interface ToolbarHandle extends ViewHandle {
  setActiveTool(tool: EditorTool): void;
}

export function createToolbar(options: ToolbarOptions): ToolbarHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let active = options.activeTool;

  const buttons = new Map<EditorTool, HTMLElement>();

  const root = h("div", { class: "rt-toolbar" });

  for (const id of options.tools) {
    const tool = resolveToolDef(id);
    const btn = h("button", {
      class: `rt-toolbar__btn${id === active ? " rt-toolbar__btn--active" : ""}`,
      title: tool.label,
    });
    btn.innerHTML = `${tool.icon}<span>${tool.label}</span>`;

    btn.addEventListener(
      "click",
      () => {
        if (active === id) return;
        buttons.get(active)?.classList.remove("rt-toolbar__btn--active");
        btn.classList.add("rt-toolbar__btn--active");
        active = id;
        options.onToolChange(id);
      },
      { signal },
    );

    buttons.set(id, btn);
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
