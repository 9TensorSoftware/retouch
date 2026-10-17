/**
 * True when motion is welcome: the browser can tell (matchMedia exists) and
 * the person hasn't asked for less. Script-driven animation checks this;
 * CSS animation is switched off by the stylesheet's reduced-motion rule.
 */
export function motionOK(): boolean {
  return (
    typeof matchMedia === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Run a change that moves some elements, then let them glide from where they
 * were to where they are (FLIP). Without motion, the change just happens.
 */
export function glide(elements: HTMLElement[], change: () => void): void {
  const before = new Map(elements.map((el) => [el, el.getBoundingClientRect().top] as const));
  change();
  if (!motionOK()) return;
  for (const el of elements) {
    if (!el.isConnected || typeof el.animate !== "function") continue;
    const dy = (before.get(el) ?? 0) - el.getBoundingClientRect().top;
    if (Math.abs(dy) < 1) continue;
    el.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], {
      duration: 280,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
    });
  }
}
