import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  aspectLabel,
  describeMetadata,
  fieldLabel,
  formatExposure,
  readMetadata,
  readXmp,
} from "../src/utils/metadata";

// Fixtures are 16×12 crops of a demo photo with tags written by exiftool.
const fixture = (name: string) =>
  new Uint8Array(readFileSync(resolve(__dirname, "fixtures", name)));

const facts = { name: "x", type: "image/jpeg", size: 1000, width: 16, height: 12 };

describe("readMetadata (JPEG)", () => {
  it("reads EXIF, GPS, XMP, IPTC, the ICC profile and the comment", async () => {
    const meta = await readMetadata(fixture("meta.jpg"));
    const get = (name: string) => meta.fields.find((f) => f.name === name)?.value;
    expect(meta.format).toBe("jpeg");
    expect(get("Make")).toBe("FUJIFILM");
    expect(get("Model")).toBe("X-T5");
    expect(get("LensModel")).toBe("XF33mmF1.4 R LM WR");
    expect(get("ExposureTime")).toBe("1/250 s");
    expect(get("FNumber")).toBe("ƒ/2.8");
    expect(get("ISO")).toBe("400");
    expect(get("FocalLength")).toBe("33 mm");
    expect(get("ExposureBiasValue")).toBe("-0.67 EV");
    expect(get("ExposureProgram")).toBe("Aperture priority");
    expect(get("MeteringMode")).toBe("Pattern");
    expect(get("Flash")).toBe("Off, did not fire");
    expect(get("Software")).toBe("Rétouch test");
    expect(get("Copyright")).toBe("© 2024 Ada");
    expect(get("dc:title")).toBe("Golden hour");
    expect(get("dc:subject")).toBe("dog, beach");
    expect(get("City")).toBe("Istanbul");
    expect(get("Caption-Abstract")).toBe("A corgi");
    expect(get("Comment")).toBe("hello comment");
    expect(get("ProfileDescription")).toBe("sRGB IEC61966-2.1");
    expect(get("ChromaSubsampling")).toBeTruthy();
    expect(meta.gps?.latitude).toBeCloseTo(41.0082, 4);
    expect(meta.gps?.longitude).toBeCloseTo(28.9784, 4);
    expect(meta.gps?.altitude).toBe(39);
  });

  it("turns the fields into readable sections", async () => {
    const meta = await readMetadata(fixture("meta.jpg"));
    const sections = describeMetadata(meta, facts);
    const row = (title: string, label: string) =>
      sections.find((s) => s.title === title)?.rows.find((r) => r.label === label)?.value;
    expect(row("Camera", "Camera")).toBe("FUJIFILM X-T5");
    expect(row("Camera", "Lens")).toBe("FUJIFILM XF33mmF1.4 R LM WR");
    expect(row("Exposure", "Focal length")).toBe("33 mm (50 mm full-frame)");
    expect(row("Exposure", "Taken")).toContain("2024");
    expect(row("Exposure", "Taken")).toContain("UTC+02:00");
    expect(row("Location", "Coordinates")).toBe("41.00820° N, 28.97840° E");
    expect(row("Description", "Rating")).toBe("★★★★☆");
    expect(row("Color", "Profile")).toBe("sRGB IEC61966-2.1");
  });
});

describe("readMetadata (PNG)", () => {
  it("reads the eXIf chunk, text chunks and XMP", async () => {
    const meta = await readMetadata(fixture("meta.png"));
    const get = (name: string) => meta.fields.find((f) => f.name === name)?.value;
    expect(meta.format).toBe("png");
    expect(get("FNumber")).toBe("ƒ/4");
    expect(get("parameters")).toBe("a cat in space, Steps: 20");
    expect(get("dc:title")).toBe("PNG title");
    expect(get("ColorType")).toBe("RGB");
    expect(meta.gps?.latitude).toBeCloseTo(-33.8688, 4);
    const sections = describeMetadata(meta, { ...facts, type: "image/png" });
    expect(sections.find((s) => s.title === "Generated")?.rows[0].value).toContain("a cat");
  });
});

describe("readMetadata (anything else)", () => {
  it("returns no fields for a file it doesn't know, without throwing", async () => {
    const meta = await readMetadata(new Uint8Array([1, 2, 3, 4]));
    expect(meta.format).toBe("unknown");
    expect(meta.fields).toEqual([]);
  });

  it("survives a truncated JPEG", async () => {
    const meta = await readMetadata(fixture("meta.jpg").slice(0, 300));
    expect(meta.format).toBe("jpeg");
  });
});

describe("readXmp", () => {
  it("reads attributes, lists and nested structures", () => {
    const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
      <rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"
        xmlns:Iptc4xmpCore="http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/" xmp:Rating="5">
        <dc:creator><rdf:Seq><rdf:li>Ada</rdf:li><rdf:li>Grace</rdf:li></rdf:Seq></dc:creator>
        <Iptc4xmpCore:CreatorContactInfo rdf:parseType="Resource">
          <Iptc4xmpCore:CiAdrCity>Paris</Iptc4xmpCore:CiAdrCity>
        </Iptc4xmpCore:CreatorContactInfo>
      </rdf:Description></rdf:RDF></x:xmpmeta>`;
    expect(readXmp(xml)).toEqual([
      { name: "xmp:Rating", value: "5" },
      { name: "dc:creator", value: "Ada, Grace" },
      { name: "Iptc4xmpCore:CreatorContactInfo/Iptc4xmpCore:CiAdrCity", value: "Paris" },
    ]);
  });
});

describe("formatting", () => {
  it("writes exposures as photographers do", () => {
    expect(formatExposure(1 / 250)).toBe("1/250 s");
    expect(formatExposure(2.5)).toBe("2.5 s");
  });

  it("names aspect ratios", () => {
    expect(aspectLabel(6000, 4000)).toBe("3:2");
    expect(aspectLabel(1920, 1080)).toBe("16:9");
    expect(aspectLabel(1068, 1600)).toBe("≈2:3");
    expect(aspectLabel(1001, 1000)).toBe("≈1:1");
    expect(aspectLabel(1000, 1234)).toBe("1:1.23");
  });

  it("spells out field names", () => {
    expect(fieldLabel("FocalLengthIn35mmFormat")).toBe("Focal length in 35mm format");
    expect(fieldLabel("GPSImgDirection")).toBe("GPS img direction");
    expect(fieldLabel("dc:title")).toBe("Title");
  });
});
