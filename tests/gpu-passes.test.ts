import { describe, expect, it } from "vitest";
import { createDefaultStylize } from "../src/constants";
import { buildCurveLuts } from "../src/utils/curves";
import type { PostPasses } from "../src/utils/gpu-passes";
import { GpuPasses, postPassesAreNeutral } from "../src/utils/gpu-passes";

const none = (): PostPasses => ({
  clarity: 0,
  dehaze: 0,
  masks: [],
  hueTable: null,
  curveLuts: null,
  stylize: createDefaultStylize(),
});

describe("post passes", () => {
  it("are neutral only when no pass would change a pixel", () => {
    expect(postPassesAreNeutral(none())).toBe(true);
    expect(postPassesAreNeutral({ ...none(), clarity: 10 })).toBe(false);
    expect(postPassesAreNeutral({ ...none(), dehaze: -10 })).toBe(false);
    const curves = {
      master: [
        { x: 0, y: 0.1 },
        { x: 1, y: 1 },
      ],
      r: [],
      g: [],
      b: [],
    };
    expect(postPassesAreNeutral({ ...none(), curveLuts: buildCurveLuts(curves) })).toBe(false);
    expect(
      postPassesAreNeutral({
        ...none(),
        stylize: { ...createDefaultStylize(), kind: "posterize" },
      }),
    ).toBe(false);
  });

  it("have no GPU runner without WebGL2, so the preview keeps the CPU passes", () => {
    expect(GpuPasses.create()).toBeNull();
  });
});
