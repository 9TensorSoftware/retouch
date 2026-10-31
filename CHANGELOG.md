# Changelog

All notable changes to `@9tensor/retouch` and `@9tensor/retouch-ml` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); both packages use
[Semantic Versioning](https://semver.org/) and share a version number.

## Unreleased

### Added

- **Read text**, an AI tool in `@9tensor/retouch-ml`: it finds every line of text in a photo,
  at any angle, and reads it in 32 Latin-script languages, accents included, with PaddleOCR's
  PP-OCRv4 detector and PP-OCRv5 Latin recognizer (13 MB together, Apache-2.0). The lines are
  outlined on the photo and listed in reading order, to copy, or to pixelate in place.
  `recognizeText(image)` returns them without the editor, and `linesToText()` joins them.
- `ctx.ui.output()`: a read-only block of text a tool produced, selectable and scrollable.

### Changed

- AI tools that change a photo's pixels (Cutout, Erase, Denoise, Depth blur, Pixelate) are now
  steps in the editor's history: undo takes them back, and the history menu names them.
  `replaceImageSource(id, file, { label })` adds such a step; the editor stays on the same tool.
- Cutout clears the background of the photo itself, as a PNG, instead of adding a new image to
  the gallery, so Compare shows the photo before and after.
- A crop waits for an explicit OK. Moving the frame, or picking an aspect, only proposes a crop:
  **Apply** (or Enter) crops, and **Cancel** (or Esc) puts the frame back. Leaving Crop for
  another tool, or pressing Done, with a frame that wasn't applied asks first: Apply or Discard,
  or Esc to keep cropping. Before, switching tools or pressing Done applied it without asking.
- Liquify and the rotate buttons have new icons: a bulging grid, and a frame with a quarter-turn
  arrow. The old Liquify icon looked like search.

- The preview runs clarity, dehaze, masks, the color mixer, curves and stylize on the GPU
  (WebGL2): 4–30 ms a frame where the CPU took 40 ms to 2.5 s, so zooming, sliders and video
  playback no longer stall on edited photos. Results match the CPU passes within a level or two;
  export still runs the CPU passes, and so does the preview where WebGL2 is missing or fails.

### Fixed

- Pinch and ⌘/Ctrl + wheel zoom no longer stall on edited photos. Zoomed in, the canvas is drawn
  with no more device pixels than the preview has (on a 2× screen it was drawn at four times
  that), and it's redrawn only when it needs another size, ahead of the zoom.
- Dragging the crop frame keeps the cursor it started with until the drag ends. With a fixed
  shape, the pointer soon left the corner handle and showed the frame's move cursor.
- The rotate-right icon was drawn mostly outside its box.

## [0.2.0] — 2026-10-18

The first release of `@9tensor/retouch` and `@9tensor/retouch-ml` on npm. It carries everything
in 0.1.0, which was prepared but never published, and adds a redesign of every screen, called
Safelight: an editor on a graphite stage with an inspector, a contact-sheet gallery, a drop zone,
phone layouts, motion, and AI tools that say what they'll download before they do. Plugins get
a UI kit (`ctx.ui`) that keeps their panes matching the built-in tools, and theming takes one
variable for a brand color. See [Writing a tool](docs/PLUGINS.md) and [Theming](docs/THEMING.md).

### Upgrading from `@retouchjs/core` 0.0.2

Each of these is explained under [0.1.0](#010--2026-09-19) below.

- Install `@9tensor/retouch` in place of `@retouchjs/core` and update imports. The AI tools are
  `@9tensor/retouch-ml`. `@retouchjs/core` stays at 0.0.2 and is deprecated.
- Video is accepted by default. Pass `acceptedVideoTypes: []` to accept only images, as before.
- Done bakes edits into the image. Pass `commitMode: "keep-edits"` to keep them parametric
  until export, as before.
- Entries can be images or videos: `getEditingEntry()`, `images:add` and `editor:done` carry
  either, and `isImageEntry()` / `isVideoEntry()` tell them apart. `getImages()` is deprecated
  in favor of `getMedia()`.
- `ImageEdits` is the full edit model now; code that builds one by hand needs every field.
- `fabric` is a dependency; `mediabunny` and `gifenc` load only when video or a GIF is exported.

Nothing else is needed for the redesign: options, methods and events from 0.1.0 work as they
did, and custom tools built by hand from the `rt-dock__*` classes still render.

### Added

- `theme: "light" | "dark" | "auto"` and `setTheme()` for the drop zone and gallery. Dark uses the
  editor's darkroom tokens; auto follows the OS setting.
- `ctx.ui` for custom tools: `row`, `section`, `slider`, `button`, `choice` and `note` build pane
  controls that match the built-in tools (types exported as `ToolUi`, `UiSlider`, and so on).
- Tokens: type families and scale (`--rt-font-*`, `--rt-type-*`),
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
  `shortcut`, and, for the AI menu, `description` and `badge`. `@9tensor/retouch-ml` tools use them.
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
- AI tools explain themselves before they cost anything. `@9tensor/retouch-ml` panes open on a card with
  the model, its download size and where it runs; the run button names the download ("Erase ·
  208 MB") until the model is saved; Select asks before downloading instead of starting
  on a click; runs show download, run and save steps, with a progress bar; and results wipe in
  over the photo. Without `openResults`, a finished gallery result offers "Open it".
- Ask AI replies are cards listing what they set ("Contrast +15", "Warm filter") with an Undo for
  exactly that step, and suggestion chips sit above the input.
- Plugin kit: `ctx.ui.card()`, `ctx.ui.steps()`, `button({ variant: "ai" })`, slider
  `ariaLabel` and `fillFrom`, and `ctx.reveal(result)` to wipe a result in before committing it (types `UiCard`,
  `UiCardOptions`, `UiSteps`, `UiStepsOptions`, `UiStep`, `UiStepState`).
- `@9tensor/retouch-ml`: `isModelCached(urls)`.
- AI tools get their own section on the rail, lit by the prism. The first three sit on the rail
  from the start; the AI menu (now "All AI tools") lists every one with a pin, so people keep the
  ones they use on the rail. A toggle at the rail's foot shows tool names, keys and, for AI tools,
  a line on what each does. Both choices persist per browser; hosts set the starting layout with
  `rail: { pinned, expanded }` (type `RailOptions`).
- A rail taller than the screen fades at the end with more to scroll; short screens get a denser
  rail.
- Transparent pixels show as a checkerboard in the editor.
- A new drop zone: a stack of prints that fans out when files are dragged over, the accepted
  formats, and **Choose files** and **Paste** buttons. ⌘/Ctrl+V adds pasted images while the drop
  zone or gallery is up and nothing else on the page has focus.
- The gallery is a contact sheet: justified rows at true aspect ratios (the new default layout),
  frame numbers, an Edited badge and video lengths. Layouts are Rows, Grid (square crops),
  Filmstrip and List, remembered per browser. Frames can be selected (the circle, ⌘/Ctrl-click,
  Shift to extend, ⌘/Ctrl+A, Esc to clear) and downloaded or removed together; a selection is
  circled like a grease pencil on a contact sheet. `GalleryViewMode` adds `"rows"` and `"grid"`.
- Removing from the gallery offers Undo for a few seconds. The removal fires `images:remove` at
  once, and Undo fires `images:add` for the entries it puts back, in their old places.
- The export sheet shows every file's thumbnail with a ring that fills as it exports, a check or a
  mark when it's done, one bar for the run, the time left, and Cancel (or Esc). It opens straight
  away for runs with video and after 400 ms for images, so quick runs don't flash it.
- Toasts take a detail line and one action, pause while pointed at or focused, and stack three at
  most.
- Phones and upright tablets get a bottom sheet for the controls: drag its bar or header between
  just the header, about half, and most of the screen (a fling carries on), tap the bar to step
  it up, or tap the active tool again to fold it away; the stage refits once the sheet rests.
- Touch on the stage: pinch to zoom, two fingers to pan, one finger on the photo to pan once zoomed
  in, and double-tap to zoom in or back to fit. While two fingers are down, tools don't hear them.
- The tools row along the bottom of a phone settles on whole buttons and keeps the active tool in
  view. On phones, Ask AI moves to the sheet's header, and its chat pins under the top bar at full
  width.
- Motion. Opening a photo zooms it from its gallery frame onto the stage, and Done or Cancel
  settles it back into its frame, which already shows the edits (a view transition; without the
  API, the editor cross-fades). The editor's panels slide in from their edges; the drop zone deals
  its prints; the gallery rises in and new frames cascade into it; toasts glide aside for each
  other; each exported file's check springs in, and a finished export shows a check and a green bar
  before it lets go; the AI result wipe has a prism edge. Reduced motion turns all of it off,
  delays included, and nothing waits on an animation to finish.
- `openEditor(id, { tool })` opens the editor on a given tool, such as `"adjust"` or a plugin's id
  (type `OpenEditorOptions`). Without it, or for a tool the editor doesn't offer, it opens on the
  first tool as before.
- Guides for [writing a tool](docs/PLUGINS.md) and [theming](docs/THEMING.md), and screenshots in
  the README (`node scripts/screenshots.mjs` retakes them from a running demo).
- The demo is now the landing page for retouch.9tensor.com: the live editor with five sample
  photos already in its gallery, a before/after hero that Rétouch renders in the page (Edit this
  photo opens it on those settings), and sections that show real output: a color mix, the Looks
  plugin's looks, and what Erase, Select, Cutout and Upscale made of these photos. It has a social
  preview image, an icon and the 9Tensor footer. The photos are from Unsplash, credited on the page
  and in `demo/public/photos/CREDITS.txt`.

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
- `@9tensor/retouch-ml` panes are built with `ctx.ui`, so they follow the editor's design; status text is
  rewritten in plain language.
- Rejected files make one toast per batch ("3 files couldn't be added · 2 unsupported · 1 too
  large") instead of one each, and a single rejection says what would have worked. Failed exports
  make one toast per run, named for the file, and say the original went out instead.
- The 0.1 gallery layouts open as their nearest new one: `"cols-2"`, `"cols-3"` and `"cols-4"` as the
  grid, `"width-fit"` as rows.
- In the gallery and drop zone, every control is 44 px on touch screens.
- `downloadImage()` falls back to the original file when an image fails to export, as `exportAll()`
  does, instead of rejecting.
- On touch screens, the editor's controls are 44 px (sliders get a bigger thumb, handles on the
  photo a wider grab area), fields are 16 px so iOS doesn't zoom into them, and hints drop their
  keyboard shortcuts. The zoom controls appear once the photo is zoomed.
- Video on phones puts the trim filmstrip on a row of its own, the full width.
- A phone on its side keeps the three-column editor, compacted, instead of stacking it into a
  sliver; the names toggle and the dense rail are for laptop-sized screens only.
- The editor uses the visible screen height (`100dvh`) and keeps clear of notches and the home
  indicator (`env(safe-area-inset-*)`).
- A state change is current at once (`state`, events), while the view swap can wait a frame for
  its transition.
- Resting the mouse on the rail's All AI tools button opens the AI tools menu; it closes once the
  pointer has left both the button and the menu. A click, or the I key, still opens it to stay,
  with focus inside. Keyboard focus on the button shows its tooltip as before.
- AI run buttons lead with the action and then the download: "Erase · 208 MB" instead of
  "Download 208 MB and erase". A label too long for its button wraps inside it instead of
  spilling past the edges.
- With an aspect preset (Square, 4:3, …) the crop frame shows only its corners. Its side handles
  looked like they'd move one edge, but the shape made the whole frame follow; they come back
  with Free, and the hint under the presets says which handles to drag.
- Drags keep to the direction they start in: crop corners and moving the crop frame, every mask
  handle, and curve points. A pull that sets off straight up, down or across stays on that axis,
  so the hand's drift no longer widens the crop, tilts a gradient or moves a point's input; one
  that sets off at an angle stays free. The first few pixels decide.
- Select gets the whole object from one click more often. Of the shapes the model offers, it
  prefers one with a crisp edge to a blob that spills past the object, which the model often
  rates a hair higher. Clicking the same spot again steps to the next shape: a corgi's nose, its
  face, the whole dog. `decodeSamClicks()` takes which shape to return and says how many there
  are; `rankMasks()`, `maskStability()` and `isRepeatClick()` are exported.
- Depth blurs like a lens. The background blurs without the sharp subject, which used to glow
  into it as a pale halo. The depth map's edges snap to the photo's own (a guided filter), so the
  blur stops at the subject's outline instead of a stepped one, fur included. Whatever is in front
  of the focus blurs over what's behind it, so a near subject goes soft at its edges instead of
  looking cut out. The whole subject stays sharp, not only the spot clicked, and the focus starts
  on the middle of the photo rather than on nothing in particular. Apply renders from the
  preview's blur, so the result matches it, and takes far less memory on large photos. New:
  `renderBokeh()`, `composeBokehPixels()`, `renderBokehPixels()`, `focusLayers()`,
  `guidedDepth()`, `defocus()` and `suggestFocus()`; `BokehPrep` holds the photo and its depth,
  and the blur levels come with the focus.

### Fixed

- Theme overrides apply whatever order stylesheets load in. Tokens now live in the
  `retouch-tokens` cascade layer, declared first; before, Rétouch's injected stylesheet came last
  and won ties against a host's `.rt-root { --rt-accent: … }`. Component rules stay unlayered, so
  host resets still can't restyle them.
- Setting only `--rt-accent` no longer leaves terracotta-tinted washes behind.
- Side-by-side compare showed the original larger than the edited image; both now fit the same.
- The gallery kept neither its layout nor its scroll position when it re-rendered after an edit
  or an added file; it keeps both now, and the selection too.
- On phones, the AI tools menu opened behind the controls (the rail's edge fade clipped it), and
  the Ask AI panel opened with its header, and its close button, off the top of the screen.
- A second finger could drag the crop frame or a mask handle along with the first.
- `@9tensor/retouch-ml` tools failed in production builds: the first run stopped with "no
  available backend found". ONNX Runtime starts its worker from the file it lives in, and a
  bundler had put it in the app's bundle, so the worker ran the whole app and died at its first
  `document`. ONNX Runtime now loads on first use, through a dynamic import that bundlers split
  into a chunk of its own, which also keeps about 400 KB out of the page's first download.
- Dragging the Compare divider re-rendered the whole edited photo on every move, every 2D pass
  included (Dehaze, Clarity, masks, color mix, curves). On a heavily edited photo that took
  hundreds of milliseconds per step. The divider now repaints from the frames it keeps while
  comparing, in well under a millisecond, and an edit made while comparing still renders in full.
- With an aspect preset, dragging the crop frame's top or left corner moved the opposite corner
  too, so the frame slid instead of growing. The opposite corner stays put now, and a corner sizes
  the frame by the axis it was pulled along.

## [0.1.0] — 2026-09-19

Prepared but never published; 0.2.0 is its first release. It turned a crop/brightness prototype
into a full image *and video* editor with an on-device ML companion package.

### Breaking changes since 0.0.2

- **New package names.** Rétouch now publishes under the 9Tensor npm scope: `@retouchjs/core` is
  now `@9tensor/retouch`, and the ML tools ship as `@9tensor/retouch-ml`. Update the dependency
  and your imports; `@retouchjs/core` stays at 0.0.2 and is deprecated.
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

### Added — `@9tensor/retouch-ml` 0.1.0 (first release)

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

Initial public release, published as `@retouchjs/core`: drop zone → gallery → editor with crop,
rotation and brightness/contrast/saturation adjustments; `onDone` export to Blobs.

[0.2.0]: https://github.com/9tensorsoftware/retouch/compare/v0.0.2...v0.2.0
[0.1.0]: https://github.com/9tensorsoftware/retouch/commit/97870cf
[0.0.2]: https://github.com/9tensorsoftware/retouch/releases/tag/v0.0.2
