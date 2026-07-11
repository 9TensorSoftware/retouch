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
  Powered by fabric.js. Canvas-native. Framework-agnostic.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@9tensor/retouch"><img src="https://img.shields.io/npm/v/@9tensor/retouch?color=D4572A&label=npm" alt="npm version" /></a>
  <a href="https://github.com/9TensorSoftware/retouch/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@9tensor/retouch?color=1A1815" alt="license" /></a>
  <a href="https://www.npmjs.com/package/@9tensor/retouch"><img src="https://img.shields.io/npm/dm/@9tensor/retouch?color=6B6560" alt="downloads" /></a>
</p>

<p align="center">
  <a href="https://9TensorSoftware.github.io/retouch.js/">Live Demo</a> &nbsp;·&nbsp;
  <a href="#install">Install</a> &nbsp;·&nbsp;
  <a href="#quick-start">Quick Start</a> &nbsp;·&nbsp;
  <a href="#how-it-works">How It Works</a> &nbsp;·&nbsp;
  <a href="#api">API</a> &nbsp;·&nbsp;
  <a href="#tools">Tools</a> &nbsp;·&nbsp;
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
- **Framework-agnostic** — vanilla JS core with a React wrapper available

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

<br />

## Quick Start

### Vanilla JS

```ts
import { Retouch } from "@9tensor/retouch";

const editor = new Retouch({
  target: "#editor",
  width: 800,
  height: 600,
});

// When done:
editor.destroy();
```

### React

```tsx
import { RetouchEditor } from "@9tensor/retouch/react";

function App() {
  return (
    <RetouchEditor
      multiple
      maxFiles={10}
      accept="image/*"
      tools={["crop", "adjust", "filters", "draw"]}
      gallery="grid"
      onDone={(files) => {
        console.log("Edited files:", files);
      }}
    />
  );
}
```

<br />

## How It Works

Rétouch lives in **three states**. No complex routing, no page transitions — just one component that adapts.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌──────┐
│  Drop Zone  │ ───→ │   Gallery   │ ───→ │   Editor    │ ───→ │ Done │
│             │      │             │      │             │      │      │
│ Drag & drop │      │ Grid / List │      │ Crop, draw, │      │ Blob │
│ or browse   │      │ view, manage│      │ adjust, etc │      │ File │
└─────────────┘      └─────────────┘      └─────────────┘      └──────┘
```

### 1. Drop Zone

The initial state. Accepts drag & drop, file browse, paste, and URLs. Minimal and inviting — transitions to the gallery the moment files land.

> PNG, JPG, WebP — up to 20 MB each

### 2. Gallery

Once images are loaded they appear in a responsive grid (or list). Each thumbnail reveals an edit button on hover. A green dot marks images that have already been edited. Add more files anytime.

### 3. Editor

Opens as a modal overlay: a dark stage that keeps focus on the image, and a clearly separated control tray below it. The active tool's controls sit in a horizontal strip (aspect chips, one-slider adjustments, a filter filmstrip), with prominent feature-group tabs underneath — no sidebars. Tabs are pluggable via `Retouch.registerTool`. Everything is non-destructive until you hit **Done**.

<br />

## Tools

| Tool | Description |
|------|-------------|
| **Crop** | Commit-style: drag a selection (free-form or fixed aspect — 16:9, 4:3, 1:1, 3:2, 9:16) over a rule-of-thirds grid, then **Apply crop** (or press Enter) — the discarded area disappears everywhere; **Reset crop** brings the full frame back. Works on video too. |
| **Transform** | Rotate 90° and flip H/V that keep the crop over your content, a straighten slider that auto-crops to the largest inscribed window (no black corners), and vertical/horizontal **perspective (keystone) correction** for converging lines. |
| **Adjust** | 12 controls in Light / Color / Effects groups: exposure, brightness, contrast, temperature, tint, hue, saturation, vibrance, sharpen, blur, grain, vignette — real-time, live on playing video. Double-click a label to reset it. Includes a **white-balance eyedropper**: click a neutral area and temperature/tint correct themselves. |
| **Curves** | Photoshop-style tone curves: master + per-channel (R/G/B) with draggable control points over a **live histogram**. Monotone-cubic interpolation (no overshoot), applied identically in the preview, image export, and per-frame video export. |
| **Filters** | 12 presets — B&W, Sepia, Warm, Cool, Vivid, Vintage, Kodachrome, Technicolor, Polaroid, Brownie, Invert — with an intensity slider and live thumbnails. |
| **Trim** | Video only. Filmstrip timeline with draggable in/out handles, loop-in-range preview, keyboard nudging, and 0.25–4× playback speed. |
| **Draw** | _Planned._ Freehand drawing and annotation directly on the canvas. |
| **Text** | _Planned._ Add and position text overlays with font and color controls. |
| **Sticker** | _Planned._ Place image overlays and shapes onto the canvas. |

### Video

Drop an MP4, WebM, or MOV alongside your images. Videos get poster cards with a
duration badge in the gallery and open in the same editor with a playback
transport. Everything is non-destructive until export:

- **Trim** — sample-accurate in/out points; untouched clips trim losslessly without re-encoding
- **Crop / rotate / adjust / filter** — applied per frame at export, matching the live preview exactly
- **Frame capture** — grab any frame as a new image entry, carrying the video's edits
- **Audio** — preserved through export; one-tap mute discards the track
- **Export** — MP4 (WebM fallback) via WebCodecs + lazily-loaded [mediabunny](https://mediabunny.dev/); browsers without WebCodecs fall back to a realtime MediaRecorder pipeline
- Progress is reported per file (`export:progress` events) with cancellation via `cancelExport()`

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

### AI edits

A **✦ Ask AI** pill sits at the bottom-left of the canvas — click it (or press
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
| `Cmd/Ctrl+Z` · `Cmd/Ctrl+Shift+Z` | Undo · redo (also toolbar buttons) |
| `Esc` | Cancel · `Cmd/Ctrl+Enter` | Done |
| `1`–`4` | Switch tool · `Space` | Play/pause (video) |

Plus **hold-to-compare** with the original, **Reset** to clear all edits, and **toasts** for rejected files (the `file:rejected` event still fires for custom handling).

**Export options** — choose the image output format and sizing (videos always export MP4/WebM):

```ts
new Retouch({
  target: "#editor",
  export: { format: "jpeg", quality: 0.85, maxDimension: 2048 },
});
```

<br />

## API

### `RetouchEditor` Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `target` | `string \| HTMLElement` | — | CSS selector or DOM element to mount into |
| `width` | `number` | `800` | Canvas width in pixels |
| `height` | `number` | `600` | Canvas height in pixels |
| `multiple` | `boolean` | `false` | Allow multiple image uploads |
| `maxFiles` | `number` | `10` | Maximum number of files when `multiple` is enabled |
| `accept` | `string` | `"image/*"` | Accepted file types |
| `aspectRatio` | `string` | `"free"` | Default crop aspect ratio |
| `tools` | `string[]` | All tools | Which editor tools to enable |
| `gallery` | `"grid" \| "list"` | `"grid"` | Default gallery view mode |
| `onDone` | `(files: Blob[]) => void` | — | Callback when editing is complete |

### Instance Methods

```ts
const editor = new Retouch({ target: "#editor" });

editor.state;          // "idle" | "mounted" | "destroyed"
editor.canvasElement;  // The underlying HTMLCanvasElement
editor.render();       // Force a re-render
editor.destroy();      // Tear down and clean up (idempotent)
```

<br />

## Development

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server with live demo
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm build            # Build for production
pnpm check            # Lint and format check
pnpm typecheck        # Type check
```

### Project Structure

```
src/
├── index.ts           # Public API exports
├── retouch.ts         # Core Retouch class
├── types.ts           # TypeScript interfaces
├── constants.ts       # Defaults and version
└── utils/
    └── canvas.ts      # Canvas helper functions
tests/
└── retouch.test.ts    # Test suite
demo/
├── index.html         # Dev playground
└── main.ts            # Demo entry point
```

<br />

## License

[MIT](LICENSE) — use it however you want.
