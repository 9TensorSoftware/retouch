// A before/after frame with a draggable divider, like the editor's split
// compare. The markup is a figure with two stacked images; CSS clips the
// after image to the right of --split.

export interface Compare {
  /** Move the divider, as a fraction of the width. */
  set(fraction: number): void;
  /** Show the after image and sweep the divider in from the right edge. */
  reveal(): void;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountCompare(figure: HTMLElement, initial = 0.5): Compare {
  const frame = figure.querySelector<HTMLElement>(".compare__frame");
  const grip = figure.querySelector<HTMLElement>(".compare__grip");
  if (!frame || !grip) throw new Error("A compare figure needs a frame and a grip");

  let split = initial;
  let sweep = 0;

  const set = (fraction: number) => {
    split = Math.min(1, Math.max(0, fraction));
    figure.style.setProperty("--split", `${(split * 100).toFixed(2)}%`);
    grip.setAttribute("aria-valuenow", String(Math.round(split * 100)));
    // A label the divider is about to cover steps aside.
    figure.classList.toggle("is-before-hidden", split < 0.14);
    figure.classList.toggle("is-after-hidden", split > 0.86);
  };

  const at = (event: PointerEvent) => {
    const box = frame.getBoundingClientRect();
    return (event.clientX - box.left) / box.width;
  };

  let pointer: number | null = null;
  frame.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pointer !== null) return;
    cancelAnimationFrame(sweep);
    pointer = event.pointerId;
    frame.setPointerCapture(event.pointerId);
    figure.classList.add("is-dragging");
    set(at(event));
    // Keep focus on the grip so the arrow keys carry on from here.
    grip.focus({ preventScroll: true });
    event.preventDefault();
  });
  frame.addEventListener("pointermove", (event) => {
    if (event.pointerId === pointer) set(at(event));
  });
  const release = (event: PointerEvent) => {
    if (event.pointerId !== pointer) return;
    pointer = null;
    figure.classList.remove("is-dragging");
  };
  frame.addEventListener("pointerup", release);
  frame.addEventListener("pointercancel", release);

  grip.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const next: Record<string, number> = {
      ArrowLeft: split - step,
      ArrowDown: split - step,
      ArrowRight: split + step,
      ArrowUp: split + step,
      PageDown: split - 0.1,
      PageUp: split + 0.1,
      Home: 0,
      End: 1,
    };
    if (!(event.key in next)) return;
    event.preventDefault();
    cancelAnimationFrame(sweep);
    set(next[event.key]);
  });

  set(initial);

  return {
    set,
    reveal() {
      figure.classList.add("is-ready");
      if (reducedMotion()) return;
      // Start with only the before showing, then let the edit wipe in.
      const start = performance.now();
      const duration = 1100;
      set(1);
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - (1 - t) ** 4;
        set(1 + (initial - 1) * eased);
        if (t < 1) sweep = requestAnimationFrame(tick);
      };
      sweep = requestAnimationFrame(tick);
    },
  };
}
