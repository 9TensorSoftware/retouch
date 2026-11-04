// The fields of a photo's metadata a person can change, how each one's text
// is understood, and how the changes go into an exported file: EXIF and XMP
// in a JPEG, PNG or WebP, plus text chunks in a PNG. Only what was changed is
// written; exports otherwise carry no metadata at all.

import type { MetadataEdits, MetadataKey } from "../types";
import {
  formatExposure,
  formatTag,
  type MetadataField,
  type MetadataSource,
  type PhotoMetadata,
  trimNumber,
} from "./metadata";

interface Editable {
  /** What the undo history calls it. */
  label: string;
  /** The fields it speaks for: a raw row with one of these names edits it. */
  aliases: readonly string[];
  /** Fields that go when it changes, without being edits of it. */
  also?: readonly string[];
  /** Where the new value shows, once changed. */
  shows?: readonly [MetadataSource, string];
  /** The text as stored, or null when it can't be understood. Not given: plain text. */
  parse?: (text: string) => string | null;
  /** What to type, when the text wasn't understood. */
  hint?: string;
  /** Takes line breaks; everywhere else Enter finishes. */
  multiline?: boolean;
}

const number = String.raw`[+-]?\d+(?:[.,]\d+)?`;
const toNumber = (text: string): number =>
  Number.parseFloat(text.replace(",", ".").replace("−", "-"));

/** A number with an optional unit around it, within a range. */
function numeric(
  pattern: string,
  min: number,
  max: number,
  format: (n: number) => string,
): (text: string) => string | null {
  const re = new RegExp(`^${pattern}$`, "i");
  return (text) => {
    const m = text.replace("−", "-").match(re);
    if (!m) return null;
    const n = toNumber(m[1]);
    return n >= min && n <= max ? format(n) : null;
  };
}

function parseShutter(text: string): string | null {
  const m = text.match(
    /^(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+(?:[.,]\d+)?))?\s*(?:s|sec|seconds?|")?$/i,
  );
  if (!m) return null;
  const seconds = toNumber(m[1]) / (m[2] ? toNumber(m[2]) : 1);
  return seconds > 0 && seconds <= 3600 ? formatExposure(seconds) : null;
}

/** "2024-05-03 14:30:00 +02:00", from most ways of writing a date. */
function parseDate(text: string): string | null {
  const m = text.match(
    /^(\d{4})[-:/.](\d{1,2})[-:/.](\d{1,2})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (!m) return null;
  const [mo, d, hh, mm, ss] = [m[2], m[3], m[4] ?? "0", m[5] ?? "0", m[6] ?? "0"].map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = m[7] ? (/z/i.test(m[7]) ? "+00:00" : `${m[7].slice(0, 3)}:${m[7].slice(-2)}`) : "";
  return `${m[1]}-${pad(mo)}-${pad(d)} ${pad(hh)}:${pad(mm)}:${pad(ss)}${offset ? ` ${offset}` : ""}`;
}

/** One coordinate as signed degrees: 41.0082, 41.0082° N, or 41° 0′ 29.5″ N. */
function parseDegrees(text: string, positive: string, negative: string): number | null {
  const m = text
    .trim()
    .match(
      /^([+-]?\d+(?:\.\d+)?)\s*°?(?:\s*(\d+(?:\.\d+)?)\s*['′])?(?:\s*(\d+(?:\.\d+)?)\s*["″])?\s*([a-z])?$/i,
    );
  if (!m) return null;
  const hemisphere = m[4]?.toUpperCase();
  if (hemisphere && hemisphere !== positive && hemisphere !== negative) return null;
  const whole = Number.parseFloat(m[1]);
  const size = Math.abs(whole) + Number(m[2] ?? 0) / 60 + Number(m[3] ?? 0) / 3600;
  return whole < 0 !== (hemisphere === negative) ? -size : size;
}

function parseCoordinates(text: string): string | null {
  const parts = text.split(/[,;]|\s{2,}/);
  if (parts.length !== 2) return null;
  const lat = parseDegrees(parts[0], "N", "S");
  const lon = parseDegrees(parts[1], "E", "W");
  if (lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

function parseRating(text: string): string | null {
  const stars = text.match(/^[★☆]+$/) ? [...text].filter((c) => c === "★").length : Number(text);
  if (!Number.isInteger(stars) || stars < 0 || stars > 5) return null;
  return stars === 0 ? "" : String(stars);
}

function parseKeywords(text: string): string {
  const words = text
    .split(/[,;\n]/)
    .map((word) => word.trim())
    .filter(Boolean);
  return [...new Set(words)].join(", ");
}

const signed = (n: number): string => `${n > 0 ? "+" : ""}${trimNumber(n, 2)} EV`;

export const EDITABLE: Record<MetadataKey, Editable> = {
  fileName: { label: "Name", aliases: [] },
  make: { label: "Make", aliases: ["Make", "tiff:Make"], shows: ["exif", "Make"] },
  model: { label: "Model", aliases: ["Model", "tiff:Model"], shows: ["exif", "Model"] },
  lens: {
    label: "Lens",
    aliases: ["LensModel", "aux:Lens", "exifEX:LensModel"],
    also: ["LensMake", "LensSpecification"],
    shows: ["exif", "LensModel"],
  },
  serial: {
    label: "Serial number",
    aliases: ["BodySerialNumber", "aux:SerialNumber"],
    shows: ["exif", "BodySerialNumber"],
  },
  owner: {
    label: "Owner",
    aliases: ["OwnerName", "aux:OwnerName"],
    shows: ["exif", "OwnerName"],
  },
  software: {
    label: "Software",
    aliases: ["Software", "xmp:CreatorTool"],
    shows: ["exif", "Software"],
  },
  taken: {
    label: "Date taken",
    aliases: [
      "DateTimeOriginal",
      "DateTimeDigitized",
      "DateTime",
      "xmp:CreateDate",
      "photoshop:DateCreated",
      "DateCreated",
    ],
    also: ["OffsetTimeOriginal", "OffsetTimeDigitized", "OffsetTime", "TimeCreated"],
    parse: parseDate,
    hint: "Write it like 2024-05-03 14:30.",
  },
  shutter: {
    label: "Shutter",
    aliases: ["ExposureTime", "ShutterSpeedValue"],
    shows: ["exif", "ExposureTime"],
    parse: parseShutter,
    hint: "Write it like 1/250 or 2 s.",
  },
  aperture: {
    label: "Aperture",
    aliases: ["FNumber", "ApertureValue"],
    shows: ["exif", "FNumber"],
    parse: numeric(
      String.raw`(?:[fƒ]\s*/?\s*)?(\d+(?:[.,]\d+)?)`,
      0.5,
      256,
      (n) => `ƒ/${trimNumber(n, 1)}`,
    ),
    hint: "Write it like 2.8.",
  },
  iso: {
    label: "ISO",
    aliases: ["ISO"],
    shows: ["exif", "ISO"],
    parse: (text) => {
      const m = text.match(/^(?:iso\s*)?(\d+)$/i);
      const n = m ? Number(m[1]) : 0;
      return n >= 1 && n <= 65535 ? String(n) : null;
    },
    hint: "A whole number, like 400.",
  },
  focal: {
    label: "Focal length",
    aliases: ["FocalLength"],
    shows: ["exif", "FocalLength"],
    parse: numeric(
      String.raw`(\d+(?:[.,]\d+)?)\s*(?:mm)?`,
      0.1,
      10000,
      (n) => `${trimNumber(n, 1)} mm`,
    ),
    hint: "In millimeters, like 35.",
  },
  focal35: {
    label: "35mm equivalent",
    aliases: ["FocalLengthIn35mmFormat"],
    shows: ["exif", "FocalLengthIn35mmFormat"],
    parse: numeric(String.raw`(\d+)\s*(?:mm)?`, 1, 65535, (n) => `${n} mm`),
    hint: "Whole millimeters, like 50.",
  },
  bias: {
    label: "Exposure bias",
    aliases: ["ExposureBiasValue"],
    shows: ["exif", "ExposureBiasValue"],
    parse: numeric(`(${number})\\s*(?:ev)?`, -32, 32, signed),
    hint: "In stops, like -0.7.",
  },
  coordinates: {
    label: "Location",
    aliases: [],
    also: [
      "GPSLatitude",
      "GPSLatitudeRef",
      "GPSLongitude",
      "GPSLongitudeRef",
      "exif:GPSLatitude",
      "exif:GPSLongitude",
    ],
    parse: parseCoordinates,
    hint: "Write it like 41.0082, 28.9784.",
  },
  altitude: {
    label: "Altitude",
    aliases: ["GPSAltitude"],
    also: ["GPSAltitudeRef", "exif:GPSAltitude"],
    shows: ["gps", "GPSAltitude"],
    parse: numeric(`(${number})\\s*m?`, -20000, 100000, (n) => `${trimNumber(n, 1)} m`),
    hint: "In meters, like 39.",
  },
  facing: {
    label: "Facing",
    aliases: ["GPSImgDirection"],
    also: ["GPSImgDirectionRef"],
    shows: ["gps", "GPSImgDirection"],
    parse: numeric(String.raw`(\d+(?:[.,]\d+)?)\s*°?`, 0, 360, (n) => trimNumber(n, 2)),
    hint: "Degrees from north, 0 to 360.",
  },
  title: {
    label: "Title",
    aliases: ["dc:title", "ObjectName", "XPTitle", "Title"],
    shows: ["xmp", "dc:title"],
  },
  caption: {
    label: "Caption",
    aliases: [
      "ImageDescription",
      "dc:description",
      "Caption-Abstract",
      "Description",
      "XPComment",
      "UserComment",
      "Comment",
    ],
    shows: ["exif", "ImageDescription"],
    multiline: true,
  },
  keywords: {
    label: "Keywords",
    aliases: ["dc:subject", "Keywords", "XPKeywords"],
    shows: ["xmp", "dc:subject"],
    parse: parseKeywords,
  },
  creator: {
    label: "Creator",
    aliases: ["Artist", "dc:creator", "By-line", "XPAuthor", "Author"],
    shows: ["exif", "Artist"],
  },
  copyright: {
    label: "Copyright",
    aliases: ["Copyright", "dc:rights", "CopyrightNotice"],
    shows: ["exif", "Copyright"],
  },
  license: {
    label: "License",
    aliases: ["xmpRights:WebStatement"],
    shows: ["xmp", "xmpRights:WebStatement"],
  },
  source: { label: "Source", aliases: ["dc:source", "Source"], shows: ["xmp", "dc:source"] },
  rating: {
    label: "Rating",
    aliases: ["xmp:Rating", "Rating"],
    shows: ["xmp", "xmp:Rating"],
    parse: parseRating,
    hint: "From 0 to 5.",
  },
  city: {
    label: "City",
    aliases: ["City", "photoshop:City", "Iptc4xmpCore:Location"],
    shows: ["xmp", "photoshop:City"],
  },
  state: {
    label: "State",
    aliases: ["Province-State", "photoshop:State"],
    shows: ["xmp", "photoshop:State"],
  },
  country: {
    label: "Country",
    aliases: ["Country-PrimaryLocationName", "photoshop:Country"],
    shows: ["xmp", "photoshop:Country"],
  },
};

const ALIASES = new Map(
  (Object.keys(EDITABLE) as MetadataKey[]).flatMap((key) =>
    EDITABLE[key].aliases.map((name) => [name, key] as const),
  ),
);

/** The editable field a raw field belongs to, if any. */
export const fieldKey = (name: string): MetadataKey | undefined => ALIASES.get(name);

/**
 * The text as it would be stored, "" for empty, or null when it can't be
 * understood. A blank always clears.
 */
export function parseMetadataValue(key: MetadataKey, text: string): string | null {
  const def = EDITABLE[key];
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (def.parse) return def.parse(trimmed);
  return def.multiline ? trimmed : trimmed.replace(/\s*\n\s*/g, " ");
}

/** A new file name, keeping the file's extension, since the format doesn't change with it. */
export function parseFileName(text: string, current: string): string | null {
  const extension = current.match(/\.[^.]+$/)?.[0] ?? "";
  const stem = text
    .trim()
    // biome-ignore lint/suspicious/noControlCharactersInRegex: a file name can't hold them
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\.(jpe?g|png|webp|gif|avif|heic|mp4|mov|webm)$/i, "");
  return stem ? stem + extension : null;
}

export const metadataHint = (key: MetadataKey): string =>
  EDITABLE[key].hint ?? "That can't be read.";

export const metadataTakesLines = (key: MetadataKey): boolean => !!EDITABLE[key].multiline;

export const metadataLabel = (key: MetadataKey): string => EDITABLE[key].label;

export function metadataEdited(edits: MetadataEdits | undefined): boolean {
  return !!edits && Object.keys(edits).length > 0;
}

type Rational = [number, number];

/** A coordinate's whole size as degrees, minutes and seconds. */
function dms(value: number): Rational[] {
  const size = Math.abs(value);
  const d = Math.floor(size);
  const m = Math.floor((size - d) * 60);
  const s = (size - d - m / 60) * 3600;
  return [
    [d, 1],
    [m, 1],
    [Math.round(s * 1000), 1000],
  ];
}

const coordinatesOf = (value: string): [number, number] => {
  const [lat, lon] = value.split(",").map(Number);
  return [lat, lon];
};

/** The metadata with the edits laid over it: what the file will say once exported. */
export function applyMetadataEdits(meta: PhotoMetadata, edits: MetadataEdits = {}): PhotoMetadata {
  const out: PhotoMetadata = {
    ...meta,
    fields: [...meta.fields],
    gps: meta.gps && { ...meta.gps },
  };
  for (const key of Object.keys(edits) as MetadataKey[]) {
    const value = edits[key] ?? "";
    const def = EDITABLE[key];
    const gone = new Set([...def.aliases, ...(def.also ?? [])]);
    out.fields = out.fields.filter((field) => !gone.has(field.name));
    const fresh: MetadataField[] = [];
    if (value && def.shows) fresh.push({ source: def.shows[0], name: def.shows[1], value });
    if (key === "taken" && value) {
      const [date, time, offset] = value.split(" ");
      const exif = `${date.replaceAll("-", ":")} ${time}`;
      fresh.push({ source: "exif", name: "DateTimeOriginal", value: exif });
      if (offset) fresh.push({ source: "exif", name: "OffsetTimeOriginal", value: offset });
    }
    if (key === "coordinates") {
      if (value) {
        const [latitude, longitude] = coordinatesOf(value);
        out.gps = { ...out.gps, latitude, longitude };
        fresh.push(
          { source: "gps", name: "GPSLatitudeRef", value: latitude < 0 ? "S" : "N" },
          { source: "gps", name: "GPSLatitude", value: formatTag("GPSLatitude", dms(latitude)) },
          { source: "gps", name: "GPSLongitudeRef", value: longitude < 0 ? "W" : "E" },
          { source: "gps", name: "GPSLongitude", value: formatTag("GPSLongitude", dms(longitude)) },
        );
      } else {
        out.gps = undefined;
      }
    }
    if (key === "altitude" && out.gps) {
      out.gps = { ...out.gps, altitude: value ? Number.parseFloat(value) : undefined };
    }
    out.fields.push(...fresh);
  }
  return out;
}

// ── Writing ──────────────────────────────────────────────────────────────

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

interface Tag {
  tag: number;
  type: number;
  count: number;
  data: Uint8Array;
}

// Non-ASCII text goes in as UTF-8, as exiftool and most software read it.
function asciiTag(tag: number, text: string): Tag {
  const data = utf8(`${text}\0`);
  return { tag, type: 2, count: data.length, data };
}

function shortTag(tag: number, value: number): Tag {
  const data = new Uint8Array(2);
  new DataView(data.buffer).setUint16(0, value, true);
  return { tag, type: 3, count: 1, data };
}

function rationalTag(tag: number, values: readonly Rational[], type = 5): Tag {
  const data = new Uint8Array(values.length * 8);
  const view = new DataView(data.buffer);
  values.forEach(([a, b], i) => {
    view.setInt32(i * 8, a, true);
    view.setInt32(i * 8 + 4, b, true);
  });
  return { tag, type, count: values.length, data };
}

const byteTag = (tag: number, bytes: readonly number[], type = 1): Tag => ({
  tag,
  type,
  count: bytes.length,
  data: Uint8Array.from(bytes),
});

/** Windows' own tags: little-endian UTF-16, null-terminated. */
function utf16Tag(tag: number, text: string): Tag {
  const data = new Uint8Array((text.length + 1) * 2);
  const view = new DataView(data.buffer);
  for (let i = 0; i < text.length; i++) view.setUint16(i * 2, text.charCodeAt(i), true);
  return { tag, type: 1, count: data.length, data };
}

const hundredths = (value: number): Rational => [Math.round(value * 100), 100];

function exifTags(edits: MetadataEdits): { main: Tag[]; exif: Tag[]; gps: Tag[] } {
  const main: Tag[] = [];
  const exif: Tag[] = [];
  const gps: Tag[] = [];
  const text = (key: MetadataKey, into: Tag[], tag: number) => {
    const value = edits[key];
    if (value) into.push(asciiTag(tag, value));
  };
  text("caption", main, 270);
  text("make", main, 271);
  text("model", main, 272);
  text("software", main, 305);
  text("creator", main, 315);
  text("copyright", main, 33432);
  if (edits.rating) main.push(shortTag(18246, Number(edits.rating)));
  if (edits.title) main.push(utf16Tag(40091, edits.title));
  if (edits.keywords) main.push(utf16Tag(40094, edits.keywords.replaceAll(", ", ";")));

  text("owner", exif, 42032);
  text("serial", exif, 42033);
  text("lens", exif, 42036);
  if (edits.shutter) {
    const fraction = edits.shutter.match(/^1\/(\d+)/);
    const seconds = Number.parseFloat(edits.shutter);
    exif.push(
      rationalTag(33434, [fraction ? [1, Number(fraction[1])] : [Math.round(seconds * 10), 10]]),
    );
  }
  if (edits.aperture) {
    exif.push(rationalTag(33437, [hundredths(Number.parseFloat(edits.aperture.slice(2)))]));
  }
  if (edits.iso) exif.push(shortTag(34855, Number(edits.iso)));
  if (edits.taken) {
    const [date, time, offset] = edits.taken.split(" ");
    exif.push(asciiTag(36867, `${date.replaceAll("-", ":")} ${time}`));
    if (offset) exif.push(asciiTag(36881, offset));
  }
  if (edits.bias) exif.push(rationalTag(37380, [hundredths(Number.parseFloat(edits.bias))], 10));
  if (edits.focal) exif.push(rationalTag(37386, [hundredths(Number.parseFloat(edits.focal))]));
  if (edits.focal35) exif.push(shortTag(41989, Number.parseInt(edits.focal35, 10)));
  // The Exif IFD says which version of the standard it follows.
  if (exif.length) exif.push(byteTag(36864, [0x30, 0x32, 0x33, 0x32], 7));

  if (edits.coordinates) {
    const [lat, lon] = coordinatesOf(edits.coordinates);
    gps.push(
      asciiTag(1, lat < 0 ? "S" : "N"),
      rationalTag(2, dms(lat)),
      asciiTag(3, lon < 0 ? "W" : "E"),
      rationalTag(4, dms(lon)),
    );
  }
  if (edits.altitude) {
    const altitude = Number.parseFloat(edits.altitude);
    gps.push(byteTag(5, [altitude < 0 ? 1 : 0]), rationalTag(6, [hundredths(Math.abs(altitude))]));
  }
  if (edits.facing) {
    gps.push(asciiTag(16, "T"), rationalTag(17, [hundredths(Number.parseFloat(edits.facing))]));
  }
  if (gps.length) gps.push(byteTag(0, [2, 3, 0, 0]));
  return { main, exif, gps };
}

/** A TIFF block holding the edits, or null when none of them are EXIF's. */
export function buildExif(edits: MetadataEdits): Uint8Array | null {
  const { main, exif, gps } = exifTags(edits);
  if (!main.length && !exif.length && !gps.length) return null;
  const extra = (tags: Tag[]) =>
    tags.reduce((sum, t) => sum + (t.data.length > 4 ? (t.data.length + 1) & ~1 : 0), 0);
  const size = (tags: Tag[]) => 2 + tags.length * 12 + 4 + extra(tags);
  const pointers = (exif.length ? 1 : 0) + (gps.length ? 1 : 0);
  const mainSize = 2 + (main.length + pointers) * 12 + 4 + extra(main);
  const exifAt = 8 + mainSize;
  const gpsAt = exifAt + (exif.length ? size(exif) : 0);
  const pointer = (tag: number, at: number): Tag => {
    const data = new Uint8Array(4);
    new DataView(data.buffer).setUint32(0, at, true);
    return { tag, type: 4, count: 1, data };
  };
  if (exif.length) main.push(pointer(0x8769, exifAt));
  if (gps.length) main.push(pointer(0x8825, gpsAt));

  const out = new Uint8Array(gpsAt + (gps.length ? size(gps) : 0));
  const view = new DataView(out.buffer);
  out.set([0x49, 0x49, 0x2a, 0], 0);
  view.setUint32(4, 8, true);
  const writeIfd = (tags: Tag[], at: number) => {
    const sorted = [...tags].sort((a, b) => a.tag - b.tag);
    view.setUint16(at, sorted.length, true);
    let spill = at + 2 + sorted.length * 12 + 4;
    sorted.forEach((t, i) => {
      const entry = at + 2 + i * 12;
      view.setUint16(entry, t.tag, true);
      view.setUint16(entry + 2, t.type, true);
      view.setUint32(entry + 4, t.count, true);
      if (t.data.length <= 4) {
        out.set(t.data, entry + 8);
      } else {
        view.setUint32(entry + 8, spill, true);
        out.set(t.data, spill);
        spill += (t.data.length + 1) & ~1;
      }
    });
  };
  writeIfd(main, 8);
  if (exif.length) writeIfd(exif, exifAt);
  if (gps.length) writeIfd(gps, gpsAt);
  return out;
}

const escapeXml = (text: string): string =>
  text
    // biome-ignore lint/suspicious/noControlCharactersInRegex: XML can't hold them
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** An XMP packet holding the edits, or null when none of them are XMP's. */
export function buildXmp(edits: MetadataEdits): string | null {
  const parts: string[] = [];
  const alt = (name: string, value?: string) => {
    if (value) {
      parts.push(
        `<${name}><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(value)}</rdf:li></rdf:Alt></${name}>`,
      );
    }
  };
  const list = (name: string, kind: "Bag" | "Seq", values: readonly string[]) => {
    if (values.length) {
      const items = values.map((v) => `<rdf:li>${escapeXml(v)}</rdf:li>`).join("");
      parts.push(`<${name}><rdf:${kind}>${items}</rdf:${kind}></${name}>`);
    }
  };
  const simple = (name: string, value?: string) => {
    if (value) parts.push(`<${name}>${escapeXml(value)}</${name}>`);
  };
  alt("dc:title", edits.title);
  alt("dc:description", edits.caption);
  alt("dc:rights", edits.copyright);
  list("dc:creator", "Seq", edits.creator ? [edits.creator] : []);
  list("dc:subject", "Bag", edits.keywords ? edits.keywords.split(", ") : []);
  simple("dc:source", edits.source);
  simple("xmp:Rating", edits.rating);
  simple("xmp:CreatorTool", edits.software);
  if (edits.taken) {
    const [date, time, offset] = edits.taken.split(" ");
    simple("xmp:CreateDate", `${date}T${time}${offset ?? ""}`);
  }
  simple("xmpRights:WebStatement", edits.license);
  simple("photoshop:City", edits.city);
  simple("photoshop:State", edits.state);
  simple("photoshop:Country", edits.country);
  if (!parts.length) return null;
  return (
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">' +
    parts.join("") +
    '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
  );
}

/** A JPEG segment holds at most this much past its marker and length. */
const JPEG_SEGMENT = 65533;

function jpegWith(bytes: Uint8Array, exif: Uint8Array | null, xmp: string | null): Uint8Array {
  const segment = (body: Uint8Array): Uint8Array[] => {
    if (body.length > JPEG_SEGMENT) {
      console.warn("[Retouch] Metadata too long for a JPEG segment was left out");
      return [];
    }
    const head = new Uint8Array(4);
    head[0] = 0xff;
    head[1] = 0xe1;
    new DataView(head.buffer).setUint16(2, body.length + 2);
    return [head, body];
  };
  // After the JFIF header when there is one, which must come first.
  let at = 2;
  if (bytes[2] === 0xff && bytes[3] === 0xe0) at = 4 + ((bytes[4] << 8) | bytes[5]);
  const parts = [bytes.subarray(0, at)];
  if (exif) parts.push(...segment(concat([utf8("Exif\0\0"), exif])));
  if (xmp) parts.push(...segment(concat([utf8("http://ns.adobe.com/xap/1.0/\0"), utf8(xmp)])));
  parts.push(bytes.subarray(at));
  return concat(parts);
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(utf8(type), 4);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc32(out.subarray(4, data.length + 8)));
  return out;
}

/** An uncompressed international text chunk, which can hold any language. */
const pngText = (keyword: string, text: string): Uint8Array =>
  pngChunk("iTXt", concat([utf8(keyword), Uint8Array.of(0, 0, 0, 0, 0), utf8(text)]));

function pngWith(
  bytes: Uint8Array,
  exif: Uint8Array | null,
  xmp: string | null,
  edits: MetadataEdits,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  if (exif) chunks.push(pngChunk("eXIf", exif));
  if (xmp) chunks.push(pngText("XML:com.adobe.xmp", xmp));
  // The keywords PNG itself defines.
  const keywords: Array<[string, string | undefined]> = [
    ["Title", edits.title],
    ["Description", edits.caption],
    ["Author", edits.creator],
    ["Copyright", edits.copyright],
    ["Software", edits.software],
    ["Source", edits.source],
  ];
  for (const [keyword, value] of keywords) if (value) chunks.push(pngText(keyword, value));
  // Right after the header: 8 bytes of signature and the 25 of IHDR.
  const at = 33;
  return concat([bytes.subarray(0, at), ...chunks, bytes.subarray(at)]);
}

function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + ((data.length + 1) & ~1));
  out.set(utf8(type), 0);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function webpWith(bytes: Uint8Array, exif: Uint8Array | null, xmp: string | null): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  for (let at = 12; at + 8 <= bytes.length; ) {
    const size = view.getUint32(at + 4, true);
    chunks.push({
      type: String.fromCharCode(...bytes.subarray(at, at + 4)),
      data: bytes.subarray(at + 8, at + 8 + size),
    });
    at += 8 + ((size + 1) & ~1);
  }
  // Metadata needs the extended header; a simple file gets one from its frame.
  let header = chunks.find((c) => c.type === "VP8X")?.data;
  if (!header) {
    const frame = chunks.find((c) => c.type === "VP8 " || c.type === "VP8L");
    if (!frame) return bytes;
    const d = frame.data;
    const lossless = frame.type === "VP8L";
    const width = lossless ? (d[1] | ((d[2] & 0x3f) << 8)) + 1 : (d[6] | (d[7] << 8)) & 0x3fff;
    const height = lossless
      ? (((d[2] >> 6) | (d[3] << 2) | ((d[4] & 0x0f) << 10)) & 0x3fff) + 1
      : (d[8] | (d[9] << 8)) & 0x3fff;
    const made = new Uint8Array(10);
    if (lossless && d[4] & 0x10) made[0] |= 0x10;
    if (chunks.some((c) => c.type === "ALPH")) made[0] |= 0x10;
    made[4] = (width - 1) & 0xff;
    made[5] = ((width - 1) >> 8) & 0xff;
    made[6] = ((width - 1) >> 16) & 0xff;
    made[7] = (height - 1) & 0xff;
    made[8] = ((height - 1) >> 8) & 0xff;
    made[9] = ((height - 1) >> 16) & 0xff;
    header = made;
  } else {
    header = header.slice();
  }
  if (exif) header[0] |= 0x08;
  if (xmp) header[0] |= 0x04;
  const body = concat([
    riffChunk("VP8X", header),
    ...chunks.filter((c) => c.type !== "VP8X").map((c) => riffChunk(c.type, c.data)),
    ...(exif ? [riffChunk("EXIF", exif)] : []),
    ...(xmp ? [riffChunk("XMP ", utf8(xmp))] : []),
  ]);
  const head = new Uint8Array(12);
  head.set(utf8("RIFF"), 0);
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  head.set(utf8("WEBP"), 8);
  return concat([head, body]);
}

/** The file with the edits written into it, by what the bytes say the file is. */
export function writeMetadata(bytes: Uint8Array, edits: MetadataEdits): Uint8Array {
  const exif = buildExif(edits);
  const xmp = buildXmp(edits);
  if (!exif && !xmp) return bytes;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegWith(bytes, exif, xmp);
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return pngWith(bytes, exif, xmp, edits);
  if (bytes[0] === 0x52 && bytes[8] === 0x57) return webpWith(bytes, exif, xmp);
  return bytes;
}

/** An exported file carrying the edits; the same file when there are none. */
export async function embedMetadata(blob: Blob, edits: MetadataEdits | undefined): Promise<Blob> {
  if (!edits || !Object.entries(edits).some(([key, value]) => value && key !== "fileName")) {
    return blob;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const out = writeMetadata(bytes, edits);
  return out === bytes ? blob : new Blob([out as BlobPart], { type: blob.type });
}
