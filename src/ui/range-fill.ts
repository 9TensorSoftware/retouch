/**
 * Filled-track state for `input[type="range"]`. The stylesheet paints the
 * span between two custom properties — `--rt-fill-a` (the anchor) and
 * `--rt-fill-b` (the thumb) — so unipolar sliders fill from the left while
 * bipolar sliders (min < 0, or an explicit `neutral`) fill outward from
 * their resting point. Call after creating a slider, from its `input`
 * listener, and from every code path that writes `input.value`
 * programmatically (undo/redo sync, resets, chip retargeting). An unwired
 * slider degrades to an empty track — never a wrong fill.
 */
export function refreshRangeFill(input: HTMLInputElement, neutral?: number): void {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const span = max - min;
  const pct = (v: number): number =>
    span > 0 ? Math.min(100, Math.max(0, ((v - min) / span) * 100)) : 0;
  const anchor = neutral ?? (min < 0 ? 0 : min);
  input.style.setProperty("--rt-fill-a", `${pct(anchor)}%`);
  input.style.setProperty("--rt-fill-b", `${pct(Number(input.value))}%`);
}
