import { createDefaultVideoEdits, MIN_TRIM_DURATION } from "../src/constants";
import type { ImageEntry, MediaEntry, VideoEntry } from "../src/types";
import { processFiles } from "../src/utils/image";
import {
  clampTrim,
  formatDuration,
  formatTime,
  frameFileName,
  isImageEntry,
  isVideoEntry,
  snapTime,
} from "../src/utils/video";

vi.mock("../src/utils/video", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/utils/video")>();
  return {
    ...original,
    loadVideo: vi.fn(async (file: File) => {
      if (file.name === "broken.mp4") throw new Error("decode failed");
      return {
        video: {} as HTMLVideoElement,
        url: "blob:video",
        duration: 5,
        width: 640,
        height: 360,
      };
    }),
    capturePoster: vi.fn(async () => "blob:poster"),
    createSeekQueue: vi.fn(() => ({ seek: async () => {}, destroy: () => {} })),
    releaseVideo: vi.fn(),
  };
});

beforeAll(() => {
  // jsdom doesn't implement object URLs; the code under test revokes them on rejection.
  if (typeof URL.revokeObjectURL !== "function") {
    URL.revokeObjectURL = () => {};
  }
});

const PROCESS_DEFAULTS = {
  acceptedImageTypes: ["image/jpeg", "image/png", "image/webp"],
  acceptedVideoTypes: ["video/mp4", "video/webm"],
  maxFileSize: Number.POSITIVE_INFINITY,
  maxVideoDuration: Number.POSITIVE_INFINITY,
};

function makeFile(name: string, type: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("processFiles media routing", () => {
  it("accepts a video file as a VideoEntry with default trim spanning the duration", async () => {
    const { entries, rejected } = await processFiles(
      [makeFile("clip.mp4", "video/mp4")],
      PROCESS_DEFAULTS,
    );
    expect(rejected).toHaveLength(0);
    expect(entries).toHaveLength(1);
    const entry = entries[0] as VideoEntry;
    expect(entry.kind).toBe("video");
    expect(entry.duration).toBe(5);
    expect(entry.edits.trim).toEqual({ start: 0, end: 5 });
    expect(entry.edits.mute).toBe(false);
    expect(entry.thumbnailUrl).toBe("blob:poster");
  });

  it("rejects unknown MIME types with reason 'type'", async () => {
    const { entries, rejected } = await processFiles(
      [makeFile("doc.pdf", "application/pdf")],
      PROCESS_DEFAULTS,
    );
    expect(entries).toHaveLength(0);
    expect(rejected).toEqual([{ file: expect.any(File), reason: "type" }]);
  });

  it("rejects videos when acceptedVideoTypes is empty", async () => {
    const { rejected } = await processFiles([makeFile("clip.mp4", "video/mp4")], {
      ...PROCESS_DEFAULTS,
      acceptedVideoTypes: [],
    });
    expect(rejected[0]?.reason).toBe("type");
  });

  it("rejects oversize files with reason 'size' before loading", async () => {
    const { rejected } = await processFiles([makeFile("big.png", "image/png", 100)], {
      ...PROCESS_DEFAULTS,
      maxFileSize: 50,
    });
    expect(rejected[0]?.reason).toBe("size");
  });

  it("rejects too-long videos with reason 'duration'", async () => {
    const { rejected } = await processFiles([makeFile("long.mp4", "video/mp4")], {
      ...PROCESS_DEFAULTS,
      maxVideoDuration: 2,
    });
    expect(rejected[0]?.reason).toBe("duration");
  });

  it("rejects undecodable videos with reason 'load-error'", async () => {
    const { rejected } = await processFiles(
      [makeFile("broken.mp4", "video/mp4")],
      PROCESS_DEFAULTS,
    );
    expect(rejected[0]?.reason).toBe("load-error");
  });
});

describe("video edit defaults", () => {
  it("spans the full duration and deep-clones shared edits", () => {
    const a = createDefaultVideoEdits(12);
    const b = createDefaultVideoEdits(12);
    expect(a.trim).toEqual({ start: 0, end: 12 });
    expect(a.mute).toBe(false);
    expect(a.filter).toBe("none");
    a.adjustments.brightness = 150;
    a.crop.x = 0.5;
    expect(b.adjustments.brightness).toBe(100);
    expect(b.crop.x).toBe(0);
  });
});

describe("trim math", () => {
  it("clamps start and end into the valid range", () => {
    expect(clampTrim({ start: -1, end: 4 }, 10)).toEqual({ start: 0, end: 4 });
    expect(clampTrim({ start: 2, end: 99 }, 10)).toEqual({ start: 2, end: 10 });
  });

  it("enforces the minimum trimmed length", () => {
    const r = clampTrim({ start: 5, end: 5 }, 10);
    expect(r.end - r.start).toBeCloseTo(MIN_TRIM_DURATION);
    const atEnd = clampTrim({ start: 10, end: 10 }, 10);
    expect(atEnd.start).toBeCloseTo(10 - MIN_TRIM_DURATION);
    expect(atEnd.end).toBe(10);
  });

  it("snaps within the threshold and passes through outside it", () => {
    expect(snapTime(4.9, [5], 0.15)).toBe(5);
    expect(snapTime(4.5, [5], 0.15)).toBe(4.5);
    expect(snapTime(0.1, [0, 5], 0.15)).toBe(0);
  });
});

describe("time formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3605)).toBe("1:00:05");
  });

  it("formats transport time with tenths", () => {
    expect(formatTime(4.25)).toBe("0:04.3");
    expect(formatTime(61.04)).toBe("1:01.0");
  });

  it("builds frame-capture filenames", () => {
    expect(frameFileName("clip.mp4", 3.5)).toBe("clip-frame-3.50s.png");
    expect(frameFileName("noext", 0)).toBe("noext-frame-0.00s.png");
  });
});

describe("media entry guards", () => {
  const image = { kind: "image" } as ImageEntry;
  const video = { kind: "video" } as VideoEntry;

  it("narrows by kind", () => {
    const all: MediaEntry[] = [image, video];
    expect(all.filter(isImageEntry)).toEqual([image]);
    expect(all.filter(isVideoEntry)).toEqual([video]);
  });
});
