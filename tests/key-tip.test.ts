import { afterEach, describe, expect, it } from "vitest";
import { keyTip } from "../src/ui/key-tip";

function pointer(type: string, pointerType = "mouse"): Event {
  return Object.assign(new Event(type), { pointerType });
}

const tip = (): HTMLElement | null => document.querySelector(".rt-tooltip");

describe("keyTip", () => {
  let abort = new AbortController();

  function control(): HTMLButtonElement {
    const button = document.createElement("button");
    button.getClientRects = () => [{}] as unknown as DOMRectList;
    document.body.appendChild(button);
    keyTip(button, "Undo", "⌘Z", abort.signal);
    return button;
  }

  afterEach(() => {
    abort.abort();
    abort = new AbortController();
    document.body.innerHTML = "";
  });

  it("names the key in a styled key on hover, and goes on leaving", () => {
    const button = control();
    button.dispatchEvent(pointer("pointerenter"));
    expect(tip()?.textContent).toBe("Undo⌘Z");
    expect(tip()?.querySelector("kbd")?.textContent).toBe("⌘Z");
    button.dispatchEvent(pointer("pointerleave"));
    expect(tip()).toBeNull();
  });

  it("stays away from a finger", () => {
    control().dispatchEvent(pointer("pointerenter", "touch"));
    expect(tip()).toBeNull();
  });

  it("goes when the control is pressed", () => {
    const button = control();
    button.dispatchEvent(pointer("pointerenter"));
    button.dispatchEvent(pointer("pointerdown"));
    expect(tip()).toBeNull();
  });

  it("goes when the control is removed under the mouse", async () => {
    const button = control();
    button.dispatchEvent(pointer("pointerenter"));
    button.remove();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(tip()).toBeNull();
  });

  it("goes with its view", () => {
    control().dispatchEvent(pointer("pointerenter"));
    abort.abort();
    expect(tip()).toBeNull();
  });
});
