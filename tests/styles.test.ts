import { injectStyles } from "../src/styles";

describe("injectStyles", () => {
  it("puts the token layer first in <head> and the component rules last, once", () => {
    const hostSheet = document.createElement("style");
    hostSheet.id = "host";
    document.head.appendChild(hostSheet);

    injectStyles();
    injectStyles();

    const ids = [...document.head.querySelectorAll("style")].map((s) => s.id);
    expect(ids).toEqual(["rt-tokens", "host", "rt-styles"]);

    const tokens = document.getElementById("rt-tokens")?.textContent ?? "";
    const rules = document.getElementById("rt-styles")?.textContent ?? "";
    expect(tokens).toContain("@layer retouch-tokens");
    // Component rules stay unlayered so host resets can't outrank them.
    expect(rules).not.toContain("@layer");
    // The shell's dark set applies by option, or by OS preference under auto.
    expect(tokens).toContain('.rt-root[data-rt-theme="dark"]');
    expect(tokens).toMatch(/prefers-color-scheme: dark\)\s*\{\s*\.rt-root\[data-rt-theme="auto"\]/);
  });

  it("turns all of its motion off under reduced motion, delays and view transitions included", () => {
    injectStyles();
    const rules = document.getElementById("rt-styles")?.textContent ?? "";
    const reduced = rules.slice(rules.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    for (const rule of [
      "animation-duration: 0.01ms !important",
      "animation-delay: 0s !important",
      "transition-duration: 0.01ms !important",
      "transition-delay: 0s !important",
      "html.rt-morphing::view-transition-group(*)",
    ]) {
      expect(reduced).toContain(rule);
    }
    for (const scope of [
      ".rt-root *",
      ".rt-editor-overlay *",
      ".rt-export-overlay *",
      ".rt-toasts *",
    ]) {
      expect(reduced).toContain(scope);
    }
  });
});
