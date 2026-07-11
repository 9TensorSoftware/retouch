import { hasKeystone, keystoneScaleAt } from "../src/utils/perspective";

describe("keystone helpers", () => {
  it("hasKeystone is false only when both axes are zero", () => {
    expect(hasKeystone(0, 0)).toBe(false);
    expect(hasKeystone(10, 0)).toBe(true);
    expect(hasKeystone(0, -5)).toBe(true);
  });

  it("scale is 1 at the center row regardless of amount", () => {
    expect(keystoneScaleAt(0.5, 80)).toBeCloseTo(1, 10);
    expect(keystoneScaleAt(0.5, -80)).toBeCloseTo(1, 10);
  });

  it("positive amounts widen the top and narrow the bottom symmetrically", () => {
    const top = keystoneScaleAt(0, 50);
    const bottom = keystoneScaleAt(1, 50);
    expect(top).toBeGreaterThan(1);
    expect(bottom).toBeLessThan(1);
    expect(top - 1).toBeCloseTo(1 - bottom, 10);
  });

  it("never collapses a row below the safety floor", () => {
    expect(keystoneScaleAt(1, 100)).toBeGreaterThanOrEqual(0.4);
  });
});
