import { h } from "../src/ui/h";

describe("h (hyperscript helper)", () => {
  it("creates an element with the given tag", () => {
    const el = h("div");
    expect(el.tagName).toBe("DIV");
  });

  it("sets string attributes", () => {
    const el = h("div", { class: "foo", id: "bar" });
    expect(el.className).toBe("foo");
    expect(el.id).toBe("bar");
  });

  it("sets boolean attributes when true", () => {
    const el = h("input", { disabled: true });
    expect(el.hasAttribute("disabled")).toBe(true);
  });

  it("does not set boolean attributes when false", () => {
    const el = h("input", { disabled: false });
    expect(el.hasAttribute("disabled")).toBe(false);
  });

  it("attaches event listeners for on* attributes", () => {
    const fn = vi.fn();
    const el = h("button", { onClick: fn });
    el.click();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("appends string children as text nodes", () => {
    const el = h("p", null, "hello");
    expect(el.textContent).toBe("hello");
  });

  it("appends element children", () => {
    const child = h("span", null, "inner");
    const el = h("div", null, child);
    expect(el.firstElementChild?.tagName).toBe("SPAN");
    expect(el.textContent).toBe("inner");
  });

  it("handles multiple children", () => {
    const el = h("div", null, h("span"), h("em"), "text");
    expect(el.childNodes.length).toBe(3);
  });

  it("works with no attrs or children", () => {
    const el = h("br");
    expect(el.tagName).toBe("BR");
    expect(el.childNodes.length).toBe(0);
  });

  it("sets numeric attributes as strings", () => {
    const el = h("input", { tabindex: 3 });
    expect(el.getAttribute("tabindex")).toBe("3");
  });
});
