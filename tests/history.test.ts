import { createHistory } from "../src/utils/history";

interface State {
  value: number;
}

/** Drives createHistory against a plain mutable object. */
function setup(debounceMs = 350) {
  const live: State = { value: 0 };
  const restored: State[] = [];
  const history = createHistory<State>({
    snapshot: () => ({ ...live }),
    restore: (s) => {
      live.value = s.value;
      restored.push({ ...s });
    },
    debounceMs,
  });
  return { live, restored, history };
}

describe("createHistory", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid records into one checkpoint", () => {
    const { live, history } = setup();
    for (let i = 1; i <= 5; i++) {
      live.value = i;
      history.record();
    }
    vi.advanceTimersByTime(350);
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(live.value).toBe(0); // back to initial, the 5 mid-drag values collapsed
  });

  it("undoes and redoes across distinct checkpoints", () => {
    const { live, history } = setup();
    live.value = 10;
    history.record();
    vi.advanceTimersByTime(350);
    live.value = 20;
    history.record();
    vi.advanceTimersByTime(350);

    expect(history.undo()).toBe(true);
    expect(live.value).toBe(10);
    expect(history.undo()).toBe(true);
    expect(live.value).toBe(0);
    expect(history.undo()).toBe(false); // nothing before initial
    expect(history.redo()).toBe(true);
    expect(live.value).toBe(10);
    expect(history.redo()).toBe(true);
    expect(live.value).toBe(20);
    expect(history.redo()).toBe(false);
  });

  it("flushes a pending edit before undoing (undo lands before the edit)", () => {
    const { live, history } = setup();
    live.value = 42;
    history.record(); // pending, not yet committed
    expect(history.canUndo()).toBe(true);
    history.undo();
    expect(live.value).toBe(0);
  });

  it("drops the redo tail when a new edit follows an undo", () => {
    const { live, history } = setup();
    live.value = 1;
    history.record();
    vi.advanceTimersByTime(350);
    live.value = 2;
    history.record();
    vi.advanceTimersByTime(350);

    history.undo(); // back to 1
    expect(live.value).toBe(1);
    live.value = 99;
    history.record();
    vi.advanceTimersByTime(350);

    expect(history.canRedo()).toBe(false); // the "2" branch is gone
    history.undo();
    expect(live.value).toBe(1);
    history.redo();
    expect(live.value).toBe(99);
  });

  it("notifies subscribers on record and undo/redo", () => {
    const { live, history } = setup();
    const fn = vi.fn();
    history.onChange(fn);
    live.value = 5;
    history.record();
    vi.advanceTimersByTime(350);
    history.undo();
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("does not record after destroy", () => {
    const { live, history } = setup();
    history.destroy();
    live.value = 7;
    history.record();
    vi.advanceTimersByTime(350);
    // initial checkpoint only — nothing to undo to
    expect(history.undo()).toBe(false);
  });
});
