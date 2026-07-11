# Advanced features — research & license audit

Constraint: everything runs **fully client-side in TypeScript** (canvas/WebGL or
ONNX Runtime Web / transformers.js). Licenses verified 2026-07 against an
MIT-licensed library used commercially. Weights are fetched at runtime (HF CDN
or self-hosted), never bundled — but defaults must still be permissive.

## License verdicts (checked at source)

| Model / lib | License | Verdict |
|---|---|---|
| BiRefNet | MIT | ✅ default for background removal |
| MODNet | Apache-2.0 | ✅ portrait matting (image + per-frame video) |
| LaMa | Apache-2.0 | ✅ object erase (ONNX ports exist, ~200 MB) |
| MI-GAN (Picsart) | MIT | ✅ small object-erase alternative |
| Real-ESRGAN | BSD-3-Clause | ✅ upscale |
| Depth Anything V2 **Small** | Apache-2.0 | ✅ depth effects (Small ONLY) |
| Depth Anything V2 Base/Large/Giant | CC-BY-NC-4.0 | ❌ non-commercial |
| SAM2 | Apache-2.0 | ✅ click-to-select masks |
| DDColor | Apache-2.0 | ✅ colorization |
| GFPGAN | Apache-2.0 | ✅ face restoration |
| CodeFormer | S-Lab 1.0 | ❌ non-commercial |
| BRIA RMBG-1.4 / 2.0 | CC non-commercial | ❌ needs paid BRIA agreement |
| RobustVideoMatting | GPL-3.0 | ❌ viral — incompatible as MIT-lib dependency |
| Zero-DCE | CC-BY-NC (academic) | ❌ — use classical CLAHE/gamma or NAFNet (MIT) |
| RIFE | MIT | ✅ license-wise; impractical in-browser for real clips — parked |
| Whisper (tiny/base) | MIT | ✅ browser-proven via transformers.js (captions, stretch) |
| onnxruntime-web / transformers.js / TF.js | MIT / Apache-2.0 / Apache-2.0 | ✅ runtimes |

Note: RMBG-2.0 is architecturally BiRefNet + BRIA's proprietary data — using
MIT BiRefNet directly is the clean path.

Patent note: seam carving (content-aware scale) has MERL/Adobe patents in the
wild; OSS implements it widely, but commercial adopters should be aware.

## Tier A — pure TypeScript / canvas / WebGL (no models, no downloads)

1. ✅ Perspective / keystone correction — V/H sliders shipped (separable strip warp); 4-corner "perspective crop" still open
2. ✅ Auto-crop on straighten — largest inscribed rect, no black corners (shipped)
3. ✅ Curves + live histogram (shipped; Levels still open)
4. ✅ HSL mixer + white-balance eyedropper (shipped; split-toning wheels still open)
5. Selective (masked) adjustments — linear/radial gradient + brush masks
6. Clarity / dehaze (CLAHE-style local contrast) · unsharp with radius
7. Lens corrections — barrel/pincushion, defish, CA fix, devignette
8. Warp / liquify / mesh (cage) transform
9. Content-aware scale — seam carving in a worker (see patent note)
10. Stylize — tilt-shift, duotone/gradient map, posterize, pixelate region, halftone
11. Video classical — deflicker, reverse, boomerang, GIF-of-range, poster pick, low-light via CLAHE

## Tier B — on-device ML plugin packages (`@9tensor/retouch-ml-*`, lazy-loaded, WebGPU→WASM fallback)

1. Background removal / cutout — **BiRefNet** (MIT), MODNet for speed
2. Object erase / heal brush — **LaMa** (Apache-2.0), **MI-GAN** (MIT) for small installs
3. Upscale 2–4× — **Real-ESRGAN** (BSD-3)
4. Depth effects — **Depth Anything V2 Small** (Apache-2.0): bokeh, fog, depth grade
5. Click-to-select subject — **SAM2** (Apache-2.0) masks feeding selective adjustments
6. Colorize B&W — **DDColor** (Apache-2.0)
7. Face restoration — **GFPGAN** (Apache-2.0) — not CodeFormer
8. Denoise — **NAFNet** (MIT) / SCUNet (Apache-2.0)
9. Video matting — **MODNet per-frame** (RVM is GPL — excluded)
10. Auto-captions (stretch) — **Whisper tiny** (MIT) via transformers.js

## Cut by the fully-client-side constraint

Generative inpaint/outpaint (FLUX/SDXL/Qwen-Image-Edit), IC-Light relighting,
video frame interpolation at scale — multi-GB diffusion/flow models with no
realistic browser path. Revisit only if a server proxy tier is ever wanted.

## Recommended order

1. Tier A 1–6 (pro-grade editing, zero new deps)
2. `@9tensor/retouch-ml` package: background removal + upscale + erase (B 1–3)
3. Depth bokeh + SAM2 select (B 4–5)
