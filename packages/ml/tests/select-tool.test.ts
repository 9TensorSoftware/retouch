import type { SamCandidates } from "../src/sam";
import {
  clickedPoints,
  createSelectionHistory,
  distinctShapes,
  EMPTY_SELECTION,
  shapeContains,
  shapeLabels,
} from "../src/select-tool";

const SIDE = 256;

/** Candidates on a 10×10 photo grid, each given by the cells it covers. */
function candidates(shapes: [number, number, number, number][], order?: number[]): SamCandidates {
  const masks = new Float32Array(shapes.length * SIDE * SIDE).fill(-5);
  shapes.forEach(([x0, y0, x1, y1], i) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) masks[i * SIDE * SIDE + y * SIDE + x] = 5;
    }
  });
  return {
    masks,
    region: { width: 10, height: 10, stride: SIDE },
    order: order ?? shapes.map((_, i) => i),
    iou: new Float32Array(shapes.length).fill(0.9),
    width: 100,
    height: 100,
  };
}

describe("what a click does", () => {
  const one = [{ x: 0.5, y: 0.5, label: 1 as const }];

  it("starts a new selection in Select mode, whatever was selected", () => {
    expect(clickedPoints(one, "new", 0.2, 0.2)).toEqual([{ x: 0.2, y: 0.2, label: 1 }]);
  });

  it("adds or takes away in those modes, or with Shift and Alt", () => {
    expect(clickedPoints(one, "add", 0.2, 0.2)).toEqual([...one, { x: 0.2, y: 0.2, label: 1 }]);
    expect(clickedPoints(one, "remove", 0.2, 0.2)).toEqual([...one, { x: 0.2, y: 0.2, label: 0 }]);
    expect(clickedPoints(one, "new", 0.2, 0.2, { shift: true })?.at(-1)?.label).toBe(1);
    expect(clickedPoints(one, "new", 0.2, 0.2, { alt: true })?.at(-1)?.label).toBe(0);
  });

  it("selects with the first click in any mode, but has nothing to take away from", () => {
    expect(clickedPoints([], "add", 0.2, 0.2)).toEqual([{ x: 0.2, y: 0.2, label: 1 }]);
    expect(clickedPoints([], "remove", 0.2, 0.2)).toBeNull();
  });
});

describe("selection history", () => {
  it("takes back every step, Deselect included, and redoes them", () => {
    const history = createSelectionHistory();
    expect(history.canUndo).toBe(false);
    const a = { points: [{ x: 0.1, y: 0.1, label: 1 as const }], shape: null };
    const b = { points: a.points, shape: 2 };
    history.set(a);
    history.set(b);
    history.set(EMPTY_SELECTION);
    expect(history.undo()).toBe(true);
    expect(history.current).toBe(b);
    history.undo();
    expect(history.current).toBe(a);
    history.undo();
    expect(history.current).toBe(EMPTY_SELECTION);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(history.current).toBe(a);
    // A new step drops what was undone.
    history.set(b);
    expect(history.canRedo).toBe(false);
  });

  it("forgets everything when the photo changes", () => {
    const history = createSelectionHistory();
    history.set({ points: [{ x: 0.1, y: 0.1, label: 1 }], shape: null });
    history.reset();
    expect(history.current).toBe(EMPTY_SELECTION);
    expect(history.canUndo).toBe(false);
  });
});

describe("shapes to offer", () => {
  it("lists them smallest first, without empty ones or near-copies of a better one", () => {
    // 1: 6×6, the model's favourite; 2: 2×2; 0: the 6×6 plus one more cell; 3: nothing.
    const found = candidates(
      [
        [0, 0, 6, 6],
        [0, 0, 6, 6],
        [2, 2, 4, 4],
        [0, 0, 0, 0],
      ],
      [1, 0, 2, 3],
    );
    found.masks[0 * SIDE * SIDE + 6 * SIDE + 0] = 5;
    expect(distinctShapes(found)).toEqual([2, 1]);
  });

  it("names them by size", () => {
    expect(shapeLabels(1)).toEqual(["Selected"]);
    expect(shapeLabels(2)).toEqual(["Smaller", "Larger"]);
    expect(shapeLabels(3)).toEqual(["Small", "Medium", "Large"]);
  });

  it("knows what's inside a shape", () => {
    const found = candidates([[2, 2, 4, 4]]);
    expect(shapeContains(found, 0, 0.3, 0.3)).toBe(true);
    expect(shapeContains(found, 0, 0.8, 0.8)).toBe(false);
  });
});
