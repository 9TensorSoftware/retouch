import { createDefaultVideoEdits } from "../src/constants";
import { createFramePipeline, EXPORT_MAX_DIM } from "../src/export/frame-pipeline";

describe("frame pipeline geometry", () => {
  it("is identity for untouched edits at native size", () => {
    const p = createFramePipeline(createDefaultVideoEdits(5), 640, 360);
    expect(p.isIdentity).toBe(true);
    expect(p.outWidth).toBe(640);
    expect(p.outHeight).toBe(360);
    p.dispose();
  });

  it("caps output to the export limit and keeps dimensions even", () => {
    const p = createFramePipeline(createDefaultVideoEdits(5), 3840, 2160);
    expect(p.isIdentity).toBe(false);
    expect(p.outWidth).toBeLessThanOrEqual(EXPORT_MAX_DIM);
    expect(p.outWidth % 2).toBe(0);
    expect(p.outHeight % 2).toBe(0);
    expect(p.outWidth / p.outHeight).toBeCloseTo(16 / 9, 1);
    p.dispose();
  });

  it("crops to the requested region", () => {
    const edits = createDefaultVideoEdits(5);
    edits.crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
    const p = createFramePipeline(edits, 640, 360);
    expect(p.isIdentity).toBe(false);
    expect(p.outWidth).toBe(320);
    expect(p.outHeight).toBe(180);
    p.dispose();
  });

  it("crops rotation to the inscribed window instead of expanding", () => {
    const edits = createDefaultVideoEdits(5);
    edits.rotation = 45;
    const p = createFramePipeline(edits, 400, 400);
    const expected = Math.round(400 * Math.SQRT1_2); // largest inscribed square at 45°
    expect(Math.abs(p.outWidth - expected)).toBeLessThanOrEqual(2);
    expect(p.outWidth % 2).toBe(0);
    expect(p.isIdentity).toBe(false);
    p.dispose();
  });

  it("keystone breaks identity so the export re-encodes", () => {
    const edits = createDefaultVideoEdits(5);
    edits.keystoneV = 30;
    const p = createFramePipeline(edits, 400, 400);
    expect(p.isIdentity).toBe(false);
    p.dispose();
  });

  it("processFrame draws the full source through the crop transform", () => {
    const edits = createDefaultVideoEdits(5);
    edits.crop = { x: 0.5, y: 0, width: 0.5, height: 1 };
    const p = createFramePipeline(edits, 200, 100);
    const calls: number[][] = [];
    const sample = {
      draw: (_ctx: CanvasRenderingContext2D, ...args: number[]) => {
        calls.push(args);
      },
    };
    const result = p.processFrame(sample);
    expect(result).toBeInstanceOf(HTMLCanvasElement);
    // The crop is realized by the canvas transform + the 100px-wide target,
    // so the sample is asked for its full 200×100 frame.
    expect(result.width).toBe(100);
    expect(calls[0].slice(0, 4)).toEqual([0, 0, 200, 100]);
    p.dispose();
  });
});
