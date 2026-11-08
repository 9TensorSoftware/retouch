import {
  boxQuad,
  cropAround,
  detectionColors,
  detectionName,
  FINDING_COLORS,
  keepFindings,
} from "../src/findings";

describe("findings", () => {
  it("turns a box into corners, clockwise from top-left", () => {
    expect(boxQuad({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toEqual([
      [0.1, 0.2],
      [0.4, 0.2],
      [0.4, 0.6000000000000001],
      [0.1, 0.6000000000000001],
    ]);
  });

  it("crops to a box with even room around it", () => {
    // The corgi: a box in the middle of a tall photo crops to about that box,
    // not most of the photo.
    const crop = cropAround([{ x: 0.3, y: 0.31, w: 0.5, h: 0.55 }]);
    expect(crop?.x).toBeCloseTo(0.26);
    expect(crop?.y).toBeCloseTo(0.266);
    expect(crop?.width).toBeCloseTo(0.58);
    expect(crop?.height).toBeCloseTo(0.638);
  });

  it("crops to every box at once, and stays inside the frame", () => {
    const crop = cropAround(
      [
        { x: 0, y: 0.5, w: 0.2, h: 0.2 },
        { x: 0.6, y: 0.7, w: 0.4, h: 0.3 },
      ],
      0.1,
    );
    expect(crop).toEqual({ x: 0, y: expect.closeTo(0.45), width: 1, height: expect.closeTo(0.55) });
    expect(cropAround([])).toBeNull();
  });

  it("calls what the face model finds a face", () => {
    expect(detectionName({})).toBe("face");
    expect(detectionName({ label: "dog" })).toBe("dog");
  });

  it("gives each class one color, in order of first sighting", () => {
    expect(
      detectionColors([{ label: "car" }, { label: "dog" }, { label: "car" }, { label: "cat" }]),
    ).toEqual([FINDING_COLORS[0], FINDING_COLORS[1], FINDING_COLORS[0], FINDING_COLORS[2]]);
  });

  it("keeps findings with the pixels they were found in", () => {
    const kept = keepFindings<string>();
    const first = {};
    const entry = { image: first };
    expect(kept.get(entry)).toBeUndefined();
    kept.set(entry, "found");
    expect(kept.get(entry)).toBe("found");

    // New pixels that may have moved start with nothing; undo brings them back.
    entry.image = {};
    expect(kept.get(entry)).toBeUndefined();
    entry.image = first;
    expect(kept.get(entry)).toBe("found");
  });

  it("carries findings to pixels that line up, and keeps them for undo too", () => {
    const kept = keepFindings<string>();
    const first = {};
    const entry = { image: first };
    kept.set(entry, "found");
    kept.carry(entry, "found");
    const mosaic = {};
    entry.image = mosaic;
    expect(kept.get(entry)).toBe("found");
    entry.image = first;
    expect(kept.get(entry)).toBe("found");
    entry.image = mosaic;
    expect(kept.get(entry)).toBe("found");
  });

  it("drops a carry whose pixels never came", () => {
    const kept = keepFindings<string>();
    const entry = { image: {} };
    kept.carry(entry, "found");
    kept.drop(entry);
    entry.image = {};
    expect(kept.get(entry)).toBeUndefined();
  });
});
