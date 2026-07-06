# Rétouch Roadmap

Feature catalog and build order. Priorities: **P1** = next, **P2** = soon, **P3** = later.
Status: ✅ shipped · 🚧 in progress · ⬜ planned.

## A. Usability & editor polish

| Status | P | Feature |
|--------|---|---------|
| ✅ | P1 | Undo/redo history (Cmd/Ctrl+Z / ⇧Z) over the edits object |
| ✅ | P1 | Keyboard: Esc=cancel, Cmd/Ctrl+Enter=done, number-key tool hotkeys, Space=play, arrow-nudge trim handles |
| ✅ | P1 | Focus trap + `role="dialog"` + ARIA in editor; full keyboard operability |
| ✅ | P1 | Error feedback: toast on rejected files (type/size/count) + `file:rejected` event |
| ✅ | P1 | Before/after compare (hold button) · Reset-all |
| ⬜ | P2 | Zoom & pan canvas (wheel/pinch, fit/100%) |
| ✅ | P2 | EXIF orientation (handled by the browser's default `image-orientation: from-image`) |
| ✅ | P2 | Filter intensity slider (0–100% preset blend) |
| ✅ | P2 | 12 adjustments: exposure, temperature/tint, hue, vibrance, sharpen, blur, grain, vignette |
| ✅ | P2 | Rotate 90° + flip H/V buttons (crop-tracking transforms) |
| ⬜ | P2 | Mobile: responsive editor (panel → bottom sheet), touch-size hit targets |
| ⬜ | P3 | Curves editor · per-color HSL mixer · highlights/shadows recovery (researched: Lightroom/Snapseed baseline) |
| ⬜ | P3 | Clarity/dehaze · denoise · custom LUT import · auto-enhance |
| ⬜ | P3 | Histogram · straighten-with-grid · loading skeletons · pixel-size readout on crop |

## B. Editor tools

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | Crop (aspect presets, straighten, rotate 90°/flip) · Adjust (12 controls in Light/Color/Effects) · Filters (12 presets with intensity, live thumbnails) |
| ⬜ | P2 | Draw tool (PencilBrush: size/color/opacity, eraser) |
| ⬜ | P2 | Text tool (Textbox: font/size/color/align, drag/scale/rotate) |
| ⬜ | P2 | Sticker/shapes tool (built-in set + custom images) |
| ⬜ | P2 | Object layer for the above: select/move/delete/z-order, serialization into edits, export compositing |

## C. Gallery & workflow

| Status | P | Feature |
|--------|---|---------|
| ✅ | — | View modes (cols-2/3/4, width-fit, height-fit, list) + size controls |
| ⬜ | P2 | Multi-select + batch delete/export |
| ⬜ | P2 | Copy/paste edits between items · "apply to all" |
| ⬜ | P3 | Drag to reorder · inline rename · metadata display · sort/filter by edited · revert-to-original |

## D. API / integration / theming

| Status | P | Feature |
|--------|---|---------|
| 🚧 | P1 | Enforce `maxFileSize` (ships with video Stage A1) |
| 🚧 | P1 | Export progress/error/cancel events (ships with video Stage B) |
| ✅ | P2 | `tools` option — feature-group tabs are registry-driven |
| ✅ | P2 | Export options: format png/jpeg/webp, quality, max dimension (`export` option) |
| ⬜ | P2 | Paste-from-clipboard + URL import |
| ⬜ | P2 | `getEdits()/setEdits()` JSON round-trip for host persistence |
| ⬜ | P2 | README truth pass (docs match the real API) |
| ⬜ | P3 | i18n strings option · documented CSS-var theming · React wrapper · Vue/Svelte wrappers |

## E. Video editing

| Status | P | Feature |
|--------|---|---------|
| 🚧 | P1 | A1: accept video files · poster cards with duration badge · media model |
| 🚧 | P1 | A2: editor playback transport · crop/adjust/filters live on video |
| 🚧 | P1 | A3: trim tool with filmstrip, in/out handles, loop-in-range |
| 🚧 | P1 | A4: frame capture → image entry |
| 🚧 | P1 | B1: re-encoded MP4 export (mediabunny/WebCodecs), audio + mute, progress + cancel |
| 🚧 | P1 | B2: MediaRecorder fallback · export progress overlay · video on by default |
| ✅ | — | Playback speed 0.25–4× (preview + retimed export; audio dropped at non-1×) |
| ⬜ | P3 | Audio gain/fade · pitch-preserving speed audio · GIF-of-range export · poster pick |
| ⬜ | P3 | Researched (CapCut baseline, need multi-clip/object layers): transitions · text & auto-captions · keyframe animation · speed curves · stabilization · chroma key |

## G. AI

| Status | P | Feature |
|--------|---|---------|
| 🚧 | P1 | AI command bar: natural-language edits via VLM (token-gated, Anthropic by default, `complete` hook for proxies) |
| ⬜ | P3 | AI auto-enhance suggestions · smart-crop refinements · alt-text generation on export |

## F. Ambitious / later

| Status | P | Feature |
|--------|---|---------|
| ⬜ | P3 | Background removal (separate plugin package, WebGPU/onnx) |
| ⬜ | P3 | Collage canvas · batch watermark |
| ✅ | — | Plugin API v1: `Retouch.registerTool` feature groups over the shared edit model (demo: "Looks") |
| ⬜ | P3 | Plugin API v2: custom render passes + `registerFilter` (needed for Draw/Text/Sticker as plugins) |
