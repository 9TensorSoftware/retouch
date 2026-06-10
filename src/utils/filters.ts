import type { FabricImage } from "fabric";
import { filters } from "fabric";
import type { Adjustments, FilterPreset } from "../types";

/** Element type of an image's fabric filter stack. */
type FabricFilter = FabricImage["filters"][number];

/** Filter presets shown in the editor's Filters panel, in display order. */
export const FILTER_PRESETS: { id: FilterPreset; label: string }[] = [
  { id: "none", label: "Original" },
  { id: "bw", label: "B&W" },
  { id: "sepia", label: "Sepia" },
  { id: "warm", label: "Warm" },
  { id: "cool", label: "Cool" },
  { id: "vintage", label: "Vintage" },
  { id: "vivid", label: "Vivid" },
];

/** Build the fabric filter for a preset, or null for "none". */
export function buildPresetFilter(preset: FilterPreset): FabricFilter | null {
  switch (preset) {
    case "bw":
      return new filters.Grayscale();
    case "sepia":
      return new filters.Sepia();
    // Warm pushes red up and blue down; cool does the reverse (4×5 RGBA matrix).
    case "warm":
      return new filters.ColorMatrix({
        matrix: [1.1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 1, 0],
      });
    case "cool":
      return new filters.ColorMatrix({
        matrix: [0.9, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1.1, 0, 0, 0, 0, 0, 1, 0],
      });
    case "vintage":
      return new filters.Vintage();
    case "vivid":
      return new filters.Vibrance({ vibrance: 0.6 });
    default:
      return null;
  }
}

/** True when the adjustments and preset would not change a single pixel. */
export function isNeutral(adj: Adjustments, preset: FilterPreset): boolean {
  return (
    preset === "none" && adj.brightness === 100 && adj.contrast === 100 && adj.saturation === 100
  );
}

/**
 * Build the full fabric filter stack for an image: the preset filter (if any)
 * sits beneath the brightness/contrast/saturation adjustments. Shared by the
 * live renderer, the export path, and the Filters tool previews so all three
 * produce identical pixels.
 */
export function buildFabricFilters(adj: Adjustments, preset: FilterPreset): FabricFilter[] {
  const stack: FabricFilter[] = [
    new filters.Brightness({ brightness: (adj.brightness - 100) / 100 }),
    new filters.Contrast({ contrast: (adj.contrast - 100) / 100 }),
    new filters.Saturation({ saturation: (adj.saturation - 100) / 100 }),
  ];
  const presetFilter = buildPresetFilter(preset);
  if (presetFilter) stack.unshift(presetFilter);
  return stack;
}
