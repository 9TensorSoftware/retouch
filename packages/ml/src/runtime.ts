import * as ort from "onnxruntime-web";
import { type FetchProgress, fetchModel } from "./model-cache";

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
  onDownloadProgress?: (progress: FetchProgress) => void;
}

let defaultApplied = false;

function configure(options: RuntimeOptions): void {
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
    const buffer = await fetchModel(url, options.onDownloadProgress);
    const providers = options.executionProviders ?? ["webgpu", "wasm"];
    try {
      return await ort.InferenceSession.create(buffer, {
        executionProviders: providers,
        graphOptimizationLevel: "all",
      });
    } catch (error) {
      // With WASM alone there is nothing left to fall back to — surface the
      // real failure (blocked .wasm fetch, OOM) instead of masking it.
      if (providers.length === 1 && providers[0] === "wasm") throw error;
      return await ort.InferenceSession.create(buffer, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
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

export { ort };
