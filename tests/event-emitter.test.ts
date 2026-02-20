import { EventEmitter } from "../src/event-emitter";

interface TestEvents {
  ping: { value: number };
  pong: { message: string };
}

describe("EventEmitter", () => {
  let emitter: EventEmitter<TestEvents>;

  beforeEach(() => {
    emitter = new EventEmitter<TestEvents>();
  });

  it("calls listeners on emit", () => {
    const fn = vi.fn();
    emitter.on("ping", fn);
    emitter.emit("ping", { value: 42 });
    expect(fn).toHaveBeenCalledWith({ value: 42 });
  });

  it("supports multiple listeners for the same event", () => {
    const a = vi.fn();
    const b = vi.fn();
    emitter.on("ping", a);
    emitter.on("ping", b);
    emitter.emit("ping", { value: 1 });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it("does not call listeners for other events", () => {
    const fn = vi.fn();
    emitter.on("ping", fn);
    emitter.emit("pong", { message: "hello" });
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns an unsubscribe function from on()", () => {
    const fn = vi.fn();
    const unsub = emitter.on("ping", fn);
    unsub();
    emitter.emit("ping", { value: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("removes a specific listener with off()", () => {
    const fn = vi.fn();
    emitter.on("ping", fn);
    emitter.off("ping", fn);
    emitter.emit("ping", { value: 1 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("clears all listeners with removeAll()", () => {
    const a = vi.fn();
    const b = vi.fn();
    emitter.on("ping", a);
    emitter.on("pong", b);
    emitter.removeAll();
    emitter.emit("ping", { value: 1 });
    emitter.emit("pong", { message: "hi" });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it("does not throw when emitting with no listeners", () => {
    expect(() => emitter.emit("ping", { value: 1 })).not.toThrow();
  });
});
