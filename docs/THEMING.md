# Theming

Every color, font, radius, shadow and duration in Rétouch's chrome is a CSS custom property, so
restyling it means setting a few variables: no class overrides and no rebuild.

## Where the tokens live

Rétouch has two worlds. The **shell** (drop zone and gallery) renders inside your target element
and reads its tokens from `.rt-root`. The **darkroom** (the editor, the export sheet and toasts)
attaches to `<body>` and reads its own set from `.rt-editor-overlay`, `.rt-export-overlay` and
`.rt-toasts`. Set a token on whichever world you want to change.

The defaults sit in a cascade layer, `retouch-tokens`, declared before any other styles. A rule of
yours outside that layer wins over them whatever its specificity, and wherever your stylesheet
loads. The component rules themselves stay outside the layer, so a global reset in your app
can't restyle them by accident.

## Light, dark and auto

```ts
const retouch = new Retouch({ target: "#editor", theme: "auto" });
retouch.setTheme("dark");
```

`theme` sets the shell: `"light"` (the default), `"dark"`, or `"auto"` to follow the operating
system. Dark uses the darkroom's set. The editor is always dark, on purpose: a neutral, dim
surround keeps color judgment honest. Its tokens can still be overridden like any others.

## Brand color

The accent's hover shade, its washes, the focus ring and accent-colored text all derive from
`--rt-accent`, so one variable rebrands each world:

```css
.rt-root {
  --rt-accent: #2563eb;
}
.rt-editor-overlay, .rt-export-overlay, .rt-toasts {
  --rt-accent: #60a5fa;
}
```

Any derived step can be set too. A light brand color needs two of them: `--rt-accent-text`, a
darker shade that keeps 4.5:1 contrast against the surface when the accent is used as text, and
`--rt-on-accent`, the text color on filled accent buttons.

## Type, shape and motion

```css
.rt-root, .rt-editor-overlay, .rt-export-overlay, .rt-toasts {
  --rt-font-ui: "Inter", system-ui, sans-serif;
  --rt-radius-md: 6px;
  --rt-radius-lg: 10px;
}
```

Rétouch loads no web fonts; set `--rt-font-ui` to a face your page already loads.
`--rt-font-display` (larger titles) follows the UI face unless you set it. Durations and easings
shape every animation, and with `prefers-reduced-motion` the motion is off whatever they say.

## All tokens

Values are the shell's light defaults, then the darkroom's.

### Surfaces and text

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--rt-surface` | `#F7F5F2` | `#0B0B0C` | The page behind everything; the editor's stage |
| `--rt-surface-raised` | `#FFFFFF` | `#161618` | Panels and cards |
| `--rt-surface-overlay` | `#FFFFFF` | `#222225` | Menus, popovers, toasts |
| `--rt-surface-subtle` | `#EFEBE5` | `#101012` | Inset wells and fields |
| `--rt-surface-wash` | 3% ink | 4% white | Quiet hover backgrounds |
| `--rt-surface-glass` | 85% white | 86% `#18181B` | Floating bars over the stage |
| `--rt-control`, `--rt-control-hover` | 5%, 10% ink | 7%, 13% white | Idle and hovered buttons |
| `--rt-text-1`, `--rt-text-2`, `--rt-text-3` | `#1C1917`, `#57514A`, `#756E64` | 93%, 70%, 54% white | Primary, secondary and tertiary text |
| `--rt-text-disabled` | 35% ink | 35% white | Disabled text |
| `--rt-line`, `--rt-line-strong`, `--rt-line-loud` | `#E7E2DA`, `#CFC8BC`, `#A9A195` | 7%, 16%, 32% white | Hairlines, borders, emphasized borders |

### Accent and status

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--rt-accent` | `#D4572A` | `#F5753F` | Primary buttons, selection, slider fills in the editor |
| `--rt-accent-hover` | 7.5% darker | 11.5% lighter | Hovered accent |
| `--rt-accent-soft`, `--rt-accent-glow` | 8%, 14% accent | 12%, 18% accent | Washes behind selected items |
| `--rt-accent-text` | 10% darker | the accent | The accent as text |
| `--rt-on-accent` | `#221008` | `#221008` | Text on accent fills |
| `--rt-focus` | the accent | the accent | The `:focus-visible` ring |
| `--rt-success` | `#1FA355` | `#3DCB77` | Done states |
| `--rt-danger`, `--rt-danger-text` | `#C64830`, `#B03A25` | `#E5533D`, `#F08E7D` | Errors, and error text |
| `--rt-danger-soft` | 12% danger | 14% danger | A wash behind errors |
| `--rt-track`, `--rt-track-fill` | 12%, 45% ink | 14% white, the accent | Slider tracks and fills |
| `--rt-prism` | a conic gradient | the same | Marks on-device AI: the AI rail section, run buttons, Ask AI |

### Over the photo

These sit on image pixels, so they're the same in both worlds: `--rt-on-media`,
`--rt-on-media-dim`, `--rt-on-media-faint` (white at 100%, 72% and 25%), `--rt-scrim` and
`--rt-scrim-heavy` (dark veils), `--rt-glass` and `--rt-glass-hover` (frosted controls).

### Type, shape, elevation, motion

| Token | Default |
|---|---|
| `--rt-font-ui` | `system-ui, -apple-system, 'Segoe UI', sans-serif` |
| `--rt-font-mono` | `ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace` |
| `--rt-font-display` | `var(--rt-font-ui)` |
| `--rt-type-xs` … `--rt-type-xl` | 11, 12, 13, 15, 18 px |
| `--rt-radius-sm` … `--rt-radius-xl`, `--rt-radius-full` | 6, 10, 16, 24, 999 px |
| `--rt-shadow-sm`, `--rt-shadow-md`, `--rt-shadow-lg` | Small to large elevation |
| `--rt-shadow-float`, `--rt-highlight` | Panels floating over the stage, and their lit top edge |
| `--rt-dur-1` … `--rt-dur-4` | 120, 200, 320, 480 ms |
| `--rt-ease`, `--rt-ease-decel` | `cubic-bezier(0.2, 0, 0, 1)`, `cubic-bezier(0.05, 0.7, 0.1, 1)` |
| `--rt-ease-spring` | A spring, as `linear()` where browsers support it |

## What doesn't follow

A few things are painted on canvases, which can't read CSS variables: the curves editor's lines,
the histogram, and the ML tools' overlays. They use fixed colors chosen to read on the darkroom's
surfaces.

## Your own tools

A tool built with `ctx.ui` follows all of the above with no CSS of its own; see
[Writing a tool](PLUGINS.md). For anything else you add to the editor, use the tokens rather than
fixed colors, so your additions follow a host's branding too.
