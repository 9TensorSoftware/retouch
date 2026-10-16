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
});
