/**
 * Model weight fetching with browser-side caching: weights are streamed once
 * (with download progress) and stored via the Cache API, so subsequent
 * sessions load instantly and offline.
 */

const CACHE_NAME = "retouch-ml-models";

export interface FetchProgress {
  /** Bytes received so far. */
  loaded: number;
  /** Total bytes, or 0 when the server doesn't say. */
  total: number;
}

const inflight = new Map<string, Promise<ArrayBuffer>>();

// ── What every pane can see: downloads under way, files saved, failures ──

/** Files downloading now, and how far along each is. */
const underway = new Map<string, FetchProgress>();
/** Files downloaded during the current download, with their size, for its total. */
const finished = new Map<string, number>();
/** Files known to be on this device. */
const saved = new Set<string>();
/** Files whose last download failed. */
const failed = new Set<string>();
/** How to stop each download under way. */
const stoppers = new Map<string, AbortController>();
const watchers = new Set<() => void>();
let pending: ReturnType<typeof setTimeout> | null = null;

function notify(now = false): void {
  if (!now) {
    // Chunks arrive hundreds of times a second; a few updates a second read better.
    pending ??= setTimeout(() => notify(true), 100);
    return;
  }
  if (pending !== null) clearTimeout(pending);
  pending = null;
  for (const watcher of [...watchers]) watcher();
}

/** Hear about model downloads: progress, files saved, failures. Returns a function that stops it. */
export function watchModelDownloads(listener: () => void): () => void {
  watchers.add(listener);
  return () => watchers.delete(listener);
}

/**
 * How far along the download of these files is, across all of them, or null
 * when none of them is downloading. `total` is 0 while any size is unknown.
 */
export function modelDownload(urls: readonly string[]): FetchProgress | null {
  let loaded = 0;
  let total = 0;
  let known = true;
  let active = false;
  for (const url of urls) {
    const file = underway.get(url);
    if (file) {
      active = true;
      loaded += file.loaded;
      total += file.total;
      if (file.total <= 0) known = false;
    } else {
      const size = finished.get(url);
      if (size !== undefined) {
        loaded += size;
        total += size;
      }
    }
  }
  return active ? { loaded, total: known ? total : 0 } : null;
}

/** True when every file is known to be on this device (checked by `isModelCached` or downloaded). */
export function isModelSaved(urls: readonly string[]): boolean {
  return urls.length > 0 && urls.every((url) => saved.has(url));
}

/** True when the last download of any of these files failed, and none has started since. */
export function modelDownloadFailed(urls: readonly string[]): boolean {
  return urls.some((url) => failed.has(url)) && modelDownload(urls) === null;
}

/**
 * Stop downloading these files. What was downloaded so far is dropped, and
 * the files are back to not downloaded, not failed.
 */
export function stopModelDownload(urls: readonly string[]): void {
  for (const url of urls) stoppers.get(url)?.abort();
}

/** Download and save every file, all at once, without loading the model. */
export async function downloadModel(urls: readonly string[]): Promise<void> {
  await Promise.all(urls.map((url) => fetchModel(url)));
}

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
      saved.add(url);
      onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
      return buffer;
    }
  } catch {
    cache = null;
  }

  // A new download: what finished in an earlier one no longer counts toward its total.
  if (underway.size === 0) finished.clear();
  failed.delete(url);
  underway.set(url, { loaded: 0, total: 0 });
  const stopper = new AbortController();
  stoppers.set(url, stopper);
  notify(true);
  try {
    const buffer = await download(url, cache, stopper.signal, onProgress);
    finished.set(url, buffer.byteLength);
    saved.add(url);
    return buffer;
  } catch (error) {
    // Stopped on purpose isn't a failure: it can simply be downloaded again.
    if (!stopper.signal.aborted) failed.add(url);
    throw error;
  } finally {
    underway.delete(url);
    stoppers.delete(url);
    notify(true);
  }
}

async function download(
  url: string,
  cache: Cache | null,
  signal: AbortSignal,
  onProgress?: (progress: FetchProgress) => void,
): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`[Retouch ML] Failed to download model (${response.status}): ${url}`);
  }

  const total = Number(response.headers.get("Content-Length") ?? 0);
  const reader = response.body?.getReader();
  let buffer: ArrayBuffer;
  if (reader) {
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    // Stopping ends the wait for the next chunk too, however the stream behaves.
    const stopped = new Promise<never>((_, reject) => {
      const stop = (): void => {
        reject(new DOMException("The download was stopped", "AbortError"));
        void reader.cancel().catch(() => {});
      };
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    });
    stopped.catch(() => {});
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), stopped]);
      // A cancelled stream reads as finished: stopped, it's only part of the file.
      signal.throwIfAborted();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      underway.set(url, { loaded, total });
      notify();
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
    signal.throwIfAborted();
    onProgress?.({ loaded: buffer.byteLength, total: buffer.byteLength });
  }

  signal.throwIfAborted();
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
  let cache: Cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    // No Cache API: only what this page downloaded counts.
    return isModelSaved(urls);
  }
  let all = urls.length > 0;
  for (const url of urls) {
    let hit = false;
    try {
      hit = (await cache.match(url)) !== undefined;
    } catch {
      hit = saved.has(url);
    }
    if (hit) saved.add(url);
    else {
      saved.delete(url);
      all = false;
    }
  }
  return all;
}

/** Drop every cached model (frees storage; next run re-downloads). */
export async function clearModelCache(): Promise<void> {
  try {
    await caches.delete(CACHE_NAME);
  } catch {
    // Cache API unavailable — nothing to clear.
  }
  saved.clear();
  notify(true);
}
