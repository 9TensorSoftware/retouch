import * as ort from "onnxruntime-web";
import { type FetchProgress, fetchModel } from "./model-cache";
import { enqueueInference } from "./queue";

/**
 * ONNX Runtime Web session management: WebGPU when the browser has it,
 * WASM otherwise. The runtime's .wasm binaries load from a CDN by default
 * so bundlers never have to copy them; point `wasmPaths` at a self-hosted
 * directory to stay first-party.
 */

export interface RuntimeOptions {
  /**
   * Directory the ORT .wasm binaries load from. Defaults to jsDelivr.
   * Page-global: an explicit value applies to every later session too.
   */
  wasmPaths?: string;
  /** Execution providers in preference order. Defaults to WebGPU → WASM. */
  executionProviders?: string[];
  /**
   * Sidecar weights for exports split into a graph stub plus an
   * `.onnx.data` blob. Both files download through the model cache; the
   * sidecar's filename must match what the graph references.
   */
  externalDataUrl?: string;
  onDownloadProgress?: (progress: FetchProgress) => void;
}

let defaultApplied = false;
let runtimeConfigured = false;

function configure(options: RuntimeOptions): void {
  if (!runtimeConfigured) {
    runtimeConfigured = true;
    // Run inference off the main thread. Heavy models (upscale, inpaint) —
    // and especially the WASM fallback when a WebGPU kernel fails mid-run —
    // would otherwise block the UI thread and freeze the editor for the
    // whole run. Proxy mode hosts the wasm/JSEP backend in a worker, so
    // `session.run()` resolves asynchronously without ever blocking paint.
    if (typeof Worker !== "undefined") {
      ort.env.wasm.proxy = true;
    }
    // Quiet ORT's own node-assignment warnings; real errors still surface
    // through the promise rejection our fallback handles.
    ort.env.logLevel = "error";
  }
  if (options.wasmPaths) {
    // Explicit paths always apply, no matter which tool configured first.
    ort.env.wasm.wasmPaths = options.wasmPaths;
    defaultApplied = true;
    return;
  }
  if (defaultApplied) return;
  defaultApplied = true;
  const version = (ort.env.versions as { web?: string } | undefined)?.web ?? "1.22.0";
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
}

const sessions = new Map<string, Promise<ort.InferenceSession>>();

function sessionKey(url: string, options: RuntimeOptions): string {
  return `${url}|${(options.executionProviders ?? ["webgpu", "wasm"]).join(",")}`;
}

/**
 * Download (or read back from cache) a model and create a session for it.
 * Sessions are memoized per URL + provider list; a WebGPU failure at
 * creation time retries on plain WASM. Some kernels only fail at inference
 * time — callers doing heavy runs should catch and retry via
 * `loadSession(url, { ...options, executionProviders: ["wasm"] })`.
 */
export function loadSession(
  url: string,
  options: RuntimeOptions = {},
): Promise<ort.InferenceSession> {
  const key = sessionKey(url, options);
  const existing = sessions.get(key);
  if (existing) return existing;

  const create = (async () => {
    configure(options);
    // The big sidecar (when present) downloads first so its progress is
    // what the user watches; the small stub follows.
    let externalData: Array<{ data: Uint8Array; path: string }> | undefined;
    if (options.externalDataUrl) {
      const data = await fetchModel(options.externalDataUrl, options.onDownloadProgress);
      const path = options.externalDataUrl.split("/").pop() ?? "model.onnx.data";
      externalData = [{ data: new Uint8Array(data), path }];
    }
    const buffer = await fetchModel(url, options.onDownloadProgress);
    const providers = options.executionProviders ?? ["webgpu", "wasm"];
    const base = {
      graphOptimizationLevel: "all" as const,
      ...(externalData ? { externalData } : {}),
    };
    try {
      return await ort.InferenceSession.create(buffer, {
        ...base,
        executionProviders: providers,
      });
    } catch (error) {
      // With WASM alone there is nothing left to fall back to — surface the
      // real failure (blocked .wasm fetch, OOM) instead of masking it.
      if (providers.length === 1 && providers[0] === "wasm") throw error;
      // Proxy mode transferred (detached) `buffer` to the worker on the
      // first attempt — re-read it from the cache for the retry.
      const retryBuffer = await fetchModel(url, options.onDownloadProgress);
      return await ort.InferenceSession.create(retryBuffer, {
        ...base,
        executionProviders: ["wasm"],
      });
    }
  })();
  // A failed load shouldn't poison the memo — allow retrying.
  create.catch(() => sessions.delete(key));
  sessions.set(key, create);
  return create;
}

/**
 * Drop a memoized session and free its native resources — used after a
 * session proves unusable (e.g. WebGPU kernels failing at inference time).
 */
export async function releaseSession(url: string, options: RuntimeOptions = {}): Promise<void> {
  const key = sessionKey(url, options);
  const pending = sessions.get(key);
  if (!pending) return;
  sessions.delete(key);
  try {
    const session = await pending;
    await session.release();
  } catch {
    // Already failed or released — nothing to free.
  }
}

/** Model URLs whose WebGPU sessions failed at inference time. */
const wasmPreferred = new Set<string>();

export interface ResilientRunResult {
  session: ort.InferenceSession;
  results: Awaited<ReturnType<ort.InferenceSession["run"]>>;
}

/**
 * Proxy mode posts input buffers to the worker with transfer, which
 * *detaches* the source ArrayBuffer. A WebGPU→WASM retry reuses the same
 * feed tensors, so it would hit a detached buffer — hand each run a
 * throwaway copy and the caller's tensors survive every attempt.
 */
function cloneFeeds(feeds: Record<string, ort.Tensor>): Record<string, ort.Tensor> {
  const out: Record<string, ort.Tensor> = {};
  for (const [name, tensor] of Object.entries(feeds)) {
    const data = tensor.data as { slice(): ort.Tensor["data"] };
    out[name] = new ort.Tensor(tensor.type, data.slice(), tensor.dims);
  }
  return out;
}

/**
 * Load the session for `url` and run `feeds` through it (serialized on the
 * shared inference queue), falling back to WASM once when a WebGPU kernel
 * fails at inference time — some devices only reject kernels mid-run. The
 * fallback sticks per model URL for later calls. An explicit
 * `executionProviders` list is respected verbatim: no automatic fallback.
 */
export async function runResilient(
  url: string,
  options: RuntimeOptions,
  feeds: (session: ort.InferenceSession) => Record<string, ort.Tensor>,
): Promise<ResilientRunResult> {
  const explicit = options.executionProviders;
  const preferWasm = !explicit && wasmPreferred.has(url);
  let session = await loadSession(
    url,
    preferWasm ? { ...options, executionProviders: ["wasm"] } : options,
  );
  try {
    const results = await enqueueInference(() => session.run(cloneFeeds(feeds(session))));
    return { session, results };
  } catch (error) {
    if (explicit || preferWasm) throw error;
    wasmPreferred.add(url);
    console.warn("[Retouch ML] WebGPU inference failed — retrying on WASM", error);
    // Free the broken session's weights and GPU buffers.
    void releaseSession(url, options);
    session = await loadSession(url, { ...options, executionProviders: ["wasm"] });
    const results = await enqueueInference(() => session.run(cloneFeeds(feeds(session))));
    return { session, results };
  }
}

export { ort };
