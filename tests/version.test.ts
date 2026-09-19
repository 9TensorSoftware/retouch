import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import { VERSION } from "../src/constants";

describe("VERSION", () => {
  it("matches package.json — bump both together", () => {
    expect(VERSION).toBe(pkg.version);
  });
});
