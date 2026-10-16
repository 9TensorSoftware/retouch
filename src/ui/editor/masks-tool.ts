import type { EditMask, LocalAdjust, MaskKind } from "../../types";
import { createDefaultLocalAdjust, localAdjustIsNeutral } from "../../utils/masks";
import { h } from "../h";
import { ICON_INVERT, ICON_MASK_LINEAR, ICON_MASK_RADIAL, ICON_TRASH } from "../icons";
import { createSection } from "./controls";
import type { SliderHandle } from "./slider";
import { createSlider } from "./slider";
import {
  TRACK_BRIGHTNESS,
  TRACK_EXPOSURE,
  TRACK_SATURATION,
  TRACK_TEMPERATURE,
  TRACK_TINT,
} from "./tracks";

export interface MasksToolOptions {
  masks: EditMask[];
  /** Fires with the full cloned mask list on any change. */
  onChange: (masks: EditMask[]) => void;
  /** Fires when the selected mask changes (null = none). */
  onSelectionChange: (id: string | null) => void;
}

export interface MasksToolHandle {
  root: HTMLElement;
  getSelectedId(): string | null;
  /** Sync after an external change (undo/reset) — does not fire onChange. */
  setMasks(masks: EditMask[]): void;
  destroy(): void;
}

const ADJ_DEFS: { key: keyof LocalAdjust; label: string; track?: string }[] = [
  { key: "exposure", label: "Exposure", track: TRACK_EXPOSURE },
  { key: "brightness", label: "Brightness", track: TRACK_BRIGHTNESS },
  { key: "contrast", label: "Contrast" },
  { key: "saturation", label: "Saturation", track: TRACK_SATURATION },
  { key: "temperature", label: "Temperature", track: TRACK_TEMPERATURE },
  { key: "tint", label: "Tint", track: TRACK_TINT },
];

const KIND_LABEL: Record<MaskKind, string> = { linear: "Linear", radial: "Radial" };
const KIND_ICON: Record<MaskKind, string> = { linear: ICON_MASK_LINEAR, radial: ICON_MASK_RADIAL };

let maskCounter = 0;

/**
 * Selective-adjustment masks: a list of linear and radial masks; pick one to
 * dial the six local adjustments that apply only inside its gradient. Its
 * geometry is shaped by dragging the handles on the photo.
 */
export function createMasksTool(options: MasksToolOptions): MasksToolHandle {
  let masks: EditMask[] = structuredClone(options.masks);
  let selectedId: string | null = masks[0]?.id ?? null;
  const abort = new AbortController();
  const signal = abort.signal;

  const selected = (): EditMask | undefined => masks.find((m) => m.id === selectedId);
  const nameOf = (mask: EditMask): string => `${KIND_LABEL[mask.kind]} ${masks.indexOf(mask) + 1}`;

  function emit(): void {
    options.onChange(structuredClone(masks));
  }

  // ── Add buttons ──

  function addButton(kind: MaskKind): HTMLButtonElement {
    const button = h("button", { type: "button", class: "rt-masks__add-btn" });
    button.innerHTML = KIND_ICON[kind];
    button.appendChild(h("span", null, `Add ${KIND_LABEL[kind].toLowerCase()}`));
    button.addEventListener("click", () => addMask(kind), { signal });
    return button;
  }

  function addMask(kind: MaskKind): void {
    maskCounter++;
    const mask: EditMask = {
      id: `mask-${maskCounter}-${Math.floor(performance.now() % 100000)}`,
      kind,
      // Sensible starting geometry: linear fades from the top third; radial
      // sits centered at about half size.
      x0: 0.5,
      y0: kind === "linear" ? 0.1 : 0.5,
      x1: kind === "linear" ? 0.5 : 0.78,
      y1: kind === "linear" ? 0.6 : 0.72,
      invert: false,
      adjust: createDefaultLocalAdjust(),
    };
    masks.push(mask);
    renderList();
    select(mask.id);
    emit();
  }

  // ── The list ──

  interface Row {
    li: HTMLElement;
    pick: HTMLButtonElement;
    name: HTMLElement;
    dot: HTMLElement;
    invert: HTMLButtonElement;
    remove: HTMLButtonElement;
  }
  const rows = new Map<string, Row>();
  const list = h("ul", { class: "rt-masklist", "aria-label": "Masks" });
  const empty = h(
    "p",
    { class: "rt-dock__hint rt-masks__empty" },
    "Add a mask, then drag its handles on the photo to place it.",
  );

  function iconButton(icon: string, onClick: () => void): HTMLButtonElement {
    const button = h("button", { type: "button", class: "rt-masklist__icon" });
    button.innerHTML = icon;
    button.addEventListener("click", onClick, { signal });
    return button;
  }

  function buildRow(mask: EditMask): Row {
    const pick = h("button", { type: "button", class: "rt-masklist__select" });
    pick.innerHTML = KIND_ICON[mask.kind];
    const name = h("span", { class: "rt-masklist__name" });
    const dot = h("span", { class: "rt-masklist__dot", "aria-hidden": "true" });
    pick.append(name, dot);
    pick.addEventListener("click", () => select(mask.id), { signal });
    const invert = iconButton(ICON_INVERT, () => {
      mask.invert = !mask.invert;
      paintList();
      emit();
    });
    const remove = iconButton(ICON_TRASH, () => deleteMask(mask.id));
    const li = h("li", { class: "rt-masklist__row" }, pick, invert, remove);
    return { li, pick, name, dot, invert, remove };
  }

  /** Rebuild the rows (masks added or removed). */
  function renderList(): void {
    rows.clear();
    list.replaceChildren();
    for (const mask of masks) {
      const row = buildRow(mask);
      rows.set(mask.id, row);
      list.appendChild(row.li);
    }
    paintList();
  }

  /** Reflect names, selection, changes and inversion on the existing rows. */
  function paintList(): void {
    for (const mask of masks) {
      const row = rows.get(mask.id);
      if (!row) continue;
      const name = nameOf(mask);
      const isSelected = mask.id === selectedId;
      row.li.classList.toggle("rt-masklist__row--selected", isSelected);
      row.pick.setAttribute("aria-pressed", String(isSelected));
      row.name.textContent = name;
      row.dot.classList.toggle("rt-masklist__dot--on", !localAdjustIsNeutral(mask.adjust));
      row.invert.setAttribute("aria-pressed", String(mask.invert));
      row.invert.setAttribute("aria-label", `Invert ${name}`);
      row.invert.title = mask.invert
        ? "Inverted: applies outside the shape"
        : "Invert: apply outside the shape";
      row.remove.setAttribute("aria-label", `Delete ${name}`);
      row.remove.title = `Delete ${name}`;
    }
    list.hidden = masks.length === 0;
    empty.hidden = masks.length > 0;
  }

  function deleteMask(id: string): void {
    const index = masks.findIndex((m) => m.id === id);
    if (index < 0) return;
    const hadFocus = list.contains(document.activeElement);
    masks = masks.filter((m) => m.id !== id);
    renderList();
    if (selectedId === id) select(masks[Math.min(index, masks.length - 1)]?.id ?? null);
    // Keep keyboard focus in the list (or on the add buttons once it's empty).
    if (hadFocus) {
      const next = masks[Math.min(index, masks.length - 1)];
      (next ? rows.get(next.id)?.pick : addLinear)?.focus();
    }
    emit();
  }

  // ── The selected mask's adjustments ──

  const section = createSection({ title: "Inside the mask" });
  const sliders = new Map<keyof LocalAdjust, SliderHandle>();
  for (const def of ADJ_DEFS) {
    const slider = createSlider(
      {
        label: def.label,
        min: -100,
        max: 100,
        value: 0,
        track: def.track,
        onInput: (v) => {
          const mask = selected();
          if (!mask) return;
          mask.adjust[def.key] = v;
          syncCount();
          paintList();
          emit();
        },
      },
      signal,
    );
    sliders.set(def.key, slider);
    section.body.appendChild(slider.root);
  }

  function syncCount(): void {
    const mask = selected();
    section.setCount(mask ? ADJ_DEFS.filter((d) => mask.adjust[d.key] !== 0).length : 0);
  }

  function syncSliders(): void {
    const mask = selected();
    section.root.hidden = !mask;
    for (const def of ADJ_DEFS) {
      const slider = sliders.get(def.key);
      slider?.set(mask ? mask.adjust[def.key] : 0);
      if (mask) slider?.setLabel(def.label, `${nameOf(mask)} ${def.label.toLowerCase()}`);
    }
    syncCount();
  }

  function select(id: string | null): void {
    selectedId = id;
    paintList();
    syncSliders();
    options.onSelectionChange(id);
  }

  const addLinear = addButton("linear");
  const root = h(
    "div",
    { class: "rt-masks" },
    h("div", { class: "rt-masks__add" }, addLinear, addButton("radial")),
    list,
    empty,
    section.root,
  );

  renderList();
  syncSliders();

  return {
    root,
    getSelectedId: () => selectedId,
    setMasks(next) {
      masks = structuredClone(next);
      if (!masks.some((m) => m.id === selectedId)) selectedId = masks[0]?.id ?? null;
      renderList();
      syncSliders();
      options.onSelectionChange(selectedId);
    },
    destroy() {
      abort.abort();
    },
  };
}
