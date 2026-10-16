# Changelog

All notable changes to `@retouchjs/core` and `@retouchjs/ml` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); both packages use
[Semantic Versioning](https://semver.org/) and share a version number.

## Unreleased

### Added

- `theme: "light" | "dark" | "auto"` and `setTheme()` for the drop zone and gallery. Dark uses the
  editor's darkroom tokens; auto follows the OS setting.
- `ctx.ui` for custom tools: `row`, `section`, `slider`, `button`, `choice` and `note` build pane
  controls that match the built-in tools (types exported as `ToolUi`, `UiSlider`, and so on).
- Tokens for the coming redesign: type families and scale (`--rt-font-*`, `--rt-type-*`),
  `--rt-shadow-float`, `--rt-highlight`, `--rt-prism`, `--rt-radius-full`, `--rt-dur-4`, and a
  spring easing, `--rt-ease-spring`.
- Zoom and pan in the editor: zoom controls at the foot of the stage (−, +, Fit, 1:1), ⌘/Ctrl +
  wheel or trackpad pinch to zoom at the pointer, `+` `-` `0` keys, and wheel, Space-drag (images)
  or middle-drag to pan. Up to 800%; the canvas redraws sharp up to the preview's resolution and
  magnifies past it, with crop handles and mask gizmos keeping their size.
- A live RGB histogram heads the inspector for the tone and look tools.
- Letter shortcuts for tools (C, T, L, A, V, H, M, S, F; R for Trim) with hover tooltips naming
  each tool and its key. `I` opens the AI tools menu.
- Plugin tools take `group` (`"frame" | "tone" | "looks" | "plugins" | "ai"`, type `ToolGroup`),
  `shortcut`, and, for the AI menu, `description` and `badge`. `@retouchjs/ml` tools use them.
- A before/after divider for images: Compare (or `\`) lays it across the photo; drag the grip or
  use the arrow keys. The left side is the photo without its look edits but framed the same way,
  so the halves line up at any zoom. After a commit it shows the pristine original, unless a
  committed crop or turn means it can't line up, in which case Compare shows the two side by side.
- Sliders show their value as a field you can type into (`↑`/`↓` step it), mark themselves with a
  dot when they're off neutral, and reset on a double-click of the label or the track. Color
  sliders draw what they do on their tracks.
- The inspector's Reset clears the active tool's edits; the top bar's button now reads "Reset all".
- `ctx.ui.tiles()` builds preview tiles and `ctx.preview(edits)` draws the photo with a look
  applied for them (types `UiTiles`, `UiTilesOptions`, `UiTileOption`, `PreviewEdits`). Sliders
  from `ctx.ui.slider()` take `track` and `parse`.
- A brush ring for Liquify and the ML package's Erase, sized to the brush; `[` and `]` resize the
  Liquify brush.
- AI tools explain themselves before they cost anything. `@retouchjs/ml` panes open on a card with
  the model, its download size and where it runs; the run button names the download ("Download
  208 MB and erase") until the model is saved; Select asks before downloading instead of starting
  on a click; runs show download, run and save steps, with a progress bar; and results wipe in
  over the photo. Without `openResults`, a finished gallery result offers "Open it".
- Ask AI replies are cards listing what they set ("Contrast +15", "Warm filter") with an Undo for
  exactly that step, and suggestion chips sit above the input.
- Plugin kit: `ctx.ui.card()`, `ctx.ui.steps()`, `button({ variant: "ai" })`, slider
  `ariaLabel` and `fillFrom`, and `ctx.reveal(result)` to wipe a result in before committing it (types `UiCard`,
  `UiCardOptions`, `UiSteps`, `UiStepsOptions`, `UiStep`, `UiStepState`).
- `@retouchjs/ml`: `isModelCached(urls)`.
- Transparent pixels show as a checkerboard in the editor.

### Changed

- Branding takes one variable: the accent's hover, washes, text color and the focus ring derive
  from `--rt-accent` (and `--rt-danger-soft` from `--rt-danger`). The default palette renders the
  same.
- The editor's frame is redesigned. Floating panels sit on a graphite stage; the control strip
  under the canvas became an inspector on the right, and the tool rail groups tools (frame, tone,
  looks, then plugins), with the AI tools gathered behind one launcher when there are two or
  more. The rail orders tools by group: the `tools` option picks which appear and their order
  within a group, and the number keys follow the rail.
- Dark tokens (the editor and the shell's dark theme) move to graphite neutrals and a brighter
  accent, `#F5753F`.
- On narrow windows (760 px and below) and upright tablets, the editor stacks: stage, then the
  inspector, then the rail along the bottom edge.
- Every tool pane is rebuilt for the inspector. Adjust shows all 14 sliders in four folding
  sections (Light, Color, Effects, Detail) instead of one slider picked by chip. Curves spans the
  inspector's width with an input → output readout. Color mix picks bands from swatches and draws
  its sliders in the band's color. Filters, Stylize and the demo's Looks are preview tiles drawn
  from the photo. Crop has aspect tiles, a straighten ruler and rotate/flip buttons, and no Apply
  button (the crop applies on tool switch, Enter or Done). Masks are a list with invert and delete
  on each row, and all six local sliders visible.
- `ctx.ui.section()` returns a titled group whose controls stack, matching the built-in sections.
- The Transform straighten slider moves in 0.1° steps.
- `@retouchjs/ml` panes are built with `ctx.ui`, so they follow the editor's design; status text is
  rewritten in plain language.

### Fixed

- Theme overrides apply whatever order stylesheets load in. Tokens now live in the
  `retouch-tokens` cascade layer, declared first; before, Rétouch's injected stylesheet came last
  and won ties against a host's `.rt-root { --rt-accent: … }`. Component rules stay unlayered, so
  host resets still can't restyle them.
- Setting only `--rt-accent` no longer leaves terracotta-tinted washes behind.
- Side-by-side compare showed the original larger than the edited image; both now fit the same.

## [0.1.0] — 2026-09-19

The first release since 0.0.2 turns a crop/brightness prototype into a full image *and video*
editor with an on-device ML companion package. `@retouchjs/ml` is published for the first time.

### Breaking changes since 0.0.2

- **Video is accepted by default.** `acceptedTypes` now covers images only; MP4/WebM/MOV arrive
  through the new `acceptedVideoTypes` (default `["video/mp4", "video/webm", "video/quicktime"]`).
  Pass `acceptedVideoTypes: []` to keep the 0.0.2 behavior.
- **Done bakes edits into the image** (`commitMode: "bake"`, the new default): after Done, an
  entry's `file` and pixels are the edited version and the pristine original moves to
  `entry.original`. Set `commitMode: "keep-edits"` for the old parametric-until-export behavior.
- **Entries are a union.** `getEditingEntry()` returns `MediaEntry | null`, the `images:add`
  payload is `{ entries: MediaEntry[] }`, and `editor:done` carries `ImageEdits | VideoEdits`.
  Narrow with the exported `isImageEntry` / `isVideoEntry` (or `entry.kind`).
- `getImages()` is deprecated (it silently omits videos) — use `getMedia()`.
- `ImageEdits` grew from three fields to the full edit model (orientation, flips, keystone, lens,
  seam width, liquify, curves, HSL, masks, stylize, filter + strength, …). Code that constructed
  `ImageEdits` literals by hand will need every field; `Adjustments` now has 14 keys.
- Runtime dependencies: `fabric` (static import), `mediabunny` and `gifenc` (loaded lazily, only
  when a video or GIF is exported). 0.0.2 had none.

### Added — editor

- Feature-group tabs on a left rail with a contextual control strip under the canvas; tabs are
  registry-driven (`tools` option) and pluggable via `Retouch.registerTool` (plugin API v1).
- **Crop** (commit-style apply, aspect presets, thirds grid) · **Transform** (rotate 90°/flip,
  straighten with auto-crop, keystone, lens distortion + devignette, content-aware width via seam
  carving in a worker) · **Liquify** (brush push warp) · **Adjust** (14 controls incl. exposure,
  temperature/tint, vibrance, clarity, dehaze, white-balance eyedropper) · **Curves** (master + RGB,
  live histogram) · **Color mix** (8-band HSL) · **Masks** (linear/radial selective adjustments) ·
  **Stylize** (tilt-shift, duotone, posterize, pixelate, halftone) · **Filters** (11 presets with
  intensity and live thumbnails).
- Undo/redo history with a timeline menu; keyboard operability (Esc, ⌘/Ctrl+Enter, ⌘/Ctrl+Z/⇧Z/Y,
  ⌘/Ctrl+K, 1–9, Enter, Space) with a focus trap and dialog ARIA.
- Side-by-side compare view (images), hold-to-compare (video), Reset, and `restoreOriginal(id)` /
  `replaceImageSource(id, file)` with `image:commit` / `image:restore` events.
- Toast notifications for rejected files and export errors, with a severity icon (errors are
  announced as alerts) and placed clear of the controls; `file:rejected` reasons
  `type | size | duration | count | load-error`; `maxFileSize` and `maxVideoDuration` options.

### Added — video

- Video ingestion with poster cards and duration badges; playback transport with crop, adjust and
  filters live on the frame; **Trim** tool with filmstrip, in/out handles, loop-in-range and
  keyboard nudging; playback speed 0.25–4×.
- Re-encoded MP4/WebM export through WebCodecs (mediabunny) with audio, one-tap mute, per-file
  `export:*` progress events, an export overlay and `cancelExport()`; packet copy when nothing
  changed; a MediaRecorder fallback for browsers without WebCodecs.
- Frame capture into a new image entry, GIF-of-range export (forward/reverse/boomerang), deflicker,
  and poster pick.

### Added — AI

- ✦ Ask AI panel (⌘K): natural-language edits mapped onto the manual tools' edit operations as
  one undoable step, with a downscaled frame for content-aware commands. Token-gated via
  `ai: { apiKey | baseUrl | complete | allowUserKey }`; `ai:start` / `ai:applied` / `ai:error`
  events.

### Added — gallery & API

- Six gallery view modes (2/3/4 columns, width-fit, height-fit, list), an add-more drop target,
  and a **Done** button whenever `onDone` is configured.
- Export options (`export: { format, quality, maxDimension }`), `exportGif()`, `downloadImage()`,
  `cancelExport()`; `refreshRangeFill` for plugin sliders.

### Added — design system & theming

- "Warm atelier / neutral darkroom" visual system: semantic CSS tokens per world (light shell,
  true-neutral editor), a unified 24-grid/1.5-stroke icon set, property-scoped motion with entrance
  keyframes and `prefers-reduced-motion`, focus rings, filled slider tracks, and a documented
  theming contract (override tokens on `.rt-root` or the overlay roots).

### Added — `@retouchjs/ml` 0.1.0 (first release)

Seven editor tabs, each also available as a headless function, running through ONNX Runtime Web
(WebGPU → WASM fallback, inference in a worker, weights cached via the Cache API):

- **Cutout** — MODNet background removal (any BiRefNet export via `modelUrl`)
- **Upscale** — tiled Real-ESRGAN 4× with seam-free overlap
- **Erase** — LaMa heal brush, composited back in place
- **Detect** — UltraFace faces + YOLOX-nano objects (80 COCO classes) → masks, privacy pixelate,
  crop-to-boxes
- **Select** — SlimSAM click-to-segment with add/subtract refinement → cut out or erase object
- **Depth** — Depth Anything V2 Small bokeh with click-to-focus and aperture
- **Denoise** — SCUNet real-noise removal (split graph + weights sidecar via `externalDataUrl`)

Default model URLs are pinned to specific upstream revisions. All default weights are MIT,
Apache-2.0 or BSD-3 licensed — see `docs/ADVANCED-FEATURES.md` for the audit.

### Fixed

- A dragged crop is kept when you press Done or switch tools; it no longer needs Apply crop first.
- The editor fits phone screens: Done stays visible at any width, the top bar and control strip
  scroll instead of clipping their first items, and the tool rail collapses to icons.
- Sample-accurate trim: packet copy is reserved for untouched full-range exports.
- History no longer records no-op checkpoints ("phantom Edit steps").
- The compare button no longer inherits the host page's colors; the compare view is discoverable.
- ML results open in the editor with honest status text; heavy models run in a worker so the UI
  never freezes.

### Tooling

- CI on every push: typecheck → lint → tests → builds → a Node smoke test that imports both built
  packages and inspects their tarballs → demo build; GitHub Pages deploys only from a green `main`.
- `publish.sh` releases both packages in dependency order with `pnpm publish`.

## [0.0.2] — 2026-02-19

Initial public release: drop zone → gallery → editor with crop, rotation and brightness/contrast/
saturation adjustments; `onDone` export to Blobs.

[0.1.0]: https://github.com/onursavas/retouch.js/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/onursavas/retouch.js/releases/tag/v0.0.2
