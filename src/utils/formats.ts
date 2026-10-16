/** What people call a format, keyed by MIME type. */
const LABELS: Record<string, string> = {
  "image/jpeg": "JPG",
  "image/jpg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
  "image/gif": "GIF",
  "image/avif": "AVIF",
  "image/heic": "HEIC",
  "image/heif": "HEIF",
  "image/bmp": "BMP",
  "image/tiff": "TIFF",
  "image/svg+xml": "SVG",
  "video/mp4": "MP4",
  "video/quicktime": "MOV",
  "video/webm": "WebM",
  "video/ogg": "OGV",
  "video/x-matroska": "MKV",
};

/** "image/png" → "PNG"; unknown types fall back to their upper-cased subtype. */
export function formatLabel(mime: string): string {
  const known = LABELS[mime.toLowerCase()];
  if (known) return known;
  const subtype = mime.split("/")[1] ?? mime;
  return subtype.replace(/^x-/, "").toUpperCase();
}

/** Format names for a list of MIME types, in order, without repeats. */
export function formatNames(types: string[]): string[] {
  return [...new Set(types.map(formatLabel))];
}

/** "JPG, PNG or WebP". */
export function listOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

/** "840 KB", "2.4 MB", "10 MB" — one decimal, dropped when it's zero. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const [value, unit] =
    bytes < 1024 * 1024
      ? [bytes / 1024, "KB"]
      : bytes < 1024 ** 3
        ? [bytes / 1024 ** 2, "MB"]
        : [bytes / 1024 ** 3, "GB"];
  return `${value.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

/** A length of time in words: "45 seconds", "2 minutes", "1.5 minutes". */
export function formatSpan(seconds: number): string {
  if (seconds < 90) {
    const s = Math.round(seconds);
    return `${s} ${s === 1 ? "second" : "seconds"}`;
  }
  const m = Math.round((seconds / 60) * 10) / 10;
  return `${m} minutes`;
}
