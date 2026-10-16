import {
  createToastHost,
  rejectionDetail,
  rejectionMessage,
  rejectionSummary,
} from "../src/ui/toast";

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

describe("rejection copy", () => {
  const limits = {
    types: ["image/jpeg", "image/png", "video/mp4", "video/quicktime"],
    maxFileSize: 10 * 1024 * 1024,
    maxVideoDuration: 30,
    maxFiles: 5,
  };

  it("says what would have worked", () => {
    expect(rejectionDetail("type", limits)).toBe("Use JPG, PNG, MP4 or MOV.");
    expect(rejectionDetail("size", limits)).toBe("Files up to 10 MB work.");
    expect(rejectionDetail("duration", limits)).toBe("Videos up to 30 seconds work.");
    expect(rejectionDetail("count", limits)).toBe("The gallery holds 5 files.");
    expect(rejectionDetail("load-error", limits)).toContain("damaged");
  });

  it("tallies a batch by reason", () => {
    expect(rejectionSummary(["type", "size", "type"])).toEqual({
      message: "3 files couldn't be added",
      detail: "2 unsupported · 1 too large",
    });
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

  it("adds a detail line and one action, which also dismisses it", () => {
    vi.useFakeTimers();
    const host = createToastHost();
    const onClick = vi.fn();
    const onDismiss = vi.fn();
    host.show("Removed 2 items", "info", {
      detail: "They left the gallery.",
      action: { label: "Undo", onClick },
      onDismiss,
    });
    const toast = document.querySelector(".rt-toast") as HTMLElement;
    expect(toast.querySelector(".rt-toast__text")?.textContent).toBe("Removed 2 items");
    expect(toast.querySelector(".rt-toast__detail")?.textContent).toBe("They left the gallery.");
    const action = toast.querySelector(".rt-toast__action") as HTMLButtonElement;
    expect(action.textContent).toBe("Undo");
    action.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".rt-toast")).toBeNull();
    host.destroy();
    vi.useRealTimers();
  });

  it("stays longer with an action, and holds while pointed at", () => {
    vi.useFakeTimers();
    const host = createToastHost();
    const onDismiss = vi.fn();
    host.show("Removed", "info", { action: { label: "Undo", onClick: () => {} }, onDismiss });
    const toast = document.querySelector(".rt-toast") as HTMLElement;
    vi.advanceTimersByTime(5000);
    expect(onDismiss).not.toHaveBeenCalled();
    toast.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(20000);
    expect(onDismiss).not.toHaveBeenCalled();
    toast.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(3000);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    host.destroy();
    vi.useRealTimers();
  });

  it("keeps three on screen at most, letting the oldest go", () => {
    vi.useFakeTimers();
    const host = createToastHost();
    const first = vi.fn();
    host.show("One", "info", { onDismiss: first });
    for (const text of ["Two", "Three", "Four"]) host.show(text);
    expect(first).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect([...document.querySelectorAll(".rt-toast")].map((t) => t.textContent)).toEqual([
      "Two",
      "Three",
      "Four",
    ]);
    host.destroy();
    vi.useRealTimers();
  });

  it("hands back a handle that dismisses it", () => {
    vi.useFakeTimers();
    const host = createToastHost();
    const toast = host.show("Working on it");
    toast.dismiss();
    vi.advanceTimersByTime(300);
    expect(document.querySelector(".rt-toast")).toBeNull();
    host.destroy();
    vi.useRealTimers();
  });
});
