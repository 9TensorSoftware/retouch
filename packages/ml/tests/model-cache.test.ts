import { isModelCached } from "../src/model-cache";

/** A Cache API stand-in holding the given URLs. */
function fakeCaches(saved: string[]): CacheStorage {
  const cache = {
    match: async (url: RequestInfo | URL) =>
      saved.includes(String(url)) ? new Response("weights") : undefined,
  } as unknown as Cache;
  return { open: async () => cache } as unknown as CacheStorage;
}

describe("isModelCached", () => {
  const original = globalThis.caches;

  afterEach(() => {
    Object.defineProperty(globalThis, "caches", { value: original, configurable: true });
  });

  function useCaches(value: CacheStorage | undefined): void {
    Object.defineProperty(globalThis, "caches", { value, configurable: true });
  }

  it("is true only when every file is saved", async () => {
    useCaches(fakeCaches(["https://m/enc.onnx", "https://m/dec.onnx"]));
    expect(await isModelCached(["https://m/enc.onnx", "https://m/dec.onnx"])).toBe(true);
    expect(await isModelCached(["https://m/enc.onnx", "https://m/other.onnx"])).toBe(false);
  });

  it("says no download is avoidable when there's nothing to check or no Cache API", async () => {
    useCaches(fakeCaches([]));
    expect(await isModelCached([])).toBe(false);
    useCaches(undefined);
    expect(await isModelCached(["https://m/enc.onnx"])).toBe(false);
  });
});
