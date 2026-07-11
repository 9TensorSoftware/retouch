import type { VideoEntry } from "../types";
import { createCanvas } from "../utils/canvas";
import { createFramePipeline } from "./frame-pipeline";

export type GifLoopMode = "forward" | "reverse" | "boomerang";

export interface GifExportOptions {
  /** Frames per second sampled from the (trimmed) clip. Defaults to 12. */
  fps?: number;
  /** Output width cap in pixels. Defaults to 480. */
  maxWidth?: number;
  /** Playback direction. Defaults to "forward". */
  loop?: GifLoopMode;
}

interface QuantizedFrame {
  index: Uint8Array;
  palette: number[][];
}

/**
 * Export the trimmed range as an animated GIF with every edit applied —
 * frames run through the same pipeline as the video export, then get
 * quantized by gifenc. Reverse and boomerang loops are cheap here because
 * quantized GIF frames are small enough to buffer.
 */
export async function exportGif(entry: VideoEntry, options: GifExportOptions = {}): Promise<Blob> {
  const fps = Math.min(30, Math.max(1, options.fps ?? 12));
  const maxWidth = Math.max(64, options.maxWidth ?? 480);
  const loop = options.loop ?? "forward";

  const [mb, gifenc] = await Promise.all([import("mediabunny"), import("gifenc")]);
  const input = new mb.Input({ source: new mb.BlobSource(entry.file), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("[Retouch] No video track to export");

    const pipeline = createFramePipeline(entry.edits, entry.width, entry.height);
    const scale = Math.min(1, maxWidth / pipeline.outWidth);
    const gifW = Math.max(2, Math.round(pipeline.outWidth * scale));
    const gifH = Math.max(2, Math.round(pipeline.outHeight * scale));
    const gifCanvas = createCanvas(gifW, gifH);
    const gifCtx = gifCanvas.getContext("2d");
    if (!gifCtx) throw new Error("[Retouch] Failed to create GIF canvas");

    const sink = new mb.CanvasSink(track, { poolSize: 2 });
    const { start, end } = entry.edits.trim;
    // Playback speed compresses/stretches the sampled timeline.
    const speed = entry.edits.speed || 1;
    const step = (1 / fps) * speed;
    const delay = Math.round(1000 / fps);

    const frames: QuantizedFrame[] = [];
    for (let t = start; t < end - 1e-6; t += step) {
      const wrapped = await sink.getCanvas(Math.min(t, end));
      if (!wrapped) continue;
      const source = wrapped.canvas;
      const processed = pipeline.processFrame({
        draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) => {
          ctx.drawImage(source as CanvasImageSource, sx, sy, sw, sh, dx, dy, dw ?? sw, dh ?? sh);
        },
      });
      gifCtx.drawImage(processed, 0, 0, gifW, gifH);
      const data = gifCtx.getImageData(0, 0, gifW, gifH).data;
      const palette = gifenc.quantize(data, 256);
      frames.push({ index: gifenc.applyPalette(data, palette), palette });
    }
    pipeline.dispose();
    if (frames.length === 0) throw new Error("[Retouch] No frames in the selected range");

    let sequence: QuantizedFrame[];
    if (loop === "reverse") {
      sequence = [...frames].reverse();
    } else if (loop === "boomerang") {
      sequence = [...frames, ...frames.slice(1, -1).reverse()];
    } else {
      sequence = frames;
    }

    const gif = gifenc.GIFEncoder();
    for (const frame of sequence) {
      gif.writeFrame(frame.index, gifW, gifH, { palette: frame.palette, delay });
    }
    gif.finish();
    return new Blob([gif.bytes()], { type: "image/gif" });
  } finally {
    input.dispose?.();
  }
}
