import { glide, motionOK } from "../src/ui/motion";

function reducedMotion(reduce: boolean): void {
  vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
}

/** An element whose top is whatever `top()` says, with a spy for animate. */
function box(top: () => number) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  el.getBoundingClientRect = () => new DOMRect(0, top(), 100, 40);
  const animate = vi.fn();
  Object.defineProperty(el, "animate", { value: animate });
  return { el, animate };
}

describe("motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("is welcome unless reduced motion is asked for, or can't be asked about", () => {
    reducedMotion(false);
    expect(motionOK()).toBe(true);
    reducedMotion(true);
    expect(motionOK()).toBe(false);
    vi.unstubAllGlobals();
    vi.stubGlobal("matchMedia", undefined);
    expect(motionOK()).toBe(false);
  });

  it("glides what a change moved from where it was, and leaves the rest", () => {
    reducedMotion(false);
    let shifted = false;
    const moved = box(() => (shifted ? 80 : 100));
    const still = box(() => 300);
    glide([moved.el, still.el], () => {
      shifted = true;
    });
    expect(moved.animate).toHaveBeenCalledWith(
      [{ translate: "0 20px" }, { translate: "0 0" }],
      expect.objectContaining({ duration: 280 }),
    );
    expect(still.animate).not.toHaveBeenCalled();
  });

  it("only makes the change under reduced motion", () => {
    reducedMotion(true);
    let shifted = false;
    const moved = box(() => (shifted ? 80 : 100));
    const change = vi.fn(() => {
      shifted = true;
    });
    glide([moved.el], change);
    expect(change).toHaveBeenCalledTimes(1);
    expect(moved.animate).not.toHaveBeenCalled();
  });
});
