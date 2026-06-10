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

Opens as a modal overlay with dark chrome to keep focus on the image. Tool sidebar on the left, properties panel on the right, canvas center stage. Everything from cropping to drawing to filters — all non-destructive until you hit **Done**.

<br />

## Tools

| Tool | Description |
|------|-------------|
| **Crop** | Free-form or fixed aspect ratio (16:9, 4:3, 1:1, 3:2, 9:16). Rule-of-thirds grid overlay. Rotation control. Works on video too. |
| **Adjust** | Brightness, contrast, saturation sliders with real-time preview — live on playing video. |
| **Filters** | Quick presets — Warm, Cool, B&W, and more. One-tap application with live thumbnails. |
| **Trim** | Video only. Filmstrip timeline with draggable in/out handles, loop-in-range preview, keyboard nudging. |
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
