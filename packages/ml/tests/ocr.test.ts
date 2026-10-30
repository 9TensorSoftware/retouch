import { describe, expect, it } from "vitest";
import {
  boxCorners,
  charsetFromDictionary,
  convexHull,
  ctcDecode,
  detectorSize,
  linesToText,
  minAreaRect,
  type Point,
  readingOrder,
  rgbaToDetectorTensor,
  rgbaToRecognizerTensor,
  type TextLine,
  textBoxesFromMap,
} from "../src/ocr";

describe("convexHull", () => {
  it("drops interior and collinear points", () => {
    const hull = convexHull([
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [2, 2],
      [1, 3],
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(
      expect.arrayContaining([
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ]),
    );
  });
});

describe("minAreaRect", () => {
  it("fits an axis-aligned rectangle with the axis along its long side", () => {
    const rect = minAreaRect([
      [10, 20],
      [50, 20],
      [50, 30],
      [10, 30],
      [30, 25],
    ]);
    expect(rect.cx).toBeCloseTo(30);
    expect(rect.cy).toBeCloseTo(25);
    expect(rect.width).toBeCloseTo(40);
    expect(rect.height).toBeCloseTo(10);
    expect(rect.ux).toBeCloseTo(1);
    expect(rect.uy).toBeCloseTo(0);
  });

  it("finds a rotated rectangle and points its axis right", () => {
    // A 40×10 bar tilted 30° up to the right (y down), sampled densely.
    const angle = (-30 * Math.PI) / 180;
    const pts: Point[] = [];
    for (let a = -20; a <= 20; a += 1) {
      for (let b = -5; b <= 5; b += 1) {
        pts.push([
          100 + a * Math.cos(angle) - b * Math.sin(angle),
          100 + a * Math.sin(angle) + b * Math.cos(angle),
        ]);
      }
    }
    const rect = minAreaRect(pts);
    expect(rect.width).toBeCloseTo(40, 1);
    expect(rect.height).toBeCloseTo(10, 1);
    expect(rect.ux).toBeCloseTo(Math.cos(angle), 3);
    expect(rect.uy).toBeCloseTo(Math.sin(angle), 3);
  });

  it("gives corners clockwise from the top-left", () => {
    const [tl, tr, br, bl] = boxCorners({ cx: 5, cy: 5, ux: 1, uy: 0, width: 10, height: 4 });
    expect(tl).toEqual([0, 3]);
    expect(tr).toEqual([10, 3]);
    expect(br).toEqual([10, 7]);
    expect(bl).toEqual([0, 7]);
  });
});

describe("textBoxesFromMap", () => {
  function map(width: number, height: number, fill: (x: number, y: number) => number) {
    const prob = new Float32Array(width * height);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) prob[y * width + x] = fill(x, y);
    return prob;
  }

  it("boxes each confident region and grows it past the shrunk kernel", () => {
    // Two bars: one confident, one faint (mean under the box threshold).
    const prob = map(100, 60, (x, y) => {
      if (y >= 10 && y < 20 && x >= 10 && x < 70) return 0.9;
      if (y >= 40 && y < 50 && x >= 10 && x < 70) return 0.4;
      return 0;
    });
    const boxes = textBoxesFromMap(prob, 100, 60);
    expect(boxes).toHaveLength(1);
    const [box] = boxes;
    expect(box.cx).toBeCloseTo(40);
    expect(box.cy).toBeCloseTo(15);
    expect(box.score).toBeCloseTo(0.9);
    // Grown by area·1.5 / perimeter = 600·1.5 / 140 on each side.
    const grow = (60 * 10 * 1.5) / 140;
    expect(box.width).toBeCloseTo(60 + 2 * grow);
    expect(box.height).toBeCloseTo(10 + 2 * grow);
  });

  it("ignores specks too thin to be text", () => {
    const prob = map(40, 40, (x, y) => (y === 5 && x < 30 ? 0.95 : 0));
    expect(textBoxesFromMap(prob, 40, 40)).toHaveLength(0);
  });
});

describe("detectorSize", () => {
  it("caps the long side and rounds both to multiples of 32", () => {
    expect(detectorSize(1600, 1065, 960)).toEqual([960, 640]);
    expect(detectorSize(500, 300, 960)).toEqual([512, 288]);
    expect(detectorSize(10, 10, 960)).toEqual([32, 32]);
  });
});

describe("tensors", () => {
  it("feeds the detector BGR planes with ImageNet mean and std", () => {
    const t = rgbaToDetectorTensor(new Uint8ClampedArray([255, 0, 0, 255]), 1);
    expect(t[0]).toBeCloseTo((0 - 0.485) / 0.229); // B
    expect(t[1]).toBeCloseTo((0 - 0.456) / 0.224); // G
    expect(t[2]).toBeCloseTo((1 - 0.406) / 0.225); // R
  });

  it("feeds the recognizer BGR planes in [-1, 1]", () => {
    const t = rgbaToRecognizerTensor(new Uint8ClampedArray([255, 0, 0, 255]), 1);
    expect(Array.from(t)).toEqual([-1, -1, 1]);
  });
});

describe("ctcDecode", () => {
  it("merges repeats, drops blanks and averages the kept confidences", () => {
    const charset = charsetFromDictionary("a\nb\n");
    expect(charset).toEqual(["", "a", "b", " "]);
    // steps: a a blank a b space b → "aa b"... with merges: a, (a merged), blank, a, b, " ", b
    const rows = [
      [0.1, 0.9, 0, 0],
      [0.1, 0.8, 0, 0],
      [0.9, 0.1, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 0.7],
      [0, 0, 0.6, 0],
    ];
    const { text, score } = ctcDecode(new Float32Array(rows.flat()), rows.length, 4, charset);
    expect(text).toBe("aab b");
    expect(score).toBeCloseTo((0.9 + 1 + 1 + 0.7 + 0.6) / 5);
  });
});

describe("reading order", () => {
  const line = (text: string, x: number, y: number, w = 0.2, h = 0.05): TextLine => ({
    text,
    score: 1,
    quad: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    x,
    y,
    w,
    h,
  });

  it("groups lines into rows, top to bottom and left to right", () => {
    const lines = [
      line("4786m", 0.5, 0.41),
      line("CORAZÓN", 0.1, 0.42),
      line("COTOPAXI", 0.5, 0.2),
      line("15700ft", 0.5, 0.5),
    ];
    expect(readingOrder(lines).map((row) => row.map((l) => l.text))).toEqual([
      ["COTOPAXI"],
      ["CORAZÓN", "4786m"],
      ["15700ft"],
    ]);
    expect(linesToText(lines)).toBe("COTOPAXI\nCORAZÓN  4786m\n15700ft");
  });
});
