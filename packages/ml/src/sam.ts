import { loadSession, ort, type RuntimeOptions, runResilient } from "./runtime";

/**
 * Click-to-select via SlimSAM-77 (Apache-2.0): the image encodes once into
 * embeddings (~38 MB of model across two files), then every click runs only
 * the small prompt decoder, so refinement feels instant.
 *
 * Conventions verified against the exports: encoder takes RGB /255 with
 * ImageNet mean/std, longest edge resized to 1024 and zero-padded
 * bottom/right AFTER normalization; it emits image_embeddings AND
 * image_positional_embeddings, both of which feed the decoder. Decoder
 * points are in the 1024-resized space (scale = 1024/max(W,H)), labels are
 * int64 (1 = keep, 0 = remove); it returns 3 candidate masks as 256×256
 * logits with per-mask IoU scores. Post: pick argmax(iou), sigmoid → gray,
 * bilinear-upsample, crop the padding, resize to the original, threshold.
 */

export const DEFAULT_SAM_ENCODER_URL =
  "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder.onnx";
export const DEFAULT_SAM_DECODER_URL =
  "https://huggingface.co/Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder.onnx";

/** The network's fixed spatial size. */
export const SAM_SIZE = 1024;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export interface SamOptions extends RuntimeOptions {
  encoderUrl?: string;
  decoderUrl?: string;
}

/** One prompt click, normalized 0–1 over the source. 1 = keep, 0 = remove. */
export interface SamPoint {
  x: number;
  y: number;
  label: 0 | 1;
}

/** Cached per-image encoder outputs plus the source dimensions. */
export interface SamEmbeddings {
  image: Float32Array;
  positional: Float32Array;
  width: number;
  height: number;
}

/** Longest edge → SAM_SIZE, the other side rounded (≥1), aspect kept. */
export function samResizedSize(width: number, height: number): { width: number; height: number } {
  const scale = SAM_SIZE / Math.max(width, height, 1);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Resized-image RGBA → CHW float tensor data at SAM_SIZE²: /255 then
 * ImageNet-normalized, zero-padded bottom/right (padding stays 0 — the
 * normalization is applied to image pixels only, per the HF processor).
 */
export function rgbaToSamTensor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const plane = SAM_SIZE * SAM_SIZE;
  const chw = new Float32Array(plane * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const p = y * SAM_SIZE + x;
      chw[p] = (data[i] / 255 - MEAN[0]) / STD[0];
      chw[plane + p] = (data[i + 1] / 255 - MEAN[1]) / STD[1];
      chw[plane * 2 + p] = (data[i + 2] / 255 - MEAN[2]) / STD[2];
    }
  }
  return chw;
}

/** Normalized clicks → decoder tensors (coords in the 1024-resized space). */
export function pointsToSamTensors(
  points: SamPoint[],
  srcWidth: number,
  srcHeight: number,
): { coords: Float32Array; labels: BigInt64Array } {
  const scale = SAM_SIZE / Math.max(srcWidth, srcHeight, 1);
  const coords = new Float32Array(points.length * 2);
  const labels = new BigInt64Array(points.length);
  for (let i = 0; i < points.length; i++) {
    coords[i * 2] = points[i].x * srcWidth * scale;
    coords[i * 2 + 1] = points[i].y * srcHeight * scale;
    labels[i] = BigInt(points[i].label);
  }
  return { coords, labels };
}

/** Pick the highest-scoring of the 3 candidate masks. */
export function pickBestMask(
  iouScores: Float32Array,
  masks: Float32Array,
  maskPixels: number,
): { mask: Float32Array; score: number } {
  let best = 0;
  for (let i = 1; i < iouScores.length; i++) {
    if (iouScores[i] > iouScores[best]) best = i;
  }
  return {
    mask: masks.subarray(best * maskPixels, (best + 1) * maskPixels),
    score: iouScores[best],
  };
}

/**
 * Mask logits → opaque grayscale RGBA (sigmoid × 255), so a canvas bilinear
 * upsample followed by a 127 threshold approximates interpolating the
 * logits — verified equivalent on the reference implementation.
 */
export function maskLogitsToGray(mask: Float32Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(mask.length * 4);
  for (let p = 0; p < mask.length; p++) {
    const v = (1 / (1 + Math.exp(-mask[p]))) * 255;
    rgba[p * 4] = v;
    rgba[p * 4 + 1] = v;
    rgba[p * 4 + 2] = v;
    rgba[p * 4 + 3] = 255;
  }
  return rgba;
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** Per-image embedding cache, keyed by element identity (a replaced image
 * is a new element, so invalidation is automatic). ~8 MiB per entry. */
const EMBED_CACHE_MAX = 3;
const embedCache = new Map<HTMLImageElement | HTMLCanvasElement, Promise<SamEmbeddings>>();

/** Drop all cached embeddings (frees ~8 MiB per analyzed image). */
export function clearSamCache(): void {
  embedCache.clear();
}

/**
 * Encode an image into SAM embeddings, memoized per element. The decoder
 * download is kicked off in parallel so the first click after analysis
 * doesn't wait on it.
 */
export function encodeSamImage(
  source: HTMLImageElement | HTMLCanvasElement,
  options: SamOptions = {},
): Promise<SamEmbeddings> {
  const cached = embedCache.get(source);
  if (cached) return cached;

  const promise = (async () => {
    const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
    const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (srcW < 2 || srcH < 2) throw new Error("[Retouch ML] Image too small to analyze");

    // Warm the decoder while the encoder downloads/runs.
    void loadSession(options.decoderUrl ?? DEFAULT_SAM_DECODER_URL, {
      ...options,
      onDownloadProgress: undefined,
    }).catch(() => {});

    const resized = samResizedSize(srcW, srcH);
    const canvas = canvasOf(resized.width, resized.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("[Retouch ML] Failed to create canvas context");
    ctx.drawImage(source, 0, 0, resized.width, resized.height);
    const data = ctx.getImageData(0, 0, resized.width, resized.height).data;

    const input = new ort.Tensor("float32", rgbaToSamTensor(data, resized.width, resized.height), [
      1,
      3,
      SAM_SIZE,
      SAM_SIZE,
    ]);
    const { session, results } = await runResilient(
      options.encoderUrl ?? DEFAULT_SAM_ENCODER_URL,
      options,
      (s) => ({ [s.inputNames[0]]: input }),
    );
    return {
      image: results[session.outputNames[0]].data as Float32Array,
      positional: results[session.outputNames[1]].data as Float32Array,
      width: srcW,
      height: srcH,
    };
  })();
  promise.catch(() => embedCache.delete(source));
  embedCache.set(source, promise);
  // Simple LRU: evict the oldest entry beyond the cap.
  if (embedCache.size > EMBED_CACHE_MAX) {
    const oldest = embedCache.keys().next().value;
    if (oldest) embedCache.delete(oldest);
  }
  return promise;
}

/**
 * Run the prompt decoder for the given clicks. Returns a white-on-black
 * binary mask canvas at the source resolution plus the model's confidence.
 */
export async function decodeSamClicks(
  embeddings: SamEmbeddings,
  points: SamPoint[],
  options: SamOptions = {},
): Promise<{ mask: HTMLCanvasElement; score: number }> {
  if (points.length === 0) throw new Error("[Retouch ML] No prompt points");
  const { coords, labels } = pointsToSamTensors(points, embeddings.width, embeddings.height);
  const feeds = {
    input_points: new ort.Tensor("float32", coords, [1, 1, points.length, 2]),
    input_labels: new ort.Tensor("int64", labels, [1, 1, points.length]),
    image_embeddings: new ort.Tensor("float32", embeddings.image, [1, 256, 64, 64]),
    image_positional_embeddings: new ort.Tensor("float32", embeddings.positional, [1, 256, 64, 64]),
  };
  const { session, results } = await runResilient(
    options.decoderUrl ?? DEFAULT_SAM_DECODER_URL,
    options,
    () => feeds,
  );
  const iou = results[session.outputNames[0]].data as Float32Array;
  const masks = results[session.outputNames[1]].data as Float32Array;
  const side = 256;
  const { mask, score } = pickBestMask(iou, masks, side * side);

  // 256² sigmoid-gray → bilinear to 1024² → crop padding → source size
  const small = canvasOf(side, side);
  small.getContext("2d")?.putImageData(new ImageData(maskLogitsToGray(mask), side, side), 0, 0);
  const resized = samResizedSize(embeddings.width, embeddings.height);
  const up = canvasOf(resized.width, resized.height);
  const upCtx = up.getContext("2d");
  if (!upCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  upCtx.imageSmoothingEnabled = true;
  upCtx.imageSmoothingQuality = "high";
  // Scale the full 256² (which represents the padded 1024²) and let the
  // crop fall out of drawing only the un-padded region scaled to fit.
  upCtx.drawImage(
    small,
    0,
    0,
    (side * resized.width) / SAM_SIZE,
    (side * resized.height) / SAM_SIZE,
    0,
    0,
    resized.width,
    resized.height,
  );

  const out = canvasOf(embeddings.width, embeddings.height);
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("[Retouch ML] Failed to create canvas context");
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(up, 0, 0, embeddings.width, embeddings.height);
  const image = outCtx.getImageData(0, 0, out.width, out.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] > 127 ? 255 : 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  outCtx.putImageData(image, 0, 0);
  return { mask: out, score };
}
