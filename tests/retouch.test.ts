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

  it("mounts to the target element", () => {
    const editor = new Retouch({ target: container });
    expect(container.querySelector(".rt-root")).not.toBeNull();
    expect(editor.state).toBe("dropzone");
    editor.destroy();
  });

  it("accepts a CSS selector string as target", () => {
    const editor = new Retouch({ target: "#test-editor" });
    expect(editor.state).toBe("dropzone");
    editor.destroy();
  });

  it("throws if the target selector does not match any element", () => {
    expect(() => new Retouch({ target: "#nonexistent" })).toThrow("Target element not found");
  });

  it("starts in dropzone state", () => {
    const editor = new Retouch({ target: container });
    expect(editor.state).toBe("dropzone");
    editor.destroy();
  });

  it("cleans up on destroy", () => {
    const editor = new Retouch({ target: container });
    editor.destroy();
    expect(container.querySelector(".rt-root")).toBeNull();
    expect(editor.state).toBe("destroyed");
  });

  it("is idempotent on double destroy", () => {
    const editor = new Retouch({ target: container });
    editor.destroy();
    editor.destroy();
    expect(editor.state).toBe("destroyed");
  });

  it("renders the dropzone view", () => {
    const editor = new Retouch({ target: container });
    expect(container.querySelector(".rt-dropzone")).not.toBeNull();
    editor.destroy();
  });
});
