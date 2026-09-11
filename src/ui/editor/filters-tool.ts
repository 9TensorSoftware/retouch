import { FabricImage, StaticCanvas } from "fabric";
import type { FilterPreset } from "../../types";
import { buildPresetFilter, FILTER_PRESETS } from "../../utils/filters";
import { h } from "../h";
import { refreshRangeFill } from "../range-fill";

export interface FiltersToolOptions {
  /** Preview source — the image itself, or a captured frame canvas for video. */
  image: HTMLImageElement | HTMLCanvasElement;
  filter: FilterPreset;
  strength: number;
  onChange: (filter: FilterPreset) => void;
  onStrengthChange: (strength: number) => void;
}

export interface FiltersToolHandle {
  root: HTMLElement;
  getFilter(): FilterPreset;
  setFilter(filter: FilterPreset): void;
  /** Sync the intensity slider after an external change (does not fire onStrengthChange). */
  setStrength(strength: number): void;
  destroy(): void;
}

/** Max dimension of the per-preset preview thumbnails (CSS crops them to the button box). */
const PREVIEW_SIZE = 120;

export function createFiltersTool(options: FiltersToolOptions): FiltersToolHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let active = options.filter;

  const buttons = new Map<FilterPreset, HTMLElement>();
  const strip = h("div", { class: "rt-dock__filters" });

  // Intensity slider — only meaningful while a preset is active.
  const strengthValue = h("span", { class: "rt-dock__slider-value" }, String(options.strength));
  const strengthInput = h("input", {
    type: "range",
    min: 0,
    max: 100,
    step: 1,
    value: options.strength,
    "aria-label": "Filter intensity",
  }) as HTMLInputElement;
  refreshRangeFill(strengthInput);
  strengthInput.addEventListener(
    "input",
    () => {
      strengthValue.textContent = strengthInput.value;
      refreshRangeFill(strengthInput);
      options.onStrengthChange(Number(strengthInput.value));
    },
    { signal },
  );
  const strengthRow = h(
    "div",
    { class: "rt-dock__row rt-dock__slider" },
    h("span", { class: "rt-dock__slider-label" }, "Intensity"),
    strengthInput,
    strengthValue,
  );

  function updateStrengthVisibility(): void {
    strengthRow.style.visibility = active === "none" ? "hidden" : "";
  }

  for (const preset of FILTER_PRESETS) {
    const thumb = h("img", {
      class: "rt-dock__filter-thumb",
      src: renderPreview(options.image, preset.id, PREVIEW_SIZE),
      alt: preset.label,
    });

    const btn = h(
      "button",
      {
        class: `rt-dock__filter-btn${preset.id === active ? " rt-dock__filter-btn--active" : ""}`,
        title: preset.label,
      },
      thumb,
      h("span", { class: "rt-dock__filter-label" }, preset.label),
    );

    btn.addEventListener(
      "click",
      () => {
        if (active === preset.id) return;
        buttons.get(active)?.classList.remove("rt-dock__filter-btn--active");
        btn.classList.add("rt-dock__filter-btn--active");
        active = preset.id;
        updateStrengthVisibility();
        options.onChange(preset.id);
      },
      { signal },
    );

    buttons.set(preset.id, btn);
    strip.appendChild(btn);
  }

  updateStrengthVisibility();
  const root = h("div", { class: "rt-filters" }, strengthRow, strip);

  return {
    root,
    getFilter: () => active,
    setFilter(filter) {
      buttons.get(active)?.classList.remove("rt-dock__filter-btn--active");
      buttons.get(filter)?.classList.add("rt-dock__filter-btn--active");
      active = filter;
      updateStrengthVisibility();
    },
    setStrength(strength) {
      strengthInput.value = String(strength);
      strengthValue.textContent = String(strength);
      refreshRangeFill(strengthInput);
    },
    destroy() {
      abort.abort();
    },
  };
}

/** Render a small, preset-filtered preview of the image as a data URL. */
function renderPreview(
  image: HTMLImageElement | HTMLCanvasElement,
  preset: FilterPreset,
  maxSize: number,
): string {
  const iw = "naturalWidth" in image ? image.naturalWidth : image.width;
  const ih = "naturalHeight" in image ? image.naturalHeight : image.height;
  if (iw === 0 || ih === 0) return "";

  const scale = Math.min(maxSize / iw, maxSize / ih, 1);
  const width = Math.max(1, Math.round(iw * scale));
  const height = Math.max(1, Math.round(ih * scale));

  const canvas = new StaticCanvas(undefined, { width, height });
  const fabricImg = new FabricImage(image, {
    originX: "center",
    originY: "center",
    left: width / 2,
    top: height / 2,
    scaleX: scale,
    scaleY: scale,
  });

  const presetFilter = buildPresetFilter(preset);
  fabricImg.filters = presetFilter ? [presetFilter] : [];
  fabricImg.applyFilters();

  canvas.add(fabricImg);
  canvas.renderAll();

  const url = canvas.toDataURL({ format: "png", multiplier: 1 });
  canvas.dispose();
  return url;
}
