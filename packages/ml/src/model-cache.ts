/**
 * Model weight fetching with browser-side caching: weights are streamed once
 * (with download progress) and stored via the Cache API, so subsequent
 * sessions load instantly and offline.
 */

const CACHE_NAME = "retouchjs-ml-models";

export interface FetchProgress {
  /** Bytes received so far. */
  loaded: number;
  /** Total bytes, or 0 when the server doesn't say. */
  total: number;
}

const inflight = new Map<string, Promise<ArrayBuffer>>();

/**
 * Fetch a model file, reporting progress and caching the bytes. Falls back
 * to a plain fetch where the Cache API is unavailable (private windows).
 * Concurrent requests for the same URL share one download.
 */
export function fetchModel(
  url: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<ArrayBuffer> {
  const existing = inflight.get(url);
  if (existing) return existing;
  const promise = fetchModelUncached(url, onProgress);
  inflight.set(url, promise);
  promise.then(
    () => inflight.delete(url),
    () => inflight.delete(url),
  );
  return promise;
}

async function fetchModelUncached(
  url: string,
  onProgress?: (progress: FetchProgress) => void,
): Promise<ArrayBuffer> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const buffer = await hit.arrayBuffer();
      onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
      return buffer;
    }
  } catch {
    cache = null;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[Retouch ML] Failed to download model (${response.status}): ${url}`);
  }

  const total = Number(response.headers.get("Content-Length") ?? 0);
  const reader = response.body?.getReader();
  let buffer: ArrayBuffer;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
    }
    const merged = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    buffer = merged.buffer;
  } else {
    buffer = await response.arrayBuffer();
    onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
  }

  try {
    await cache?.put(url, new Response(buffer.slice(0), { headers: response.headers }));
  } catch {
    // Cache quota/availability problems never block inference.
  }
  return buffer;
}

/**
 * True when every file in `urls` is already saved on this device, so a run
 * needs no download. False when any is missing — or when the Cache API is
 * unavailable (private windows), since the run will download then.
 */
export async function isModelCached(urls: readonly string[]): Promise<boolean> {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const url of urls) {
      if (!(await cache.match(url))) return false;
    }
    return urls.length > 0;
  } catch {
    return false;
  }
}

/** Drop every cached model (frees storage; next run re-downloads). */
export async function clearModelCache(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // Cache API unavailable — nothing to clear.
  }
}
