/**
 * Content-aware scale (seam carving, Avidan–Shamir): repeatedly remove the
 * lowest-energy vertical seam until the target width is reached. The core is
 * a single self-contained function so it can run synchronously (export,
 * tests) or be serialized into a Blob-URL worker for the live preview.
 *
 * Note: seam carving has historic MERL/Adobe patents; widely implemented in
 * open source, but commercial adopters should be aware.
 */

export interface CarveResult {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Remove vertical seams from RGBA `data` until `targetWidth`. Self-contained
 * on purpose — no external references — so `.toString()` can ship it into a
 * worker.
 */
export function carveWidthSync(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
): CarveResult {
  let w = width;
  const target = Math.max(2, Math.min(width, Math.round(targetWidth)));
  let pixels = data;

  const lumaOf = (buf: Uint8ClampedArray, i: number): number =>
    0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];

  while (w > target) {
    // Energy: horizontal + vertical luminance gradient magnitude
    const energy = new Float32Array(w * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < w; x++) {
        const left = (y * w + (x > 0 ? x - 1 : x)) * 4;
        const right = (y * w + (x < w - 1 ? x + 1 : x)) * 4;
        const up = ((y > 0 ? y - 1 : y) * w + x) * 4;
        const down = ((y < height - 1 ? y + 1 : y) * w + x) * 4;
        energy[y * w + x] =
          Math.abs(lumaOf(pixels, right) - lumaOf(pixels, left)) +
          Math.abs(lumaOf(pixels, down) - lumaOf(pixels, up));
      }
    }

    // DP: cumulative minimum energy going down
    const cost = new Float32Array(w * height);
    cost.set(energy.subarray(0, w));
    for (let y = 1; y < height; y++) {
      for (let x = 0; x < w; x++) {
        let best = cost[(y - 1) * w + x];
        if (x > 0) best = Math.min(best, cost[(y - 1) * w + x - 1]);
        if (x < w - 1) best = Math.min(best, cost[(y - 1) * w + x + 1]);
        cost[y * w + x] = energy[y * w + x] + best;
      }
    }

    // Backtrack the cheapest seam
    const seam = new Int32Array(height);
    let sx = 0;
    for (let x = 1; x < w; x++) {
      if (cost[(height - 1) * w + x] < cost[(height - 1) * w + sx]) sx = x;
    }
    seam[height - 1] = sx;
    for (let y = height - 2; y >= 0; y--) {
      const prev = seam[y + 1];
      let bx = prev;
      if (prev > 0 && cost[y * w + prev - 1] < cost[y * w + bx]) bx = prev - 1;
      if (prev < w - 1 && cost[y * w + prev + 1] < cost[y * w + bx]) bx = prev + 1;
      seam[y] = bx;
    }

    // Remove the seam
    const next = new Uint8ClampedArray((w - 1) * height * 4);
    for (let y = 0; y < height; y++) {
      const cut = seam[y];
      const srcRow = y * w * 4;
      const dstRow = y * (w - 1) * 4;
      next.set(pixels.subarray(srcRow, srcRow + cut * 4), dstRow);
      next.set(pixels.subarray(srcRow + (cut + 1) * 4, srcRow + w * 4), dstRow + cut * 4);
    }
    pixels = next;
    w--;
  }

  return { data: pixels, width: w, height };
}

let workerUrl: string | null = null;

function getWorkerUrl(): string {
  if (!workerUrl) {
    const source = `
${carveWidthSync.toString()}
self.onmessage = (e) => {
  const { data, width, height, target } = e.data;
  const result = carveWidthSync(data, width, height, target);
  self.postMessage(result, [result.data.buffer]);
};`;
    workerUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
  }
  return workerUrl;
}

/**
 * Carve off the main thread. Falls back to synchronous carving where workers
 * are unavailable. One request at a time per call — callers should debounce
 * and drop superseded results.
 */
export function carveWidthAsync(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
): Promise<CarveResult> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(carveWidthSync(data, width, height, targetWidth));
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerUrl());
    worker.onmessage = (e) => {
      worker.terminate();
      resolve(e.data as CarveResult);
    };
    worker.onerror = (err) => {
      worker.terminate();
      reject(err);
    };
    // Copy so the caller's buffer survives the transfer.
    const copy = new Uint8ClampedArray(data);
    worker.postMessage({ data: copy, width, height, target: targetWidth }, [copy.buffer]);
  });
}
