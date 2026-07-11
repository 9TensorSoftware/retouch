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
});
```

Pass `cutout: false` or `upscale: false` to skip registering a tool.
`wasmPaths` is page-global — setting it in either tool's options applies to
both.

`clearModelCache()` drops the cached weights.

## Licenses

The package is MIT. Default model weights: MODNet (Apache-2.0),
Real-ESRGAN x4plus (BSD-3-Clause), and LaMa (Apache-2.0). ONNX Runtime Web
is MIT. See `docs/ADVANCED-FEATURES.md` in the repo root for the full
per-model license audit.
