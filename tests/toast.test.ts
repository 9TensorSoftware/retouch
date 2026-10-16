import { createToastHost, rejectionMessage } from "../src/ui/toast";

describe("rejectionMessage", () => {
  it("produces a message for every rejection reason", () => {
    expect(rejectionMessage("a.txt", "type")).toContain("unsupported");
    expect(rejectionMessage("big.png", "size")).toContain("too large");
    expect(rejectionMessage("long.mp4", "duration")).toContain("too long");
    expect(rejectionMessage("x.png", "count")).toContain("limit");
    expect(rejectionMessage("bad.mp4", "load-error")).toContain("couldn't be loaded");
    expect(rejectionMessage("a.txt", "type")).toContain("a.txt");
  });
});

describe("createToastHost", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("appends a toast with the message and kind, then auto-dismisses", () => {
    vi.useFakeTimers();
    const host = createToastHost();
    host.show("Something failed", "error");
    const toast = document.querySelector(".rt-toast");
    expect(toast?.textContent).toBe("Something failed");
    expect(toast?.classList.contains("rt-toast--error")).toBe(true);

    vi.advanceTimersByTime(5000); // dismiss timer
    vi.advanceTimersByTime(300); // removal fallback
    expect(document.querySelector(".rt-toast")).toBeNull();
    host.destroy();
    vi.useRealTimers();
  });

  it("gives each kind an icon, and only errors interrupt", () => {
    const host = createToastHost();
    host.show("Couldn't load", "error");
    host.show("Heads up");
    host.show("Saved", "success");
    const [error, info, success] = document.querySelectorAll(".rt-toast");
    expect(error.getAttribute("role")).toBe("alert");
    expect(info.getAttribute("role")).toBe("status");
    expect(info.classList.contains("rt-toast--info")).toBe(true);
    expect(success.classList.contains("rt-toast--success")).toBe(true);
    for (const toast of [error, info, success]) {
      const icon = toast.querySelector(".rt-toast__icon");
      expect(icon?.getAttribute("aria-hidden")).toBe("true");
      expect(icon?.querySelector("svg")).not.toBeNull();
    }
    host.destroy();
  });

  it("dismisses on click", () => {
    vi.useFakeTimers();
    const host = createToastHost();
    host.show("Click me");
    const toast = document.querySelector(".rt-toast") as HTMLElement;
    toast.click();
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".rt-toast")).toBeNull();
    host.destroy();
    vi.useRealTimers();
  });

  it("removes the host on destroy", () => {
    const host = createToastHost();
    expect(document.querySelector(".rt-toasts")).not.toBeNull();
    host.destroy();
    expect(document.querySelector(".rt-toasts")).toBeNull();
  });
});
