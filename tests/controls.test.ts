import {
  createCard,
  createSection,
  createSegmented,
  createSteps,
  createTiles,
} from "../src/ui/editor/controls";
import { createRuler } from "../src/ui/editor/ruler";

describe("createSection", () => {
  it("folds when collapsible and counts changed controls", () => {
    const section = createSection({ title: "Effects", collapsible: true, open: false });
    expect(section.root.tagName).toBe("DETAILS");
    expect((section.root as HTMLDetailsElement).open).toBe(false);
    const count = section.root.querySelector(".rt-section__count") as HTMLElement;
    expect(count.hidden).toBe(true);
    section.setCount(2);
    expect(count.hidden).toBe(false);
    expect(count.textContent).toBe("2");
    expect(section.root.querySelector(".rt-section__title")?.getAttribute("aria-label")).toBe(
      "Effects, 2 changed",
    );
  });

  it("is a plain titled group otherwise", () => {
    const child = document.createElement("p");
    const section = createSection({ title: "Lens" }, child);
    expect(section.root.tagName).toBe("DIV");
    expect(section.body.contains(child)).toBe(true);
  });
});

describe("createTiles", () => {
  it("presses one tile, reports changes, and swaps previews", () => {
    const onChange = vi.fn();
    const tiles = createTiles({
      label: "Effect",
      options: [
        { value: "none", label: "None", preview: "data:a" },
        { value: "duotone", label: "Duotone" },
      ],
      value: "none",
      onChange,
    });
    const [none, duotone] = [...tiles.root.querySelectorAll<HTMLButtonElement>(".rt-tile")];
    expect(tiles.root.getAttribute("aria-label")).toBe("Effect");
    expect(none.getAttribute("aria-pressed")).toBe("true");
    expect(none.querySelector("img")?.getAttribute("src")).toBe("data:a");
    expect(duotone.querySelector("img")?.hasAttribute("src")).toBe(false);

    duotone.click();
    expect(onChange).toHaveBeenCalledWith("duotone");
    expect(duotone.getAttribute("aria-pressed")).toBe("true");
    duotone.click(); // already pressed: no repeat
    expect(onChange).toHaveBeenCalledOnce();

    tiles.set(null);
    expect(tiles.value).toBeNull();
    expect(duotone.getAttribute("aria-pressed")).toBe("false");
    tiles.setPreview("duotone", "data:b");
    expect(duotone.querySelector("img")?.getAttribute("src")).toBe("data:b");
  });
});

describe("createSegmented", () => {
  it("names terse labels and keeps one pressed", () => {
    const onChange = vi.fn();
    const seg = createSegmented({
      label: "Channel",
      options: [
        { value: "master", label: "RGB" },
        { value: "r", label: "R", title: "Red channel", color: "#f00" },
      ],
      value: "master",
      onChange,
    });
    const [rgb, red] = [...seg.root.querySelectorAll<HTMLButtonElement>("button")];
    expect(red.getAttribute("aria-label")).toBe("Red channel");
    expect(red.querySelector(".rt-segmented__dot")).not.toBeNull();
    red.click();
    expect(onChange).toHaveBeenCalledWith("r");
    expect(rgb.getAttribute("aria-pressed")).toBe("false");
    expect(red.getAttribute("aria-pressed")).toBe("true");
  });
});

describe("createRuler", () => {
  function setup() {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const ruler = createRuler({
      label: "Straighten",
      min: -45,
      max: 45,
      step: 0.1,
      keyStep: 0.1,
      value: 0,
      pxPerUnit: 8,
      format: (v) => `${v.toFixed(1)}°`,
      onInput,
      onChange,
    });
    document.body.appendChild(ruler.root);
    const tape = ruler.root.querySelector(".rt-ruler") as HTMLElement;
    return { ruler, tape, onInput, onChange };
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is a slider for the keyboard: arrows, Shift ×10, Home/End, 0", () => {
    const { ruler, tape, onChange } = setup();
    const key = (k: string, shiftKey = false) =>
      tape.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true }),
      );
    expect(tape.getAttribute("role")).toBe("slider");
    key("ArrowRight");
    expect(ruler.value).toBe(0.1);
    key("ArrowRight", true);
    expect(ruler.value).toBe(1.1);
    expect(tape.getAttribute("aria-valuetext")).toBe("1.1°");
    key("End");
    expect(ruler.value).toBe(45);
    key("0");
    expect(ruler.value).toBe(0);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("reads higher as you pull the tape left, and double-click zeroes it", () => {
    const { ruler, tape, onInput, onChange } = setup();
    // jsdom has no PointerEvent; the ruler only reads these fields.
    const pointer = (type: string, clientX: number) =>
      tape.dispatchEvent(
        Object.assign(new MouseEvent(type, { clientX, button: 0, bubbles: true }), {
          pointerId: 1,
        }),
      );
    pointer("pointerdown", 200);
    pointer("pointermove", 176); // 24 px left at 8 px per degree
    expect(ruler.value).toBe(3);
    expect(onInput).toHaveBeenLastCalledWith(3);
    pointer("pointerup", 176);
    expect(onChange).toHaveBeenLastCalledWith(3);
    tape.dispatchEvent(new MouseEvent("dblclick"));
    expect(ruler.value).toBe(0);
  });
});

describe("createCard", () => {
  it("lays out the description, facts, and a body for controls", () => {
    const card = createCard({
      description: "Removes the background.",
      facts: [
        ["Model", "MODNet"],
        ["Download", "25 MB, once, then saved"],
      ],
    });
    expect(card.root.querySelector(".rt-card__desc")?.textContent).toBe("Removes the background.");
    const dts = [...card.root.querySelectorAll("dt")].map((d) => d.textContent);
    expect(dts).toEqual(["Model", "Download"]);
    card.setFact("Download", "Saved on this device");
    card.setFact("Runs on", "This device · WebGPU");
    expect([...card.root.querySelectorAll("dd")].map((d) => d.textContent)).toEqual([
      "MODNet",
      "Saved on this device",
      "This device · WebGPU",
    ]);
    expect(card.root.contains(card.body)).toBe(true);
  });
});

describe("createSteps", () => {
  it("moves each step through its states and announces the changes", () => {
    const steps = createSteps({
      label: "Progress",
      steps: [
        { label: "Download the model", detail: "25 MB" },
        { label: "Find the subject" },
        { label: "Add to your gallery" },
      ],
    });
    const rows = [...steps.root.querySelectorAll<HTMLElement>(".rt-step")];
    const announcer = steps.root.querySelector("[aria-live]") as HTMLElement;
    expect(rows.map((r) => r.dataset.state)).toEqual(["waiting", "waiting", "waiting"]);

    steps.set(0, "active", { detail: "5 MB of 25 MB", progress: 0.2 });
    const bar = rows[0].querySelector(".rt-step__bar") as HTMLElement;
    expect(bar.hidden).toBe(false);
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("20%");
    expect(rows[0].querySelector(".rt-step__detail")?.textContent).toBe("5 MB of 25 MB");
    expect(announcer.textContent).toBe("Download the model: started");

    steps.set(0, "done", { detail: "25 MB" });
    expect(bar.hidden).toBe(true);
    expect(rows[0].querySelector(".rt-step__mark svg")).not.toBeNull();
    steps.set(1, "failed");
    expect(rows[1].dataset.state).toBe("failed");
    expect(announcer.textContent).toBe("Find the subject: failed");

    steps.reset();
    expect(rows.map((r) => r.dataset.state)).toEqual(["waiting", "waiting", "waiting"]);
    expect(rows[0].querySelector(".rt-step__detail")?.textContent).toBe("25 MB");
  });
});
