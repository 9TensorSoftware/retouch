import { StateMachine } from "../src/state-machine";

type Light = "red" | "yellow" | "green";

const transitions: Record<Light, Light[]> = {
  red: ["green"],
  green: ["yellow"],
  yellow: ["red"],
};

describe("StateMachine", () => {
  let sm: StateMachine<Light>;

  beforeEach(() => {
    sm = new StateMachine<Light>("red", transitions);
  });

  afterEach(() => {
    sm.destroy();
  });

  it("starts with the initial state", () => {
    expect(sm.state).toBe("red");
  });

  it("transitions to a valid next state", () => {
    sm.transition("green");
    expect(sm.state).toBe("green");
  });

  it("throws on invalid transition", () => {
    expect(() => sm.transition("yellow")).toThrow("Invalid state transition: red → yellow");
  });

  it("reports canTransition correctly", () => {
    expect(sm.canTransition("green")).toBe(true);
    expect(sm.canTransition("yellow")).toBe(false);
  });

  it("emits change events on transition", () => {
    const fn = vi.fn();
    sm.onChange(fn);
    sm.transition("green");
    expect(fn).toHaveBeenCalledWith({ from: "red", to: "green" });
  });

  it("unsubscribes from change events", () => {
    const fn = vi.fn();
    const unsub = sm.onChange(fn);
    unsub();
    sm.transition("green");
    expect(fn).not.toHaveBeenCalled();
  });

  it("supports multi-step transitions", () => {
    sm.transition("green");
    sm.transition("yellow");
    sm.transition("red");
    expect(sm.state).toBe("red");
  });
});
