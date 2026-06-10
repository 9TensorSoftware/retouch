import { ASPECT_RATIOS, MIN_TRIM_DURATION } from "../constants";
import type {
  Adjustments,
  AiEditOps,
  AiOptions,
  AiRequest,
  AspectRatioPreset,
  CropRect,
  FilterPreset,
  ImageEdits,
  VideoEdits,
} from "../types";
import { FILTER_PRESETS } from "../utils/filters";
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
    adjustments: {
      type: "object",
      description: "Absolute values 0-200 where 100 is neutral. Only include keys you change.",
      properties: {
        brightness: { type: "number" },
        contrast: { type: "number" },
        saturation: { type: "number" },
      },
      additionalProperties: false,
    },
    filter: {
      type: "string",
      enum: FILTER_IDS,
      description: "Preset filter. 'none' removes the current filter.",
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
    "Only include fields the request asks to change. Adjustment values are absolute (100 = neutral); 'a bit' ≈ ±15, 'much more' ≈ ±40.",
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

  if (typeof r.filter === "string" && (FILTER_IDS as string[]).includes(r.filter)) {
    ops.filter = r.filter as FilterPreset;
  }

  const rotation = toNumber(r.rotation);
  if (rotation !== undefined) ops.rotation = clamp(rotation, -45, 45);

  if (r.adjustments && typeof r.adjustments === "object") {
    const adj = r.adjustments as Record<string, unknown>;
    const out: Partial<Adjustments> = {};
    for (const key of ["brightness", "contrast", "saturation"] as const) {
      const value = toNumber(adj[key]);
      if (value !== undefined) out[key] = clamp(value, 0, 200);
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
