/** The image formats a photo can be saved as. */
export type ImageFormat = "png" | "jpeg" | "webp" | "avif";

/**
 * Saving transparent areas in a format that can't keep them: fill them with
 * white, save as PNG instead, or don't save.
 */
export type FlattenChoice = "flatten" | "png" | "cancel";

export interface ImageFormatInfo {
  id: ImageFormat;
  /** What people call it: "JPG". */
  label: string;
  mime: string;
  extension: string;
  /** Whether it keeps transparent pixels. */
  alpha: boolean;
  /** A few words on when to pick it. */
  note: string;
}

/** Every format, in the order a menu lists them. */
export const IMAGE_FORMATS: readonly ImageFormatInfo[] = [
  {
    id: "png",
    label: "PNG",
    mime: "image/png",
    extension: "png",
    alpha: true,
    note: "Lossless, keeps transparency",
  },
  {
    id: "jpeg",
    label: "JPG",
    mime: "image/jpeg",
    extension: "jpg",
    alpha: false,
    note: "Small, no transparency",
  },
  {
    id: "webp",
    label: "WebP",
    mime: "image/webp",
    extension: "webp",
    alpha: true,
    note: "Smaller, keeps transparency",
  },
  {
    id: "avif",
    label: "AVIF",
    mime: "image/avif",
    extension: "avif",
    alpha: true,
    note: "Smallest, newer apps only",
  },
];

const PICKED_KEY = "rt-download-format";

/** The format this browser's user last picked to download in, or nothing yet. */
export function loadPickedFormat(): ImageFormat | null {
  try {
    const picked = localStorage.getItem(PICKED_KEY);
    return IMAGE_FORMATS.find((f) => f.id === picked)?.id ?? null;
  } catch {
    return null;
  }
}

export function savePickedFormat(format: ImageFormat): void {
  try {
    localStorage.setItem(PICKED_KEY, format);
  } catch {
    // Storage blocked: the pick lasts as long as the page.
  }
}

export function formatInfo(format: ImageFormat): ImageFormatInfo {
  return IMAGE_FORMATS.find((f) => f.id === format) ?? IMAGE_FORMATS[0];
}

/** "image/jpeg" → "jpeg"; null for a type that isn't one of ours. */
export function formatOfMime(mime: string): ImageFormat | null {
  const type = mime.toLowerCase() === "image/jpg" ? "image/jpeg" : mime.toLowerCase();
  return IMAGE_FORMATS.find((f) => f.mime === type)?.id ?? null;
}

/** "corgi.jpeg" saved as PNG → "corgi.png". */
export function downloadName(name: string, format: ImageFormat): string {
  const stem = name.replace(/\.[^./\\]+$/, "") || "image";
  return `${stem}.${formatInfo(format).extension}`;
}

let encodable: Promise<ImageFormat[]> | null = null;

/**
 * The formats this browser can write, in menu order. Every browser writes
 * PNG and JPG; WebP and AVIF depend on it (a browser that can't hands back a
 * PNG instead, which is how it's told). Asked once, then remembered.
 */
export function encodableFormats(): Promise<ImageFormat[]> {
  encodable ??= Promise.all(
    IMAGE_FORMATS.map(async (f) =>
      f.id === "png" || f.id === "jpeg" || (await canEncode(f.mime)) ? f.id : null,
    ),
  ).then((ids) => ids.filter((id): id is ImageFormat => id !== null));
  return encodable;
}

function canEncode(mime: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      if (!canvas.getContext("2d") || typeof canvas.toBlob !== "function") {
        resolve(false);
        return;
      }
      canvas.toBlob((blob) => resolve(blob?.type === mime), mime);
    } catch {
      resolve(false);
    }
  });
}

/** True when any pixel of the canvas is less than fully opaque. */
export function canvasHasTransparency(canvas: HTMLCanvasElement): boolean {
  const { width, height } = canvas;
  if (width === 0 || height === 0) return false;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  // In bands, so a large photo never needs a second copy of all its pixels.
  const band = Math.max(1, Math.floor(4_000_000 / width));
  for (let y = 0; y < height; y += band) {
    const rows = Math.min(band, height - y);
    const { data } = ctx.getImageData(0, y, width, rows);
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  }
  return false;
}
