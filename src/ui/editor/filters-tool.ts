import { FabricImage, StaticCanvas } from "fabric";
import type { FilterPreset } from "../../types";
import { buildPresetFilter, FILTER_PRESETS } from "../../utils/filters";
import { h } from "../h";

export interface FiltersToolOptions {
  image: HTMLImageElement;
  filter: FilterPreset;
  onChange: (filter: FilterPreset) => void;
}

export interface FiltersToolHandle {
  root: HTMLElement;
  getFilter(): FilterPreset;
  setFilter(filter: FilterPreset): void;
  destroy(): void;
}

/** Max dimension of the per-preset preview thumbnails (CSS crops them to the button box). */
const PREVIEW_SIZE = 120;

export function createFiltersTool(options: FiltersToolOptions): FiltersToolHandle {
  const abort = new AbortController();
  const signal = abort.signal;
  let active = options.filter;

  const buttons = new Map<FilterPreset, HTMLElement>();
  const grid = h("div", { class: "rt-props__filters-grid" });

  for (const preset of FILTER_PRESETS) {
    const thumb = h("img", {
      class: "rt-props__filter-thumb",
      src: renderPreview(options.image, preset.id, PREVIEW_SIZE),
      alt: preset.label,
    });

    const btn = h(
      "button",
      {
        class: `rt-props__filter-btn${preset.id === active ? " rt-props__filter-btn--active" : ""}`,
        title: preset.label,
      },
      thumb,
      h("span", { class: "rt-props__filter-label" }, preset.label),
    );

    btn.addEventListener(
      "click",
      () => {
        if (active === preset.id) return;
        buttons.get(active)?.classList.remove("rt-props__filter-btn--active");
        btn.classList.add("rt-props__filter-btn--active");
        active = preset.id;
        options.onChange(preset.id);
      },
      { signal },
    );

    buttons.set(preset.id, btn);
    grid.appendChild(btn);
  }

  const root = h("div", null, h("div", { class: "rt-props__title" }, "Filters"), grid);

  return {
    root,
    getFilter: () => active,
    setFilter(filter) {
      buttons.get(active)?.classList.remove("rt-props__filter-btn--active");
      buttons.get(filter)?.classList.add("rt-props__filter-btn--active");
      active = filter;
    },
    destroy() {
      abort.abort();
    },
  };
}

/** Render a small, preset-filtered preview of the image as a data URL. */
function renderPreview(image: HTMLImageElement, preset: FilterPreset, maxSize: number): string {
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  if (iw === 0 || ih === 0) return image.src;

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
