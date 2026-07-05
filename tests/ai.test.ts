import type { AiContext } from "../src/ai/interpreter";
import { buildSchema, buildSystem, interpretCommand, validateAiOps } from "../src/ai/interpreter";
import { createDefaultVideoEdits, DEFAULT_EDITS } from "../src/constants";
import type { AiRequest } from "../src/types";
import { createAiBar } from "../src/ui/editor/ai-bar";

const IMAGE_CTX: AiContext = {
  kind: "image",
  width: 800,
  height: 600,
  edits: structuredClone(DEFAULT_EDITS),
};

const VIDEO_CTX: AiContext = {
  kind: "video",
  width: 640,
  height: 360,
  duration: 10,
  edits: createDefaultVideoEdits(10),
};

describe("validateAiOps clamping", () => {
  it("rejects non-object responses", () => {
    expect(() => validateAiOps(null, IMAGE_CTX)).toThrow();
    expect(() => validateAiOps("bw", IMAGE_CTX)).toThrow();
  });

  it("clamps rotation and adjustments into range", () => {
    const ops = validateAiOps(
      { rotation: 900, adjustments: { brightness: 500, contrast: -50 }, explanation: "x" },
      IMAGE_CTX,
    );
    expect(ops.rotation).toBe(45);
    expect(ops.adjustments).toEqual({ brightness: 200, contrast: 0 });
  });

  it("whitelists filter presets and drops hallucinated ones", () => {
    expect(validateAiOps({ filter: "bw", explanation: "x" }, IMAGE_CTX).filter).toBe("bw");
    expect(
      validateAiOps({ filter: "x-pro-ii", explanation: "x" }, IMAGE_CTX).filter,
    ).toBeUndefined();
  });

  it("clamps crop rects into the unit square with a minimum size", () => {
    const ops = validateAiOps(
      { crop: { x: -2, y: 0.9, width: 9, height: 0.01 }, explanation: "x" },
      IMAGE_CTX,
    );
    expect(ops.crop).toEqual({ x: 0, y: 0.9, width: 1, height: expect.closeTo(0.05, 5) });
  });

  it("ignores trim and mute for images but clamps them for video", () => {
    const imageOps = validateAiOps(
      { trim: { start: 1, end: 3 }, mute: true, explanation: "x" },
      IMAGE_CTX,
    );
    expect(imageOps.trim).toBeUndefined();
    expect(imageOps.mute).toBeUndefined();

    const videoOps = validateAiOps(
      { trim: { start: -5, end: 50 }, mute: true, explanation: "x" },
      VIDEO_CTX,
    );
    expect(videoOps.trim).toEqual({ start: 0, end: 10 });
    expect(videoOps.mute).toBe(true);
  });

  it("accepts aspect presets and falls back to a default explanation", () => {
    const ops = validateAiOps({ aspect: "1:1" }, IMAGE_CTX);
    expect(ops.aspect).toBe("1:1");
    expect(typeof ops.explanation).toBe("string");
  });

  it("ignores unknown keys entirely", () => {
    const ops = validateAiOps(
      { explanation: "x", inpaint: true, magic: { delete: "everything" } },
      IMAGE_CTX,
    );
    expect(Object.keys(ops)).toEqual(["explanation"]);
  });

  it("clamps the expanded adjustment set per its range", () => {
    const ops = validateAiOps(
      {
        adjustments: { temperature: -999, hue: 500, blur: 400, vignette: -5, vibrance: 60 },
        explanation: "x",
      },
      IMAGE_CTX,
    );
    expect(ops.adjustments).toEqual({
      temperature: -100,
      hue: 180,
      blur: 100,
      vignette: 0,
      vibrance: 60,
    });
  });

  it("clamps filter strength and validates orientation/flips", () => {
    const ops = validateAiOps(
      { filter: "kodachrome", filterStrength: 250, orientation: 90, flipH: true, explanation: "x" },
      IMAGE_CTX,
    );
    expect(ops.filterStrength).toBe(100);
    expect(ops.orientation).toBe(90);
    expect(ops.flipH).toBe(true);
    expect(ops.flipV).toBeUndefined();
    // 45 is not a legal orientation
    expect(
      validateAiOps({ orientation: 45, explanation: "x" }, IMAGE_CTX).orientation,
    ).toBeUndefined();
  });

  it("clamps speed for video and ignores it for images", () => {
    expect(validateAiOps({ speed: 100, explanation: "x" }, VIDEO_CTX).speed).toBe(4);
    expect(validateAiOps({ speed: 0.01, explanation: "x" }, VIDEO_CTX).speed).toBe(0.25);
    expect(validateAiOps({ speed: 2, explanation: "x" }, IMAGE_CTX).speed).toBeUndefined();
  });
});

describe("AI request building", () => {
  it("includes trim/mute in the schema only for video", () => {
    const imageProps = (buildSchema(IMAGE_CTX) as { properties: Record<string, unknown> })
      .properties;
    const videoProps = (buildSchema(VIDEO_CTX) as { properties: Record<string, unknown> })
      .properties;
    expect(imageProps.trim).toBeUndefined();
    expect(imageProps.mute).toBeUndefined();
    expect(videoProps.trim).toBeDefined();
    expect(videoProps.mute).toBeDefined();
  });

  it("describes the media and current edits in the system prompt", () => {
    const system = buildSystem(VIDEO_CTX);
    expect(system).toContain("10.0s video");
    expect(system).toContain("640×360");
    expect(system).toContain('"filter":"none"');
  });
});

describe("interpretCommand with a custom transport", () => {
  it("routes through complete() and validates the result", async () => {
    const complete = vi.fn(async (_request: AiRequest) => ({
      filter: "sepia",
      rotation: 200,
      explanation: "Sepia + straighten",
    }));
    const ops = await interpretCommand({ complete }, "make it old-timey", IMAGE_CTX);
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "make it old-timey",
        schema: expect.any(Object),
        system: expect.any(String),
      }),
    );
    expect(ops.filter).toBe("sepia");
    expect(ops.rotation).toBe(45);
  });

  it("surfaces transport failures", async () => {
    const complete = vi.fn(async () => {
      throw new Error("proxy down");
    });
    await expect(interpretCommand({ complete }, "x", IMAGE_CTX)).rejects.toThrow("proxy down");
  });
});

describe("AI bar", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
  });

  it("submits on Enter and shows the explanation", async () => {
    const onSubmit = vi.fn(async () => "Made it B&W");
    const bar = createAiBar({ ai: { complete: async () => ({}) }, onSubmit });
    document.body.appendChild(bar.root);

    const input = bar.root.querySelector(".rt-ai-bar__input") as HTMLInputElement;
    input.value = "make it bw";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith("make it bw"));
    await vi.waitFor(() =>
      expect(bar.root.querySelector(".rt-ai-bar__status")?.textContent).toBe("Made it B&W"),
    );
    expect(input.value).toBe("");
    bar.destroy();
  });

  it("shows an error state when the command fails", async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error("[Retouch] Invalid API key");
    });
    const bar = createAiBar({ ai: { apiKey: "sk-test" }, onSubmit });
    document.body.appendChild(bar.root);
    const input = bar.root.querySelector(".rt-ai-bar__input") as HTMLInputElement;
    input.value = "do a thing";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() =>
      expect(bar.root.querySelector(".rt-ai-bar__status--error")?.textContent).toBe(
        "Invalid API key",
      ),
    );
    bar.destroy();
  });

  it("opens the key popover instead of submitting when allowUserKey has no stored key", () => {
    const onSubmit = vi.fn(async () => "ok");
    const bar = createAiBar({ ai: { allowUserKey: true }, onSubmit });
    document.body.appendChild(bar.root);
    const input = bar.root.querySelector(".rt-ai-bar__input") as HTMLInputElement;
    input.value = "anything";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(bar.root.querySelector(".rt-ai-bar__popover")).not.toBeNull();

    const keyInput = bar.root.querySelector(".rt-ai-bar__key-input") as HTMLInputElement;
    keyInput.value = "sk-ant-test";
    (bar.root.querySelector(".rt-ai-bar__popover .rt-ai-bar__submit") as HTMLElement).click();
    expect(localStorage.getItem("rt-ai-key")).toBe("sk-ant-test");
    expect(bar.root.querySelector(".rt-ai-bar__popover")).toBeNull();
    bar.destroy();
  });
});
