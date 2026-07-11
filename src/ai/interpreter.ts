import { ASPECT_RATIOS, MIN_TRIM_DURATION } from "../constants";
import type {
  Adjustments,
  AiEditOps,
  AiOptions,
  AiRequest,
  AspectRatioPreset,
  CropRect,
  FilterPreset,
  HslBand,
  HslShift,
  ImageEdits,
  Orientation,
  VideoEdits,
} from "../types";
import { FILTER_PRESETS } from "../utils/filters";
import { HSL_BANDS } from "../utils/hsl";
import { clamp } from "../utils/math";
import { clampTrim } from "../utils/video";

export interface AiContext {
  kind: "image" | "video";
  width: number;
  height: number;
  /** Seconds; video only. */
  duration?: number;
  edits: ImageEdits | VideoEdits;
}

const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_BASE_URL = "https://api.anthropic.com";
const FILTER_IDS = FILTER_PRESETS.map((p) => p.id);
const ASPECT_IDS = Object.keys(ASPECT_RATIOS).filter((id) => id !== "free");
const ORIENTATIONS = [0, 90, 180, 270];

/** [min, max] per adjustment; used for both the schema and clamping. */
const ADJUSTMENT_RANGES: Record<keyof Adjustments, [number, number]> = {
  brightness: [0, 200],
  contrast: [0, 200],
  saturation: [0, 200],
  exposure: [-100, 100],
  temperature: [-100, 100],
  tint: [-100, 100],
  hue: [-180, 180],
  vibrance: [-100, 100],
  sharpen: [0, 100],
  blur: [0, 100],
  grain: [0, 100],
  vignette: [0, 100],
};
const ADJUSTMENT_KEYS = Object.keys(ADJUSTMENT_RANGES) as (keyof Adjustments)[];

// ── Request building ──────────────────────────

export function buildSchema(context: AiContext): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    explanation: {
      type: "string",
      description: "One short sentence describing the edits you applied, for the user.",
    },
    crop: {
      type: "object",
      description:
        "Crop region in normalized coordinates (0-1) relative to the full frame. Use for content-aware crops like 'crop to the dog'.",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: false,
    },
    aspect: {
      type: "string",
      enum: ASPECT_IDS,
      description: "Centered crop to a fixed aspect ratio. Prefer this for 'make it square' etc.",
    },
    rotation: { type: "number", description: "Straighten angle in degrees, -45 to 45." },
    keystoneV: {
      type: "number",
      description:
        "Vertical perspective (keystone) correction, -100 to 100. Positive widens the top — fixes converging verticals in upward shots.",
    },
    keystoneH: {
      type: "number",
      description: "Horizontal perspective (keystone) correction, -100 to 100.",
    },
    orientation: {
      type: "number",
      enum: ORIENTATIONS,
      description: "Absolute 90°-step rotation of the whole image, clockwise degrees.",
    },
    flipH: { type: "boolean", description: "True to mirror the image horizontally (a toggle)." },
    flipV: { type: "boolean", description: "True to mirror the image vertically (a toggle)." },
    adjustments: {
      type: "object",
      description:
        "Absolute values; only include keys you change. brightness/contrast/saturation are 0-200 (100 neutral); every other key's neutral is 0.",
      properties: Object.fromEntries(
        ADJUSTMENT_KEYS.map((key) => [
          key,
          {
            type: "number",
            description: `${ADJUSTMENT_RANGES[key][0]} to ${ADJUSTMENT_RANGES[key][1]}`,
          },
        ]),
      ),
      additionalProperties: false,
    },
    hsl: {
      type: "object",
      description:
        "Per-hue-band color mixer: shift hue/saturation/luminance (-100..100 each) for specific color ranges only — e.g. 'make the sky bluer' → {blue:{s:40}}, 'mute the greens' → {green:{s:-50}}.",
      properties: Object.fromEntries(
        HSL_BANDS.map((band) => [
          band,
          {
            type: "object",
            properties: {
              h: { type: "number", description: "Hue shift -100..100" },
              s: { type: "number", description: "Saturation shift -100..100" },
              l: { type: "number", description: "Luminance shift -100..100" },
            },
            additionalProperties: false,
          },
        ]),
      ),
      additionalProperties: false,
    },
    filter: {
      type: "string",
      enum: FILTER_IDS,
      description: "Preset filter. 'none' removes the current filter.",
    },
    filterStrength: {
      type: "number",
      description: "Preset intensity 0-100 (100 = full effect).",
    },
    reset: { type: "boolean", description: "True to reset every edit to defaults first." },
  };

  if (context.kind === "video") {
    properties.trim = {
      type: "object",
      description: `Trim range in seconds within [0, ${context.duration?.toFixed(2)}].`,
      properties: { start: { type: "number" }, end: { type: "number" } },
      required: ["start", "end"],
      additionalProperties: false,
    };
    properties.mute = { type: "boolean", description: "Discard the audio track on export." };
    properties.speed = {
      type: "number",
      description: "Playback rate 0.25-4 (1 = normal). Audio is dropped when not 1.",
    };
  }

  return {
    type: "object",
    properties,
    required: ["explanation"],
    additionalProperties: false,
  };
}

export function buildSystem(context: AiContext): string {
  const dims = `${context.width}×${context.height}`;
  const media =
    context.kind === "video"
      ? `a ${context.duration?.toFixed(1)}s video (${dims})`
      : `an image (${dims})`;
  const lines = [
    `You translate a user's natural-language request into edit operations for ${media} via the apply_edits tool.`,
    `Current edits: ${JSON.stringify(context.edits)}.`,
    "Only include fields the request asks to change. Adjustment values are absolute; brightness/contrast/saturation are 100-neutral ('a bit' ≈ ±15, 'much more' ≈ ±40), every other adjustment is 0-neutral.",
    "Use `orientation` (absolute 0/90/180/270 clockwise) for whole-image rotation and `rotation` only for small straightening; `flipH`/`flipV` mirror the current view.",
    "Crop coordinates are normalized 0-1 over the full frame. When asked to crop to a subject, look at the attached frame and return a tight region around it.",
    "If the request is unrelated to editing, return only an explanation saying you can't help with that.",
  ];
  return lines.join("\n");
}

// ── Validation / clamping ─────────────────────

function toNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * Trust boundary: every model-provided value is validated and clamped through
 * the same primitives the manual tools use, so a hallucinated value can never
 * corrupt edit state.
 */
export function validateAiOps(raw: unknown, context: AiContext): AiEditOps {
  if (!raw || typeof raw !== "object") {
    throw new Error("[Retouch] AI returned no edit operations");
  }
  const r = raw as Record<string, unknown>;
  const ops: AiEditOps = {
    explanation: typeof r.explanation === "string" ? r.explanation : "Edits applied",
  };

  if (r.reset === true) ops.reset = true;

  if (r.hsl && typeof r.hsl === "object") {
    const bands = r.hsl as Record<string, unknown>;
    const clean: Partial<Record<HslBand, Partial<HslShift>>> = {};
    for (const band of HSL_BANDS) {
      const shift = bands[band];
      if (!shift || typeof shift !== "object") continue;
      const sh = shift as Record<string, unknown>;
      const entry: Partial<HslShift> = {};
      for (const key of ["h", "s", "l"] as const) {
        const value = toNumber(sh[key]);
        if (value !== undefined) entry[key] = clamp(value, -100, 100);
      }
      if (Object.keys(entry).length > 0) clean[band] = entry;
    }
    if (Object.keys(clean).length > 0) ops.hsl = clean;
  }

  if (typeof r.filter === "string" && (FILTER_IDS as string[]).includes(r.filter)) {
    ops.filter = r.filter as FilterPreset;
  }

  const filterStrength = toNumber(r.filterStrength);
  if (filterStrength !== undefined) ops.filterStrength = clamp(filterStrength, 0, 100);

  const rotation = toNumber(r.rotation);
  if (rotation !== undefined) ops.rotation = clamp(rotation, -45, 45);

  const keystoneV = toNumber(r.keystoneV);
  if (keystoneV !== undefined) ops.keystoneV = clamp(keystoneV, -100, 100);
  const keystoneH = toNumber(r.keystoneH);
  if (keystoneH !== undefined) ops.keystoneH = clamp(keystoneH, -100, 100);

  const orientation = toNumber(r.orientation);
  if (orientation !== undefined && ORIENTATIONS.includes(orientation)) {
    ops.orientation = orientation as Orientation;
  }
  if (r.flipH === true) ops.flipH = true;
  if (r.flipV === true) ops.flipV = true;

  if (r.adjustments && typeof r.adjustments === "object") {
    const adj = r.adjustments as Record<string, unknown>;
    const out: Partial<Adjustments> = {};
    for (const key of ADJUSTMENT_KEYS) {
      const value = toNumber(adj[key]);
      if (value !== undefined) {
        const [min, max] = ADJUSTMENT_RANGES[key];
        out[key] = clamp(value, min, max);
      }
    }
    if (Object.keys(out).length > 0) ops.adjustments = out;
  }

  if (typeof r.aspect === "string" && (ASPECT_IDS as string[]).includes(r.aspect)) {
    ops.aspect = r.aspect as AspectRatioPreset;
  } else if (r.crop && typeof r.crop === "object") {
    const c = r.crop as Record<string, unknown>;
    const x = toNumber(c.x);
    const y = toNumber(c.y);
    const width = toNumber(c.width);
    const height = toNumber(c.height);
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
      const crop: CropRect = {
        x: clamp(x, 0, 0.95),
        y: clamp(y, 0, 0.95),
        width: 0,
        height: 0,
      };
      crop.width = clamp(width, 0.05, 1 - crop.x);
      crop.height = clamp(height, 0.05, 1 - crop.y);
      ops.crop = crop;
    }
  }

  if (context.kind === "video" && context.duration !== undefined) {
    if (r.trim && typeof r.trim === "object") {
      const t = r.trim as Record<string, unknown>;
      const start = toNumber(t.start);
      const end = toNumber(t.end);
      if (start !== undefined && end !== undefined) {
        ops.trim = clampTrim({ start, end }, context.duration, MIN_TRIM_DURATION);
      }
    }
    if (typeof r.mute === "boolean") ops.mute = r.mute;
    const speed = toNumber(r.speed);
    if (speed !== undefined) ops.speed = clamp(speed, 0.25, 4);
  }

  return ops;
}

// ── Transport ─────────────────────────────────

interface AnthropicContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

async function callAnthropic(options: AiOptions, request: AiRequest): Promise<unknown> {
  const key = options.apiKey;
  if (!key) throw new Error("[Retouch] No AI API key configured");

  const content: unknown[] = [];
  if (request.imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: request.imageBase64 },
    });
  }
  content.push({ type: "text", text: request.prompt });

  const response = await fetch(`${options.baseUrl ?? DEFAULT_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_MODEL,
      max_tokens: 1024,
      system: request.system,
      messages: [{ role: "user", content }],
      tools: [
        {
          name: "apply_edits",
          description: "Apply the requested edits to the current media.",
          input_schema: request.schema,
        },
      ],
      tool_choice: { type: "tool", name: "apply_edits" },
    }),
  });

  if (!response.ok) {
    let message = `AI request failed (${response.status})`;
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // keep the status message
    }
    throw new Error(`[Retouch] ${message}`);
  }

  const data = (await response.json()) as { content?: AnthropicContentBlock[] };
  const toolUse = data.content?.find((b) => b.type === "tool_use" && b.name === "apply_edits");
  if (!toolUse) throw new Error("[Retouch] AI returned no edit operations");
  return toolUse.input;
}

/** Interpret a natural-language command into validated edit operations. */
export async function interpretCommand(
  ai: AiOptions,
  prompt: string,
  context: AiContext,
  imageBase64?: string,
): Promise<AiEditOps> {
  const request: AiRequest = {
    system: buildSystem(context),
    prompt,
    imageBase64,
    schema: buildSchema(context),
  };
  const raw = ai.complete ? await ai.complete(request) : await callAnthropic(ai, request);
  return validateAiOps(raw, context);
}
