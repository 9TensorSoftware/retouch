import { Retouch } from "../src/index";

describe("Retouch", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    container.id = "test-editor";
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it("mounts a canvas to the target element", () => {
    const editor = new Retouch({ target: container });
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(editor.state).toBe("mounted");
  });

  it("accepts a CSS selector string as target", () => {
    const editor = new Retouch({ target: "#test-editor" });
    expect(editor.state).toBe("mounted");
    editor.destroy();
  });

  it("throws if the target selector does not match any element", () => {
    expect(() => new Retouch({ target: "#nonexistent" })).toThrow("Target element not found");
  });

  it("creates a canvas with default dimensions", () => {
    const editor = new Retouch({ target: container });
    const canvas = editor.canvasElement;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it("creates a canvas with custom dimensions", () => {
    const editor = new Retouch({ target: container, width: 1024, height: 768 });
    const canvas = editor.canvasElement;
    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });

  it("removes the canvas on destroy", () => {
    const editor = new Retouch({ target: container });
    editor.destroy();
    expect(container.querySelector("canvas")).toBeNull();
    expect(editor.state).toBe("destroyed");
  });

  it("is idempotent on double destroy", () => {
    const editor = new Retouch({ target: container });
    editor.destroy();
    editor.destroy();
    expect(editor.state).toBe("destroyed");
  });
});
