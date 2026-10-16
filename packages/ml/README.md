# @retouchjs/ml

<p>
  <a href="https://www.npmjs.com/package/@retouchjs/ml"><img src="https://img.shields.io/npm/v/@retouchjs/ml?color=D4572A&label=npm" alt="npm version" /></a>
  <a href="https://github.com/onursavas/retouch.js/blob/main/packages/ml/LICENSE"><img src="https://img.shields.io/npm/l/@retouchjs/ml?color=1A1815" alt="license" /></a>
</p>

On-device ML tools for [Rétouch](https://github.com/onursavas/retouch.js) — no
server, no API keys. Models run in the browser through ONNX Runtime Web
(WebGPU when available, WASM otherwise, inference in a worker so the UI never
freezes); weights download on first use and are cached via the Cache API.

## Install

```bash
npm install @retouchjs/core @retouchjs/ml
```

`@retouchjs/core` is a peer dependency — the tools register into its editor
through the plugin API and ride its edit model.

## Features

- **Cutout (background removal)** — MODNet (Apache-2.0, ~25 MB) by default;
  point `modelUrl` at any BiRefNet ONNX export for higher fidelity. Registers
  a "Cutout" tool in the editor; the result is added to the gallery as a new
  transparent PNG.
- **Upscale (4× super-resolution)** — Real-ESRGAN x4plus (BSD-3-Clause,
  ~67 MB), run tile-by-tile with overlap so seams never show. WebGPU when the
  device can take it, automatic WASM fallback when a kernel fails mid-run.
  Inputs are capped at a 2048px long edge; transparency is preserved.
- **Detect (faces + objects)** — UltraFace (MIT, ~1.2 MB) for faces and
  YOLOX-nano (Apache-2.0, ~3.5 MB) for 80 COCO object classes with labeled
  boxes. Either feeds three one-click actions: add a radial mask per box
  (tune it in the Masks tool), **pixelate** for privacy (replaces the image
  in place), or **crop to the detected boxes**. Mask/crop actions ride the
  non-destructive edit model, so they undo like any other edit.
- **Select (click-to-segment)** — SlimSAM-77 (Apache-2.0, ~38 MB in two
  files). Click any object to segment it on-device, refine with more clicks
  (Subtract mode / shift-click removes), then **Cut out** to a transparent
  PNG or **Erase object** in place (dilated mask through the LaMa
  inpainter). The image encodes once and is cached, so refinement clicks
  land in tens of milliseconds.
- **Depth (bokeh)** — Depth Anything V2 Small (Apache-2.0, ~27 MB). One
  analysis produces a depth map; then click anything to set the focal plane
  and scrub Aperture with instant feedback (pre-blurred levels are blended
  per pixel, so the controls never re-run a blur). Apply renders the
  depth-of-field at full resolution and replaces the image in place.
- **Denoise** — SCUNet real-PSNR (Apache-2.0, ~77 MB as a small graph stub
  plus a weights sidecar). One click removes real-world noise — sensor
  grain, compression speckle — tile-by-tile at native resolution and
  replaces the image in place; transparency is preserved and Reset brings
  the original back. Inputs are capped at a 2048px long edge.
- **Erase (heal brush)** — LaMa inpainting (Apache-2.0, ~208 MB). Paint over
  an object, hit Erase: a padded square around the strokes runs through the
  network and the fill composites back at full resolution, feathered and
  masked-pixels-only. The result **replaces the image in place** (the editor
  remounts; undo history restarts). Needs neutral geometry — reset
  crop/transform/liquify first, or erase before transforming.

## Usage

```ts
import { Retouch } from "@retouchjs/core";
import { installMlTools } from "@retouchjs/ml";

const retouch = new Retouch({ target: "#editor" });
installMlTools(retouch);
```

In the editor, every tool opens on a card naming its model, its download size
and where it runs, and its run button names the download ("Download 208 MB and
erase") until the model is saved on the device. Runs show their steps —
download with a progress bar, run, then add to the gallery or replace the photo
— and results wipe in over the photo. With a self-hosted `modelUrl` the size
is unknown, so the button says "Download and …" instead.

Every tool is also a plain function you can call without the editor. Each
takes an `HTMLImageElement | HTMLCanvasElement` plus options, and accepts
`onDownloadProgress` for the first-run weight download:

```ts
import {
  denoiseImage, detectFaces, detectObjects, estimateDepth,
  inpaintStrokes, removeBackground, upscaleImage,
} from "@retouchjs/ml";

const cutout = await removeBackground(image, {
  onDownloadProgress: ({ loaded, total }) => console.log(loaded / total),
});                                                  // HTMLCanvasElement (RGBA)
const big = await upscaleImage(image, { onTileProgress: (done, total) => … });
const clean = await denoiseImage(image);
const faces = await detectFaces(image);              // [{ x, y, w, h, score }], normalized 0–1
const things = await detectObjects(image);           // …plus `label` (COCO class)
const healed = await inpaintStrokes(image, [{ x, y, r }, …]);
const depth = await estimateDepth(image);            // { width, height, data: Float32Array } (0–1, higher = closer)
```

`inpaintMask(image, maskCanvas)` takes a painted mask instead of strokes; the
SAM pieces are exposed as `encodeSamImage` / `decodeSamClicks` / `pickBestMask`.

## Options

```ts
installMlTools(retouch, {
  cutout:  { refSize: 512 },                          // or false to skip the tool
  upscale: { tileSize: 64, tileOverlap: 8, maxInputDim: 2048 },
  denoise: { tileSize: 192, tileOverlap: 16, maxInputDim: 2048 },
  erase:   { modelUrl },                              // LaMa inpainting (also backs Select → Erase object)
  detect:  { scoreThreshold: 0.7, iouThreshold: 0.35, // faces (UltraFace)
             objects: { scoreThreshold: 0.35, iouThreshold: 0.45 } }, // YOLOX
  select:  { encoderUrl, decoderUrl },
  depth:   { modelUrl },
  openResults: true,
});
```

Any of the seven keys can be `false` to leave that tool out. The tools share
one AI launcher on the editor's rail, and its menu lists each with a line on
what it does and its download size. Every option
group also accepts the runtime options below (`wasmPaths`,
`executionProviders`, `externalDataUrl`, `onDownloadProgress`).
`openResults` (default `true`) opens results that land in the gallery — Cutout,
Upscale, and Select's **Cut out** — in the editor as soon as they finish; pass
`false` to leave them in the gallery quietly.

## Self-hosting

By default, model weights load from the Hugging Face CDN and the ONNX Runtime
`.wasm` binaries from jsDelivr. To stay fully first-party, host both yourself:

```ts
installMlTools(retouch, {
  cutout: { modelUrl: "https://your.cdn/models/modnet.onnx", wasmPaths: "https://your.cdn/ort/" },
  upscale: { modelUrl: "https://your.cdn/models/realesrgan-x4plus.onnx" },
  erase: { modelUrl: "https://your.cdn/models/lama_fp32.onnx" },
  detect: {
    modelUrl: "https://your.cdn/models/ultraface-rfb-320.onnx",
    objects: { modelUrl: "https://your.cdn/models/yolox_nano.onnx" },
  },
  select: { encoderUrl: "https://your.cdn/models/sam-encoder.onnx", decoderUrl: "https://your.cdn/models/sam-decoder.onnx" },
  depth: { modelUrl: "https://your.cdn/models/depth-anything-v2-small.onnx" },
  denoise: {
    modelUrl: "https://your.cdn/models/scunet.onnx",
    externalDataUrl: "https://your.cdn/models/scunet.onnx.data",
  },
});
```

Default model URLs are pinned to a specific upstream revision, so an upstream
repository change can never alter what your users download; the
`DEFAULT_*_MODEL_URL` constants expose them. `wasmPaths` is page-global —
setting it in any tool's options applies to every session. `executionProviders`
(default `["webgpu", "wasm"]`) sets the preference order; a run that fails on
WebGPU retries on WASM automatically.

`await isModelCached(urls)` tells you whether a run would download anything
(all of `urls` saved in the cache), and `await clearModelCache()` drops the
cached weights.

The denoise default is a split export: a graph stub plus a `.onnx.data`
weights sidecar. When self-hosting it, keep the sidecar's filename identical
to the location the graph references (`scunet_color_real_psnr.onnx.data` for
the default). A custom `modelUrl` without `externalDataUrl` is treated as a
single-file export — no sidecar is fetched.

## Licenses

The package is MIT. Default model weights: MODNet (Apache-2.0),
Real-ESRGAN x4plus (BSD-3-Clause), LaMa (Apache-2.0), UltraFace (MIT),
YOLOX-nano (Apache-2.0), SlimSAM-77 (Apache-2.0), Depth Anything V2
Small (Apache-2.0), and SCUNet (Apache-2.0).
ONNX Runtime Web is MIT. See `docs/ADVANCED-FEATURES.md` in the repo root for the full
per-model license audit.
