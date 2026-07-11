import { describe, expect, it } from "vitest";
import { enqueueInference } from "../src/queue";

describe("enqueueInference", () => {
  it("serializes tasks — no overlap even when enqueued together", async () => {
    const events: string[] = [];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const task = (name: string, ms: number) => async () => {
      events.push(`${name}:start`);
      await sleep(ms);
      events.push(`${name}:end`);
      return name;
    };
    const [a, b] = await Promise.all([
      enqueueInference(task("a", 20)),
      enqueueInference(task("b", 1)),
    ]);
    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(events).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("keeps the chain alive after a failing task", async () => {
    const failing = enqueueInference(async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");
    await expect(enqueueInference(async () => 42)).resolves.toBe(42);
  });
});
