import { createDefaultHsl, DEFAULT_ADJUSTMENTS } from "../src/constants";
import type { EditMask } from "../src/types";
import { createAdjustTool } from "../src/ui/editor/adjust-tool";
import { createHslTool } from "../src/ui/editor/hsl-tool";
import { createMasksTool } from "../src/ui/editor/masks-tool";

function field(root: Element, label: string): HTMLInputElement {
  const slider = [...root.querySelectorAll(".rt-slider")].find(
    (s) => s.querySelector(".rt-slider__label")?.textContent?.trim() === label,
  );
  if (!slider) throw new Error(`no slider ${label}`);
  return slider.querySelector(".rt-slider__value") as HTMLInputElement;
}

function range(root: Element, label: string): HTMLInputElement {
  return field(root, label).parentElement?.querySelector('input[type="range"]') as HTMLInputElement;
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
}

describe("adjust pane", () => {
  it("shows all fourteen sliders in four sections, read as offsets from neutral", () => {
    const onChange = vi.fn();
    const tool = createAdjustTool({ adjustments: { ...DEFAULT_ADJUSTMENTS }, onChange });
    const titles = [...tool.root.querySelectorAll(".rt-section__title")].map((t) => t.textContent);
    expect(titles).toEqual(["Light", "Color", "Effects", "Detail"]);
    expect(tool.root.querySelectorAll(".rt-slider")).toHaveLength(14);

    // Brightness rests at 100 and reads "0"; typing "+12" means 112.
    expect(field(tool.root, "Brightness").value).toBe("0");
    type(field(tool.root, "Brightness"), "+12");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ brightness: 112 }));
    expect(field(tool.root, "Hue").value).toBe("0°");

    const light = tool.root.querySelector(".rt-section__count") as HTMLElement;
    expect(light.hidden).toBe(false);
    expect(light.textContent).toBe("1");
  });

  it("syncs silently from outside", () => {
    const onChange = vi.fn();
    const tool = createAdjustTool({ adjustments: { ...DEFAULT_ADJUSTMENTS }, onChange });
    tool.setAdjustments({ ...DEFAULT_ADJUSTMENTS, temperature: 25, grain: 10 });
    expect(onChange).not.toHaveBeenCalled();
    expect(range(tool.root, "Temperature").value).toBe("25");
    const counts = [...tool.root.querySelectorAll<HTMLElement>(".rt-section__count")].map((c) =>
      c.hidden ? 0 : Number(c.textContent),
    );
    expect(counts).toEqual([0, 1, 1, 0]);
  });
});

describe("color mix pane", () => {
  it("picks a band by swatch and retints its sliders", () => {
    const onChange = vi.fn();
    const tool = createHslTool({ hsl: createDefaultHsl(), onChange });
    const swatches = [...tool.root.querySelectorAll<HTMLButtonElement>(".rt-swatch")];
    expect(swatches).toHaveLength(8);
    expect(swatches[0].getAttribute("aria-pressed")).toBe("true");

    swatches[5].click(); // blue
    expect(tool.root.querySelector(".rt-hsl__name")?.textContent).toBe("Blue");
    const sat = range(tool.root, "Saturation");
    expect(sat.getAttribute("aria-label")).toBe("Blue saturation");
    expect(sat.style.getPropertyValue("--rt-slider-track")).toContain("hsl(240");

    sat.value = "40";
    sat.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ blue: { h: 0, s: 40, l: 0 } }),
    );
    expect(swatches[5].classList.contains("rt-swatch--touched")).toBe(true);
    expect(swatches[5].getAttribute("aria-label")).toBe("Blue, changed");
  });
});

describe("masks pane", () => {
  function setup(masks: EditMask[] = []) {
    const onChange = vi.fn();
    const onSelectionChange = vi.fn();
    const tool = createMasksTool({ masks, onChange, onSelectionChange });
    document.body.appendChild(tool.root);
    const add = (kind: "linear" | "radial") =>
      [...tool.root.querySelectorAll<HTMLButtonElement>(".rt-masks__add-btn")]
        .find((b) => b.textContent?.includes(kind))
        ?.click();
    const names = () =>
      [...tool.root.querySelectorAll(".rt-masklist__name")].map((n) => n.textContent);
    const lastMasks = (): EditMask[] => onChange.mock.lastCall?.[0];
    return { tool, onChange, onSelectionChange, add, names, lastMasks };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("starts empty with a hint, and lists masks as you add them", () => {
    const { tool, add, names, onSelectionChange } = setup();
    expect((tool.root.querySelector(".rt-masks__empty") as HTMLElement).hidden).toBe(false);
    expect((tool.root.querySelector(".rt-section") as HTMLElement).hidden).toBe(true);
    add("radial");
    add("linear");
    expect(names()).toEqual(["Radial 1", "Linear 2"]);
    expect(
      tool.root.querySelector(".rt-masklist__row--selected .rt-masklist__name")?.textContent,
    ).toBe("Linear 2");
    expect(onSelectionChange).toHaveBeenLastCalledWith(tool.getSelectedId());
    expect((tool.root.querySelector(".rt-section") as HTMLElement).hidden).toBe(false);
  });

  it("dials the selected mask, toggles invert, and deletes keeping focus in the list", () => {
    const { tool, add, names, lastMasks } = setup();
    add("radial");
    add("linear");
    const exposure = range(tool.root, "Exposure");
    expect(exposure.getAttribute("aria-label")).toBe("Linear 2 exposure");
    exposure.value = "35";
    exposure.dispatchEvent(new Event("input"));
    expect(lastMasks()[1].adjust.exposure).toBe(35);
    expect(lastMasks()[0].adjust.exposure).toBe(0);
    expect(tool.root.querySelectorAll(".rt-masklist__dot--on")).toHaveLength(1);

    const invert = tool.root.querySelector<HTMLButtonElement>(
      '.rt-masklist__icon[aria-label="Invert Linear 2"]',
    );
    invert?.focus();
    invert?.click();
    expect(lastMasks()[1].invert).toBe(true);
    // Repainted in place: the same button keeps focus.
    expect(document.activeElement).toBe(invert);
    expect(invert?.getAttribute("aria-pressed")).toBe("true");

    const remove = tool.root.querySelector<HTMLButtonElement>(
      '.rt-masklist__icon[aria-label="Delete Radial 1"]',
    );
    remove?.focus();
    remove?.click();
    expect(names()).toEqual(["Linear 1"]);
    expect(lastMasks()).toHaveLength(1);
    expect(tool.root.contains(document.activeElement)).toBe(true);
  });

  it("syncs from outside without reporting a change", () => {
    const { tool, onChange, names } = setup();
    tool.setMasks([
      {
        id: "m1",
        kind: "radial",
        x0: 0.5,
        y0: 0.5,
        x1: 0.7,
        y1: 0.7,
        invert: false,
        adjust: {
          exposure: 0,
          brightness: 0,
          contrast: 20,
          saturation: 0,
          temperature: 0,
          tint: 0,
        },
      },
    ]);
    expect(onChange).not.toHaveBeenCalled();
    expect(names()).toEqual(["Radial 1"]);
    expect(range(tool.root, "Contrast").value).toBe("20");
  });
});
