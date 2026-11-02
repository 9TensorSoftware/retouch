import { createEditor } from "../src/ui/editor/editor";
import type { ToolContext } from "../src/ui/editor/tool-registry";
import { registerEditorTool } from "../src/ui/editor/tool-registry";
import { createToolUi } from "../src/ui/editor/tool-ui";
import { makeImageEntry, stubLayout } from "./editor-helpers";

function rangeOf(root: HTMLElement): HTMLInputElement {
  return root.querySelector("input") as HTMLInputElement;
}

/** The value field beside the label (typed values land here too). */
function readout(root: HTMLElement): string | undefined {
  return root.querySelector<HTMLInputElement>(".rt-dock__slider-value")?.value;
}

describe("createToolUi", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("builds a slider that reports input, change and double-click reset", () => {
    const onInput = vi.fn();
    const onChange = vi.fn();
    const slider = createToolUi().slider({
      label: "Exposure",
      min: -100,
      max: 100,
      value: 20,
      onInput,
      onChange,
    });
    const input = rangeOf(slider.root);
    expect(input.getAttribute("aria-label")).toBe("Exposure");
    expect(readout(slider.root)).toBe("+20");
    expect(input.getAttribute("aria-valuetext")).toBe("+20");
    // The fill grows from zero (the middle of a bipolar range) to the thumb.
    expect(input.style.getPropertyValue("--rt-fill-a")).toBe("50%");
    expect(input.style.getPropertyValue("--rt-fill-b")).toBe("60%");

    input.value = "-30";
    input.dispatchEvent(new Event("input"));
    expect(onInput).toHaveBeenLastCalledWith(-30);
    expect(slider.value).toBe(-30);
    expect(onChange).not.toHaveBeenCalled();
    input.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenLastCalledWith(-30);

    slider.root.querySelector(".rt-dock__slider-label")?.dispatchEvent(new MouseEvent("dblclick"));
    expect(slider.value).toBe(0);
    expect(onInput).toHaveBeenLastCalledWith(0);
    expect(onChange).toHaveBeenLastCalledWith(0);
  });

  it("moves a slider silently with set(), filling unipolar ranges from min", () => {
    const onInput = vi.fn();
    const slider = createToolUi().slider({
      label: "Grain",
      min: 0,
      max: 100,
      value: 0,
      format: (v) => `${v}%`,
      onInput,
    });
    slider.set(40);
    expect(onInput).not.toHaveBeenCalled();
    expect(readout(slider.root)).toBe("40%");
    const input = rangeOf(slider.root);
    expect(input.style.getPropertyValue("--rt-fill-a")).toBe("0%");
    expect(input.style.getPropertyValue("--rt-fill-b")).toBe("40%");
  });

  it("builds buttons with primary, toggle and disabled states", () => {
    const ui = createToolUi();
    const onClick = vi.fn();
    const primary = ui.button({ label: "Remove background", variant: "primary", onClick });
    expect(primary.root.type).toBe("button");
    expect(primary.root.classList.contains("rt-dock__chip--primary")).toBe(true);
    expect(primary.root.hasAttribute("aria-pressed")).toBe(false);
    primary.root.click();
    expect(onClick).toHaveBeenCalledOnce();
    primary.setLabel("Working…");
    expect(primary.root.textContent).toBe("Working…");

    const toggle = ui.button({ label: "Subtract", active: false, onClick: () => {} });
    expect(toggle.root.getAttribute("aria-pressed")).toBe("false");
    toggle.setActive(true);
    expect(toggle.root.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.root.classList.contains("rt-dock__chip--active")).toBe(true);

    const off = ui.button({ label: "Erase", disabled: true, onClick });
    expect(off.root.disabled).toBe(true);
    off.setDisabled(false);
    expect(off.root.disabled).toBe(false);
  });

  it("builds a choice that fires only on a real change and selects silently via set()", () => {
    const onChange = vi.fn();
    const choice = createToolUi().choice({
      label: "Aspect ratio",
      options: [
        { value: "free", label: "Free" },
        { value: "square", label: "1:1" },
      ],
      value: "free",
      onChange,
    });
    expect(choice.root.getAttribute("role")).toBe("group");
    expect(choice.root.getAttribute("aria-label")).toBe("Aspect ratio");
    const [free, square] = choice.root.querySelectorAll("button");
    expect(free.getAttribute("aria-pressed")).toBe("true");

    free.click();
    expect(onChange).not.toHaveBeenCalled();
    square.click();
    expect(onChange).toHaveBeenCalledWith("square");
    expect(choice.value).toBe("square");
    expect(square.getAttribute("aria-pressed")).toBe("true");

    choice.set("free");
    expect(onChange).toHaveBeenCalledOnce();
    expect(free.getAttribute("aria-pressed")).toBe("true");
  });

  it("builds a list that picks, lets go on a second click, and lights current rows", () => {
    const onChange = vi.fn();
    const onHover = vi.fn();
    const list = createToolUi().list<string>({
      label: "Tracks",
      items: [
        { value: "1", label: "person 1", color: "#5cc8ff", span: [0.1, 0.5], detail: "4.0 s" },
        { value: "2", label: "car 2", detail: "1.2 s" },
      ],
      onChange,
      onHover,
    });
    const rows = () => [...list.root.querySelectorAll<HTMLButtonElement>(".rt-list__item")];
    expect(list.root.getAttribute("aria-label")).toBe("Tracks");
    expect(rows().map((r) => r.textContent)).toEqual(["person 14.0 s", "car 21.2 s"]);
    const span = rows()[0].querySelector<HTMLElement>(".rt-list__span");
    expect(span?.style.getPropertyValue("--rt-span-a")).toBe("0.1");
    expect(span?.style.getPropertyValue("--rt-span-b")).toBe("0.5");
    // Without a span, the label takes its room.
    expect(rows()[1].classList.contains("rt-list__item--plain")).toBe(true);

    rows()[0].click();
    expect(onChange).toHaveBeenLastCalledWith("1");
    expect(rows()[0].getAttribute("aria-pressed")).toBe("true");
    rows()[0].click();
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(list.value).toBeNull();

    rows()[1].dispatchEvent(new Event("pointerenter"));
    expect(onHover).toHaveBeenLastCalledWith("2");
    rows()[1].dispatchEvent(new Event("pointerleave"));
    expect(onHover).toHaveBeenLastCalledWith(null);

    list.setCurrent(["2"]);
    expect(rows().map((r) => r.hasAttribute("data-current"))).toEqual([false, true]);
    list.setTime(0.25);
    expect(list.root.hasAttribute("data-time")).toBe(true);
    expect(list.root.style.getPropertyValue("--rt-list-t")).toBe("0.25");
    list.setTime(null);
    expect(list.root.hasAttribute("data-time")).toBe(false);

    // New rows keep the pick only if it's still there.
    list.set("2");
    list.setItems([{ value: "2", label: "car 2" }]);
    expect(list.value).toBe("2");
    list.setItems([{ value: "3", label: "dog 3" }]);
    expect(list.value).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("builds rows, titled sections and live notes", () => {
    const ui = createToolUi();
    const note = ui.note("Downloading…");
    const section = ui.section("Lens", note.root);
    expect(section.classList.contains("rt-section")).toBe(true);
    expect(section.querySelector(".rt-dock__row-title")?.textContent).toBe("Lens");
    expect(section.querySelector(".rt-section__body")?.contains(note.root)).toBe(true);
    expect(note.root.getAttribute("aria-live")).toBe("polite");
    note.set("Ready");
    expect(note.root.textContent).toBe("Ready");
    expect(ui.row("a", "b").textContent).toBe("ab");
  });

  it("drops its listeners when the signal aborts", () => {
    const abort = new AbortController();
    const onClick = vi.fn();
    const button = createToolUi(abort.signal).button({ label: "Go", onClick });
    abort.abort();
    button.root.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("ctx.ui in the editor", () => {
  it("hands custom tools a kit whose controls drive the edit model", () => {
    const restoreLayout = stubLayout(800, 600);
    let captured: ToolContext | undefined;
    registerEditorTool({
      id: "kit-probe",
      label: "Probe",
      icon: "<svg></svg>",
      mount(ctx) {
        captured = ctx;
        const warm = ctx.ui.button({
          label: "Warm it",
          onClick: () => {
            ctx.edits.adjustments = { ...ctx.edits.adjustments, temperature: 30 };
            ctx.render();
            ctx.record();
          },
        });
        return { root: ctx.ui.row(warm.root) };
      },
    });
    const entry = makeImageEntry();
    const editor = createEditor({ entry, onDone: vi.fn(), onCancel: vi.fn() });
    document.body.appendChild(editor.root);
    try {
      expect(captured?.ui).toBeDefined();
      const warm = [...document.querySelectorAll<HTMLButtonElement>(".rt-dock__chip")].find(
        (b) => b.textContent === "Warm it",
      );
      warm?.click();
      expect(entry.edits.adjustments.temperature).toBe(30);
    } finally {
      editor.destroy();
      document.body.innerHTML = "";
      restoreLayout();
    }
  });
});
