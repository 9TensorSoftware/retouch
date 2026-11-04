import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { MetadataEdits } from "../src/types";
import { describeMetadata, readMetadata } from "../src/utils/metadata";
import {
  applyMetadataEdits,
  embedMetadata,
  fieldKey,
  parseFileName,
  parseMetadataValue,
  writeMetadata,
} from "../src/utils/metadata-edit";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, "fixtures", name)));

const facts = { name: "x.jpg", type: "image/jpeg", size: 1000, width: 16, height: 12 };

/** What a camera JPEG with no metadata looks like to the writer. */
function bareJpeg(jfif: boolean): Uint8Array {
  const app0 = jfif ? [0xff, 0xe0, 0, 4, 0x4a, 0x46] : [];
  return Uint8Array.from([0xff, 0xd8, ...app0, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
}

const EDITS: MetadataEdits = {
  title: "Gölde ev",
  caption: "İki satır\nüstü",
  keywords: "pond, fog",
  creator: "Ada Ş.",
  copyright: "© 2026 Ada",
  license: "https://example.com/a?b=1&c=2",
  source: "Roll <7>",
  rating: "4",
  city: "İstanbul",
  state: "Marmara",
  country: "Türkiye",
  make: "FUJIFILM",
  model: "X-T5",
  lens: "XF33mm",
  serial: "123",
  owner: "Ada",
  software: "Rétouch",
  taken: "2024-05-03 14:30:15 +03:00",
  shutter: "1/250 s",
  aperture: "ƒ/2.8",
  iso: "400",
  focal: "33 mm",
  focal35: "50 mm",
  bias: "-0.67 EV",
  coordinates: "-33.856800, 151.215300",
  altitude: "39 m",
  facing: "123.5",
};

async function roundTrip(bytes: Uint8Array) {
  const meta = await readMetadata(writeMetadata(bytes, EDITS));
  const get = (name: string) => meta.fields.find((f) => f.name === name)?.value;
  expect(get("dc:title")).toBe("Gölde ev");
  expect(get("ImageDescription")).toBe("İki satır\nüstü");
  expect(get("dc:subject")).toBe("pond, fog");
  expect(get("Artist")).toBe("Ada Ş.");
  expect(get("Copyright")).toBe("© 2026 Ada");
  expect(get("xmpRights:WebStatement")).toBe("https://example.com/a?b=1&c=2");
  expect(get("dc:source")).toBe("Roll <7>");
  expect(get("xmp:Rating")).toBe("4");
  expect(get("photoshop:City")).toBe("İstanbul");
  expect(get("photoshop:Country")).toBe("Türkiye");
  expect(get("Make")).toBe("FUJIFILM");
  expect(get("Model")).toBe("X-T5");
  expect(get("LensModel")).toBe("XF33mm");
  expect(get("BodySerialNumber")).toBe("123");
  expect(get("OwnerName")).toBe("Ada");
  expect(get("Software")).toBe("Rétouch");
  expect(get("DateTimeOriginal")).toBe("2024:05:03 14:30:15");
  expect(get("OffsetTimeOriginal")).toBe("+03:00");
  expect(get("ExposureTime")).toBe("1/250 s");
  expect(get("FNumber")).toBe("ƒ/2.8");
  expect(get("ISO")).toBe("400");
  expect(get("FocalLength")).toBe("33 mm");
  expect(get("FocalLengthIn35mmFormat")).toBe("50 mm");
  expect(get("ExposureBiasValue")).toBe("-0.67 EV");
  expect(meta.gps?.latitude).toBeCloseTo(-33.8568, 5);
  expect(meta.gps?.longitude).toBeCloseTo(151.2153, 5);
  expect(meta.gps?.altitude).toBe(39);
  return meta;
}

describe("writeMetadata", () => {
  it("writes into a JPEG, with or without a JFIF header", async () => {
    await roundTrip(bareJpeg(false));
    const written = writeMetadata(bareJpeg(true), EDITS);
    // JFIF has to stay the first segment.
    expect([written[2], written[3]]).toEqual([0xff, 0xe0]);
    await roundTrip(bareJpeg(true));
  });

  it("writes into a PNG, with its own text chunks", async () => {
    const meta = await roundTrip(fixture("meta.png"));
    expect(meta.fields.find((f) => f.name === "Author")?.value).toBe("Ada Ş.");
  });

  it("writes into a WebP of every kind, giving a simple one an extended header", async () => {
    for (const name of ["plain.webp", "plain-lossless.webp", "plain-alpha.webp"]) {
      const bytes = fixture(name);
      const written = writeMetadata(bytes, EDITS);
      const view = new DataView(written.buffer, written.byteOffset, written.byteLength);
      expect(view.getUint32(4, true)).toBe(written.length - 8);
      expect(String.fromCharCode(...written.subarray(12, 16))).toBe("VP8X");
      const width = 1 + (written[24] | (written[25] << 8) | (written[26] << 16));
      const height = 1 + (written[27] | (written[28] << 8) | (written[29] << 16));
      expect([width, height]).toEqual([16, 12]);
      await roundTrip(bytes);
    }
  });

  it("leaves the file alone with nothing to write", async () => {
    const bytes = bareJpeg(true);
    expect(writeMetadata(bytes, {})).toBe(bytes);
    expect(writeMetadata(bytes, { title: "" })).toBe(bytes);
    const blob = new Blob([bytes as BlobPart]);
    expect(await embedMetadata(blob, {})).toBe(blob);
    expect(await embedMetadata(blob, undefined)).toBe(blob);
    expect(await embedMetadata(blob, { fileName: "new.jpg" })).toBe(blob);
  });
});

describe("parseMetadataValue", () => {
  it("understands what people type, and what the panel shows", () => {
    const cases: Array<[Parameters<typeof parseMetadataValue>[0], string, string]> = [
      ["shutter", "1/250", "1/250 s"],
      ["shutter", "1/250 s", "1/250 s"],
      ["shutter", "2", "2 s"],
      ["aperture", "f/2.8", "ƒ/2.8"],
      ["aperture", "ƒ/2.8", "ƒ/2.8"],
      ["aperture", "4", "ƒ/4"],
      ["iso", "ISO 800", "800"],
      ["focal", "35", "35 mm"],
      ["focal", "33 mm", "33 mm"],
      ["bias", "+0.3", "+0.3 EV"],
      ["bias", "-0.67 EV", "-0.67 EV"],
      ["taken", "2024-05-03 14:30", "2024-05-03 14:30:00"],
      ["taken", "2024:05:03 14:30:15", "2024-05-03 14:30:15"],
      ["taken", "2024-05-03T14:30:15+02:00", "2024-05-03 14:30:15 +02:00"],
      ["taken", "2024-5-3", "2024-05-03 00:00:00"],
      ["coordinates", "41.0082, 28.9784", "41.008200, 28.978400"],
      ["coordinates", "41.00820° N, 28.97840° E", "41.008200, 28.978400"],
      ["coordinates", "33.8568° S, 151.2153° E", "-33.856800, 151.215300"],
      ["coordinates", "41° 0′ 30″ N, 29° 30' 0\" W", "41.008333, -29.500000"],
      ["rating", "★★★☆☆", "3"],
      ["rating", "5", "5"],
      ["rating", "0", ""],
      ["keywords", "a; b,a\nc", "a, b, c"],
      ["title", "  one\nline ", "one line"],
      ["caption", " two\nlines ", "two\nlines"],
      ["title", "", ""],
      ["iso", "  ", ""],
    ];
    for (const [key, text, want] of cases) expect(parseMetadataValue(key, text)).toBe(want);
  });

  it("turns down what it can't understand", () => {
    expect(parseMetadataValue("iso", "fast")).toBeNull();
    expect(parseMetadataValue("iso", "0")).toBeNull();
    expect(parseMetadataValue("shutter", "1/0")).toBeNull();
    expect(parseMetadataValue("aperture", "wide")).toBeNull();
    expect(parseMetadataValue("taken", "yesterday")).toBeNull();
    expect(parseMetadataValue("taken", "2024-13-01")).toBeNull();
    expect(parseMetadataValue("coordinates", "41.0")).toBeNull();
    expect(parseMetadataValue("coordinates", "95, 10")).toBeNull();
    expect(parseMetadataValue("coordinates", "41 E, 29 N")).toBeNull();
    expect(parseMetadataValue("rating", "6")).toBeNull();
  });
});

describe("parseFileName", () => {
  it("keeps the file's extension, whatever is typed", () => {
    expect(parseFileName("pond", "a.jpg")).toBe("pond.jpg");
    expect(parseFileName("pond.jpg", "a.jpg")).toBe("pond.jpg");
    expect(parseFileName("pond.png", "a.jpg")).toBe("pond.jpg");
    expect(parseFileName("v1.2", "a.jpg")).toBe("v1.2.jpg");
    expect(parseFileName("a/b", "a.jpg")).toBe("a-b.jpg");
    expect(parseFileName("  ", "a.jpg")).toBeNull();
  });
});

describe("applyMetadataEdits", () => {
  it("replaces every field that said the same thing, and leaves the file's alone", async () => {
    const meta = await readMetadata(fixture("meta.jpg"));
    const before = meta.fields.length;
    const out = applyMetadataEdits(meta, { copyright: "Mine", title: "" });
    const names = (n: string) => out.fields.filter((f) => f.name === n);
    expect(names("Copyright").map((f) => f.value)).toEqual(["Mine"]);
    expect(names("dc:rights")).toEqual([]);
    expect(names("dc:title")).toEqual([]);
    expect(meta.fields.length).toBe(before);
    const row = describeMetadata(out, facts, { edits: {} })
      .find((s) => s.title === "Description")
      ?.rows.find((r) => r.label === "Copyright");
    expect(row).toEqual({ label: "Copyright", value: "Mine", key: "copyright" });
  });

  it("moves or clears the location", async () => {
    const meta = await readMetadata(fixture("meta.jpg"));
    const moved = applyMetadataEdits(meta, { coordinates: "10.000000, 20.000000" });
    expect(moved.gps).toEqual({ latitude: 10, longitude: 20, altitude: 39 });
    expect(meta.gps?.latitude).toBeCloseTo(41.0082, 4);
    const cleared = applyMetadataEdits(meta, { coordinates: "" });
    expect(cleared.gps).toBeUndefined();
    expect(cleared.fields.some((f) => f.name === "GPSLatitude")).toBe(false);
  });

  it("offers empty rows to fill in only when asked to", () => {
    const empty = {
      format: "png",
      fields: [],
      contentCredentials: false,
      thumbnail: false,
    } as const;
    const rows = (options?: { edits: MetadataEdits }) =>
      describeMetadata({ ...empty, fields: [] }, facts, options).flatMap((s) =>
        s.rows.map((r) => r.label),
      );
    expect(rows()).not.toContain("Title");
    expect(rows({ edits: {} })).toEqual(expect.arrayContaining(["Title", "Coordinates", "Rating"]));
    // Camera details aren't offered from nothing, but one you cleared stays to refill.
    expect(rows({ edits: {} })).not.toContain("Make");
    expect(rows({ edits: { make: "" } })).toContain("Make");
    expect(rows({ edits: {} })).not.toContain("Altitude");
  });

  it("maps raw rows onto what they edit, but not GPS's parts", () => {
    expect(fieldKey("dc:title")).toBe("title");
    expect(fieldKey("Artist")).toBe("creator");
    expect(fieldKey("GPSLatitude")).toBeUndefined();
    expect(fieldKey("ColorSpace")).toBeUndefined();
  });
});
