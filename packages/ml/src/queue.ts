/**
 * Global inference queue: ONNX Runtime Web's WASM backend cannot run two
 * inferences concurrently (it throws "Session already started" from a
 * module-level guard), and interleaved WebGPU submissions compete for the
 * same device memory. Serializing every run through one chain makes
 * concurrent tool clicks safe instead of a crash.
 */

let chain: Promise<unknown> = Promise.resolve();

/** Run `task` after every previously enqueued task settles. */
export function enqueueInference<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task);
  // The chain must survive failures — swallow only for sequencing.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
