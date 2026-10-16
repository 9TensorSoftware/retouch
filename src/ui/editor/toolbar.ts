import type { EditorTool, ViewHandle } from "../../types";
import { h } from "../h";
import { ICON_PIN, ICON_RAIL_COLLAPSE, ICON_RAIL_EXPAND, ICON_SPARKLE } from "../icons";
import type { ToolDef, ToolGroup } from "./tool-registry";
import { resolveToolDef, TOOL_GROUP_ORDER } from "./tool-registry";

/** How the rail is laid out: what's on it, and whether names show. */
export interface RailLayout {
  /** AI tools that sit on the rail itself; the rest wait in the AI menu. */
  pinned: EditorTool[];
  /** Tool names shown beside the icons. */
  expanded: boolean;
}

export interface ToolbarOptions {
  /** Tool ids to show (built-in or registered); kept in this order within each rail group. */
  tools: EditorTool[];
  activeTool: EditorTool;
  onToolChange: (tool: EditorTool) => void;
  /** The active tool was picked again (on phones, that folds or opens its controls). */
  onToolReselect?: (tool: EditorTool) => void;
  /** The starting layout. Without `pinned`, the first three AI tools are pinned. */
  layout?: Partial<RailLayout>;
  /** The user pinned or unpinned a tool, or toggled names: remember it. */
  onLayoutChange?: (layout: RailLayout) => void;
}

export interface ToolbarHandle extends ViewHandle {
  /** Tools in rail order, menu-only AI tools last: what the 1–9 keys select. */
  readonly order: readonly EditorTool[];
  readonly layout: RailLayout;
  setActiveTool(tool: EditorTool): void;
  /** Show/hide the accent dot marking a feature group with active edits. */
  setTouched(tool: EditorTool, touched: boolean): void;
  /** The tool bound to a single-key shortcut, if any. */
  toolForKey(key: string): EditorTool | undefined;
  /** Open the AI tools menu; false when the rail has none. */
  openAiMenu(): boolean;
  /** Put an AI tool on the rail, or back in the AI menu. */
  setPinned(tool: EditorTool, pinned: boolean): void;
  /** Show or hide tool names beside the icons. */
  setExpanded(expanded: boolean): void;
}

/** AI tools on the rail before anyone chooses: the first few, by registration. */
export const DEFAULT_PINNED_AI = 3;

const GROUP_LABELS: Record<ToolGroup, string> = {
  frame: "Frame",
  tone: "Tone",
  looks: "Looks",
  plugins: "Plugins",
  ai: "AI · on this device",
};

/**
 * The tool rail: groups of icon buttons (frame, tone, looks, plugins, AI).
 * AI tools sit on the rail when pinned and otherwise wait behind the AI
 * menu, which lists them all with a pin each. The rail shows icons with
 * tooltips, or — expanded — names, group titles and keys.
 */
export function createToolbar(options: ToolbarOptions): ToolbarHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let active = options.activeTool;

  const defs = options.tools.map((id) => resolveToolDef(id));
  const aiDefs = defs.filter((d) => d.group === "ai");
  // A lone AI tool just sits on the rail; a menu needs at least two.
  const hasMenu = aiDefs.length > 1;
  const isAi = (id: EditorTool): boolean => aiDefs.some((d) => d.id === id);
  const pinned = new Set<EditorTool>(
    (options.layout?.pinned ?? aiDefs.slice(0, DEFAULT_PINNED_AI).map((d) => d.id)).filter(isAi),
  );
  let expanded = options.layout?.expanded ?? false;
  const touched = new Set<EditorTool>();

  const shortcuts = new Map<string, EditorTool>();
  for (const def of defs) {
    if (def.shortcut && !shortcuts.has(def.shortcut)) shortcuts.set(def.shortcut, def.id);
  }
  const keyOf = (def: ToolDef): string | undefined =>
    def.shortcut && shortcuts.get(def.shortcut) === def.id ? def.shortcut : undefined;

  const root = h("div", { class: "rt-toolbar", role: "group", "aria-label": "Tools" });
  // The tools scroll (and fade at an end with more) inside the panel; the
  // tooltip and the AI menu sit beside the scroller so its fade can't clip them.
  const scroller = h("div", { class: "rt-toolbar__scroll" });
  const groups = h("div", { class: "rt-toolbar__groups" });

  // ── Tooltip (compact rail only: expanded rows show their names) ──

  const tip = h("div", { class: "rt-tooltip", role: "tooltip" });
  tip.hidden = true;

  function isHorizontal(): boolean {
    const r = root.getBoundingClientRect();
    return r.width > r.height;
  }

  function showTip(anchor: HTMLElement, label: string, key?: string): void {
    if (expanded && !isHorizontal()) return;
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
    if (active === id) {
      options.onToolReselect?.(id);
      return;
    }
    setActive(id);
    options.onToolChange(id);
  }

  /**
   * Icon, then what shows when the rail is expanded: the name (with a line
   * on what it does, for AI tools) and the key.
   */
  function buttonContent(
    btn: HTMLElement,
    icon: string,
    label: string,
    key?: string,
    description?: string,
  ): void {
    btn.innerHTML = icon;
    const text = h(
      "span",
      { class: "rt-toolbar__text", "aria-hidden": "true" },
      h("span", { class: "rt-toolbar__label" }, label),
    );
    if (description) text.appendChild(h("span", { class: "rt-toolbar__desc" }, description));
    btn.appendChild(text);
    if (key) {
      btn.appendChild(
        h("kbd", { class: "rt-toolbar__key", "aria-hidden": "true" }, key.toUpperCase()),
      );
    }
  }

  // ── AI tools menu: every AI tool, each with a pin ──

  let menu: HTMLElement | null = null;
  let launcher: HTMLButtonElement | null = null;
  const menuRows = new Map<EditorTool, { item: HTMLButtonElement; pin: HTMLButtonElement }>();

  function menuItems(): HTMLButtonElement[] {
    return [...menuRows.values()].map((row) => row.item);
  }

  function openMenu(): void {
    if (!menu || !launcher) return;
    hideTip();
    menu.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    const r = launcher.getBoundingClientRect();
    // Layout size, not the rect: the menu's entrance animation scales it.
    const m = { width: menu.offsetWidth, height: menu.offsetHeight };
    const viewport = document.documentElement.clientWidth || innerWidth;
    if (isHorizontal()) {
      // Above the rail, inside the screen; on a phone that's its full width.
      const rail = root.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(r.left, viewport - m.width - 8))}px`;
      menu.style.top = `${Math.max(8, rail.top - m.height - 8)}px`;
    } else {
      menu.style.left = `${root.getBoundingClientRect().right + 8}px`;
      menu.style.top = `${Math.max(8, Math.min(r.top - 8, innerHeight - m.height - 8))}px`;
    }
    (menuRows.get(active)?.item ?? menuItems()[0])?.focus();
  }

  function closeMenu(refocus = false): void {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    launcher?.setAttribute("aria-expanded", "false");
    if (refocus) launcher?.focus();
  }

  function paintPins(): void {
    for (const [id, row] of menuRows) {
      const on = pinned.has(id);
      const name = resolveToolDef(id).label;
      row.pin.setAttribute("aria-pressed", String(on));
      row.pin.setAttribute(
        "aria-label",
        on ? `Take ${name} off the rail` : `Keep ${name} on the rail`,
      );
      row.pin.title = on ? "On the rail — click to take it off" : "Keep it on the rail";
    }
  }

  if (hasMenu) {
    const list = h("div", { class: "rt-flyout__list" });
    for (const def of aiDefs) {
      const item = h("button", { type: "button", class: "rt-flyout__item" });
      item.dataset.tool = def.id;
      const icon = h("span", { class: "rt-flyout__icon", "aria-hidden": "true" });
      icon.innerHTML = def.icon;
      const text = h(
        "span",
        { class: "rt-flyout__text" },
        h("span", { class: "rt-flyout__name" }, def.label),
      );
      if (def.description) {
        text.appendChild(h("span", { class: "rt-flyout__desc" }, def.description));
      }
      item.append(icon, text);
      if (def.badge) item.appendChild(h("span", { class: "rt-flyout__badge" }, def.badge));
      const key = keyOf(def);
      if (key) item.setAttribute("aria-keyshortcuts", key.toUpperCase());
      item.addEventListener(
        "click",
        () => {
          closeMenu();
          select(def.id);
        },
        { signal },
      );
      const pin = h("button", { type: "button", class: "rt-flyout__pin" });
      pin.innerHTML = ICON_PIN;
      pin.addEventListener("click", () => setPinned(def.id, !pinned.has(def.id)), { signal });
      menuRows.set(def.id, { item, pin });
      list.appendChild(h("div", { class: "rt-flyout__row" }, item, pin));
    }
    menu = h(
      "div",
      { class: "rt-flyout", role: "dialog", "aria-label": "AI tools" },
      h(
        "div",
        { class: "rt-flyout__head" },
        h("span", { class: "rt-flyout__title" }, "AI tools"),
        h("span", { class: "rt-flyout__subtitle" }, "Run on this device"),
      ),
      list,
      h("p", { class: "rt-flyout__foot" }, "Pin the ones you use to keep them on the rail."),
    );
    menu.hidden = true;
    paintPins();

    menu.addEventListener(
      "keydown",
      (e) => {
        const items = menuItems();
        const focused = document.activeElement as HTMLElement | null;
        const row = [...menuRows.values()].find((r) => r.item === focused || r.pin === focused);
        const i = row ? items.indexOf(row.item) : -1;
        const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
        if (e.key in step) {
          e.preventDefault();
          items[(i + step[e.key] + items.length) % items.length]?.focus();
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          items[e.key === "Home" ? 0 : items.length - 1]?.focus();
        } else if (e.key === "ArrowRight" && row && focused === row.item) {
          e.preventDefault();
          row.pin.focus();
        } else if (e.key === "ArrowLeft" && row && focused === row.pin) {
          e.preventDefault();
          row.item.focus();
        } else if (e.key === "Escape") {
          // Escape closes the menu, not the editor.
          e.preventDefault();
          e.stopPropagation();
          closeMenu(true);
        }
      },
      { signal },
    );
    // Tabbing (or clicking) away closes it.
    menu.addEventListener(
      "focusout",
      (e) => {
        const next = e.relatedTarget as Node | null;
        if (next && !menu?.contains(next) && next !== launcher) closeMenu();
      },
      { signal },
    );
  }

  document.addEventListener(
    "pointerdown",
    (e) => {
      const target = e.target as Node;
      if (menu && !menu.hidden && !menu.contains(target) && !launcher?.contains(target)) {
        closeMenu();
      }
    },
    { signal },
  );

  // ── The rail ──

  const railButtons = new Map<EditorTool, HTMLButtonElement>();
  let order: EditorTool[] = [];

  function railButton(def: ToolDef): HTMLButtonElement {
    const key = keyOf(def);
    const btn = h("button", { type: "button", class: "rt-toolbar__btn", "aria-label": def.label });
    buttonContent(btn, def.icon, def.label, key, def.group === "ai" ? def.description : undefined);
    if (def.group === "ai" && def.description)
      btn.setAttribute("aria-description", def.description);
    if (key) btn.setAttribute("aria-keyshortcuts", key.toUpperCase());
    if (def.group === "ai") {
      btn.classList.add("rt-toolbar__btn--ai-tool");
      btn.appendChild(h("span", { class: "rt-toolbar__spark", "aria-hidden": "true" }));
    }
    btn.addEventListener("click", () => select(def.id), { signal });
    withTooltip(btn, def.label, key);
    railButtons.set(def.id, btn);
    return btn;
  }

  function launcherButton(): HTMLButtonElement {
    const btn = h("button", {
      type: "button",
      class: "rt-toolbar__btn rt-toolbar__btn--ai",
      "aria-label": "All AI tools",
      "aria-haspopup": "dialog",
      "aria-expanded": "false",
      "aria-keyshortcuts": "I",
    });
    buttonContent(btn, ICON_SPARKLE, "All AI tools", "i");
    btn.addEventListener("click", () => (menu?.hidden ? openMenu() : closeMenu()), { signal });
    withTooltip(btn, "All AI tools · pin your favorites", "i");
    return btn;
  }

  function renderRail(): void {
    const hadFocus = root.contains(document.activeElement) ? document.activeElement : null;
    const focusedTool = [...railButtons].find(([, b]) => b === hadFocus)?.[0];
    groups.replaceChildren();
    railButtons.clear();
    launcher = null;
    const railOrder: EditorTool[] = [];
    for (const group of TOOL_GROUP_ORDER) {
      const list = defs.filter((d) => d.group === group);
      if (list.length === 0) continue;
      const onRail = group === "ai" && hasMenu ? list.filter((d) => pinned.has(d.id)) : list;
      const box = h(
        "div",
        {
          class: `rt-toolbar__group rt-toolbar__group--${group}`,
          role: "group",
          "aria-label": GROUP_LABELS[group],
        },
        h("span", { class: "rt-toolbar__group-label", "aria-hidden": "true" }, GROUP_LABELS[group]),
      );
      for (const def of onRail) {
        box.appendChild(railButton(def));
        railOrder.push(def.id);
      }
      if (group === "ai" && hasMenu) {
        launcher = launcherButton();
        box.appendChild(launcher);
      }
      if (groups.childElementCount > 0) groups.appendChild(h("div", { class: "rt-toolbar__sep" }));
      groups.appendChild(box);
    }
    order = [...railOrder, ...aiDefs.map((d) => d.id).filter((id) => !railOrder.includes(id))];
    setActive(active);
    for (const id of touched) railButtons.get(id)?.classList.add("rt-toolbar__btn--touched");
    // Keep keyboard focus on the tool it was on, if that's still on the rail.
    if (focusedTool) railButtons.get(focusedTool)?.focus();
  }

  // ── Names toggle, at the foot of the rail ──

  const toggle = h("button", { type: "button", class: "rt-toolbar__toggle" });
  function paintToggle(): void {
    root.classList.toggle("rt-toolbar--expanded", expanded);
    toggle.setAttribute("aria-pressed", String(expanded));
    const label = expanded ? "Hide tool names" : "Show tool names";
    toggle.setAttribute("aria-label", label);
    buttonContent(toggle, expanded ? ICON_RAIL_COLLAPSE : ICON_RAIL_EXPAND, label);
  }
  toggle.addEventListener("click", () => setExpanded(!expanded), { signal });
  withTooltip(toggle, "Show tool names");

  function setActive(tool: EditorTool): void {
    active = tool;
    for (const [id, btn] of railButtons) {
      btn.classList.toggle("rt-toolbar__btn--active", id === tool);
      if (id === tool) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    }
    const shown = railButtons.get(tool) ?? launcher;
    if (shown) reveal(shown);
    for (const [id, row] of menuRows) {
      row.item.classList.toggle("rt-flyout__item--active", id === tool);
      if (id === tool) row.item.setAttribute("aria-current", "true");
      else row.item.removeAttribute("aria-current");
    }
    launcher?.classList.toggle("rt-toolbar__btn--active", isAi(tool) && !railButtons.has(tool));
  }

  const layout = (): RailLayout => ({
    pinned: aiDefs.map((d) => d.id).filter((id) => pinned.has(id)),
    expanded,
  });

  function setPinned(tool: EditorTool, on: boolean): void {
    if (!hasMenu || !isAi(tool) || pinned.has(tool) === on) return;
    if (on) pinned.add(tool);
    else pinned.delete(tool);
    paintPins();
    renderRail();
    options.onLayoutChange?.(layout());
  }

  function setExpanded(on: boolean): void {
    if (on === expanded) return;
    expanded = on;
    hideTip();
    paintToggle();
    options.onLayoutChange?.(layout());
  }

  /**
   * Scroll the rail just enough to show a tool (a phone's row of tools, or a
   * column taller than the screen). Done by hand: scrollIntoView could also
   * scroll the host page.
   */
  function reveal(btn: HTMLElement): void {
    const margin = 28;
    // The scroller is positioned, so offsets are in its (unscrolled) content box.
    if (isHorizontal()) {
      const left = btn.offsetLeft;
      if (left - margin < scroller.scrollLeft) scroller.scrollLeft = Math.max(0, left - margin);
      else if (left + btn.offsetWidth + margin > scroller.scrollLeft + scroller.clientWidth) {
        scroller.scrollLeft = left + btn.offsetWidth + margin - scroller.clientWidth;
      }
    } else {
      const top = btn.offsetTop;
      if (top - margin < scroller.scrollTop) scroller.scrollTop = Math.max(0, top - margin);
      else if (top + btn.offsetHeight + margin > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = top + btn.offsetHeight + margin - scroller.clientHeight;
      }
    }
  }

  scroller.append(groups, toggle);
  root.append(scroller, tip);
  if (menu) root.append(menu);
  paintToggle();
  renderRail();

  // When the rail is longer than the screen it scrolls; fade whichever end
  // has more, so tools never silently hide past the edge.
  function paintOverflow(): void {
    const horizontal = isHorizontal();
    const start = horizontal ? scroller.scrollLeft : scroller.scrollTop;
    const size = horizontal ? scroller.clientWidth : scroller.clientHeight;
    const total = horizontal ? scroller.scrollWidth : scroller.scrollHeight;
    root.classList.toggle("rt-toolbar--more-before", start > 1);
    root.classList.toggle("rt-toolbar--more-after", start + size < total - 1);
  }
  scroller.addEventListener("scroll", paintOverflow, { signal, passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      paintOverflow();
      const shown = railButtons.get(active) ?? launcher;
      if (shown) reveal(shown);
    });
    observer.observe(scroller);
    observer.observe(groups);
    signal.addEventListener("abort", () => observer.disconnect());
  }

  return {
    root,
    get order() {
      return order;
    },
    get layout() {
      return layout();
    },
    setActiveTool: setActive,
    setTouched(tool, on) {
      if (on) touched.add(tool);
      else touched.delete(tool);
      railButtons.get(tool)?.classList.toggle("rt-toolbar__btn--touched", on);
    },
    toolForKey: (key) => shortcuts.get(key.toLowerCase()),
    openAiMenu() {
      if (!launcher) return false;
      openMenu();
      return true;
    },
    setPinned,
    setExpanded,
    destroy() {
      abort.abort();
      root.remove();
    },
  };
}
