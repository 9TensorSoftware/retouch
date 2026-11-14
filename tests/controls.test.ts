import {
  createCard,
  createModel,
  createSection,
  createSegmented,
  createStatus,
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

describe("createModel", () => {
  const parts = (model: ReturnType<typeof createModel>) => ({
    label: model.root.querySelector(".rt-model__label")?.textContent,
    detail: model.root.querySelector(".rt-model__detail")?.textContent,
    main: model.root.querySelector(".rt-model__main") as HTMLButtonElement,
    ready: model.root.querySelector(".rt-model__ready") as HTMLElement,
    announced: model.root.querySelector("[aria-live]")?.textContent,
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stays out of sight until it knows, then offers the download with its size", () => {
    const onDownload = vi.fn();
    const model = createModel({ bytes: 208e6, onDownload });
    expect(model.root.hidden).toBe(true);
    expect(model.state).toBeNull();
    model.set("missing");
    expect(model.root.hidden).toBe(false);
    expect(parts(model)).toMatchObject({ label: "Download", detail: "208 MB" });
    parts(model).main.click();
    expect(onDownload).toHaveBeenCalledTimes(1);
  });

  it("fills while it downloads, gives the time left once it can, and holds clicks", () => {
    vi.useFakeTimers();
    const onDownload = vi.fn();
    const model = createModel({ bytes: 100e6, onDownload });
    model.progress(0, 100e6);
    expect(model.state).toBe("downloading");
    expect(parts(model)).toMatchObject({ label: "0 of 100 MB", detail: "" });
    expect(parts(model).main.getAttribute("aria-disabled")).toBe("true");
    expect(parts(model).announced).toBe("Downloading");
    parts(model).main.click();
    expect(onDownload).not.toHaveBeenCalled();
    // 10 MB a second for two seconds: 80 MB to go is 8 seconds.
    for (let t = 1; t <= 8; t++) {
      vi.advanceTimersByTime(250);
      model.progress(t * 2.5e6, 100e6);
    }
    expect(parts(model)).toMatchObject({ label: "20 of 100 MB", detail: "8 s left" });
    expect(model.root.querySelector<HTMLElement>(".rt-model__fill")?.style.width).toBe("20%");
  });

  it("says Ready, quietly, and offers to try again when a download fails", () => {
    const model = createModel({ bytes: null, name: "Erase", onDownload: vi.fn() });
    model.set("missing");
    expect(parts(model)).toMatchObject({ label: "Download Erase", detail: "" });
    model.set("failed");
    expect(parts(model)).toMatchObject({ label: "Try again", detail: "Download failed" });
    model.set("ready");
    expect(parts(model).main.hidden).toBe(true);
    expect(parts(model).ready.hidden).toBe(false);
    expect(parts(model).ready.textContent).toBe("Erase is ready");
  });

  it("keeps what the model is behind the info button", () => {
    const model = createModel({
      bytes: 26e6,
      about: { text: "Runs here.", facts: [["Model", "MODNet"]] },
      onDownload: vi.fn(),
    });
    const info = model.root.querySelector(".rt-model__info") as HTMLButtonElement;
    const about = model.root.querySelector(".rt-model__about") as HTMLElement;
    expect(about.hidden).toBe(true);
    expect(info.getAttribute("aria-controls")).toBe(about.id);
    info.click();
    expect(about.hidden).toBe(false);
    expect(info.getAttribute("aria-expanded")).toBe("true");
    model.setFact("Saved", "In this browser");
    expect([...about.querySelectorAll("dt")].map((dt) => dt.textContent)).toEqual([
      "Model",
      "Saved",
    ]);
    expect(about.textContent).toContain("Runs here.");
  });
});

describe("createStatus", () => {
  it("shows a run working, with a bar while there's progress, then done or failed", () => {
    const status = createStatus();
    const label = () => status.root.querySelector(".rt-status__label")?.textContent;
    const bar = () => status.root.querySelector<HTMLElement>(".rt-step__bar");
    expect(status.root.hidden).toBe(true);
    status.working("Upscaling…");
    expect(status.root.dataset.state).toBe("active");
    expect(bar()?.hidden).toBe(true);
    status.working("Upscaling…", { detail: "40%", progress: 0.4 });
    expect(bar()?.hidden).toBe(false);
    expect(status.root.querySelector(".rt-step__detail")?.textContent).toBe("40%");
    status.done("Added to your gallery");
    expect(status.root.dataset.state).toBe("done");
    expect(label()).toBe("Added to your gallery");
    expect(status.root.querySelector(".rt-step__mark svg")).not.toBeNull();
    status.failed("Upscale failed");
    expect(status.root.dataset.state).toBe("failed");
    expect(status.root.querySelector("[aria-live]")?.textContent).toBe("Upscale failed");
    status.clear();
    expect(status.root.hidden).toBe(true);
  });
});
