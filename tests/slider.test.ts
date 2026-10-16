import { createSlider, parseTyped, signed, snapToStep } from "../src/ui/editor/slider";

function parts(root: HTMLElement) {
  return {
    range: root.querySelector<HTMLInputElement>('input[type="range"]') as HTMLInputElement,
    field: root.querySelector<HTMLInputElement>(".rt-slider__value") as HTMLInputElement,
    label: root.querySelector(".rt-slider__label") as HTMLElement,
  };
}

function press(el: Element, key: string, shiftKey = false): void {
  el.dispatchEvent(
    new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }),
  );
}

describe("slider helpers", () => {
  it("reads typed values with signs, units and a typographic minus", () => {
    expect(parseTyped("35")).toBe(35);
    expect(parseTyped("+12")).toBe(12);
    expect(parseTyped("−12")).toBe(-12);
    expect(parseTyped("-4.5°")).toBe(-4.5);
    expect(parseTyped("80%")).toBe(80);
    expect(parseTyped("1,5")).toBe(1.5);
    expect(parseTyped("abc")).toBeNull();
  });

  it("clamps and snaps to the step grid", () => {
    expect(snapToStep(105.6, 0, 200, 1)).toBe(106);
    expect(snapToStep(400, -180, 180, 1)).toBe(180);
    expect(snapToStep(2.04, -45, 45, 0.1)).toBe(2);
    expect(snapToStep(-0.06, -45, 45, 0.1)).toBe(-0.1);
  });

  it("signs values with a true minus and never shows −0", () => {
    expect(signed(12)).toBe("+12");
    expect(signed(-12)).toBe("−12");
    expect(signed(0)).toBe("0");
    expect(signed(-0.04, 1)).toBe("0.0");
    expect(signed(2.5, 1)).toBe("+2.5");
    expect(signed(40, 0, false)).toBe("40");
  });
});

describe("createSlider", () => {
  it("commits a typed value on Enter, clamped and snapped, as one gesture", () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const slider = createSlider({
      label: "Exposure",
      min: -100,
      max: 100,
      value: 0,
      onInput,
      onChange,
    });
    const { field, range } = parts(slider.root);
    expect(field.value).toBe("0");
    expect(field.getAttribute("aria-label")).toBe("Exposure value");

    field.value = "35";
    press(field, "Enter");
    expect(range.value).toBe("35");
    expect(field.value).toBe("+35");
    expect(onInput).toHaveBeenLastCalledWith(35);
    expect(onChange).toHaveBeenLastCalledWith(35);

    field.value = "250";
    press(field, "Enter");
    expect(slider.value).toBe(100);

    // Not a number: put the value back, report nothing.
    onInput.mockClear();
    field.value = "warm";
    field.dispatchEvent(new Event("blur"));
    expect(field.value).toBe("+100");
    expect(onInput).not.toHaveBeenCalled();
  });

  it("steps from the field with the arrow keys, Shift for ten", () => {
    const onInput = vi.fn();
    const slider = createSlider({ label: "Tint", min: -100, max: 100, value: 0, onInput });
    const { field } = parts(slider.root);
    press(field, "ArrowUp");
    expect(slider.value).toBe(1);
    press(field, "ArrowDown", true);
    expect(slider.value).toBe(-9);
    expect(field.value).toBe("−9");
  });

  it("reads typed values through a custom parse (offsets from neutral)", () => {
    const slider = createSlider({
      label: "Brightness",
      min: 0,
      max: 200,
      value: 100,
      neutral: 100,
      format: (v) => signed(v - 100),
      parse: (text) => {
        const n = parseTyped(text);
        return n === null ? null : n + 100;
      },
      onInput: vi.fn(),
    });
    const { field } = parts(slider.root);
    field.value = "−12";
    press(field, "Enter");
    expect(slider.value).toBe(88);
    expect(field.value).toBe("−12");
  });

  it("marks itself changed off neutral and double-click returns to neutral", () => {
    const onInput = vi.fn();
    const slider = createSlider({
      label: "Contrast",
      min: 0,
      max: 200,
      value: 100,
      neutral: 100,
      onInput,
    });
    const { label, range } = parts(slider.root);
    expect(slider.root.classList.contains("rt-slider--changed")).toBe(false);
    slider.set(130);
    expect(slider.root.classList.contains("rt-slider--changed")).toBe(true);
    expect(onInput).not.toHaveBeenCalled(); // set() is silent

    label.dispatchEvent(new MouseEvent("dblclick"));
    expect(slider.value).toBe(100);
    expect(onInput).toHaveBeenLastCalledWith(100);
    expect(slider.root.classList.contains("rt-slider--changed")).toBe(false);

    slider.set(60);
    range.dispatchEvent(new MouseEvent("dblclick"));
    expect(slider.value).toBe(100);
  });

  it("paints a semantic track instead of the fill, and fills from fillFrom", () => {
    const slider = createSlider({
      label: "Temperature",
      min: -100,
      max: 100,
      value: 0,
      track: "linear-gradient(90deg, blue, orange)",
      onInput: vi.fn(),
    });
    const { range } = parts(slider.root);
    expect(slider.root.classList.contains("rt-slider--track")).toBe(true);
    expect(range.style.getPropertyValue("--rt-slider-track")).toContain("linear-gradient");
    slider.setTrack(null);
    expect(slider.root.classList.contains("rt-slider--track")).toBe(false);

    const intensity = createSlider({
      label: "Intensity",
      min: 0,
      max: 100,
      value: 60,
      neutral: 100,
      fillFrom: 0,
      onInput: vi.fn(),
    });
    const fill = parts(intensity.root).range;
    expect(fill.style.getPropertyValue("--rt-fill-a")).toBe("0%");
    expect(fill.style.getPropertyValue("--rt-fill-b")).toBe("60%");
    expect(intensity.root.classList.contains("rt-slider--changed")).toBe(true);
  });

  it("renames for assistive tech and disables both inputs", () => {
    const slider = createSlider({ label: "Hue", min: -100, max: 100, value: 0, onInput: vi.fn() });
    const { range, field } = parts(slider.root);
    slider.setLabel("Hue", "Blue hue");
    expect(range.getAttribute("aria-label")).toBe("Blue hue");
    expect(field.getAttribute("aria-label")).toBe("Blue hue value");
    slider.setDisabled(true);
    expect(range.disabled && field.disabled).toBe(true);
  });
});
