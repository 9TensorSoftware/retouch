import { DEFAULT_ADJUSTMENTS } from "../src/constants";
import type { Adjustments, FilterPreset, ImageEdits } from "../src/index";
import { signed } from "../src/ui/editor/slider";

// The landing page's photos and the edits it shows on them. Every "after" on
// the page is either rendered from these recipes in the browser, or (for the
// AI tools) a file in public/showcase/ that Rétouch's own models produced.

export interface Photo {
  /** File name under public/photos/. */
  file: string;
  alt: string;
  author: string;
  /** The photographer's Unsplash profile. */
  authorUrl: string;
  /** The photo's Unsplash page. */
  url: string;
}

const unsplash = "https://unsplash.com";

export const PHOTOS = {
  pond: {
    file: "pond.jpg",
    alt: "A small wooden house among orange bushes on a pond, in morning fog",
    author: "Adrian Eperjessy",
    authorUrl: `${unsplash}/@enor007`,
    url: `${unsplash}/photos/mysUTgf61cM`,
  },
  portrait: {
    file: "portrait.jpg",
    alt: "A woman in a striped shirt, lit by the setting sun",
    author: "Štefan Štefančík",
    authorUrl: `${unsplash}/@cikstefan`,
    url: `${unsplash}/photos/QXevDflbl8A`,
  },
  corgi: {
    file: "corgi.jpg",
    alt: "A smiling corgi sitting on stone steps in front of yellow flowers",
    author: "Alvan Nee",
    authorUrl: `${unsplash}/@alvannee`,
    url: `${unsplash}/photos/yUSsVoQdjxQ`,
  },
  beach: {
    file: "beach.jpg",
    alt: "A person standing at the edge of the sea, with footprints leading to them across the sand",
    author: "Michael Fischer",
    authorUrl: `${unsplash}/@photo_fish`,
    url: `${unsplash}/photos/t48mPCg5AyQ`,
  },
  road: {
    file: "road.jpg",
    alt: "A straight road between orange maples and dark pines under a stormy sky",
    author: "Rachel Reinhardt",
    authorUrl: `${unsplash}/@rreinhardt`,
    url: `${unsplash}/photos/RG11_0q94c0`,
  },
} satisfies Record<string, Photo>;

export type PhotoName = keyof typeof PHOTOS;

/** The order the photos sit in the gallery. */
export const GALLERY: PhotoName[] = ["pond", "portrait", "corgi", "road", "beach"];

type Band = keyof ImageEdits["hsl"];
type Point = ImageEdits["curves"]["master"][number];

/** A set of tone and color edits: the parts of ImageEdits a recipe changes. */
export interface Recipe {
  adjustments?: Partial<Adjustments>;
  filter?: FilterPreset;
  filterStrength?: number;
  /** The master tone curve. */
  curve?: Point[];
  hsl?: Partial<Record<Band, Partial<{ h: number; s: number; l: number }>>>;
}

/**
 * The hero: lift the fog, warm it a little, let the orange glow. Tuned at
 * the editor's own preview size; dehaze reads stronger on small renders.
 */
export const POND_EDIT: Recipe = {
  adjustments: {
    dehaze: 50,
    clarity: 15,
    vibrance: 40,
    exposure: 6,
    contrast: 108,
    temperature: 12,
    vignette: 12,
  },
  curve: [
    { x: 0, y: 0.03 },
    { x: 0.3, y: 0.26 },
    { x: 0.75, y: 0.8 },
    { x: 1, y: 1 },
  ],
  hsl: { orange: { s: 20 }, yellow: { s: 10 } },
};

/** Color mix only: the maples go crimson, nothing else moves. */
export const ROAD_EDIT: Recipe = {
  hsl: {
    orange: { h: -40, s: 20, l: -8 },
    yellow: { h: -30, s: 15 },
  },
};

export interface Look {
  name: string;
  filter: FilterPreset;
  adjustments: Partial<Adjustments>;
}

/** The demo's Looks plugin, and the grid that shows them off. */
export const LOOKS: Look[] = [
  {
    name: "Golden hour",
    filter: "warm",
    adjustments: { temperature: 35, vibrance: 25, vignette: 20 },
  },
  { name: "Noir", filter: "bw", adjustments: { contrast: 130, grain: 25, vignette: 35 } },
  { name: "Punchy", filter: "vivid", adjustments: { contrast: 115, vibrance: 40, sharpen: 20 } },
  {
    name: "Faded film",
    filter: "vintage",
    adjustments: { contrast: 88, grain: 30, temperature: 10 },
  },
  { name: "Cool morning", filter: "cool", adjustments: { temperature: -25, exposure: 10 } },
];

/** A recipe's changes as the editor's sliders show them, for the captions. */
export function describe(recipe: Recipe): string[] {
  const names: Partial<Record<keyof Adjustments, string>> = {
    exposure: "Exposure",
    contrast: "Contrast",
    dehaze: "Dehaze",
    temperature: "Temperature",
    tint: "Tint",
    vibrance: "Vibrance",
    saturation: "Saturation",
    clarity: "Clarity",
    vignette: "Vignette",
  };
  const out: string[] = [];
  for (const [key, value] of Object.entries(recipe.adjustments ?? {})) {
    const name = names[key as keyof Adjustments];
    if (!name || typeof value !== "number") continue;
    // The editor shows each slider relative to its neutral point.
    out.push(`${name} ${signed(value - DEFAULT_ADJUSTMENTS[key as keyof Adjustments])}`);
  }
  if (recipe.curve) out.push("Tone curve");
  const axes = { h: "hue", s: "saturation", l: "luminance" } as const;
  for (const [band, shift] of Object.entries(recipe.hsl ?? {})) {
    for (const [axis, value] of Object.entries(shift ?? {})) {
      if (!value) continue;
      const label = `${band[0].toUpperCase()}${band.slice(1)} ${axes[axis as keyof typeof axes]}`;
      out.push(`${label} ${signed(value)}`);
    }
  }
  return out;
}
