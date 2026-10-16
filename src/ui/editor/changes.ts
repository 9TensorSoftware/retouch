import type { Adjustments, ImageEdits, StylizeKind, VideoEdits } from "../../types";
import { FILTER_PRESETS } from "../../utils/filters";
import { HSL_BANDS } from "../../utils/hsl";
import { formatDuration } from "../../utils/video";
import { signed } from "./slider";

/** Each adjustment's label and resting value (readouts are offsets from it). */
const ADJUSTMENTS: Record<keyof Adjustments, [label: string, neutral: number, unit?: string]> = {
  exposure: ["Exposure", 0],
  brightness: ["Brightness", 100],
  contrast: ["Contrast", 100],
  dehaze: ["Dehaze", 0],
  temperature: ["Temperature", 0],
  tint: ["Tint", 0],
  vibrance: ["Vibrance", 0],
  saturation: ["Saturation", 100],
  hue: ["Hue", 0, "°"],
  clarity: ["Clarity", 0],
  vignette: ["Vignette", 0],
  grain: ["Grain", 0],
  sharpen: ["Sharpen", 0],
  blur: ["Blur", 0],
};

const EFFECTS: Record<StylizeKind, string> = {
  none: "No effect",
  tiltshift: "Tilt-shift",
  duotone: "Duotone",
  posterize: "Posterize",
  pixelate: "Pixelate",
  halftone: "Halftone",
};

const AXES = { h: "hue", s: "saturation", l: "luminance" } as const;

/** At most this many labels; the rest fold into "+N more". */
const MAX = 8;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * What changed between two edit states, as short labels the way the
 * controls read them: "Contrast +15", "Blue saturation +30", "Crop".
 * Values are where things ended up (offsets from neutral), not deltas.
 */
export function listChanges(
  prev: ImageEdits | VideoEdits,
  next: ImageEdits | VideoEdits,
): string[] {
  const out: string[] = [];

  for (const key of Object.keys(ADJUSTMENTS) as (keyof Adjustments)[]) {
    if (next.adjustments[key] === prev.adjustments[key]) continue;
    const [label, neutral, unit = ""] = ADJUSTMENTS[key];
    out.push(`${label} ${signed(next.adjustments[key] - neutral)}${unit}`);
  }

  if (next.filter !== prev.filter) {
    const preset = FILTER_PRESETS.find((p) => p.id === next.filter);
    out.push(next.filter === "none" ? "No filter" : `${preset?.label ?? next.filter} filter`);
  }
  if (next.filterStrength !== prev.filterStrength && next.filter !== "none") {
    out.push(`Filter ${next.filterStrength}%`);
  }

  for (const band of HSL_BANDS) {
    for (const axis of ["h", "s", "l"] as const) {
      if (next.hsl[band][axis] === prev.hsl[band][axis]) continue;
      const name = band[0].toUpperCase() + band.slice(1);
      out.push(`${name} ${AXES[axis]} ${signed(next.hsl[band][axis])}`);
    }
  }

  if (next.stylize.kind !== prev.stylize.kind) {
    out.push(EFFECTS[next.stylize.kind]);
  } else if (next.stylize.kind !== "none" && !same(next.stylize, prev.stylize)) {
    out.push(`${EFFECTS[next.stylize.kind]} ${next.stylize.amount}`);
  }
  if (!same(next.curves, prev.curves)) out.push("Curves");
  if (!same(next.masks, prev.masks)) out.push("Masks");
  if (!same(next.liquify, prev.liquify)) out.push("Liquify");

  // Framing. A 90° turn or a flip remaps the crop as a side effect, so the
  // crop itself only counts when neither happened.
  const turned = next.orientation !== prev.orientation;
  const flipped = next.flipH !== prev.flipH || next.flipV !== prev.flipV;
  if (turned) out.push(`Turn ${(next.orientation - prev.orientation + 360) % 360}°`);
  if (flipped) out.push("Flip");
  if (!turned && !flipped && !same(next.crop, prev.crop)) out.push("Crop");
  if (next.rotation !== prev.rotation) out.push(`Straighten ${signed(next.rotation, 1)}°`);
  if (next.keystoneV !== prev.keystoneV || next.keystoneH !== prev.keystoneH) {
    out.push("Perspective");
  }
  if (next.lensDistortion !== prev.lensDistortion || next.lensDevignette !== prev.lensDevignette) {
    out.push("Lens");
  }
  if (next.seamWidth !== prev.seamWidth) out.push(`Width ${next.seamWidth}%`);

  if ("trim" in next && "trim" in prev) {
    if (!same(next.trim, prev.trim)) {
      out.push(`Trim ${formatDuration(next.trim.start)}–${formatDuration(next.trim.end)}`);
    }
    if (next.mute !== prev.mute) out.push(next.mute ? "Mute" : "Sound on");
    if (next.speed !== prev.speed) out.push(`Speed ${next.speed}×`);
    if (next.deflicker !== prev.deflicker) out.push(next.deflicker ? "Deflicker" : "No deflicker");
  }

  return out.length > MAX ? [...out.slice(0, MAX - 1), `+${out.length - MAX + 1} more`] : out;
}
