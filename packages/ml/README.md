# @9tensor/retouch-ml

On-device ML tools for [Rétouch](https://github.com/9TensorSoftware/retouch) — no
server, no API keys. Models run in the browser through ONNX Runtime Web
(WebGPU when available, WASM otherwise); weights download on first use and are
cached via the Cache API.

## Features

- **Cutout (background removal)** — MODNet (Apache-2.0, ~25 MB) by default;
  point `modelUrl` at any BiRefNet ONNX export for higher fidelity. Registers
  a "Cutout" tab in the editor; the result is added to the gallery as a new
  transparent PNG.
- **Upscale (4× super-resolution)** — Real-ESRGAN x4plus (BSD-3-Clause,
  ~67 MB), run tile-by-tile with overlap so seams never show. WebGPU when the
  device can take it, automatic WASM fallback when a kernel fails mid-run.
  Inputs are capped at a 2048px long edge; transparency is preserved.
- **Detect (faces + objects)** — UltraFace (MIT, ~1.2 MB) for faces and
  YOLOX-nano (Apache-2.0, ~3.5 MB) for 80 COCO object classes with labeled
  boxes. Either feeds three one-click actions: add a radial mask per box
  (tune it in the Masks tab), **pixelate** for privacy (replaces the image
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
import { Retouch } from "@9tensor/retouch";
import { installMlTools } from "@9tensor/retouch-ml";

const retouch = new Retouch({ target: "#editor" });
installMlTools(retouch);
```

Or run background removal headlessly:

```ts
import { removeBackground } from "@9tensor/retouch-ml";

const canvas = await removeBackground(imageElement, {
  onDownloadProgress: ({ loaded, total }) => console.log(loaded / total),
});
```

## Self-hosting

By default, model weights load from the Hugging Face CDN and the ONNX Runtime
`.wasm` binaries from jsDelivr. To stay fully first-party, host both yourself:

```ts
installMlTools(retouch, {
  cutout: { modelUrl: "https://your.cdn/models/modnet.onnx", wasmPaths: "https://your.cdn/ort/" },
  upscale: { modelUrl: "https://your.cdn/models/realesrgan-x4plus.onnx" },
  select: { encoderUrl: "https://your.cdn/models/sam-encoder.onnx", decoderUrl: "https://your.cdn/models/sam-decoder.onnx" },
  depth: { modelUrl: "https://your.cdn/models/depth-anything-v2-small.onnx" },
  denoise: {
    modelUrl: "https://your.cdn/models/scunet.onnx",
    externalDataUrl: "https://your.cdn/models/scunet.onnx.data",
  },
});
```

Pass `cutout: false` or `upscale: false` to skip registering a tool. Cutout
and Upscale open their result in the editor when done; pass
`openResults: false` to leave it in the gallery quietly.
`wasmPaths` is page-global — setting it in either tool's options applies to
both.

`clearModelCache()` drops the cached weights.

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
