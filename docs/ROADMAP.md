# Rétouch Roadmap

Feature catalog and build order. Priorities: **P1** = next, **P2** = soon, **P3** = later.
Status: ✅ shipped · 🚧 in progress · ⬜ planned.

Release history lives in [CHANGELOG.md](../CHANGELOG.md); the research and
license audit behind the ML and advanced-feature rows is in
[ADVANCED-FEATURES.md](ADVANCED-FEATURES.md).

## A. Usability & editor polish

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | Undo/redo history (Cmd/Ctrl+Z / ⇧Z / Y) over the edits object |
| ✅ | — | Keyboard: Esc=cancel, Cmd/Ctrl+Enter=done, Cmd/Ctrl+K=AI, letter + 1–9 tool hotkeys, I=AI tools menu, +/−/0 zoom, Enter=apply crop, Space=play, arrow-nudge trim handles |
| ✅ | — | Focus trap + `role="dialog"` + ARIA in editor; full keyboard operability; `:focus-visible` rings |
| ✅ | — | Error feedback: toast on rejected files (type/size/duration/count) + `file:rejected` event |
| ✅ | — | Side-by-side compare view (images) · hold-to-compare (video) · Reset-all |
| ✅ | — | Done commits edits into the image (`commitMode: "bake"`), pristine original kept for Reset / `restoreOriginal()` |
| ✅ | — | EXIF orientation (handled by the browser's default `image-orientation: from-image`) |
| ✅ | — | Filter intensity slider (0–100% preset blend) |
| ✅ | — | 14 adjustments: brightness, contrast, saturation, exposure, temperature, tint, hue, vibrance, sharpen, blur, grain, vignette, clarity, dehaze |
| ✅ | — | Rotate 90° + flip H/V buttons (crop-tracking transforms) |
| ✅ | — | Curves editor with live histogram · per-color HSL mixer · white-balance eyedropper |
| ✅ | — | Design system: semantic tokens, neutral darkroom editor, unified icon set, motion + reduced-motion, filled slider tracks |
| ✅ | — | Editor frame: grouped tool rail with an AI tools menu, right-hand inspector with a live RGB histogram, floating panels |
| ✅ | — | Zoom & pan canvas (Cmd/Ctrl+wheel and trackpad pinch, wheel/Space/middle-drag pan, fit/1:1, sharp re-render up to the preview's resolution) |
| ⬜ | P1 | Mobile: touch pinch-zoom, bottom-sheet inspector, touch-size hit targets (the panels already stack on narrow screens) |
| ⬜ | P3 | Highlights/shadows recovery · custom LUT import · auto-enhance |
| ⬜ | P3 | Straighten-with-grid overlay · loading skeletons · pixel-size readout on crop |

## B. Editor tools

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | Crop (aspect presets, rule-of-thirds grid, commit-style apply) |
| ✅ | — | Transform (rotate/flip, straighten with auto-crop, keystone, lens distortion + devignette, content-aware width) |
| ✅ | — | Liquify (brush push warp, image + video) |
| ✅ | — | Adjust (14 controls) · Curves · Color mix (8-band HSL) · Masks (linear/radial) · Stylize (tilt-shift, duotone, posterize, pixelate, halftone) · Filters (11 presets + Original) |
| ✅ | — | Trim (video: filmstrip, in/out handles, loop-in-range, speed 0.25–4×) |
| ⬜ | P2 | Draw tool (brush: size/color/opacity, eraser) |
| ⬜ | P2 | Text tool (font/size/color/align, drag/scale/rotate) |
| ⬜ | P2 | Sticker/shapes tool (built-in set + custom images) |
| ⬜ | P2 | Object layer for the above: select/move/delete/z-order, serialization into edits, export compositing |

## C. Gallery & workflow

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | View modes (cols-2/3/4, width-fit, height-fit, list) · add-more drop target · Done button when `onDone` is set |
| ✅ | — | Revert to original (`restoreOriginal()`, editor Reset) · size/duration in list view |
| ⬜ | P2 | Multi-select + batch delete/export |
| ⬜ | P2 | Copy/paste edits between items · "apply to all" |
| ⬜ | P3 | Drag to reorder · inline rename · full metadata · sort/filter by edited |

## D. API / integration / theming

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | `maxFileSize` / `maxFiles` / `maxVideoDuration` enforcement with `file:rejected` reasons |
| ✅ | — | Export lifecycle events (`export:start/progress/complete/error`) + `cancelExport()` + progress overlay |
| ✅ | — | `tools` option — feature-group tabs are registry-driven |
| ✅ | — | Export options: format png/jpeg/webp, quality, max dimension (`export` option) |
| ✅ | — | Documented CSS-var theming (README "Theming": semantic tokens, light on `.rt-root`, dark on the overlay roots) |
| ✅ | — | README truth pass (docs match the real API) · CHANGELOG · CI (typecheck/lint/test/build/smoke) · release script for both packages |
| ⬜ | P2 | Paste-from-clipboard + URL import |
| ⬜ | P2 | `getEdits()/setEdits()` JSON round-trip for host persistence |
| ⬜ | P3 | i18n strings option · React wrapper · Vue/Svelte wrappers |

## E. Video editing

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | Accept video files · poster cards with duration badge · media model (`ImageEntry \| VideoEntry`) |
| ✅ | — | Editor playback transport · crop/adjust/filters live on video |
| ✅ | — | Trim tool with filmstrip, in/out handles, loop-in-range |
| ✅ | — | Frame capture → image entry (carries the video's visual edits) |
| ✅ | — | Re-encoded MP4/WebM export (mediabunny/WebCodecs), audio + mute, progress + cancel; packet copy when nothing changed |
| ✅ | — | MediaRecorder fallback · export progress overlay · video on by default |
| ✅ | — | Playback speed 0.25–4× (preview + retimed export; audio dropped at non-1×) |
| ✅ | — | GIF-of-range export (forward/reverse/boomerang) · deflicker · poster pick |
| ⬜ | P3 | Audio gain/fade · pitch-preserving speed audio · full mp4 reverse |
| ⬜ | P3 | Researched (CapCut baseline, need multi-clip/object layers): transitions · text & auto-captions · keyframe animation · speed curves · stabilization · chroma key |

## F. AI

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | AI panel (⌘K): natural-language edits via VLM over the full edit surface (token-gated, Anthropic by default, `baseUrl`/`complete` for proxies, `allowUserKey`) |
| ⬜ | P3 | AI auto-enhance suggestions · smart-crop refinements · alt-text generation on export |

## G. On-device ML (`@retouchjs/ml`)

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | M1 Cutout — MODNet background removal (any BiRefNet export via `modelUrl`) |
| ✅ | — | M2 Upscale — tiled Real-ESRGAN 4× |
| ✅ | — | M3 Erase — LaMa heal brush, in place |
| ✅ | — | M4 Detect — UltraFace faces + YOLOX-nano objects → masks, privacy pixelate, crop-to-boxes |
| ✅ | — | M5 Select — SlimSAM click-to-segment → cut out / erase object |
| ✅ | — | M6 Depth — Depth Anything V2 Small bokeh, click-to-focus + aperture |
| ✅ | — | M7 Denoise — SCUNet real-noise removal |
| ✅ | — | Runtime: WebGPU → WASM fallback, worker inference, Cache API weights, revision-pinned default URLs |
| ⬜ | P1 | M8 Face restoration — GFPGAN (Apache-2.0), UltraFace crop + paste-back |
| ⬜ | P3 | Colorize (DDColor — parked on export licensing) · video matting (MODNet per frame) · face-aware retouch (Face Mesh) · open-vocab detection (OWL-ViT) |

## H. Ambitious / later

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | Plugin API v1: `Retouch.registerTool` feature groups over the shared edit model (demo: "Looks"; `@retouchjs/ml` is built on it) |
| ⬜ | P3 | Plugin API v2: custom render passes + `registerFilter` (needed for Draw/Text/Sticker as plugins) |
| ⬜ | P3 | Collage canvas · batch watermark |
