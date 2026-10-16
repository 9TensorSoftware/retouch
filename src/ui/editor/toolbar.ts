import type { EditorTool, ViewHandle } from "../../types";
import { h } from "../h";
import { ICON_SPARKLE } from "../icons";
import type { ToolDef, ToolGroup } from "./tool-registry";
import { resolveToolDef, TOOL_GROUP_ORDER } from "./tool-registry";

export interface ToolbarOptions {
  /** Tool ids to show (built-in or registered); kept in this order within each rail group. */
  tools: EditorTool[];
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
}

export interface ToolbarHandle extends ViewHandle {
  /** Tools in rail order, AI-menu tools last: what the 1–9 keys select. */
  readonly order: readonly EditorTool[];
  setActiveTool(tool: EditorTool): void;
  /** Show/hide the accent dot marking a feature group with active edits. */
  setTouched(tool: EditorTool, touched: boolean): void;
  /** The tool bound to a single-key shortcut, if any. */
  toolForKey(key: string): EditorTool | undefined;
  /** Open the AI tools menu; false when the rail has none. */
  openAiMenu(): boolean;
}

/**
 * The tool rail: groups of icon buttons (frame, tone, looks, plugins), with
 * the AI tools gathered behind one launcher when there are several. Labels
 * and shortcuts show in a tooltip, positioned fixed so the scrolling rail
 * never clips it.
 */
export function createToolbar(options: ToolbarOptions): ToolbarHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let active = options.activeTool;

  /** The element that represents each tool: a rail button or an AI menu item. */
  const buttons = new Map<EditorTool, HTMLElement>();
  const shortcuts = new Map<string, EditorTool>();
  const railOrder: EditorTool[] = [];
  const menuOrder: EditorTool[] = [];
  const menuTools = new Set<EditorTool>();

  const root = h("div", { class: "rt-toolbar", role: "group", "aria-label": "Tools" });

  // ── Tooltip ──

  const tip = h("div", { class: "rt-tooltip", role: "tooltip" });
  tip.hidden = true;

  function isHorizontal(): boolean {
    const r = root.getBoundingClientRect();
    return r.width > r.height;
  }

  function showTip(anchor: HTMLElement, label: string, key?: string): void {
    tip.textContent = label;
    if (key) tip.appendChild(h("kbd", null, key.toUpperCase()));
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    if (isHorizontal()) {
      tip.style.left = `${r.left + r.width / 2}px`;
      tip.style.top = `${r.top - 8}px`;
      tip.dataset.side = "top";
    } else {
      tip.style.left = `${r.right + 10}px`;
      tip.style.top = `${r.top + r.height / 2}px`;
      tip.dataset.side = "right";
    }
  }

  function hideTip(): void {
    tip.hidden = true;
  }

  function withTooltip(btn: HTMLElement, label: string, key?: string): void {
    btn.addEventListener(
      "pointerenter",
      (e) => {
        if (e.pointerType === "mouse") showTip(btn, label, key);
      },
      { signal },
    );
    btn.addEventListener("pointerleave", hideTip, { signal });
    btn.addEventListener("pointerdown", hideTip, { signal });
    btn.addEventListener(
      "focus",
      () => {
        if (btn.matches(":focus-visible")) showTip(btn, label, key);
      },
      { signal },
    );
    btn.addEventListener("blur", hideTip, { signal });
  }

  function select(id: EditorTool): void {
    if (active === id) return;
    setActive(id);
    options.onToolChange(id);
  }

  function register(def: ToolDef, el: HTMLElement): void {
    buttons.set(def.id, el);
    if (def.shortcut && !shortcuts.has(def.shortcut)) {
      shortcuts.set(def.shortcut, def.id);
      el.setAttribute("aria-keyshortcuts", def.shortcut.toUpperCase());
    }
  }

  function railButton(def: ToolDef): HTMLElement {
    const btn = h("button", { type: "button", class: "rt-toolbar__btn", "aria-label": def.label });
    btn.innerHTML = def.icon;
    btn.appendChild(h("span", { class: "rt-toolbar__label" }, def.label));
    btn.addEventListener("click", () => select(def.id), { signal });
    withTooltip(btn, def.label, def.shortcut);
    register(def, btn);
    railOrder.push(def.id);
    return btn;
  }

  // ── AI tools menu ──

  let launcher: HTMLElement | null = null;
  let menu: HTMLElement | null = null;

  function menuItems(): HTMLElement[] {
    return menu ? [...menu.querySelectorAll<HTMLElement>(".rt-flyout__item")] : [];
  }

  function openMenu(): void {
    if (!menu || !launcher) return;
    hideTip();
    menu.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    const r = launcher.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    if (isHorizontal()) {
      menu.style.left = `${Math.max(8, Math.min(r.left, innerWidth - m.width - 8))}px`;
      menu.style.top = `${Math.max(8, r.top - m.height - 8)}px`;
    } else {
      menu.style.left = `${root.getBoundingClientRect().right + 8}px`;
      menu.style.top = `${Math.max(8, Math.min(r.top - 8, innerHeight - m.height - 8))}px`;
    }
    const current = menuItems().find((item) => item.dataset.tool === active);
    (current ?? menuItems()[0])?.focus();
  }

  function closeMenu(refocus = false): void {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    launcher?.setAttribute("aria-expanded", "false");
    if (refocus) launcher?.focus();
  }

  function aiLauncher(defs: ToolDef[]): HTMLElement {
    const btn = h("button", {
      type: "button",
      class: "rt-toolbar__btn rt-toolbar__btn--ai",
      "aria-label": "AI tools",
      "aria-haspopup": "menu",
      "aria-expanded": "false",
      "aria-keyshortcuts": "I",
    });
    btn.innerHTML = ICON_SPARKLE;
    btn.appendChild(h("span", { class: "rt-toolbar__label" }, "AI"));
    btn.addEventListener("click", () => (menu?.hidden ? openMenu() : closeMenu()), { signal });
    withTooltip(btn, "AI tools · on this device", "i");

    const list = h("div", { class: "rt-flyout", role: "menu", "aria-label": "AI tools" });
    list.hidden = true;
    for (const def of defs) {
      const item = h("button", { type: "button", class: "rt-flyout__item", role: "menuitem" });
      item.dataset.tool = def.id;
      const icon = h("span", { class: "rt-flyout__icon", "aria-hidden": "true" });
      icon.innerHTML = def.icon;
      const text = h(
        "span",
        { class: "rt-flyout__text" },
        h("span", { class: "rt-flyout__name" }, def.label),
      );
      if (def.description)
        text.appendChild(h("span", { class: "rt-flyout__desc" }, def.description));
      item.append(icon, text);
      if (def.badge) item.appendChild(h("span", { class: "rt-flyout__badge" }, def.badge));
      item.addEventListener(
        "click",
        () => {
          closeMenu();
          select(def.id);
        },
        { signal },
      );
      register(def, item);
      menuTools.add(def.id);
      menuOrder.push(def.id);
      list.appendChild(item);
    }
    list.addEventListener(
      "keydown",
      (e) => {
        const items = menuItems();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
        if (e.key in step) {
          e.preventDefault();
          items[(i + step[e.key] + items.length) % items.length]?.focus();
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          items[e.key === "Home" ? 0 : items.length - 1]?.focus();
        } else if (e.key === "Escape" || e.key === "Tab") {
          // Escape closes the menu, not the editor.
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
          }
          closeMenu(e.key === "Escape");
        }
      },
      { signal },
    );
    launcher = btn;
    menu = list;
    return btn;
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Node;
      if (menu && !menu.hidden && !menu.contains(target) && !launcher?.contains(target))
        closeMenu();
    },
    { signal },
  );

  // ── Rail ──

  const byGroup = new Map<ToolGroup, ToolDef[]>();
  for (const id of options.tools) {
    const def = resolveToolDef(id);
    const list = byGroup.get(def.group) ?? [];
    list.push(def);
    byGroup.set(def.group, list);
  }
  for (const group of TOOL_GROUP_ORDER) {
    const defs = byGroup.get(group);
    if (!defs?.length) continue;
    if (root.childElementCount > 0) root.appendChild(h("div", { class: "rt-toolbar__sep" }));
    if (group === "ai" && defs.length > 1) root.appendChild(aiLauncher(defs));
    else for (const def of defs) root.appendChild(railButton(def));
  }
  root.append(tip);
  if (menu) root.append(menu);

  function setActive(tool: EditorTool): void {
    const previous = buttons.get(active);
    previous?.classList.remove("rt-toolbar__btn--active", "rt-flyout__item--active");
    previous?.removeAttribute("aria-current");
    active = tool;
    const el = buttons.get(tool);
    el?.classList.add(menuTools.has(tool) ? "rt-flyout__item--active" : "rt-toolbar__btn--active");
    el?.setAttribute("aria-current", "true");
    launcher?.classList.toggle("rt-toolbar__btn--active", menuTools.has(tool));
  }
  setActive(active);

  return {
    root,
    order: [...railOrder, ...menuOrder],
    setActiveTool: setActive,
    setTouched(tool, touched) {
      buttons.get(tool)?.classList.toggle("rt-toolbar__btn--touched", touched);
    },
    toolForKey: (key) => shortcuts.get(key.toLowerCase()),
    openAiMenu() {
      if (!launcher) return false;
      openMenu();
      return true;
    },
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
