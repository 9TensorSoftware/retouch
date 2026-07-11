import * as ort from "onnxruntime-web";
import { type FetchProgress, fetchModel } from "./model-cache";

/**
 * ONNX Runtime Web session management: WebGPU when the browser has it,
 * WASM otherwise. The runtime's .wasm binaries load from a CDN by default
 * so bundlers never have to copy them; point `wasmPaths` at a self-hosted
 * directory to stay first-party.
 */

export interface RuntimeOptions {
  /** Directory the ORT .wasm binaries load from. Defaults to jsDelivr. */
  wasmPaths?: string;
  /** Execution providers in preference order. Defaults to WebGPU → WASM. */
  executionProviders?: string[];
  onDownloadProgress?: (progress: FetchProgress) => void;
}

let configured = false;

function configure(options: RuntimeOptions): void {
  if (configured) return;
  configured = true;
  const version = (ort.env.versions as { web?: string } | undefined)?.web ?? "1.22.0";
  ort.env.wasm.wasmPaths =
    options.wasmPaths ?? `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
}

const sessions = new Map<string, Promise<ort.InferenceSession>>();

/**
 * Download (or read back from cache) a model and create a session for it.
 * Sessions are memoized per URL; a WebGPU failure retries on plain WASM.
 */
export function loadSession(
  url: string,
  options: RuntimeOptions = {},
): Promise<ort.InferenceSession> {
  const existing = sessions.get(url);
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
    } catch {
      if (providers.length === 1 && providers[0] === "wasm") throw new Error("unreachable");
      return await ort.InferenceSession.create(buffer, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
    }
  })();
  // A failed load shouldn't poison the memo — allow retrying.
  create.catch(() => sessions.delete(url));
  sessions.set(url, create);
  return create;
}

export { ort };
