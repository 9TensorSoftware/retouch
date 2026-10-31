# Advanced features — research & license audit

Constraint: everything runs **fully client-side in TypeScript** (canvas/WebGL or
ONNX Runtime Web / transformers.js). Licenses verified 2026-07 against an
MIT-licensed library used commercially. Weights are fetched at runtime (HF CDN
or self-hosted), never bundled — but defaults must still be permissive. Since
0.1.0 every default URL is pinned to a specific upstream revision (a commit
SHA in the `resolve/…` path), so an upstream push can never change what users
download; bumping a pin is a deliberate, reviewed change.

## License verdicts (checked at source)

| Model / lib | License | Verdict |
|---|---|---|
| BiRefNet | MIT | ✅ default for background removal |
| MODNet | Apache-2.0 | ✅ portrait matting (image + per-frame video) |
| LaMa | Apache-2.0 | ✅ object erase (ONNX ports exist, ~200 MB) |
| MI-GAN (Picsart) | MIT | ✅ small object-erase alternative |
| Real-ESRGAN | BSD-3-Clause | ✅ upscale |
| Depth Anything V2 **Small** | Apache-2.0 | ✅ shipped (quantized 27 MB, 0.9993-correlated with fp32; fp16 export trips an ORT layer-norm fusion bug — avoided). Base/Large/Giant stay ❌ CC-BY-NC |
| Depth Anything V2 Base/Large/Giant | CC-BY-NC-4.0 | ❌ non-commercial |
| SAM2 | Apache-2.0 | ⚠️ upstream fine; the ONNX export repos carry no license + 134 MB external-data blobs — not shipped |
| SlimSAM-77 (Xenova ONNX) | Apache-2.0 | ✅ click-to-select (shipped default — 38 MB across encoder+decoder) |
| DDColor | Apache-2.0 | ⚠️ upstream fine; the only licensed ONNX export is 912 MB fp32, right-sized mirrors carry no license — colorize parked |
| SCUNet (real-PSNR) | Apache-2.0 | ✅ denoise (shipped default — 3.8 MB graph stub + 73 MB `.onnx.data` sidecar, LICENSE.txt at source) |
| PP-OCRv4 det + PP-OCRv5 Latin rec (PaddleOCR) | Apache-2.0 | ✅ read text (shipped default — 4.7 MB detector from SWHL/RapidOCR + 7.9 MB recognizer and dictionary from monkt/paddleocr-onnx, both repos Apache-2.0) |
| GFPGAN | Apache-2.0 | ✅ face restoration |
| CodeFormer | S-Lab 1.0 | ❌ non-commercial |
| BRIA RMBG-1.4 / 2.0 | CC non-commercial | ❌ needs paid BRIA agreement |
| RobustVideoMatting | GPL-3.0 | ❌ viral — incompatible as MIT-lib dependency |
| Zero-DCE | CC-BY-NC (academic) | ❌ — use classical CLAHE/gamma or NAFNet (MIT) |
| RIFE | MIT | ✅ license-wise; impractical in-browser for real clips — parked |
| Whisper (tiny/base) | MIT | ✅ browser-proven via transformers.js (captions, stretch) |
| onnxruntime-web / transformers.js / TF.js | MIT / Apache-2.0 / Apache-2.0 | ✅ runtimes |
| YuNet (OpenCV Zoo) | MIT | ✅ face detection (~350 KB ONNX; decode is multi-branch) |
| UltraFace RFB-320 (onnx/models) | MIT | ✅ face detection (~1.2 MB, priors decoded in-graph — shipped default) |
| MediaPipe BlazeFace / Face Mesh | Apache-2.0 | ✅ face detection + landmarks |
| YOLOX / NanoDet-Plus | Apache-2.0 | ✅ object detection (NanoDet ~4 MB) |
| OWL-ViT / OWLv2 | Apache-2.0 | ✅ open-vocabulary detection (text-prompted) |
| Florence-2 base | MIT | ✅ detect+caption+OCR in one (~230 MB) |
| BLIP | BSD-3-Clause | ✅ captions/tagging |
| Tesseract.js | Apache-2.0 | ✅ OCR |
| Ultralytics YOLO v5/v8/v11 | AGPL-3.0 | ❌ viral — same reason as RVM |

Note: RMBG-2.0 is architecturally BiRefNet + BRIA's proprietary data — using
MIT BiRefNet directly is the clean path.

Patent note: seam carving (content-aware scale) has MERL/Adobe patents in the
wild; OSS implements it widely, but commercial adopters should be aware.

## Tier A — pure TypeScript / canvas / WebGL (no models, no downloads)

1. ✅ Perspective / keystone correction — V/H sliders shipped (separable strip warp); 4-corner "perspective crop" still open
2. ✅ Auto-crop on straighten — largest inscribed rect, no black corners (shipped)
3. ✅ Curves + live histogram (shipped; Levels still open)
4. ✅ HSL mixer + white-balance eyedropper (shipped; split-toning wheels still open)
5. ✅ Selective (masked) adjustments — linear/radial gradients shipped (brush masks still open)
6. ✅ Clarity (midtone-weighted large-radius unsharp) + dehaze (shipped)
7. ✅ Lens corrections — barrel/pincushion distortion + devignette shipped (defish ≈ strong distortion; CA fix still open)
8. ✅ Warp / liquify — brush-painted push warp over a 33×33 displacement grid, size/strength brush + Reset, image and video (shipped; pinch/bloat modes and mesh/cage transform still open)
9. ✅ Content-aware scale — seam carving in a Blob-URL worker, Transform pane "Content-aware width" 50–100% (shipped, images only; see patent note. Preview carves a ≤1000px working copy; export carves at ≤1600px)
10. ✅ Stylize — tilt-shift, duotone, posterize, pixelate, halftone (shipped; per-region pixelate still open)
11. ✅ Video classical — GIF-of-range with forward/reverse/boomerang loops (gifenc, MIT), deflicker (export-time temporal gain), poster pick (shipped; full mp4 reverse still open — needs frame buffering)

## Tier B — on-device ML plugin packages (`@9tensor/retouch-ml-*`, lazy-loaded, WebGPU→WASM fallback)

1. ✅ Background removal / cutout — shipped in `@9tensor/retouch-ml` M1: MODNet (Apache-2.0, ~25 MB) default, any BiRefNet ONNX export via `modelUrl`; ORT-web WebGPU→WASM, Cache API weights, clears the background in place as an undoable step
2. ✅ Object erase / heal brush — shipped in `@9tensor/retouch-ml` M3: LaMa (Apache-2.0, Carve ONNX, ~208 MB — the MI-GAN HF mirrors lack license metadata, so LaMa is the provenance-clean pick). Brush-painted mask → padded square around the strokes runs at the model's fixed 512², fill composites back at full res (feathered, masked pixels only). Result replaces the image in place via the new core `replaceImageSource`; requires neutral geometry (guarded in the pane)
3. ✅ Upscale 4× — shipped in `@9tensor/retouch-ml` M2: Real-ESRGAN x4plus ONNX (BSD-3, ~67 MB, dynamic shapes), overlap-padded tile inference (64px cores + 8px context, no seams), WebGPU with run-level WASM fallback (some devices fail Conv buffers only at inference time), alpha carried via canvas upsampling, 2048px input cap
4. ✅ Depth bokeh — shipped in `@9tensor/retouch-ml` M6: **Depth Anything V2 Small** (Apache-2.0, quantized 27 MB, dynamic multiple-of-14 dims, higher = closer verified). The Depth tab analyzes once, then click-to-focus + Aperture recompose instantly from pre-blurred levels; Apply renders full-res in place (original buffered). Fog/depth-grade variants still open
5. ✅ Click-to-select — shipped in `@9tensor/retouch-ml` M5 as **SlimSAM-77** (Apache-2.0, ~38 MB: 1024² encoder cached per image + per-click prompt decoder, int64 labels). The Select tab segments on click with add/subtract refinement, then **Cut out** (transparent PNG) or **Erase object** (dilated mask → LaMa inpaint, in place). SlimSAM chosen over SAM2 for size and export licensing; SAM2 revisit open
6. Colorize B&W — **DDColor** (Apache-2.0) — ⚠️ parked: no right-sized licensed ONNX export exists yet (see license table)
7. Face restoration — **GFPGAN** (Apache-2.0) — not CodeFormer
8. ✅ Denoise — shipped in `@9tensor/retouch-ml` M7: **SCUNet real-PSNR** (Apache-2.0, 3.8 MB stub + 73 MB weights sidecar; the runtime gained `externalDataUrl` for split exports, sidecar downloaded first so progress tracks the big file). Blind real-noise removal tiled at 192px cores + 16px context, each tile replicate-padded to the Swin-required multiple of 64 (zero-pad bleeds a dark rim at image borders); ~12 dB PSNR gain verified, alpha carried through, replaces the image in place (original buffered, Reset restores). NAFNet (MIT) alternative still open
9. Video matting — **MODNet per-frame** (RVM is GPL — excluded)
10. Auto-captions (stretch) — **Whisper tiny** (MIT) via transformers.js
11. ✅ Detection pack — shipped in `@9tensor/retouch-ml` M4 + M4b: **UltraFace** faces (MIT, ~1.2 MB, in-graph prior decode) and **YOLOX-nano** objects (Apache-2.0, ~3.5 MB, 80 COCO classes — raw per-anchor output decoded in TS with per-class NMS; **BGR** input confirmed empirically, person 0.90 vs 0.78 RGB). The Detect tab finds either and feeds the same actions: radial Masks-tool entries, destructive privacy **pixelate** (in place), and **crop-to-boxes**. Open-vocab (OWL-ViT) still open
12. Face-aware retouch — **MediaPipe Face Mesh** (Apache-2.0) landmarks gating skin smoothing / eye brighten

## Cut by the fully-client-side constraint

Generative inpaint/outpaint (FLUX/SDXL/Qwen-Image-Edit), IC-Light relighting,
video frame interpolation at scale — multi-GB diffusion/flow models with no
realistic browser path. Revisit only if a server proxy tier is ever wanted.

## Recommended order

1. ✅ Tier A (all 11 shipped)
2. `@9tensor/retouch-ml` milestones (agreed 2026-07): ✅ M1 scaffold+cutout → ✅ M2 upscale (Real-ESRGAN) → ✅ M3 erase (LaMa) → ✅ M4 detection pack (faces + ✅ M4b objects) → ✅ M5 SlimSAM select → ✅ M6 depth bokeh → ✅ M7 denoise (SCUNet — colorize skipped: blocked on export licensing) → M8+ GFPGAN face restoration
