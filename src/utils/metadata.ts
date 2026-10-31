// Reads the metadata a photo file carries: EXIF (camera, exposure, GPS),
// XMP, IPTC, the ICC profile, and the container's own fields (PNG text
// chunks, JPEG comments, pixel density). JPEG, PNG and WebP; no network,
// no dependencies. Everything is collected as raw fields, grouped by where
// it came from, and `describeMetadata` turns that into readable sections.

export type MetadataSource =
  | "file"
  | "exif"
  | "gps"
  | "xmp"
  | "iptc"
  | "icc"
  | "png"
  | "jpeg"
  | "webp";

export interface MetadataField {
  source: MetadataSource;
  /** The field's own name: an EXIF tag name, an XMP property, a PNG keyword. */
  name: string;
  /** Readable value. */
  value: string;
}

export interface PhotoMetadata {
  format: "jpeg" | "png" | "webp" | "unknown";
  /** Every field found, in file order. */
  fields: MetadataField[];
  /** Decimal degrees, when the photo has a usable GPS position. */
  gps?: { latitude: number; longitude: number; altitude?: number };
  /** The file carries C2PA Content Credentials (provenance manifest). */
  contentCredentials: boolean;
  /** An EXIF thumbnail is embedded. */
  thumbnail: boolean;
}

// ── TIFF / EXIF ──────────────────────────────────────────────────────────

const IFD0_TAGS: Record<number, string> = {
  256: "ImageWidth",
  257: "ImageHeight",
  258: "BitsPerSample",
  259: "Compression",
  262: "PhotometricInterpretation",
  270: "ImageDescription",
  271: "Make",
  272: "Model",
  274: "Orientation",
  277: "SamplesPerPixel",
  282: "XResolution",
  283: "YResolution",
  296: "ResolutionUnit",
  305: "Software",
  306: "DateTime",
  315: "Artist",
  318: "WhitePoint",
  319: "PrimaryChromaticities",
  513: "ThumbnailOffset",
  514: "ThumbnailLength",
  529: "YCbCrCoefficients",
  531: "YCbCrPositioning",
  532: "ReferenceBlackWhite",
  18246: "Rating",
  18249: "RatingPercent",
  33432: "Copyright",
  34665: "ExifIFD",
  34853: "GPSIFD",
  40091: "XPTitle",
  40092: "XPComment",
  40093: "XPAuthor",
  40094: "XPKeywords",
  40095: "XPSubject",
  50341: "PrintIM",
  // Exif sub-IFD
  33434: "ExposureTime",
  33437: "FNumber",
  34850: "ExposureProgram",
  34852: "SpectralSensitivity",
  34855: "ISO",
  34864: "SensitivityType",
  34866: "RecommendedExposureIndex",
  36864: "ExifVersion",
  36867: "DateTimeOriginal",
  36868: "DateTimeDigitized",
  36880: "OffsetTime",
  36881: "OffsetTimeOriginal",
  36882: "OffsetTimeDigitized",
  37121: "ComponentsConfiguration",
  37122: "CompressedBitsPerPixel",
  37377: "ShutterSpeedValue",
  37378: "ApertureValue",
  37379: "BrightnessValue",
  37380: "ExposureBiasValue",
  37381: "MaxApertureValue",
  37382: "SubjectDistance",
  37383: "MeteringMode",
  37384: "LightSource",
  37385: "Flash",
  37386: "FocalLength",
  37396: "SubjectArea",
  37500: "MakerNote",
  37510: "UserComment",
  37520: "SubSecTime",
  37521: "SubSecTimeOriginal",
  37522: "SubSecTimeDigitized",
  40960: "FlashpixVersion",
  40961: "ColorSpace",
  40962: "PixelXDimension",
  40963: "PixelYDimension",
  40964: "RelatedSoundFile",
  40965: "InteropIFD",
  41486: "FocalPlaneXResolution",
  41487: "FocalPlaneYResolution",
  41488: "FocalPlaneResolutionUnit",
  41493: "ExposureIndex",
  41495: "SensingMethod",
  41728: "FileSource",
  41729: "SceneType",
  41730: "CFAPattern",
  41985: "CustomRendered",
  41986: "ExposureMode",
  41987: "WhiteBalance",
  41988: "DigitalZoomRatio",
  41989: "FocalLengthIn35mmFormat",
  41990: "SceneCaptureType",
  41991: "GainControl",
  41992: "Contrast",
  41993: "Saturation",
  41994: "Sharpness",
  41996: "SubjectDistanceRange",
  42016: "ImageUniqueID",
  42032: "OwnerName",
  42033: "BodySerialNumber",
  42034: "LensSpecification",
  42035: "LensMake",
  42036: "LensModel",
  42037: "LensSerialNumber",
  42080: "CompositeImage",
  42240: "Gamma",
  // Interop
  1: "InteropIndex",
  2: "InteropVersion",
};

const GPS_TAGS: Record<number, string> = {
  0: "GPSVersionID",
  1: "GPSLatitudeRef",
  2: "GPSLatitude",
  3: "GPSLongitudeRef",
  4: "GPSLongitude",
  5: "GPSAltitudeRef",
  6: "GPSAltitude",
  7: "GPSTimeStamp",
  8: "GPSSatellites",
  9: "GPSStatus",
  10: "GPSMeasureMode",
  11: "GPSDOP",
  12: "GPSSpeedRef",
  13: "GPSSpeed",
  14: "GPSTrackRef",
  15: "GPSTrack",
  16: "GPSImgDirectionRef",
  17: "GPSImgDirection",
  18: "GPSMapDatum",
  19: "GPSDestLatitudeRef",
  20: "GPSDestLatitude",
  21: "GPSDestLongitudeRef",
  22: "GPSDestLongitude",
  23: "GPSDestBearingRef",
  24: "GPSDestBearing",
  25: "GPSDestDistanceRef",
  26: "GPSDestDistance",
  27: "GPSProcessingMethod",
  28: "GPSAreaInformation",
  29: "GPSDateStamp",
  30: "GPSDifferential",
  31: "GPSHPositioningError",
};

/** Tags whose numeric codes mean something. */
const ENUMS: Record<string, Record<number, string>> = {
  Orientation: {
    1: "Normal",
    2: "Mirrored",
    3: "Rotated 180°",
    4: "Mirrored vertically",
    5: "Mirrored, rotated 90° left",
    6: "Rotated 90° right",
    7: "Mirrored, rotated 90° right",
    8: "Rotated 90° left",
  },
  ResolutionUnit: { 1: "None", 2: "inches", 3: "cm" },
  FocalPlaneResolutionUnit: { 1: "None", 2: "inches", 3: "cm", 4: "mm", 5: "µm" },
  ExposureProgram: {
    0: "Not defined",
    1: "Manual",
    2: "Program",
    3: "Aperture priority",
    4: "Shutter priority",
    5: "Creative",
    6: "Action",
    7: "Portrait",
    8: "Landscape",
  },
  MeteringMode: {
    0: "Unknown",
    1: "Average",
    2: "Center-weighted",
    3: "Spot",
    4: "Multi-spot",
    5: "Pattern",
    6: "Partial",
    255: "Other",
  },
  LightSource: {
    0: "Unknown",
    1: "Daylight",
    2: "Fluorescent",
    3: "Tungsten",
    4: "Flash",
    9: "Fine weather",
    10: "Cloudy",
    11: "Shade",
    17: "Standard light A",
    18: "Standard light B",
    19: "Standard light C",
    21: "D65",
    24: "Studio tungsten",
    255: "Other",
  },
  ColorSpace: { 1: "sRGB", 2: "Adobe RGB", 65535: "Uncalibrated" },
  ExposureMode: { 0: "Auto", 1: "Manual", 2: "Auto bracket" },
  WhiteBalance: { 0: "Auto", 1: "Manual" },
  SceneCaptureType: { 0: "Standard", 1: "Landscape", 2: "Portrait", 3: "Night" },
  SensingMethod: {
    1: "Not defined",
    2: "One-chip color area",
    3: "Two-chip color area",
    4: "Three-chip color area",
    5: "Color sequential area",
    7: "Trilinear",
    8: "Color sequential linear",
  },
  CustomRendered: { 0: "Normal", 1: "Custom" },
  GainControl: {
    0: "None",
    1: "Low gain up",
    2: "High gain up",
    3: "Low gain down",
    4: "High gain down",
  },
  Contrast: { 0: "Normal", 1: "Soft", 2: "Hard" },
  Saturation: { 0: "Normal", 1: "Low", 2: "High" },
  Sharpness: { 0: "Normal", 1: "Soft", 2: "Hard" },
  SubjectDistanceRange: { 0: "Unknown", 1: "Macro", 2: "Close", 3: "Distant" },
  YCbCrPositioning: { 1: "Centered", 2: "Co-sited" },
  Compression: { 1: "Uncompressed", 6: "JPEG" },
  SensitivityType: {
    0: "Unknown",
    1: "Standard output sensitivity",
    2: "Recommended exposure index",
    3: "ISO speed",
  },
  CompositeImage: {
    0: "Unknown",
    1: "Not composite",
    2: "General composite",
    3: "Composite captured while shooting",
  },
  GPSAltitudeRef: { 0: "Above sea level", 1: "Below sea level" },
  GPSDifferential: { 0: "No correction", 1: "Differential corrected" },
};

/** Flash bits → words. */
function flashText(v: number): string {
  if (!(v & 1)) return v & 0x18 ? "Off, did not fire" : "Did not fire";
  const parts = ["Fired"];
  if ((v & 0x18) === 0x18) parts.push("auto");
  if ((v & 0x18) === 0x08) parts.push("compulsory");
  if (v & 0x40) parts.push("red-eye reduction");
  if ((v & 0x06) === 0x04) parts.push("return not detected");
  if ((v & 0x06) === 0x06) parts.push("return detected");
  return parts.join(", ");
}

/** A raw tag value: numbers (rationals as [num, den]), text, or bytes. */
export type TagValue = string | number | Array<number | [number, number]> | Uint8Array;

export interface TiffTags {
  /** IFD0 and Exif sub-IFD tags, by name. */
  exif: Map<string, TagValue>;
  gps: Map<string, TagValue>;
  thumbnail: boolean;
}

const TYPE_SIZE: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  13: 4,
};

/** Parse a TIFF structure (EXIF payload) starting at `start` in `bytes`. */
export function readTiff(bytes: Uint8Array, start = 0): TiffTags | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (start + 8 > bytes.length) return null;
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const le = order === 0x4949;
  const u16 = (o: number) => view.getUint16(start + o, le);
  const u32 = (o: number) => view.getUint32(start + o, le);
  const inRange = (o: number, n: number) => o >= 0 && start + o + n <= bytes.length;
  if (u16(2) !== 42) return null;

  const result: TiffTags = { exif: new Map(), gps: new Map(), thumbnail: false };
  const seen = new Set<number>();

  function value(type: number, count: number, at: number): TagValue | null {
    const size = TYPE_SIZE[type];
    if (!size || count === 0 || !inRange(at, size * count)) return null;
    const abs = start + at;
    if (type === 2) {
      // ASCII by the spec, but cameras and apps write UTF-8.
      return decodeMaybeUtf8(bytes.subarray(abs, abs + count))
        .replace(/\0+$/, "")
        .trim();
    }
    if (type === 1 || type === 7 || type === 6) {
      if (type === 6) return Array.from({ length: count }, (_, i) => view.getInt8(abs + i));
      return bytes.slice(abs, abs + count);
    }
    const out: Array<number | [number, number]> = [];
    for (let i = 0; i < count; i++) {
      const p = abs + i * size;
      switch (type) {
        case 3:
          out.push(view.getUint16(p, le));
          break;
        case 8:
          out.push(view.getInt16(p, le));
          break;
        case 4:
        case 13:
          out.push(view.getUint32(p, le));
          break;
        case 9:
          out.push(view.getInt32(p, le));
          break;
        case 5:
          out.push([view.getUint32(p, le), view.getUint32(p + 4, le)]);
          break;
        case 10:
          out.push([view.getInt32(p, le), view.getInt32(p + 4, le)]);
          break;
        case 11:
          out.push(view.getFloat32(p, le));
          break;
        case 12:
          out.push(view.getFloat64(p, le));
          break;
      }
    }
    return out.length === 1 && typeof out[0] === "number" ? out[0] : out;
  }

  function readIfd(
    offset: number,
    names: Record<number, string>,
    into: Map<string, TagValue>,
  ): number {
    if (seen.has(offset) || !inRange(offset, 2)) return 0;
    seen.add(offset);
    const n = u16(offset);
    if (!inRange(offset + 2, n * 12 + 4)) return 0;
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const size = (TYPE_SIZE[type] ?? 0) * count;
      const at = size <= 4 ? e + 8 : u32(e + 8);
      if (tag === 0x8769 || tag === 0x8825 || tag === 0xa005) {
        const sub = u32(e + 8);
        if (tag === 0x8825) readIfd(sub, GPS_TAGS, result.gps);
        else readIfd(sub, IFD0_TAGS, into);
        continue;
      }
      const v = value(type, count, at);
      if (v === null) continue;
      const name = names[tag] ?? `Tag 0x${tag.toString(16).padStart(4, "0")}`;
      if (!into.has(name)) into.set(name, v);
    }
    return u32(offset + 2 + n * 12);
  }

  const ifd1 = readIfd(u32(4), IFD0_TAGS, result.exif);
  if (ifd1 && inRange(ifd1, 2)) {
    const thumb = new Map<string, TagValue>();
    readIfd(ifd1, IFD0_TAGS, thumb);
    result.thumbnail = thumb.has("ThumbnailOffset") || thumb.has("ThumbnailLength");
  }
  return result;
}

// ── Formatting raw tag values ────────────────────────────────────────────

const ratio = (r: [number, number]): number => (r[1] ? r[0] / r[1] : 0);

function num(v: TagValue | undefined): number | undefined {
  if (typeof v === "number") return v;
  if (Array.isArray(v) && v.length > 0) {
    const first = v[0];
    return typeof first === "number" ? first : ratio(first);
  }
  return undefined;
}

const trimNumber = (n: number, digits = 2): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(digits).replace(/\.?0+$/, "");

/** "1/250 s", "2.5 s" */
export function formatExposure(seconds: number): string {
  if (seconds <= 0) return "0 s";
  if (seconds < 0.5) return `1/${Math.round(1 / seconds)} s`;
  return `${trimNumber(seconds, 1)} s`;
}

function decodeUserComment(bytes: Uint8Array): string {
  const head = latin1(bytes.subarray(0, 8)).replace(/\0/g, "");
  const body = bytes.subarray(8);
  if (head === "UNICODE") {
    // Byte order isn't marked; most writers use the TIFF order, big-endian guesses read as CJK.
    const be = new TextDecoder("utf-16be").decode(body);
    const le = new TextDecoder("utf-16le").decode(body);
    const plain = (s: string) => (s.match(/[\x20-\x7e]/g) ?? []).length;
    return (plain(le) >= plain(be) ? le : be).replace(/\0+$/, "").trim();
  }
  return new TextDecoder()
    .decode(head === "ASCII" || head === "" ? body : bytes)
    .replace(/\0+$/, "")
    .trim();
}

/** A tag's value as people read it. */
export function formatTag(name: string, v: TagValue): string {
  if (typeof v === "string") return v;
  if (name in ENUMS) {
    const n = num(v);
    if (n !== undefined) return ENUMS[name][n] ?? String(n);
  }
  if (v instanceof Uint8Array) {
    if (name === "ExifVersion" || name === "FlashpixVersion" || name === "InteropVersion") {
      const s = latin1(v);
      return `${Number.parseInt(s.slice(0, 2), 10)}.${s.slice(2).replace(/0$/, "")}`;
    }
    if (name === "UserComment") return decodeUserComment(v);
    if (name.startsWith("XP")) return new TextDecoder("utf-16le").decode(v).replace(/\0+$/, "");
    if (name === "GPSProcessingMethod" || name === "GPSAreaInformation")
      return decodeUserComment(v);
    if (name === "GPSVersionID") return Array.from(v).join(".");
    if (name === "ComponentsConfiguration") {
      return Array.from(v)
        .map((c) => ["", "Y", "Cb", "Cr", "R", "G", "B"][c] ?? "")
        .join("");
    }
    if (name === "FileSource") return v[0] === 3 ? "Digital camera" : String(v[0]);
    if (name === "SceneType") return v[0] === 1 ? "Directly photographed" : String(v[0]);
    return `${v.length} bytes`;
  }
  switch (name) {
    case "ExposureTime":
      return formatExposure(num(v) ?? 0);
    case "FNumber":
      return `ƒ/${trimNumber(num(v) ?? 0, 1)}`;
    case "ApertureValue":
    case "MaxApertureValue":
      return `ƒ/${trimNumber(2 ** ((num(v) ?? 0) / 2), 1)}`;
    case "ShutterSpeedValue":
      return formatExposure(2 ** -(num(v) ?? 0));
    case "FocalLength":
      return `${trimNumber(num(v) ?? 0, 1)} mm`;
    case "FocalLengthIn35mmFormat":
      return `${num(v)} mm`;
    case "ExposureBiasValue": {
      const n = num(v) ?? 0;
      return `${n > 0 ? "+" : ""}${trimNumber(n, 2)} EV`;
    }
    case "Flash":
      return flashText(num(v) ?? 0);
    case "SubjectDistance":
      return `${trimNumber(num(v) ?? 0, 2)} m`;
    case "GPSAltitude":
      return `${trimNumber(num(v) ?? 0, 1)} m`;
    case "GPSSpeed":
    case "GPSImgDirection":
    case "GPSTrack":
    case "GPSDestBearing":
    case "GPSHPositioningError":
      return trimNumber(num(v) ?? 0, 2);
    case "GPSLatitude":
    case "GPSLongitude":
    case "GPSDestLatitude":
    case "GPSDestLongitude":
      if (Array.isArray(v) && v.length === 3) {
        const [d, m, s] = v.map((x) => (typeof x === "number" ? x : ratio(x)));
        return `${trimNumber(d, 0)}° ${trimNumber(m, 0)}′ ${trimNumber(s, 2)}″`;
      }
      break;
    case "GPSTimeStamp":
      if (Array.isArray(v) && v.length === 3) {
        const [hh, mm, ss] = v.map((x) => (typeof x === "number" ? x : ratio(x)));
        const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
        return `${pad(hh)}:${pad(mm)}:${pad(ss)} UTC`;
      }
      break;
    case "LensSpecification":
      if (Array.isArray(v) && v.length === 4) {
        const [a, b, c, d] = v.map((x) => (typeof x === "number" ? x : ratio(x)));
        const focal =
          a === b ? `${trimNumber(a, 1)} mm` : `${trimNumber(a, 1)}–${trimNumber(b, 1)} mm`;
        if (!c) return focal;
        const ap =
          c === d || !d ? `ƒ/${trimNumber(c, 1)}` : `ƒ/${trimNumber(c, 1)}–${trimNumber(d, 1)}`;
        return `${focal} ${ap}`;
      }
      break;
  }
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "number" ? trimNumber(x, 4) : trimNumber(ratio(x), 4)))
      .join(", ");
  }
  return trimNumber(v, 4);
}

/** Degrees/minutes/seconds + ref → signed decimal degrees. */
function gpsDecimal(v: TagValue | undefined, ref: TagValue | undefined): number | undefined {
  if (!Array.isArray(v) || v.length !== 3) return undefined;
  const [d, m, s] = v.map((x) => (typeof x === "number" ? x : ratio(x)));
  const deg = d + m / 60 + s / 3600;
  if (!Number.isFinite(deg)) return undefined;
  return ref === "S" || ref === "W" ? -deg : deg;
}

// ── XMP ──────────────────────────────────────────────────────────────────

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";

/** Every XMP property as "prefix:Name" → text; lists are joined with commas. */
export function readXmp(xml: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  if (typeof DOMParser === "undefined") return out;
  const doc = new DOMParser().parseFromString(xml.replace(/^[^<]+/, ""), "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return out;
  const qname = (el: Element | Attr) => (el.prefix ? `${el.prefix}:${el.localName}` : el.localName);

  function text(el: Element): string | null {
    const list = Array.from(el.children).find(
      (c) => c.namespaceURI === RDF && /^(Bag|Seq|Alt)$/.test(c.localName),
    );
    if (list) {
      const items = Array.from(list.children)
        .map((li) => li.textContent?.trim() ?? "")
        .filter(Boolean);
      return items.join(", ");
    }
    if (el.children.length === 0) return el.textContent?.trim() ?? "";
    return null;
  }

  function walk(desc: Element, prefix: string): void {
    for (const attr of Array.from(desc.attributes)) {
      if (attr.namespaceURI === RDF || attr.prefix === "xmlns" || attr.name.startsWith("xmlns"))
        continue;
      if (attr.value.trim()) out.push({ name: prefix + qname(attr), value: attr.value.trim() });
    }
    for (const child of Array.from(desc.children)) {
      if (child.namespaceURI === RDF) continue;
      const t = text(child);
      if (t !== null) {
        if (t) out.push({ name: prefix + qname(child), value: t });
        continue;
      }
      // A structure: its fields, named under the parent.
      const inner =
        child.getAttributeNS(RDF, "parseType") === "Resource"
          ? child
          : Array.from(child.children).find(
              (c) => c.namespaceURI === RDF && c.localName === "Description",
            );
      if (inner) walk(inner, `${prefix}${qname(child)}/`);
    }
  }

  for (const desc of Array.from(doc.getElementsByTagNameNS(RDF, "Description"))) {
    if (desc.parentElement?.namespaceURI === RDF && desc.parentElement.localName === "RDF")
      walk(desc, "");
  }
  return out;
}

// ── IPTC (JPEG APP13) ────────────────────────────────────────────────────

const IPTC_NAMES: Record<number, string> = {
  5: "ObjectName",
  10: "Urgency",
  15: "Category",
  20: "SupplementalCategories",
  25: "Keywords",
  40: "SpecialInstructions",
  55: "DateCreated",
  60: "TimeCreated",
  65: "OriginatingProgram",
  80: "By-line",
  85: "By-lineTitle",
  90: "City",
  92: "Sub-location",
  95: "Province-State",
  100: "Country-PrimaryLocationCode",
  101: "Country-PrimaryLocationName",
  103: "OriginalTransmissionReference",
  105: "Headline",
  110: "Credit",
  115: "Source",
  116: "CopyrightNotice",
  118: "Contact",
  120: "Caption-Abstract",
  122: "Writer-Editor",
};

export function readIptc(bytes: Uint8Array): Array<{ name: string; value: string }> {
  const fields = new Map<string, string[]>();
  let utf8 = false;
  // Photoshop resource blocks: "8BIM", id, pascal name (even-padded), size, data.
  let p = 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (p + 12 <= bytes.length) {
    if (latin1(bytes.subarray(p, p + 4)) !== "8BIM") {
      p++;
      continue;
    }
    const id = view.getUint16(p + 4);
    const nameLen = bytes[p + 6];
    let q = p + 7 + nameLen;
    if ((nameLen + 1) % 2) q++;
    if (q + 4 > bytes.length) break;
    const size = view.getUint32(q);
    const data = bytes.subarray(q + 4, Math.min(bytes.length, q + 4 + size));
    if (id === 0x0404) {
      let i = 0;
      while (i + 5 <= data.length && data[i] === 0x1c) {
        const record = data[i + 1];
        const dataset = data[i + 2];
        const len = (data[i + 3] << 8) | data[i + 4];
        const raw = data.subarray(i + 5, i + 5 + len);
        i += 5 + len;
        if (record === 1 && dataset === 90) utf8 = latin1(raw).includes("%G");
        if (record !== 2) continue;
        const name = IPTC_NAMES[dataset];
        if (!name) continue;
        const text = utf8 ? new TextDecoder().decode(raw) : decodeMaybeUtf8(raw);
        const list = fields.get(name) ?? [];
        list.push(text.trim());
        fields.set(name, list);
      }
    }
    p = q + 4 + size + (size % 2);
  }
  return Array.from(fields, ([name, values]) => ({ name, value: values.join(", ") }));
}

// ── ICC ──────────────────────────────────────────────────────────────────

const ICC_CLASSES: Record<string, string> = {
  scnr: "Input",
  mntr: "Display",
  prtr: "Output",
  link: "Device link",
  spac: "Color space",
  abst: "Abstract",
  nmcl: "Named color",
};

export function readIcc(bytes: Uint8Array): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  if (bytes.length < 132) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tagCount = view.getUint32(128);
  const tags = new Map<string, [number, number]>();
  for (let i = 0; i < tagCount && 132 + i * 12 + 12 <= bytes.length; i++) {
    const at = 132 + i * 12;
    tags.set(latin1(bytes.subarray(at, at + 4)), [view.getUint32(at + 4), view.getUint32(at + 8)]);
  }
  const textTag = (sig: string): string | undefined => {
    const t = tags.get(sig);
    if (!t || t[0] + t[1] > bytes.length) return undefined;
    const [off, size] = t;
    const type = latin1(bytes.subarray(off, off + 4));
    if (type === "desc") {
      const n = view.getUint32(off + 8);
      return latin1(bytes.subarray(off + 12, off + 12 + n)).replace(/\0+$/, "");
    }
    if (type === "mluc") {
      const records = view.getUint32(off + 8);
      if (!records) return undefined;
      const len = view.getUint32(off + 20);
      const at = view.getUint32(off + 24);
      return new TextDecoder("utf-16be")
        .decode(bytes.subarray(off + at, off + at + len))
        .replace(/\0+$/, "");
    }
    if (type === "text") return latin1(bytes.subarray(off + 8, off + size)).replace(/\0+$/, "");
    return undefined;
  };
  const desc = textTag("desc");
  if (desc) out.push({ name: "ProfileDescription", value: desc });
  const major = bytes[8];
  const minor = bytes[9] >> 4;
  out.push({ name: "ProfileVersion", value: `${major}.${minor}` });
  const cls = latin1(bytes.subarray(12, 16));
  out.push({ name: "ProfileClass", value: ICC_CLASSES[cls] ?? cls });
  out.push({ name: "ColorSpaceData", value: latin1(bytes.subarray(16, 20)).trim() });
  out.push({ name: "ConnectionSpace", value: latin1(bytes.subarray(20, 24)).trim() });
  const cprt = textTag("cprt");
  if (cprt) out.push({ name: "ProfileCopyright", value: cprt });
  return out;
}

// ── Containers ───────────────────────────────────────────────────────────

function latin1(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

/** UTF-8 when it decodes cleanly, Latin-1 otherwise. */
function decodeMaybeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return latin1(bytes);
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new DecompressionStream("deflate");
    const writer = stream.writable.getWriter();
    void writer.write(bytes as Uint8Array<ArrayBuffer>).catch(() => {});
    void writer.close().catch(() => {});
    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  } catch {
    return null;
  }
}

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";

interface Raw {
  meta: PhotoMetadata;
  tiff: TiffTags | null;
  push(source: MetadataSource, name: string, value: string): void;
}

const JPEG_PROCESS: Record<number, string> = {
  192: "Baseline",
  193: "Extended sequential",
  194: "Progressive",
  195: "Lossless",
};

async function readJpeg(bytes: Uint8Array, raw: Raw): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const icc: Array<[number, Uint8Array]> = [];
  let p = 2;
  while (p + 4 <= bytes.length) {
    if (bytes[p] !== 0xff) {
      p++;
      continue;
    }
    const marker = bytes[p + 1];
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) {
      p += 2;
      continue;
    }
    const len = view.getUint16(p + 2);
    const seg = bytes.subarray(p + 4, Math.min(bytes.length, p + 2 + len));
    const head = latin1(seg.subarray(0, 40));
    if (marker === 0xe0 && head.startsWith("JFIF\0") && seg.length >= 12) {
      const unit = seg[7];
      const x = (seg[8] << 8) | seg[9];
      const y = (seg[10] << 8) | seg[11];
      raw.push("jpeg", "JFIFVersion", `${seg[5]}.${String(seg[6]).padStart(2, "0")}`);
      if (unit) raw.push("jpeg", "Density", `${x} × ${y} per ${unit === 1 ? "inch" : "cm"}`);
    } else if (marker === 0xe1 && head.startsWith("Exif\0")) {
      raw.tiff ??= readTiff(seg, 6);
    } else if (marker === 0xe1 && head.startsWith(XMP_HEADER)) {
      const xml = new TextDecoder().decode(seg.subarray(XMP_HEADER.length));
      for (const f of readXmp(xml)) raw.push("xmp", f.name, f.value);
    } else if (marker === 0xe2 && head.startsWith("ICC_PROFILE\0")) {
      icc.push([seg[12], seg.subarray(14)]);
    } else if (marker === 0xed && head.startsWith("Photoshop 3.0\0")) {
      for (const f of readIptc(seg.subarray(14))) raw.push("iptc", f.name, f.value);
    } else if (marker === 0xeb && latin1(seg).includes("c2pa")) {
      raw.meta.contentCredentials = true;
    } else if (marker === 0xfe) {
      const text = decodeMaybeUtf8(seg).replace(/\0+$/, "").trim();
      if (text) raw.push("jpeg", "Comment", text);
    } else if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      raw.push("jpeg", "Encoding", JPEG_PROCESS[marker] ?? `SOF${marker - 0xc0}`);
      raw.push("jpeg", "BitsPerSample", String(seg[0]));
      raw.push("jpeg", "ColorComponents", String(seg[5]));
      if (seg[5] === 3 && seg.length >= 15) {
        const h = seg[7] >> 4;
        const v = seg[7] & 15;
        const sub =
          h === 2 && v === 2
            ? "4:2:0"
            : h === 2 && v === 1
              ? "4:2:2"
              : h === 1 && v === 1
                ? "4:4:4"
                : `${h}×${v}`;
        raw.push("jpeg", "ChromaSubsampling", sub);
      }
    }
    p += 2 + len;
  }
  if (icc.length) {
    icc.sort((a, b) => a[0] - b[0]);
    const total = icc.reduce((n, [, b]) => n + b.length, 0);
    const profile = new Uint8Array(total);
    let at = 0;
    for (const [, b] of icc) {
      profile.set(b, at);
      at += b.length;
    }
    for (const f of readIcc(profile)) raw.push("icc", f.name, f.value);
  }
}

const PNG_COLOR: Record<number, string> = {
  0: "Grayscale",
  2: "RGB",
  3: "Indexed",
  4: "Grayscale + alpha",
  6: "RGB + alpha",
};

async function readPng(bytes: Uint8Array, raw: Raw): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 8;
  while (p + 8 <= bytes.length) {
    const len = view.getUint32(p);
    const type = latin1(bytes.subarray(p + 4, p + 8));
    const data = bytes.subarray(p + 8, Math.min(bytes.length, p + 8 + len));
    p += 12 + len;
    if (type === "IEND") break;
    if (type === "IHDR" && data.length >= 13) {
      raw.push("png", "BitDepth", String(data[8]));
      raw.push("png", "ColorType", PNG_COLOR[data[9]] ?? String(data[9]));
      raw.push("png", "Interlace", data[12] ? "Adam7" : "None");
    } else if (type === "eXIf") {
      raw.tiff ??= readTiff(data, 0);
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const nul = data.indexOf(0);
      if (nul < 0) continue;
      const key = latin1(data.subarray(0, nul));
      let text = "";
      if (type === "tEXt") {
        text = latin1(data.subarray(nul + 1));
      } else if (type === "zTXt") {
        const inflated = await inflate(data.subarray(nul + 2));
        text = inflated ? latin1(inflated) : "";
      } else {
        const compressed = data[nul + 1] === 1;
        let q = nul + 3;
        const lang = data.indexOf(0, q);
        if (lang < 0) continue;
        const translated = data.indexOf(0, lang + 1);
        if (translated < 0) continue;
        q = translated + 1;
        const body = data.subarray(q);
        const decoded = compressed ? await inflate(body) : body;
        text = decoded ? new TextDecoder().decode(decoded) : "";
      }
      if (key === "XML:com.adobe.xmp") {
        for (const f of readXmp(text)) raw.push("xmp", f.name, f.value);
      } else if (text.trim()) {
        raw.push("png", key, text.trim());
      }
    } else if (type === "iCCP") {
      const nul = data.indexOf(0);
      if (nul < 0) continue;
      raw.push("icc", "ProfileName", latin1(data.subarray(0, nul)));
      const profile = await inflate(data.subarray(nul + 2));
      if (profile) for (const f of readIcc(profile)) raw.push("icc", f.name, f.value);
    } else if (type === "sRGB") {
      raw.push(
        "png",
        "sRGB",
        ["Perceptual", "Relative colorimetric", "Saturation", "Absolute colorimetric"][data[0]] ??
          "Yes",
      );
    } else if (type === "gAMA" && data.length >= 4) {
      const gamma = new DataView(data.buffer, data.byteOffset, 4).getUint32(0);
      raw.push("png", "Gamma", trimNumber(gamma / 100000, 5));
    } else if (type === "pHYs" && data.length >= 9) {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const x = dv.getUint32(0);
      const y = dv.getUint32(4);
      if (data[8] === 1)
        raw.push(
          "png",
          "Density",
          `${Math.round(x * 0.0254)} × ${Math.round(y * 0.0254)} per inch`,
        );
      else raw.push("png", "PixelAspect", `${x}:${y}`);
    } else if (type === "tIME" && data.length >= 7) {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const pad = (n: number) => String(n).padStart(2, "0");
      raw.push(
        "png",
        "LastModified",
        `${dv.getUint16(0)}-${pad(data[2])}-${pad(data[3])} ${pad(data[4])}:${pad(data[5])}:${pad(data[6])} UTC`,
      );
    } else if (type === "acTL" && data.length >= 8) {
      const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      raw.push("png", "Animation", `${dv.getUint32(0)} frames`);
    } else if (type === "caBX") {
      raw.meta.contentCredentials = true;
    }
  }
}

async function readWebp(bytes: Uint8Array, raw: Raw): Promise<void> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 12;
  while (p + 8 <= bytes.length) {
    const type = latin1(bytes.subarray(p, p + 4));
    const len = view.getUint32(p + 4, true);
    const data = bytes.subarray(p + 8, Math.min(bytes.length, p + 8 + len));
    p += 8 + len + (len % 2);
    if (type === "VP8 ") raw.push("webp", "Compression", "Lossy");
    else if (type === "VP8L") raw.push("webp", "Compression", "Lossless");
    else if (type === "VP8X" && data.length >= 1) {
      if (data[0] & 0x10) raw.push("webp", "Alpha", "Yes");
      if (data[0] & 0x02) raw.push("webp", "Animation", "Yes");
    } else if (type === "EXIF") {
      const off = latin1(data.subarray(0, 6)) === "Exif\0\0" ? 6 : 0;
      raw.tiff ??= readTiff(data, off);
    } else if (type === "XMP ") {
      for (const f of readXmp(new TextDecoder().decode(data))) raw.push("xmp", f.name, f.value);
    } else if (type === "ICCP") {
      for (const f of readIcc(data)) raw.push("icc", f.name, f.value);
    } else if (type === "C2PA") {
      raw.meta.contentCredentials = true;
    }
  }
}

/** Read every piece of metadata in a photo file. Never throws: unreadable parts are skipped. */
export async function readMetadata(file: Blob | Uint8Array): Promise<PhotoMetadata> {
  const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer());
  const meta: PhotoMetadata = {
    format: "unknown",
    fields: [],
    contentCredentials: false,
    thumbnail: false,
  };
  const raw: Raw = {
    meta,
    tiff: null,
    push: (source, name, value) => meta.fields.push({ source, name, value }),
  };
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      meta.format = "jpeg";
      await readJpeg(bytes, raw);
    } else if (latin1(bytes.subarray(1, 4)) === "PNG") {
      meta.format = "png";
      await readPng(bytes, raw);
    } else if (
      latin1(bytes.subarray(0, 4)) === "RIFF" &&
      latin1(bytes.subarray(8, 12)) === "WEBP"
    ) {
      meta.format = "webp";
      await readWebp(bytes, raw);
    }
  } catch (error) {
    console.warn("[Retouch] Some of the photo's metadata couldn't be read", error);
  }
  const tiff = raw.tiff;
  if (tiff) {
    meta.thumbnail = tiff.thumbnail;
    const exifFields: MetadataField[] = [];
    for (const [name, v] of tiff.exif) {
      if (name === "ThumbnailOffset" || name === "ThumbnailLength") continue;
      const value = formatTag(name, v);
      if (value) exifFields.push({ source: "exif", name, value });
    }
    for (const [name, v] of tiff.gps) {
      const value = formatTag(name, v);
      if (value) exifFields.push({ source: "gps", name, value });
    }
    meta.fields.unshift(...exifFields);
    const lat = gpsDecimal(tiff.gps.get("GPSLatitude"), tiff.gps.get("GPSLatitudeRef"));
    const lon = gpsDecimal(tiff.gps.get("GPSLongitude"), tiff.gps.get("GPSLongitudeRef"));
    if (lat !== undefined && lon !== undefined && (lat !== 0 || lon !== 0)) {
      const alt = num(tiff.gps.get("GPSAltitude"));
      const below = num(tiff.gps.get("GPSAltitudeRef")) === 1;
      meta.gps = {
        latitude: lat,
        longitude: lon,
        altitude: alt === undefined ? undefined : below ? -alt : alt,
      };
    }
  }
  return meta;
}

// ── Readable sections ────────────────────────────────────────────────────

export interface InfoRow {
  label: string;
  value: string;
}

export interface InfoSection {
  title: string;
  rows: InfoRow[];
}

/** What the panel says about the photo itself, before any embedded metadata. */
export interface FileFacts {
  name: string;
  type: string;
  size: number;
  lastModified?: number;
  width: number;
  height: number;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${trimNumber(n / 1024, 1)} KB`;
  return `${trimNumber(n / (1024 * 1024), 1)} MB`;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

const COMMON_RATIOS: Array<[number, number]> = [
  [1, 1],
  [5, 4],
  [4, 3],
  [3, 2],
  [16, 10],
  [5, 3],
  [16, 9],
  [2, 1],
  [21, 9],
  [3, 1],
];

/** "3:2", "2:3", "≈16:9"; a decimal ratio when nothing common is close. */
export function aspectLabel(w: number, h: number): string {
  const g = gcd(w, h) || 1;
  const a = w / g;
  const b = h / g;
  if (a <= 32 && b <= 32) return `${a}:${b}`;
  const long = Math.max(w, h) / Math.min(w, h);
  for (const [x, y] of COMMON_RATIOS) {
    if (Math.abs(long / (x / y) - 1) < 0.01) return w >= h ? `≈${x}:${y}` : `≈${y}:${x}`;
  }
  return w >= h ? `${trimNumber(long, 2)}:1` : `1:${trimNumber(long, 2)}`;
}

/** EXIF "2024:06:01 18:22:10" (+ offset) → a local, readable date. */
export function formatExifDate(value: string, offset?: string): string {
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return value;
  const [, y, mo, d, hh, mm] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
  const day = date.toLocaleDateString(undefined, {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = date.toLocaleTimeString(undefined, {
    timeZone: "UTC",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day}, ${time}${offset ? ` (UTC${offset})` : ""}`;
}

/** Shown names for the raw sources, in the "All fields" list. */
export const SOURCE_LABELS: Record<MetadataSource, string> = {
  file: "File",
  exif: "EXIF",
  gps: "GPS",
  xmp: "XMP",
  iptc: "IPTC",
  icc: "Color profile",
  png: "PNG",
  jpeg: "JPEG",
  webp: "WebP",
};

/** Spell out an EXIF-style CamelCase name: "FocalLengthIn35mmFormat" → "Focal length in 35mm format". */
export function fieldLabel(name: string): string {
  const local = name.includes(":") ? name.slice(name.lastIndexOf(":") + 1) : name;
  const spaced = local
    .replace(/^GPS/, "GPS ")
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_/-]+/g, " ")
    .trim();
  return (
    spaced.charAt(0).toUpperCase() +
    spaced.slice(1).replace(/ ([A-Z])([a-z])/g, (_, a, b) => ` ${a.toLowerCase()}${b}`)
  );
}

/**
 * The panel's sections: the file, then camera, exposure, location,
 * description and color, each only when there's something to say.
 */
export function describeMetadata(meta: PhotoMetadata, file: FileFacts): InfoSection[] {
  const first = (...names: string[]): string | undefined => {
    for (const name of names) {
      const f = meta.fields.find((x) => x.name === name);
      if (f?.value) return f.value;
    }
    return undefined;
  };
  const sections: InfoSection[] = [];
  const add = (title: string, rows: Array<[string, string | undefined]>) => {
    const kept = rows
      .filter((r): r is [string, string] => !!r[1])
      .map(([label, value]) => ({ label, value }));
    if (kept.length) sections.push({ title, rows: kept });
  };

  const mp = (file.width * file.height) / 1e6;
  add("File", [
    ["Name", file.name],
    // The file on screen now (a cutout turns a JPEG into a PNG); the metadata may be the original's.
    [
      "Format",
      file.type
        ? (file.type.split("/")[1] ?? file.type).replace("quicktime", "mov").toUpperCase()
        : undefined,
    ],
    ["Size", formatBytes(file.size)],
    ["Dimensions", `${file.width} × ${file.height} px`],
    ["Megapixels", `${trimNumber(mp, 1)} MP · ${aspectLabel(file.width, file.height)}`],
    ["Modified", file.lastModified ? new Date(file.lastModified).toLocaleString() : undefined],
  ]);

  const make = first("Make", "tiff:Make");
  const model = first("Model", "tiff:Model");
  const camera =
    model && make && !model.toLowerCase().startsWith(make.toLowerCase().split(" ")[0])
      ? `${make} ${model}`
      : (model ?? make);
  const lensModel = first("LensModel", "aux:Lens", "exifEX:LensModel");
  const lensMake = first("LensMake");
  add("Camera", [
    ["Camera", camera],
    [
      "Lens",
      lensModel
        ? lensMake && !lensModel.startsWith(lensMake)
          ? `${lensMake} ${lensModel}`
          : lensModel
        : first("LensSpecification"),
    ],
    ["Serial number", first("BodySerialNumber", "aux:SerialNumber")],
    ["Owner", first("OwnerName", "aux:OwnerName")],
    ["Software", first("Software", "xmp:CreatorTool")],
  ]);

  const focal = first("FocalLength");
  const focal35 = first("FocalLengthIn35mmFormat");
  add("Exposure", [
    [
      "Taken",
      (() => {
        const d = first("DateTimeOriginal", "DateTimeDigitized", "DateTime");
        return d
          ? formatExifDate(d, first("OffsetTimeOriginal", "OffsetTime"))
          : first("xmp:CreateDate", "photoshop:DateCreated", "DateCreated");
      })(),
    ],
    ["Shutter", first("ExposureTime", "ShutterSpeedValue")],
    ["Aperture", first("FNumber", "ApertureValue")],
    ["ISO", first("ISO")],
    [
      "Focal length",
      focal ? (focal35 && focal35 !== focal ? `${focal} (${focal35} full-frame)` : focal) : focal35,
    ],
    ["Exposure bias", first("ExposureBiasValue")],
    ["Program", first("ExposureProgram")],
    ["Metering", first("MeteringMode")],
    ["Flash", first("Flash")],
    ["White balance", first("WhiteBalance")],
    ["Scene", first("SceneCaptureType")],
  ]);

  if (meta.gps) {
    const { latitude, longitude, altitude } = meta.gps;
    const coord = (v: number, pos: string, neg: string) =>
      `${Math.abs(v).toFixed(5)}° ${v >= 0 ? pos : neg}`;
    add("Location", [
      ["Coordinates", `${coord(latitude, "N", "S")}, ${coord(longitude, "E", "W")}`],
      ["Altitude", altitude === undefined ? undefined : `${trimNumber(altitude, 0)} m`],
      [
        "Facing",
        (() => {
          const dir = first("GPSImgDirection");
          return dir ? `${Math.round(Number.parseFloat(dir))}°` : undefined;
        })(),
      ],
    ]);
  }

  add("Description", [
    ["Title", first("dc:title", "ObjectName", "XPTitle", "Title")],
    [
      "Caption",
      first(
        "ImageDescription",
        "dc:description",
        "Caption-Abstract",
        "Description",
        "XPComment",
        "UserComment",
        "Comment",
      ),
    ],
    ["Keywords", first("dc:subject", "Keywords", "XPKeywords")],
    ["Creator", first("Artist", "dc:creator", "By-line", "XPAuthor", "Author")],
    ["Copyright", first("Copyright", "dc:rights", "CopyrightNotice")],
    ["License", first("xmpRights:WebStatement")],
    ["Source", first("dc:source", "Source")],
    [
      "Rating",
      (() => {
        const r = Number.parseInt(first("xmp:Rating", "Rating") ?? "", 10);
        return r > 0 && r <= 5 ? "★".repeat(r) + "☆".repeat(5 - r) : undefined;
      })(),
    ],
    [
      "Place",
      [
        first("City", "photoshop:City", "Iptc4xmpCore:Location"),
        first("Province-State", "photoshop:State"),
        first("Country-PrimaryLocationName", "photoshop:Country"),
      ]
        .filter(Boolean)
        .join(", ") || undefined,
    ],
  ]);

  // Image generators write their prompt and settings into PNG text.
  const prompt = first("parameters", "prompt", "Dream", "sd-metadata");
  add("Generated", [
    ["Parameters", prompt],
    ["Workflow", first("workflow") ? "ComfyUI workflow embedded" : undefined],
  ]);

  add("Color", [
    ["Profile", first("ProfileDescription", "ProfileName", "photoshop:ICCProfile")],
    ["Color space", first("ColorSpace", "ColorType")],
    ["Bit depth", first("BitDepth", "BitsPerSample")],
    ["Encoding", first("Encoding", "Compression")],
    ["Chroma", first("ChromaSubsampling")],
    ["Orientation", first("Orientation")],
    [
      "Density",
      first("Density") ??
        (() => {
          const x = first("XResolution");
          const unit = first("ResolutionUnit");
          return x && unit && unit !== "None"
            ? `${x} per ${unit === "inches" ? "inch" : unit}`
            : undefined;
        })(),
    ],
  ]);
  return sections;
}
