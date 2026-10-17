import { createDefaultCurves, createDefaultHsl, DEFAULT_ADJUSTMENTS } from "../src/constants";
import type { ImageEdits } from "../src/index";
import { createPreviewBase, renderLookToCanvas } from "../src/ui/editor/preview";
import type { Look, Recipe } from "./photos";

type ToneEdits = Pick<ImageEdits, "adjustments" | "curves" | "hsl" | "filter" | "filterStrength">;

/** A recipe as the full tone and color edits the renderer and the editor take. */
export function recipeEdits(recipe: Recipe): ToneEdits {
  const curves = createDefaultCurves();
  if (recipe.curve) curves.master = recipe.curve.map((p) => ({ ...p }));
  const hsl = createDefaultHsl();
  for (const [band, shift] of Object.entries(recipe.hsl ?? {})) {
    Object.assign(hsl[band as keyof typeof hsl], shift);
  }
  return {
    adjustments: { ...DEFAULT_ADJUSTMENTS, ...recipe.adjustments },
    curves,
    hsl,
    filter: recipe.filter ?? "none",
    filterStrength: recipe.filterStrength ?? 100,
  };
}

export function lookRecipe(look: Look): Recipe {
  return { filter: look.filter, adjustments: look.adjustments };
}

/**
 * `image` with `recipe` applied, at most `size` px on the long edge. It goes
 * through the editor's own preview pipeline, so it's exactly what Rétouch
 * draws for those settings.
 */
export function render(image: HTMLImageElement, recipe: Recipe, size: number): HTMLCanvasElement {
  return renderLookToCanvas(createPreviewBase(image, size), recipeEdits(recipe));
}

/** A canvas as an object URL for an <img>, so it sizes like the photo beside it. */
export function toObjectUrl(canvas: HTMLCanvasElement, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(URL.createObjectURL(blob)) : reject(new Error("Couldn't encode a render")),
      "image/jpeg",
      quality,
    );
  });
}

/** An <img>'s pixels, once they can be drawn. */
export async function decoded(img: HTMLImageElement): Promise<HTMLImageElement> {
  if (!img.complete) {
    await new Promise<void>((resolve, reject) => {
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => reject(new Error(`Couldn't load ${img.src}`)), {
        once: true,
      });
    });
  } else if (img.naturalWidth === 0) {
    throw new Error(`Couldn't load ${img.src}`);
  }
  await img.decode().catch(() => {});
  return img;
}
