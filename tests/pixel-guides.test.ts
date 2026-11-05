import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGuidesSwitch, createPixelGuides, pixelAt } from "../src/ui/editor/pixel-guides";

const box = { left: 100, top: 50, width: 200, height: 100 };
const pixels = { width: 4000, height: 2000 };

describe("pixelAt", () => {
  it("counts in the photo's pixels, from 0", () => {
    expect(pixelAt({ x: 100, y: 50 }, box, pixels)).toEqual({ x: 0, y: 0 });
    expect(pixelAt({ x: 200, y: 100 }, box, pixels)).toEqual({ x: 2000, y: 1000 });
    expect(pixelAt({ x: 299.99, y: 149.99 }, box, pixels)).toEqual({ x: 3999, y: 1999 });
  });

  it("is nothing off the photo", () => {
    expect(pixelAt({ x: 99, y: 60 }, box, pixels)).toBeNull();
    expect(pixelAt({ x: 300, y: 60 }, box, pixels)).toBeNull();
    expect(pixelAt({ x: 150, y: 150 }, box, pixels)).toBeNull();
    expect(pixelAt({ x: 0, y: 0 }, { left: 0, top: 0, width: 0, height: 0 }, pixels)).toBeNull();
  });
});

describe("pixel guides", () => {
  let abort = new AbortController();

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    abort.abort();
    abort = new AbortController();
    document.body.innerHTML = "";
  });

  function setup() {
    const area = document.createElement("div");
    const photo = document.createElement("div");
    const button = document.createElement("div");
    button.className = "aside";
    area.append(photo, button);
    document.body.appendChild(area);
    photo.getBoundingClientRect = () => box as DOMRect;
    const control = createGuidesSwitch();
    const guides = createPixelGuides({
      area,
      host: () => area,
      photo: () => photo,
      pixels: () => pixels,
      ignore: ".aside",
      control,
      signal: abort.signal,
    });
    const move = (el: Element, x: number, y: number, pointerType = "mouse"): void => {
      el.dispatchEvent(
        Object.assign(new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y }), {
          pointerType,
        }),
      );
    };
    const readout = () => area.querySelector(".rt-guides__readout")?.textContent ?? null;
    return { area, photo, button, control, guides, move, readout };
  }

  it("shows the pixel while on the photo, and goes off it", () => {
    const { area, photo, move, readout } = setup();
    move(photo, 200, 100);
    expect(readout()).toBe("2000, 1000");
    move(photo, 10, 10);
    expect(readout()).toBeNull();
    move(photo, 100, 50);
    expect(readout()).toBe("0, 0");
    area.dispatchEvent(new Event("pointerleave"));
    expect(readout()).toBeNull();
  });

  it("stands aside for touch, and for what it's told to ignore", () => {
    const { photo, button, move, readout } = setup();
    move(photo, 200, 100, "touch");
    expect(readout()).toBeNull();
    move(button, 200, 100);
    expect(readout()).toBeNull();
  });

  it("stands aside while the view is being dragged", () => {
    const { area, photo, move, readout } = setup();
    area.classList.add("rt-stage--panning");
    move(photo, 200, 100);
    expect(readout()).toBeNull();
  });

  it("re-reads the pixel when the photo moves under a still mouse", () => {
    const { photo, guides, move, readout } = setup();
    move(photo, 200, 100);
    photo.getBoundingClientRect = () => ({ ...box, left: 150 }) as DOMRect;
    guides.refresh();
    expect(readout()).toBe("1000, 1000");
  });

  it("turns off and on from a button, and remembers", () => {
    const { photo, control, move, readout } = setup();
    expect(control.on).toBe(true);
    const button = control.button(abort.signal);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    move(photo, 200, 100);
    button.click();
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(readout()).toBeNull();
    expect(createGuidesSwitch().on).toBe(false);
    button.click();
    expect(readout()).toBe("2000, 1000");
  });

  it("goes when its view does", () => {
    const { photo, move, readout } = setup();
    const spy = vi.fn();
    move(photo, 200, 100);
    expect(readout()).not.toBeNull();
    abort.signal.addEventListener("abort", spy);
    abort.abort();
    expect(spy).toHaveBeenCalled();
    expect(readout()).toBeNull();
  });
});
