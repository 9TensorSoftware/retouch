<p align="center">
  <br />
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/retouch-logo-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset=".github/retouch-logo-light.svg" />
    <img src=".github/retouch-logo-light.svg" width="240" alt="Rétouch" />
  </picture>
  <br />
</p>

<h3 align="center">
  A drop-in image editor that feels like part of your app.
</h3>

<p align="center">
  Drop files, browse, click to edit — three states, one component.<br/>
  Powered by fabric.js. Canvas-native. Framework-agnostic. Video and on-device ML included.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@9tensor/retouch"><img src="https://img.shields.io/npm/v/@9tensor/retouch?color=D4572A&label=npm" alt="npm version" /></a>
  <a href="https://github.com/9tensor/retouch.js/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@9tensor/retouch?color=1A1815" alt="license" /></a>
  <a href="https://www.npmjs.com/package/@9tensor/retouch"><img src="https://img.shields.io/npm/dm/@9tensor/retouch?color=6B6560" alt="downloads" /></a>
</p>

<p align="center">
  <a href="https://retouch.9tensor.com">Live Demo</a> &nbsp;·&nbsp;
  <a href="#install">Install</a> &nbsp;·&nbsp;
  <a href="#quick-start">Quick Start</a> &nbsp;·&nbsp;
  <a href="#how-it-works">How It Works</a> &nbsp;·&nbsp;
  <a href="#tools">Tools</a> &nbsp;·&nbsp;
  <a href="#api">API</a> &nbsp;·&nbsp;
  <a href="#development">Development</a>
</p>

<br />

---

## Why Rétouch?

Most image editors bolt onto your app like an afterthought. Rétouch was designed the other way around — to feel native from day one. No iframes, no external services. Built on [fabric.js](http://fabricjs.com/) for robust canvas rendering, with a clean API that does exactly what your users expect.

- **Powered by fabric.js** — battle-tested canvas engine under the hood, tree-shakeable
- **Three-state UX** — drop zone, gallery, editor — all handled for you
- **Canvas-native** — all processing happens on an HTML Canvas, no server round-trips
- **Video too** — trim, crop, adjust and filter videos, re-encoded in the browser via WebCodecs ([mediabunny](https://mediabunny.dev/) loads lazily, only when a video is exported)
- **On-device ML** — background removal, upscaling, object erase, click-to-select, depth bokeh, denoise via the optional [`@9tensor/retouch-ml`](packages/ml) package; no server, no keys
- **Framework-agnostic** — a vanilla TypeScript class you mount into any element (framework wrappers are on the roadmap)

<br />

## Install

```bash
npm install @9tensor/retouch
```

```bash
pnpm add @9tensor/retouch
```

```bash
yarn add @9tensor/retouch
```

Requirements: a browser with `<canvas>`; ESM-first with a CommonJS build (the CJS bundle still loads
mediabunny/gifenc through `import()`). Importing is side-effect free — styles inject when the first
`Retouch` is constructed — so the package is safe to import under SSR; construct it once a DOM exists
(`useEffect`, `onMount`, …).

<br />

## Quick Start

```ts
import { Retouch } from "@9tensor/retouch";

const retouch = new Retouch({
  target: "#editor",
  onDone: (blobs) => upload(blobs), // edited files, one Blob per entry
});

// When you're finished with it:
retouch.destroy();
```

Users drop files, edit, and press **Done** in the gallery; `onDone` receives every entry exported
with its edits applied (images as PNG by default, videos as MP4/WebM). Hosts can drive the same flow
programmatically — `addFiles()`, `openEditor()`, `done()` — see [API](#api).

<br />

## How It Works

Rétouch lives in **three states**. No complex routing, no page transitions — just one component that adapts.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌──────┐
│  Drop Zone  │ ───→ │   Gallery   │ ───→ │   Editor    │ ───→ │ Done │
│             │      │             │      │             │      │      │
│ Drag & drop │      │ 6 view modes│      │ Crop, adjust│      │ Blob │
│ or browse   │      │ add, manage │      │ filter, trim│      │ each │
└─────────────┘      └─────────────┘      └─────────────┘      └──────┘
```

### 1. Drop Zone

The initial state. Accepts drag & drop and file browse. Minimal and inviting — transitions to the gallery the moment files land.

> PNG, JPG, WebP by default, plus MP4, WebM and MOV when video is enabled (it is unless you pass
> `acceptedVideoTypes: []`). Files are unlimited in size and count unless you set `maxFileSize` /
> `maxFiles`; rejections surface as a toast and a `file:rejected` event.

### 2. Gallery

Once files are loaded they appear in one of six view modes — 2/3/4 columns, width-fit, height-fit,
or a list. Each thumbnail reveals edit, download and remove actions on hover; a green dot marks
entries that have already been edited. Drop or browse to add more anytime, and press **Done** (shown
when `onDone` is configured) to export everything.

### 3. Editor

Opens as a modal overlay: a true-neutral dark stage that keeps focus — and color judgment — on the image, an icon rail of feature-group tabs down the left edge, and a contextual control strip beneath the canvas (aspect chips, one-slider adjustments, a filter filmstrip). Tabs are pluggable via `Retouch.registerTool`. Everything is non-destructive until you hit **Done**.

<br />

## Tools

| Tool | Description |
|------|-------------|
| **Crop** | Commit-style: drag a selection (free-form or fixed aspect — 16:9, 4:3, 1:1, 3:2, 9:16) over a rule-of-thirds grid, then **Apply crop** (or press Enter) — the discarded area disappears everywhere; **Reset crop** brings the full frame back. Works on video too. |
| **Transform** | Rotate 90° and flip H/V that keep the crop over your content, a straighten slider that auto-crops to the largest inscribed window (no black corners), vertical/horizontal **perspective (keystone) correction**, **lens corrections** — barrel/pincushion distortion and corner devignetting — and **content-aware width** (seam carving in a worker, images only). |
| **Liquify** | Brush-based push warp: drag on the image to bend and reshape content, with size and strength controls. Displacements live in a coarse grid in the edit model, so strokes preview live, undo cleanly, and apply to image and video exports alike. |
| **Adjust** | 14 controls: exposure, brightness, contrast, temperature, tint, hue, saturation, vibrance, sharpen, blur, grain, vignette, plus **clarity** (midtone local contrast) and **dehaze** — real-time, live on playing video. Double-click a label to reset it. Includes a **white-balance eyedropper**: click a neutral area and temperature/tint correct themselves. |
| **Curves** | Photoshop-style tone curves: master + per-channel (R/G/B) with draggable control points over a **live histogram**. Monotone-cubic interpolation (no overshoot), applied identically in the preview, image export, and per-frame video export. |
| **Color mix** | Lightroom-style **HSL mixer**: eight hue bands (red → magenta), each with hue/saturation/luminance shifts and smooth falloff to neighboring bands. Grays stay untouched. The AI understands it too — "make the sky bluer" targets just the blue band. |
| **Masks** | Selective adjustments: add **linear or radial gradient masks**, drag their handles on the canvas, and dial local exposure/brightness/contrast/saturation/temperature/tint that apply only inside the feathered gradient. Invertible, stackable, fully non-destructive. |
| **Stylize** | Parametric effects: **tilt-shift** (miniature look with a movable focus band), **duotone** (pick shadow/highlight colors), **posterize**, **pixelate**, **halftone** — each with a strength slider, applied identically at export. |
| **Filters** | 11 presets — B&W, Sepia, Warm, Cool, Vivid, Vintage, Kodachrome, Technicolor, Polaroid, Brownie, Invert — plus Original, with an intensity slider and live thumbnails. |
| **Trim** | Video only. Filmstrip timeline with draggable in/out handles, loop-in-range preview, keyboard nudging (0.1 s, Shift for 1 s), and playback speed in nine steps from 0.25× to 4×. |
| **Draw** | _Planned._ Freehand drawing and annotation directly on the canvas. |
| **Text** | _Planned._ Add and position text overlays with font and color controls. |
| **Sticker** | _Planned._ Place image overlays and shapes onto the canvas. |

### Video

Drop an MP4, WebM, or MOV alongside your images. Videos get poster cards with a
duration badge in the gallery and open in the same editor with a playback
transport. Everything is non-destructive until export:

- **Trim** — sample-accurate in/out points; an export with no trim, no visual edits and 1× speed copies packets without re-encoding; anything else re-encodes
- **Crop / rotate / adjust / filter** — applied per frame at export, matching the live preview exactly
- **Frame capture** — grab any frame as a new image entry, carrying the video's edits
- **Audio** — preserved through export; one-tap mute discards the track
- **Export** — MP4 (WebM fallback) via WebCodecs + lazily-loaded [mediabunny](https://mediabunny.dev/); browsers without WebCodecs fall back to a realtime MediaRecorder pipeline
- **GIF of the trimmed range** — forward, reverse, or boomerang loops with every edit applied ([gifenc](https://github.com/mattdesl/gifenc) loads lazily); **deflicker** smooths brightness on export; **Set poster** picks the gallery thumbnail frame
- Progress is reported per file (`export:progress` events) with cancellation via `cancelExport()`

### ML tools (`@9tensor/retouch-ml`)

On-device background removal, 4× super-resolution, an object-erase heal
brush, face and object detection (labeled COCO boxes, masks, privacy
pixelate, crop-to-subject), **click-to-select** — click any object to
segment it, then cut it out or magic-erase it in place — **depth
bokeh** — click to focus and blur by real estimated depth — and one-click
**denoise** for grainy photos. No server, no keys. Models run through ONNX Runtime
Web (WebGPU with WASM fallback), download on first use, and cache in the
browser:

```ts
import { installMlTools } from "@9tensor/retouch-ml";

installMlTools(retouch); // Cutout, Upscale, Erase, Select, Detect, Depth, Denoise
```

### Plugin feature groups

The editor's tabs are registry-driven. Register your own feature group — a
tab plus a contextual pane under the canvas — or deploy only the built-ins
you want:

```ts
Retouch.registerTool({
  id: "looks",
  label: "Looks",
  icon: "<svg …></svg>",
  // kinds: ["image"],            // optionally restrict by media kind
  mount(ctx) {
    const root = document.createElement("div");
    root.className = "rt-dock__row";
    const chip = document.createElement("button");
    chip.className = "rt-dock__chip";
    chip.textContent = "Golden hour";
    chip.onclick = () => {
      ctx.edits.filter = "warm";                       // shared edit model
      ctx.edits.adjustments.temperature = 35;
      ctx.render();                                    // live preview
      ctx.record();                                    // undoable step
    };
    root.appendChild(chip);
    return { root };
  },
});

new Retouch({
  target: "#editor",
  tools: ["crop", "filters", "looks"],  // deploy a subset, in tab order
});
```

Custom tools write through the same non-destructive edit model as the
built-ins, so previews, undo/redo, AI ops, and export work unchanged. (Tools
that need their own render passes — draw/text layers — are on the roadmap.)

A slider in a custom pane gets the built-in filled-track treatment by calling
`refreshRangeFill(input)` (exported from `@9tensor/retouch`) after creating it,
from its `input` listener, and wherever you set `input.value` programmatically.

### Theming

All chrome resolves through CSS custom properties, so restyling is a matter of
overriding tokens — no class overrides, no rebuild. Rétouch is two worlds:
the shell (drop zone + gallery) reads its tokens from `.rt-root`, while the
editor, export progress, and toasts attach to `<body>` and read a dark set
from `.rt-editor-overlay, .rt-export-overlay, .rt-toasts`. Override whichever
world you want to change:

```css
/* Brand the accent (shell + gallery) */
.rt-root {
  --rt-accent: #2563EB;
  --rt-accent-hover: #1D4ED8;
  --rt-accent-text: #1D4ED8;      /* accent used as text — keep ≥4.5:1 */
  --rt-focus: #2563EB;
}

/* And the editor's darkroom chrome */
.rt-editor-overlay, .rt-export-overlay, .rt-toasts {
  --rt-accent: #60A5FA;
  --rt-accent-hover: #93C5FD;
  --rt-accent-text: #60A5FA;
  --rt-focus: #60A5FA;
}
```

The main tokens (each defined per world):

| Token | Role |
|---|---|
| `--rt-surface`, `--rt-surface-raised`, `--rt-surface-overlay`, `--rt-surface-subtle` | Stage, tray/cards, menus/toasts, inset wells |
| `--rt-control`, `--rt-control-hover` | Idle/hover washes on chips and buttons |
| `--rt-text-1/2/3`, `--rt-text-disabled` | Text hierarchy |
| `--rt-line`, `--rt-line-strong`, `--rt-line-loud` | Hairlines → emphasized borders |
| `--rt-accent`, `--rt-accent-hover`, `--rt-accent-soft`, `--rt-accent-glow`, `--rt-accent-text`, `--rt-on-accent` | The accent ramp: fills, washes, accent-as-text, text-on-accent |
| `--rt-success`, `--rt-danger`, `--rt-danger-soft` | Status colors |
| `--rt-focus` | The `:focus-visible` ring |
| `--rt-radius-sm/md/lg/xl` | 6 / 10 / 16 / 24 px |
| `--rt-dur-1/2/3`, `--rt-ease`, `--rt-ease-decel` | Motion (respects `prefers-reduced-motion`) |

Colors drawn onto canvases (the curves editor, ML overlays) can't read CSS
variables and keep matching constants in TypeScript.

### AI edits

A **✦ Ask AI** pill sits at the top-right of the stage — click it (or press
**⌘K**) and it opens a vertical chat panel. Type what you want — *"moody and
cinematic, crop to a square"*, *"rotate it upright and speed it up 2×"* — and a
vision model maps it onto the same non-destructive edit operations the manual
tools use, applied as a single undoable step. Each prompt and its outcome stay
in the thread, so follow-ups ("a bit warmer", "undo the crop") read as a
conversation. Token-gated and off by default:

```ts
new Retouch({
  target: "#editor",
  ai: { apiKey: "sk-ant-…" },              // dev/prototype: browser-direct Anthropic call
  // ai: { baseUrl: "https://your-proxy" } // production: same wire format via your server
  // ai: { complete: async (req) => {...} }// or fully custom transport
  // ai: { allowUserKey: true }            // or let end users paste their own key
});
```

Defaults to `claude-haiku-4-5` with a downscaled frame attached for
content-aware commands ("crop to the dog"). Every model-returned value is
validated and clamped through the same primitives the manual tools use before
it touches edit state. Browser-visible API keys are prototype-grade — proxy
via `baseUrl` or `complete` in production. Events: `ai:start`, `ai:applied`,
`ai:error`.

<br />

## Editing UX

The editor is a keyboard-operable, accessible modal (`role="dialog"`, focus trap, focus moves in on open):

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl+Z` · `Cmd/Ctrl+Shift+Z` / `Cmd/Ctrl+Y` | Undo · redo (also toolbar buttons) |
| `Esc` · `Cmd/Ctrl+Enter` | Cancel · Done |
| `Cmd/Ctrl+K` | Open the AI panel |
| `1`–`9` | Switch tool, in tab order |
| `Enter` (Crop tab) · `Space` (video) | Apply crop · play/pause |

Plus a **side-by-side compare view** — the labeled Compare button splits the
canvas into bordered "Original" and "Edited" panels (the original comes from
the pristine buffer once edits have been committed); click again to go back
to the single canvas. Videos keep the momentary hold-to-compare gesture. **Reset** clears
all edits, and **toasts** announce rejected files (the `file:rejected` event
still fires for custom handling).

**Done commits the edits.** Pressing Done on an image bakes the edits into
the image itself — the entry's file and pixels become the edited version, and
its controls read neutral on the next visit. The pristine original stays in a
buffer on the entry, so **Reset** always brings it back, even across several
Done rounds or destructive ML tools (erase, face pixelate). `image:commit`
and `image:restore` events fire around the swap, and
`restoreOriginal(id)` does it programmatically. Prefer the classic
non-destructive flow (edits stay parametric until export)? Opt out:

```ts
new Retouch({ target: "#editor", commitMode: "keep-edits" });
```

**Export options** — choose the image output format and sizing (videos always export MP4/WebM):

```ts
new Retouch({
  target: "#editor",
  export: { format: "jpeg", quality: 0.85, maxDimension: 2048 },
});
```

<br />

## API

### Options

```ts
new Retouch(options: RetouchOptions)
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `target` | `string \| HTMLElement` | — | CSS selector or element to mount into (throws if the selector matches nothing) |
| `maxFiles` | `number` | `Infinity` | Cap on the number of entries; extra files are rejected with reason `"count"` |
| `acceptedTypes` | `string[]` | `["image/jpeg", "image/png", "image/webp"]` | Accepted image MIME types |
| `acceptedVideoTypes` | `string[]` | `["video/mp4", "video/webm", "video/quicktime"]` | Accepted video MIME types; `[]` disables video |
| `maxFileSize` | `number` | `Infinity` | Per-file size cap in bytes (reason `"size"`) |
| `maxVideoDuration` | `number` | `Infinity` | Video length cap in seconds (reason `"duration"`) |
| `commitMode` | `"bake" \| "keep-edits"` | `"bake"` | What Done does to an image's edits — see [Editing UX](#editing-ux) |
| `tools` | `EditorTool[]` | all | Feature groups to mount, in tab order (built-ins and registered plugins) |
| `export` | `ImageExportOptions` | `{ format: "png", quality: 0.92 }` | Image output format/quality/`maxDimension`; videos always export MP4/WebM |
| `ai` | `AiOptions` | off | Enables the AI panel — see [AI edits](#ai-edits) |
| `onDone` | `(blobs: Blob[]) => void` | — | Receives every entry exported with its edits; also shows the gallery's Done button |

### Instance

```ts
const retouch = new Retouch({ target: "#editor" });

retouch.state;                       // "dropzone" | "gallery" | "editor" | "destroyed"
retouch.on("images:add", (e) => …);  // subscribe; returns an unsubscribe function

await retouch.addFiles(files);       // validate + ingest File objects (drop zone / gallery do this for you)
retouch.getMedia();                  // every entry, in insertion order (ImageEntry | VideoEntry)
retouch.getEditingEntry();           // the entry open in the editor, or null
retouch.removeImage(id);

retouch.openEditor(id);
retouch.closeEditor(commit);         // true = Done, false = Cancel
await retouch.restoreOriginal(id);   // bring back the pristine pixels after a bake / destructive tool
await retouch.replaceImageSource(id, file); // swap an image's pixels in place (ML tools use this)

await retouch.exportAll();           // Blob[] with edits applied — what Done hands to onDone
await retouch.done();                // exportAll() + "done" event + onDone
retouch.cancelExport();              // abort an in-flight exportAll()/done()
await retouch.downloadImage(id);     // export one entry and trigger a browser download
await retouch.exportGif(id, { fps, maxWidth, loop }); // video: animated GIF of the trimmed range

retouch.destroy();                   // tear down (idempotent)
```

`Retouch.registerTool(plugin)` (static) adds a feature group — see [Plugin feature groups](#plugin-feature-groups).
`getImages()` is deprecated in favor of `getMedia()` (it omits videos).

### Events

```ts
const off = retouch.on("export:progress", ({ id, progress }) => …);
```

| Event | Payload | When |
|-------|---------|------|
| `state:change` | `{ from, to }` | The component moves between drop zone, gallery, editor |
| `images:add` | `{ entries }` | Files were accepted (images and videos) |
| `images:remove` | `{ id }` | An entry was removed |
| `file:rejected` | `{ file, reason }` | A file failed validation — `"type" \| "size" \| "duration" \| "count" \| "load-error"` |
| `editor:open` | `{ id }` | The editor opened an entry |
| `editor:done` | `{ id, edits }` | Done was pressed in the editor |
| `editor:cancel` | `{ id }` | The editor was dismissed without applying |
| `image:commit` | `{ id }` | Edits were baked into the image's pixels (`commitMode: "bake"`) |
| `image:restore` | `{ id }` | The pristine original was restored |
| `frame:capture` | `{ sourceId, entry }` | A video frame became a new image entry |
| `ai:start` / `ai:applied` / `ai:error` | `{ id, prompt }` / `{ id, ops, explanation }` / `{ id, error }` | AI panel lifecycle |
| `export:start` / `export:progress` / `export:complete` / `export:error` | `{ id, kind }` / `{ id, progress }` / `{ id, blob }` / `{ id, error }` | Per-entry export lifecycle (`cancelExport()` ends the run without an event) |
| `done` | `{ blobs }` | `done()` finished — fired just before `onDone` |

### Exports

Values: `Retouch`, `refreshRangeFill`, `isImageEntry`, `isVideoEntry`, `ACCEPTED_TYPES`,
`ACCEPTED_VIDEO_TYPES`, `VERSION`.
Types: `RetouchOptions`, `RetouchEventMap`, `AppState`, `MediaEntry`, `ImageEntry`, `VideoEntry`,
`MediaKind`, `ImageEdits`, `VideoEdits`, `Adjustments`, `CropRect`, `TrimRange`, `EditMask`,
`FilterPreset`, `AspectRatioPreset`, `Orientation`, `GalleryViewMode`, `EditorTool`,
`BuiltinEditorTool`, `ImageExportOptions`, `GifExportOptions`, `GifLoopMode`, `FileRejectionReason`, `AiOptions`, `AiRequest`,
`AiEditOps`, `EditorToolPlugin`, `ToolContext`, `ToolPaneHandle`.

<br />

## Development

```bash
pnpm install          # Install dependencies (workspace: core + packages/ml)
pnpm dev              # Dev server with the live demo at http://localhost:5173/retouch.js/
pnpm test             # Run the test suite (core + ml)
pnpm test:watch       # …in watch mode
pnpm test:coverage    # …with coverage
pnpm typecheck        # Type-check both packages
pnpm check            # Biome lint + format check (pnpm format to fix)
pnpm build            # Build @9tensor/retouch → dist/
pnpm build:all        # Build @9tensor/retouch, then @9tensor/retouch-ml
pnpm smoke            # Import both built packages from Node and inspect their tarballs
pnpm build:demo       # Static demo build → demo-dist/ (what GitHub Pages serves)
```

CI runs typecheck → lint → tests → builds → smoke on every push; the demo deploys only from a green
`main`. `publish.sh` releases both packages in dependency order.

### Project Structure

```
src/
├── index.ts               # Public API exports
├── retouch.ts             # The Retouch class: state, media, export, events
├── types.ts               # Options, entries, edit model, event map
├── constants.ts           # Defaults, accepted types, version
├── styles.ts              # Design tokens + all CSS (injected once)
├── ai/interpreter.ts      # Natural-language → validated edit ops
├── export/                # Image/video/GIF export pipelines (mediabunny, MediaRecorder fallback)
├── ui/                    # Drop zone, gallery, toasts, export overlay, icons
│   └── editor/            # Editor shell, tool registry, per-tool panes and overlays
└── utils/                 # Pure processing: filters, curves, HSL, masks, seam carving, liquify, …
packages/ml/               # @9tensor/retouch-ml — ONNX Runtime Web tools (cutout, upscale, erase, …)
tests/                     # Vitest + jsdom (core); packages/ml/tests for the ML package
demo/                      # Vite playground and the GitHub Pages site
docs/                      # ROADMAP.md, ADVANCED-FEATURES.md (research + license audit)
```

<br />

## License

[MIT](LICENSE) © [9Tensor LLC](https://9tensor.com) — use it however you want.
