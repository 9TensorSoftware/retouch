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
  modelUrl: "https://your.cdn/models/modnet.onnx",
  wasmPaths: "https://your.cdn/ort/",
});
```

`clearModelCache()` drops the cached weights.

## Licenses

The package is MIT. Default model weights: MODNet (Apache-2.0). ONNX Runtime
Web is MIT. See `docs/ADVANCED-FEATURES.md` in the repo root for the full
per-model license audit.
