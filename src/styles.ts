const STYLE_ID = "rt-styles";
const TOKENS_ID = "rt-tokens";

/* The dark ("darkroom") token set. The editor, export progress and toasts
   always use it; the drop zone and gallery use it under `theme: "dark"`, or
   under `theme: "auto"` when the OS asks for dark. Written once, applied in
   both places below. */
const DARK_TOKENS = /* css */ `
    --rt-surface: #0B0B0C;
    --rt-surface-raised: #161618;
    --rt-surface-overlay: #222225;
    --rt-surface-subtle: #101012;
    --rt-surface-wash: rgba(255, 255, 255, 0.04);
    --rt-surface-glass: rgba(24, 24, 27, 0.86);
    --rt-control: rgba(255, 255, 255, 0.07);
    --rt-control-hover: rgba(255, 255, 255, 0.13);
    --rt-text-1: rgba(255, 255, 255, 0.93);
    --rt-text-2: rgba(255, 255, 255, 0.7);
    --rt-text-3: rgba(255, 255, 255, 0.54);
    --rt-text-disabled: rgba(255, 255, 255, 0.35);
    --rt-line: rgba(255, 255, 255, 0.07);
    --rt-line-strong: rgba(255, 255, 255, 0.16);
    --rt-line-loud: rgba(255, 255, 255, 0.32);
    --rt-accent: #F5753F;
    --rt-accent-hover: color-mix(in oklab, var(--rt-accent) 88.5%, white);
    --rt-accent-soft: color-mix(in srgb, var(--rt-accent) 12%, transparent);
    --rt-accent-glow: color-mix(in srgb, var(--rt-accent) 18%, transparent);
    --rt-accent-text: var(--rt-accent);
    --rt-success: #3DCB77;
    --rt-danger: #E5533D;
    --rt-danger-soft: color-mix(in srgb, var(--rt-danger) 14%, transparent);
    --rt-danger-text: #F08E7D;
    --rt-focus: var(--rt-accent);
    --rt-track: rgba(255, 255, 255, 0.14);
    --rt-track-fill: var(--rt-accent);
    --rt-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
    --rt-shadow-md: 0 8px 28px rgba(0, 0, 0, 0.45);
    --rt-shadow-lg: 0 16px 56px rgba(0, 0, 0, 0.55);
    --rt-shadow-float: 0 1px 3px rgba(0, 0, 0, 0.4), 0 16px 40px rgba(0, 0, 0, 0.5);
    --rt-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.05);
`;

const TOKENS = /* css */ `
/* ═══════════════════════════════════════════════════════════════════════
   Design tokens — "Warm Atelier / Neutral Darkroom".
   The shell (drop zone + gallery) is warm gallery-paper by default; the
   editor, export progress, and toasts invert to a true-neutral darkroom so
   the chrome never color-casts the image being judged. One terracotta
   accent spans both worlds.

   They live in the retouch-tokens cascade layer, which is declared first:
   any host rule outside it (or in a later layer) wins regardless of
   specificity or stylesheet order. Only custom properties live here —
   component rules stay unlayered, so a host's global resets can't restyle
   them. The accent ramp derives from --rt-accent, so branding takes one
   variable (override any derived step to tune it).
   ═══════════════════════════════════════════════════════════════════════ */

@layer retouch-tokens {
  .rt-root, .rt-editor-overlay, .rt-export-overlay, .rt-toasts {
    /* Surfaces */
    --rt-surface: #F7F5F2;
    --rt-surface-raised: #FFFFFF;
    --rt-surface-overlay: #FFFFFF;
    --rt-surface-subtle: #EFEBE5;
    --rt-surface-wash: rgba(28, 25, 23, 0.03);
    --rt-surface-glass: rgba(255, 255, 255, 0.85);
    --rt-control: rgba(28, 25, 23, 0.05);
    --rt-control-hover: rgba(28, 25, 23, 0.1);
    /* Text */
    --rt-text-1: #1C1917;
    --rt-text-2: #57514A;
    --rt-text-3: #756E64;
    --rt-text-disabled: rgba(28, 25, 23, 0.35);
    /* Lines */
    --rt-line: #E7E2DA;
    --rt-line-strong: #CFC8BC;
    --rt-line-loud: #A9A195;
    /* Accent (terracotta — deep on paper, luminous in the dark). Derived
       steps were fitted to the original hand-picked values. */
    --rt-accent: #D4572A;
    --rt-accent-hover: color-mix(in oklab, var(--rt-accent) 92.5%, black);
    --rt-accent-soft: color-mix(in srgb, var(--rt-accent) 8%, transparent);
    --rt-accent-glow: color-mix(in srgb, var(--rt-accent) 14%, transparent);
    --rt-accent-text: color-mix(in oklab, var(--rt-accent) 90%, black);
    --rt-on-accent: #221008;
    /* Status */
    --rt-success: #1FA355;
    --rt-danger: #C64830;
    --rt-danger-soft: color-mix(in srgb, var(--rt-danger) 12%, transparent);
    --rt-danger-text: #B03A25;
    --rt-focus: var(--rt-accent);
    /* Sliders */
    --rt-track: rgba(28, 25, 23, 0.12);
    --rt-track-fill: rgba(28, 25, 23, 0.45);
    /* UI over image pixels — theme-independent */
    --rt-on-media: #FFFFFF;
    --rt-on-media-dim: rgba(255, 255, 255, 0.72);
    --rt-on-media-faint: rgba(255, 255, 255, 0.25);
    --rt-scrim: rgba(12, 10, 9, 0.6);
    --rt-scrim-heavy: rgba(10, 9, 8, 0.72);
    --rt-glass: rgba(255, 255, 255, 0.16);
    --rt-glass-hover: rgba(255, 255, 255, 0.32);
    /* Marks on-device AI: light through a prism */
    --rt-prism: conic-gradient(from 210deg, #FF6B47, #FFC457, #8CE99A, #5CC8FF, #A58BFF, #FF6B47);
    /* Elevation */
    --rt-shadow-sm: 0 1px 3px rgba(26, 24, 21, 0.07);
    --rt-shadow-md: 0 4px 16px rgba(26, 24, 21, 0.08);
    --rt-shadow-lg: 0 16px 48px rgba(26, 24, 21, 0.14);
    --rt-shadow-float: 0 1px 3px rgba(26, 24, 21, 0.08), 0 12px 32px rgba(26, 24, 21, 0.12);
    --rt-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.7);
    /* Type */
    --rt-font-ui: system-ui, -apple-system, 'Segoe UI', sans-serif;
    --rt-font-mono: ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, monospace;
    --rt-font-display: var(--rt-font-ui);
    --rt-type-xs: 11px;
    --rt-type-sm: 12px;
    --rt-type-md: 13px;
    --rt-type-lg: 15px;
    --rt-type-xl: 18px;
    /* Radii */
    --rt-radius-sm: 6px;
    --rt-radius-md: 10px;
    --rt-radius-lg: 16px;
    --rt-radius-xl: 24px;
    --rt-radius-full: 999px;
    /* Motion */
    --rt-dur-1: 120ms;
    --rt-dur-2: 200ms;
    --rt-dur-3: 320ms;
    --rt-dur-4: 480ms;
    --rt-ease: cubic-bezier(0.2, 0, 0, 1);
    --rt-ease-decel: cubic-bezier(0.05, 0.7, 0.1, 1);
    --rt-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);
    /* Layout */
    --rt-dock-h: 128px;
  }

  /* Darkroom — the editor and its body-attached siblings (every descendant
     inherits), plus the shell when it's themed dark. */
  .rt-editor-overlay, .rt-export-overlay, .rt-toasts,
  .rt-root[data-rt-theme="dark"] {${DARK_TOKENS}  }

  @media (prefers-color-scheme: dark) {
    .rt-root[data-rt-theme="auto"] {${DARK_TOKENS}    }
  }

  /* A real spring where linear() easing exists; the cubic above otherwise. */
  @supports (transition-timing-function: linear(0, 1)) {
    .rt-root, .rt-editor-overlay, .rt-export-overlay, .rt-toasts {
      --rt-ease-spring: linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%, 0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 55%, 1.017 63.9%, 1.001 85.9%, 1);
    }
  }
}
`;

const CSS = /* css */ `
.rt-root, .rt-editor-overlay, .rt-export-overlay, .rt-toasts {
  font-family: var(--rt-font-ui);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.rt-root[data-rt-theme="dark"] {
  color-scheme: dark;
}

@media (prefers-color-scheme: dark) {
  .rt-root[data-rt-theme="auto"] {
    color-scheme: dark;
  }
}

.rt-root {
  color: var(--rt-text-1);
  position: relative;
  width: 100%;
}

.rt-root *, .rt-root *::before, .rt-root *::after,
.rt-editor-overlay *, .rt-editor-overlay *::before, .rt-editor-overlay *::after,
.rt-export-overlay *, .rt-export-overlay *::before, .rt-export-overlay *::after,
.rt-toasts *, .rt-toasts *::before, .rt-toasts *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

/* One focus language everywhere. :where() keeps specificity at zero so a
   component can layer its own treatment on top without fighting this. */
:where(.rt-root, .rt-editor-overlay, .rt-export-overlay, .rt-toasts) :focus-visible {
  outline: 2px solid var(--rt-focus);
  outline-offset: 2px;
}

/* [hidden] means hidden, whatever display a component rule sets. */
.rt-root [hidden] {
  display: none !important;
}

/* Pressed feedback — a uniform, quick sink on every push control. */
.rt-dock__chip:active:not([disabled]),
.rt-dock__icon-btn:active,
.rt-tile:active,
.rt-swatch:active,
.rt-toolbar__btn:active,
.rt-editor__btn-done:active,
.rt-editor__btn-cancel:active,
.rt-editor__btn-capture:active,
.rt-editor__text-btn:active,
.rt-editor__icon-btn:active:not([disabled]),
.rt-editor__compare-btn:active,
.rt-history-menu__item:active,
.rt-dropzone__choose:active,
.rt-dropzone__paste:active,
.rt-gallery__view-btn:active,
.rt-gallery__add:active,
.rt-gallery__batch:active:not([disabled]),
.rt-gallery__done:active:not([disabled]),
.rt-gallery__clear:active,
.rt-gallery__quick-btn:active,
.rt-gallery__row-btn:active,
.rt-toast__action:active,
.rt-video-bar__btn:active,
.rt-video-bar__speed:active,
.rt-video-bar__speed-option:active,
.rt-export-overlay__cancel:active:not([disabled]),
.rt-ai__send:active:not([disabled]),
.rt-ai__save:active,
.rt-ai__close:active {
  transform: scale(0.97);
}

/* ── Drop zone: a light table with a stack of prints ── */

.rt-dropzone-wrapper {
  background: var(--rt-surface-raised);
  border-radius: var(--rt-radius-xl);
  padding: 12px;
  box-shadow: var(--rt-shadow-md), 0 0 0 1px var(--rt-line);
}

.rt-dropzone {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 48px 24px 40px;
  border-radius: var(--rt-radius-lg);
  background: radial-gradient(70% 85% at 50% 26%, var(--rt-surface-raised) 0%, var(--rt-surface-subtle) 100%);
  box-shadow: inset 0 0 0 1px var(--rt-line);
  text-align: center;
  cursor: pointer;
  transition: box-shadow var(--rt-dur-2) var(--rt-ease), background-color var(--rt-dur-2) var(--rt-ease);
}

.rt-dropzone:hover {
  box-shadow: inset 0 0 0 1px var(--rt-line-strong);
}

/* Something is being dragged over: the table lights up in the accent. */
.rt-dropzone--active,
.rt-dropzone--active:hover {
  background: radial-gradient(70% 85% at 50% 26%, var(--rt-surface-raised) 0%, color-mix(in srgb, var(--rt-accent) 12%, var(--rt-surface-subtle)) 100%);
  box-shadow: inset 0 0 0 2px var(--rt-accent), 0 0 0 6px var(--rt-accent-glow);
}

/* Three prints, painted in CSS. Prints are white whatever the theme. */
.rt-dropzone__stack {
  position: relative;
  width: 220px;
  height: 128px;
  margin-bottom: 18px;
  pointer-events: none;
}

.rt-dropzone__print {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 98px;
  aspect-ratio: 4 / 3;
  border: 5px solid #FBFAF7;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(20, 16, 12, 0.18), 0 12px 26px -10px rgba(20, 16, 12, 0.5);
  transition: transform var(--rt-dur-4) var(--rt-ease-spring);
}

/* Dusk over the hills */
.rt-dropzone__print--1 {
  transform: translate(-108%, -48%) rotate(-9deg);
  background:
    radial-gradient(130% 70% at 18% 122%, #4B2E3F 0 55%, transparent 56%),
    radial-gradient(120% 64% at 88% 124%, #6A3C4C 0 50%, transparent 51%),
    radial-gradient(circle at 64% 54%, #FFE7B0 0 9%, transparent 10%),
    linear-gradient(180deg, #F7B56A 0%, #EE7F57 52%, #B5546A 100%);
}

/* A fjord at noon, on top */
.rt-dropzone__print--2 {
  z-index: 1;
  transform: translate(-50%, -58%) rotate(2deg);
  background:
    linear-gradient(180deg, transparent 66%, #3F6F8F 66%, #2B5470 100%),
    conic-gradient(from 138deg at 70% 36%, #3D566B 0 84deg, transparent 84deg),
    conic-gradient(from 132deg at 34% 24%, #56738B 0 96deg, transparent 96deg),
    linear-gradient(180deg, #A9CFEA 0%, #E6F0F6 72%);
}

/* A meadow in the morning */
.rt-dropzone__print--3 {
  transform: translate(6%, -45%) rotate(10deg);
  background:
    radial-gradient(150% 80% at 72% 132%, #4F7A45 0 55%, transparent 56%),
    radial-gradient(120% 70% at 8% 124%, #86AE6B 0 50%, transparent 51%),
    radial-gradient(circle at 74% 30%, #FFFBE6 0 8%, transparent 9%),
    linear-gradient(180deg, #CFE7F0 0%, #F4EBD0 100%);
}

/* The pointer comes near: the stack loosens. */
.rt-dropzone:hover .rt-dropzone__print--1 { transform: translate(-122%, -50%) rotate(-14deg); }
.rt-dropzone:hover .rt-dropzone__print--2 { transform: translate(-50%, -63%) rotate(0deg); }
.rt-dropzone:hover .rt-dropzone__print--3 { transform: translate(20%, -47%) rotate(15deg); }

/* Files are on their way: it fans out and lifts to meet them. */
.rt-dropzone--active .rt-dropzone__print--1 { transform: translate(-134%, -54%) rotate(-19deg) scale(1.04); }
.rt-dropzone--active .rt-dropzone__print--2 { transform: translate(-50%, -70%) rotate(-2deg) scale(1.08); }
.rt-dropzone--active .rt-dropzone__print--3 { transform: translate(32%, -51%) rotate(20deg) scale(1.04); }

.rt-dropzone__title {
  font-size: var(--rt-type-xl);
  font-weight: 650;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: var(--rt-text-1);
}

.rt-dropzone__formats {
  font: 500 var(--rt-type-sm) / 1.4 var(--rt-font-mono);
  letter-spacing: 0.02em;
  color: var(--rt-text-3);
}

.rt-dropzone__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.rt-dropzone__choose,
.rt-dropzone__paste {
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--rt-radius-md);
  font: 600 var(--rt-type-md) / 1 var(--rt-font-ui);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), box-shadow var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-dropzone__choose svg,
.rt-dropzone__paste svg {
  width: 17px;
  height: 17px;
  flex-shrink: 0;
}

.rt-dropzone__choose {
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--rt-accent) 70%, transparent);
}

.rt-dropzone__choose:hover {
  background: var(--rt-accent-hover);
}

.rt-dropzone__paste {
  background: var(--rt-surface-raised);
  color: var(--rt-text-1);
  box-shadow: inset 0 0 0 1px var(--rt-line-strong);
}

.rt-dropzone__paste:hover {
  box-shadow: inset 0 0 0 1px var(--rt-line-loud);
}

.rt-dropzone__paste kbd {
  margin-left: 2px;
  padding: 3px 5px;
  border-radius: 5px;
  background: var(--rt-control);
  font: 500 var(--rt-type-xs) / 1 var(--rt-font-mono);
  color: var(--rt-text-3);
}

/* No keyboard to speak of: no shortcut to show. */
@media (hover: none) {
  .rt-dropzone__paste kbd {
    display: none;
  }
}

@media (max-width: 480px) {
  .rt-dropzone-wrapper {
    padding: 8px;
    border-radius: var(--rt-radius-lg);
  }
  .rt-dropzone {
    padding: 32px 16px 28px;
  }
  .rt-dropzone__stack {
    margin: -8px 0 6px;
    scale: 0.86;
  }
}

/* ── Gallery: a contact sheet ──────────────── */

.rt-gallery {
  position: relative;
  background: var(--rt-surface-raised);
  border-radius: var(--rt-radius-xl);
  padding: 20px 24px 28px;
  box-shadow: var(--rt-shadow-md), 0 0 0 1px var(--rt-line);
  max-height: 100%;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--rt-line-strong) transparent;
}

.rt-gallery::-webkit-scrollbar {
  width: 8px;
}

.rt-gallery::-webkit-scrollbar-track {
  background: transparent;
}

.rt-gallery::-webkit-scrollbar-thumb {
  background: var(--rt-line-strong);
  border-radius: 4px;
}

/* Header: what's here, the layout, what to do next */
.rt-gallery__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--rt-line);
}

.rt-gallery__summary {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.rt-gallery__count {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
}

.rt-gallery__count-title {
  font-size: var(--rt-type-lg);
  font-weight: 650;
  color: var(--rt-text-1);
  font-variant-numeric: tabular-nums;
}

.rt-gallery__count-meta {
  font: 500 var(--rt-type-sm) / 1.4 var(--rt-font-mono);
  color: var(--rt-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rt-gallery__clear {
  flex: none;
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--rt-radius-md);
  background: var(--rt-control);
  color: var(--rt-text-1);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__clear:hover {
  background: var(--rt-control-hover);
}

.rt-gallery__clear svg {
  width: 16px;
  height: 16px;
}

.rt-gallery__views {
  flex: none;
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--rt-line);
}

.rt-gallery__view-btn {
  width: 38px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--rt-text-3);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), box-shadow var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__view-btn svg {
  width: 17px;
  height: 17px;
}

.rt-gallery__view-btn:hover {
  color: var(--rt-text-1);
}

.rt-gallery__view-btn[aria-pressed="true"] {
  background: var(--rt-surface-overlay);
  color: var(--rt-text-1);
  box-shadow: var(--rt-shadow-sm), inset 0 0 0 1px var(--rt-line);
}

.rt-gallery__actions {
  flex: 1 1 0;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  min-width: max-content;
}

.rt-gallery__add,
.rt-gallery__batch {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 14px;
  border: 0;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-raised);
  color: var(--rt-text-1);
  box-shadow: inset 0 0 0 1px var(--rt-line-strong);
  font: 600 var(--rt-type-md) / 1 var(--rt-font-ui);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), box-shadow var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__add:hover,
.rt-gallery__batch:hover {
  box-shadow: inset 0 0 0 1px var(--rt-line-loud);
}

.rt-gallery__add svg,
.rt-gallery__batch svg {
  width: 16px;
  height: 16px;
}

.rt-gallery__batch[disabled] {
  opacity: 0.5;
  cursor: progress;
}

.rt-gallery__batch--danger {
  color: var(--rt-danger-text);
}

.rt-gallery__batch--danger:hover {
  background: var(--rt-danger-soft);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rt-danger) 40%, transparent);
}

/* Done — the host's exit, so it wears the primary treatment */
.rt-gallery__done {
  height: 36px;
  display: inline-flex;
  align-items: center;
  padding: 0 18px;
  border: 0;
  border-radius: var(--rt-radius-md);
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  box-shadow: 0 6px 16px -8px color-mix(in srgb, var(--rt-accent) 70%, transparent);
  font: 650 var(--rt-type-md) / 1 var(--rt-font-ui);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), opacity var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__done:hover {
  background: var(--rt-accent-hover);
}

.rt-gallery__done[disabled] {
  opacity: 0.5;
  cursor: progress;
}

/* Layouts. --rt-row-h and --rt-strip-h follow the gallery's width (set in JS). */
.rt-gallery__content {
  --rt-row-h: 180px;
  --rt-strip-h: 240px;
}

/* Rows: justified. Until the script lays them out, each frame grows in
   proportion to its aspect ratio, so a row shares one height; the filler
   keeps the last row from stretching. */
.rt-gallery__rows {
  display: flex;
  flex-wrap: wrap;
  gap: 18px 12px;
}

.rt-gallery__rows > .rt-gallery__tile {
  flex: var(--r) 1 calc(var(--r) * var(--rt-row-h));
}

.rt-gallery__rows::after {
  content: '';
  flex: 1000000 1 0;
}

/* Once the script has measured the width, it gives each frame its row's
   height (see layoutRows) and the frames take exactly that size. */
.rt-gallery__rows--laid > .rt-gallery__tile {
  flex: none;
  width: calc(var(--r) * var(--h));
}

.rt-gallery__rows--laid::after {
  display: none;
}

.rt-gallery__rows .rt-gallery__media,
.rt-gallery__strip .rt-gallery__media {
  aspect-ratio: var(--r);
}

/* Grid: square crops */
.rt-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 30%), 1fr));
  gap: 18px 12px;
}

.rt-gallery__grid .rt-gallery__media {
  aspect-ratio: 1;
}

/* Filmstrip: tall frames in a line */
.rt-gallery__strip {
  display: flex;
  gap: 14px;
  margin: -8px -8px 0;
  padding: 8px 8px 12px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scrollbar-width: thin;
  scrollbar-color: var(--rt-line-strong) transparent;
}

.rt-gallery__strip > .rt-gallery__tile {
  flex: none;
  width: calc(var(--rt-strip-h) * var(--r));
  scroll-snap-align: start;
}

/* A frame */
.rt-gallery__tile {
  position: relative;
  min-width: 0;
}

.rt-gallery__media {
  position: relative;
}

.rt-gallery__frame {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 8px;
  background: var(--rt-surface-subtle);
  transition: transform var(--rt-dur-3) var(--rt-ease-spring), box-shadow var(--rt-dur-2) var(--rt-ease);
}

/* A hairline, so pale photos keep their edge on the page */
.rt-gallery__frame::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--rt-text-1) 8%, transparent);
  pointer-events: none;
}

.rt-gallery__frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--rt-dur-4) var(--rt-ease);
}

/* The whole frame opens the editor */
.rt-gallery__open {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: grid;
  place-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--rt-on-media);
  cursor: pointer;
}

.rt-gallery__open:focus-visible {
  outline: none;
}

.rt-gallery__media:has(.rt-gallery__open:focus-visible) .rt-gallery__frame {
  box-shadow: 0 0 0 2px var(--rt-surface-raised), 0 0 0 4px var(--rt-focus);
}

.rt-gallery__open-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 13px 0 11px;
  border-radius: var(--rt-radius-full);
  background: var(--rt-scrim);
  backdrop-filter: blur(8px);
  color: var(--rt-on-media);
  font: 600 var(--rt-type-sm) / 1 var(--rt-font-ui);
  opacity: 0;
  transform: translateY(4px) scale(0.96);
  transition: opacity var(--rt-dur-2) var(--rt-ease), transform var(--rt-dur-2) var(--rt-ease);
}

.rt-gallery__open-hint svg {
  width: 14px;
  height: 14px;
}

/* Over the picture: what's been edited, how long a video runs */
.rt-gallery__badge,
.rt-gallery__duration {
  position: absolute;
  bottom: 8px;
  z-index: 2;
  height: 22px;
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  background: var(--rt-scrim);
  backdrop-filter: blur(6px);
  color: var(--rt-on-media);
  pointer-events: none;
  white-space: nowrap;
}

.rt-gallery__badge {
  left: 8px;
  gap: 6px;
  padding: 0 8px 0 7px;
  font: 600 var(--rt-type-xs) / 1 var(--rt-font-ui);
  letter-spacing: 0.01em;
}

.rt-gallery__badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rt-accent);
  box-shadow: 0 0 6px var(--rt-accent);
}

.rt-gallery__duration {
  right: 8px;
  padding: 0 7px;
  font: 500 var(--rt-type-xs) / 1 var(--rt-font-mono);
  font-variant-numeric: tabular-nums;
}

.rt-gallery__play {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--rt-scrim);
  backdrop-filter: blur(6px);
  color: var(--rt-on-media);
  pointer-events: none;
  transition: opacity var(--rt-dur-2) var(--rt-ease);
}

.rt-gallery__play svg {
  width: 18px;
  height: 18px;
  margin-left: 2px;
}

/* Download and remove, top right, for the pointer */
.rt-gallery__quick {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 3;
  display: flex;
  gap: 6px;
  opacity: 0;
  transform: translateY(-3px);
  pointer-events: none;
  transition: opacity var(--rt-dur-2) var(--rt-ease), transform var(--rt-dur-2) var(--rt-ease);
}

.rt-gallery__quick-btn {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: var(--rt-scrim);
  backdrop-filter: blur(8px);
  color: var(--rt-on-media);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__quick-btn svg {
  width: 16px;
  height: 16px;
}

.rt-gallery__quick-btn:hover {
  background: var(--rt-scrim-heavy);
  transform: scale(1.06);
}

.rt-gallery__quick-btn--danger:hover {
  background: var(--rt-danger);
}

/* The select circle, top left */
.rt-gallery__select {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--rt-dur-2) var(--rt-ease);
}

.rt-gallery__select:focus-visible {
  outline: none;
}

.rt-gallery__mark {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border: 2px solid var(--rt-on-media);
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  color: transparent;
  transition: background-color var(--rt-dur-1) var(--rt-ease), border-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-2) var(--rt-ease-spring);
}

.rt-gallery__mark svg {
  width: 13px;
  height: 13px;
  stroke-width: 2.6;
}

.rt-gallery__select:hover .rt-gallery__mark {
  transform: scale(1.1);
}

.rt-gallery__select:focus-visible .rt-gallery__mark {
  box-shadow: 0 0 0 2px var(--rt-surface-raised), 0 0 0 4px var(--rt-focus);
}

.rt-gallery__select[aria-checked="true"] .rt-gallery__mark {
  border-color: var(--rt-accent);
  background: var(--rt-accent);
  color: var(--rt-on-accent);
}

/* Hover reveals the frame's controls; a selection keeps the circles up. */
@media (hover: hover) {
  .rt-gallery__tile:hover .rt-gallery__frame img {
    transform: scale(1.035);
  }
  .rt-gallery__tile:hover .rt-gallery__open-hint {
    opacity: 1;
    transform: none;
  }
  .rt-gallery__tile:hover .rt-gallery__play {
    opacity: 0;
  }
  .rt-gallery__tile:hover .rt-gallery__quick {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
  .rt-gallery__item:hover .rt-gallery__select {
    opacity: 1;
  }
}

.rt-gallery__item:focus-within .rt-gallery__select,
.rt-gallery--selecting .rt-gallery__select {
  opacity: 1;
}

.rt-gallery--selecting .rt-gallery__open-hint,
.rt-gallery--selecting .rt-gallery__quick {
  display: none;
}

/* Touch: the circles stay up, and every target is a thumb wide. */
@media (hover: none) {
  .rt-gallery__select {
    opacity: 1;
    width: 44px;
    height: 44px;
  }
}

/* Selected: the frame steps back inside a grease-pencil loop. */
.rt-gallery__item--selected .rt-gallery__frame {
  transform: scale(0.86);
}

/* The loop stretches to its frame, so the stroke opts out of scaling; it's
   drawn on by a sweeping mask (dashes go wrong on non-scaling strokes). */
.rt-gallery__loop {
  position: absolute;
  inset: -3px;
  width: calc(100% + 6px);
  height: calc(100% + 6px);
  z-index: 2;
  overflow: visible;
  pointer-events: none;
  -webkit-mask-image: conic-gradient(from 6deg, #000 var(--rt-sweep), transparent 0);
  mask-image: conic-gradient(from 6deg, #000 var(--rt-sweep), transparent 0);
  animation: rt-loop-draw var(--rt-dur-4) var(--rt-ease) both;
}

.rt-gallery__loop path {
  fill: none;
  stroke: var(--rt-accent);
  stroke-width: 2.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

/* Captions: frame number and name, along the edge of the sheet */
.rt-gallery__caption {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  margin-top: 8px;
  font-size: var(--rt-type-sm);
  color: var(--rt-text-2);
}

.rt-gallery__num {
  flex: none;
  font: 600 var(--rt-type-xs) / 1 var(--rt-font-mono);
  letter-spacing: 0.02em;
  color: var(--rt-accent-text);
  font-variant-numeric: tabular-nums;
}

.rt-gallery__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-gallery__item--selected .rt-gallery__name {
  color: var(--rt-text-1);
}

/* List */
.rt-gallery__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rt-gallery__row {
  position: relative;
  display: grid;
  grid-template-columns: 32px 48px 22px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 8px 10px 8px 6px;
  border-radius: var(--rt-radius-md);
  transition: background-color var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__row:hover {
  background: var(--rt-surface-wash);
}

.rt-gallery__row.rt-gallery__item--selected {
  background: var(--rt-accent-soft);
}

/* The row opens the editor; its other parts let clicks through, except the controls. */
.rt-gallery__row .rt-gallery__open {
  z-index: 0;
  border-radius: inherit;
}

.rt-gallery__row > :not(.rt-gallery__open) {
  position: relative;
  z-index: 1;
  pointer-events: none;
}

.rt-gallery__row > .rt-gallery__select,
.rt-gallery__row > .rt-gallery__row-actions {
  pointer-events: auto;
}

.rt-gallery__row:has(.rt-gallery__open:focus-visible) {
  box-shadow: inset 0 0 0 2px var(--rt-focus);
}

.rt-gallery__row > .rt-gallery__select {
  position: relative;
  width: 32px;
  height: 32px;
}

.rt-gallery__row .rt-gallery__mark {
  border-color: var(--rt-line-loud);
  background: var(--rt-surface-raised);
  box-shadow: none;
}

.rt-gallery__row-media {
  width: 48px;
  height: 48px;
}

.rt-gallery__row-thumb {
  display: block;
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  background: var(--rt-surface-subtle);
}

.rt-gallery__row .rt-gallery__loop {
  inset: -6px;
  width: calc(100% + 12px);
  height: calc(100% + 12px);
}

.rt-gallery__row-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.rt-gallery__row-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.rt-gallery__row .rt-gallery__name {
  font-size: var(--rt-type-md);
  font-weight: 550;
  color: var(--rt-text-1);
}

.rt-gallery__row .rt-gallery__badge {
  position: static;
  flex: none;
  height: 20px;
  background: var(--rt-accent-soft);
  backdrop-filter: none;
  color: var(--rt-accent-text);
}

.rt-gallery__row .rt-gallery__badge::before {
  box-shadow: none;
}

.rt-gallery__row-meta {
  font: 500 var(--rt-type-xs) / 1.3 var(--rt-font-mono);
  color: var(--rt-text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rt-gallery__row-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__row:hover .rt-gallery__row-actions,
.rt-gallery__row:focus-within .rt-gallery__row-actions {
  opacity: 1;
}

.rt-gallery--selecting .rt-gallery__row-actions {
  display: none;
}

.rt-gallery__row-btn {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__row-btn:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-gallery__row-btn--danger:hover {
  background: var(--rt-danger-soft);
  color: var(--rt-danger-text);
}

.rt-gallery__row-btn svg {
  width: 17px;
  height: 17px;
}

/* Touch: a tap on the row edits, and the selection carries download and
   remove, so the row gives its width to the name instead. */
@media (hover: none) {
  .rt-gallery__row-actions {
    display: none;
  }
  .rt-gallery__row > .rt-gallery__select {
    width: 44px;
    height: 44px;
  }
}

/* Drop to add: anywhere on the sheet */
.rt-gallery__drop {
  position: absolute;
  inset: 6px;
  z-index: 5;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  border: 2px dashed var(--rt-accent);
  border-radius: calc(var(--rt-radius-xl) - 4px);
  background: color-mix(in srgb, var(--rt-surface-raised) 70%, transparent);
  backdrop-filter: blur(2px);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--rt-dur-2) var(--rt-ease);
}

.rt-gallery--dropping .rt-gallery__drop {
  opacity: 1;
}

.rt-gallery__drop-label {
  position: sticky;
  top: 40vh;
  margin-top: 96px;
  height: 48px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  border-radius: var(--rt-radius-full);
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  font: 650 var(--rt-type-lg) / 1 var(--rt-font-ui);
  box-shadow: var(--rt-shadow-lg);
}

.rt-gallery__drop-label svg {
  width: 18px;
  height: 18px;
}

/* Coarse pointers: 44 px targets in the header. */
@media (pointer: coarse) {
  .rt-gallery__view-btn {
    height: 40px;
  }
  .rt-gallery__add,
  .rt-gallery__batch,
  .rt-gallery__done,
  .rt-gallery__clear {
    height: 44px;
  }
  .rt-gallery__clear {
    width: 44px;
  }
  .rt-gallery__row-btn {
    width: 44px;
    height: 44px;
  }
}

/* Narrow: the layout switch takes its own row under the summary. */
@media (max-width: 640px) {
  .rt-gallery {
    padding: 14px 14px 20px;
    border-radius: var(--rt-radius-lg);
  }
  .rt-gallery__toolbar {
    margin-bottom: 16px;
    padding-bottom: 14px;
  }
  .rt-gallery__actions {
    flex: none;
    min-width: 0;
  }
  .rt-gallery__views {
    order: 3;
    flex: 1 1 100%;
  }
  .rt-gallery__view-btn {
    flex: 1;
  }
  .rt-gallery__row {
    grid-template-columns: auto 44px minmax(0, 1fr) auto;
    gap: 10px;
  }
  .rt-gallery__row > .rt-gallery__num {
    display: none;
  }
  .rt-gallery__row-media,
  .rt-gallery__row-thumb {
    width: 44px;
    height: 44px;
  }
}

/* Phones: the selection's actions fold to their icons. */
@media (max-width: 480px) {
  .rt-gallery__batch {
    width: 44px;
    padding: 0;
    justify-content: center;
  }
  .rt-gallery__batch span {
    display: none;
  }
}

/* ── Editor ────────────────────────────────── */

/* The darkroom: floating panels (top bar, tool rail, stage, inspector) on a
   graphite ground, so the photo is the brightest thing on screen. */
.rt-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  box-sizing: border-box;
  /* The visible height: on phones, 100vh can run under the browser's toolbar. */
  height: 100vh;
  height: 100dvh;
  background: var(--rt-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* Clear of notches and the home indicator, when the host page lets us reach them. */
  padding:
    max(8px, env(safe-area-inset-top))
    max(8px, env(safe-area-inset-right))
    max(8px, env(safe-area-inset-bottom))
    max(8px, env(safe-area-inset-left));
  animation: rt-overlay-in var(--rt-dur-3) var(--rt-ease-decel);
}

.rt-editor__topbar,
.rt-toolbar,
.rt-editor__inspector,
.rt-video-bar {
  background: var(--rt-surface-raised);
  border: 1px solid var(--rt-line);
  border-radius: var(--rt-radius-lg);
  box-shadow: var(--rt-highlight), var(--rt-shadow-float);
}

.rt-editor-overlay:focus {
  outline: none;
}

/* Three-zone top bar: Cancel | title (truly centered) | actions + Done */
.rt-editor__topbar {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 8px 0 6px;
  flex-shrink: 0;
}

/* Control tray — clearly separated from the stage above it */

.rt-history {
  position: relative;
  display: inline-flex;
}

.rt-history-menu {
  display: none;
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 40;
  padding-top: 8px;
}

.rt-history--open .rt-history-menu {
  display: block;
}

.rt-history-menu__card {
  min-width: 200px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--rt-surface-overlay);
  border: 1px solid var(--rt-line-strong);
  border-radius: var(--rt-radius-md);
  padding: 4px;
  box-shadow: var(--rt-shadow-md);
  animation: rt-pop-in var(--rt-dur-1) var(--rt-ease-decel);
  transform-origin: top right;
  scrollbar-width: thin;
  scrollbar-color: var(--rt-line-loud) transparent;
}

.rt-history-menu__card::-webkit-scrollbar {
  width: 8px;
}

.rt-history-menu__card::-webkit-scrollbar-track {
  background: transparent;
}

.rt-history-menu__card::-webkit-scrollbar-thumb {
  background: var(--rt-line-loud);
  border-radius: 4px;
}

.rt-history-menu__item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

.rt-history-menu__item:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-history-menu__item--current {
  background: var(--rt-accent-glow);
  color: var(--rt-accent-text);
}

.rt-editor__divider {
  width: 1px;
  height: 20px;
  background: var(--rt-line-strong);
  margin: 0 6px;
}

.rt-editor__topbar-left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.rt-editor__topbar-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.rt-editor__filename {
  font-size: 13px;
  color: var(--rt-text-2);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rt-editor__dimensions {
  font-size: 11px;
  color: var(--rt-text-3);
  padding: 3px 8px;
  background: var(--rt-control);
  border-radius: var(--rt-radius-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rt-editor__topbar-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

/* Done lives here, outside the action group, and never shrinks. */
.rt-editor__topbar-end {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.rt-editor__btn-cancel {
  height: 32px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

.rt-editor__btn-capture {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

.rt-editor__btn-capture:hover {
  background: var(--rt-control);
  color: var(--rt-text-1);
}

.rt-editor__btn-capture svg {
  width: 16px;
  height: 16px;
}

.rt-editor__history {
  display: flex;
  gap: 2px;
  margin-right: 4px;
}

.rt-editor__text-btn {
  height: 32px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

.rt-editor__text-btn:hover {
  background: var(--rt-control);
  color: var(--rt-text-1);
}

.rt-editor__text-btn svg {
  display: none;
  width: 18px;
  height: 18px;
}

.rt-editor__icon-btn.rt-editor__icon-btn--active {
  background: var(--rt-accent-glow);
  color: var(--rt-accent-text);
}

.rt-editor__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-editor__icon-btn:hover:not([disabled]) {
  background: var(--rt-control);
  color: var(--rt-text-1);
}

.rt-editor__icon-btn[disabled] {
  opacity: 0.3;
  cursor: default;
}

.rt-editor__icon-btn svg {
  width: 18px;
  height: 18px;
}

.rt-editor__btn-cancel:hover {
  background: var(--rt-control);
  color: var(--rt-text-1);
}

.rt-editor__btn-done {
  height: 34px;
  padding: 0 22px;
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: 999px;
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

.rt-editor__btn-done:hover {
  background: var(--rt-accent-hover);
}

/* ── Feature-group tabs (left rail) ────────── */

.rt-editor__body {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 8px;
}

.rt-editor__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 8px;
}

/* Tool rail: grouped icon buttons; names and shortcuts live in a tooltip.
   The panel holds a scroller (the tools) and, beside it, the tooltip and the
   AI menu, so the scroller's edge fade never clips them. */
.rt-toolbar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex-shrink: 0;
}

.rt-toolbar__scroll {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}

.rt-toolbar__scroll::-webkit-scrollbar {
  display: none;
}

.rt-toolbar__btn {
  position: relative;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--rt-radius-md);
  color: var(--rt-text-3);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
  flex-shrink: 0;
}

.rt-toolbar__btn:hover {
  background: var(--rt-control);
  color: var(--rt-text-1);
}

.rt-toolbar__btn--active {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
  box-shadow: inset 0 0 0 1px var(--rt-line-strong);
}

/* The active tool's marker, on the rail's leading edge. */
.rt-toolbar__btn--active::before {
  content: '';
  position: absolute;
  left: -7px;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 3px;
  background: var(--rt-accent);
}

.rt-toolbar__btn--touched::after {
  content: '';
  position: absolute;
  top: 7px;
  right: 7px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rt-accent);
}

.rt-toolbar__btn svg {
  width: 20px;
  height: 20px;
}

/* Names (and AI tools' one-liners) only show on the expanded rail; the
   buttons' aria-labels already name them. */
.rt-toolbar__text {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.rt-toolbar__sep {
  width: 24px;
  height: 1px;
  margin: 6px 0;
  background: var(--rt-line-strong);
  flex-shrink: 0;
}

.rt-toolbar__groups,
.rt-toolbar__group {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.rt-toolbar__group-label,
.rt-toolbar__key {
  display: none;
}

/* AI tools get their own section, faintly lit by the prism, so they read
   as a headline feature rather than an afterthought. */
.rt-toolbar__group--ai {
  padding: 5px 0;
  border-radius: 13px;
  background: linear-gradient(180deg, rgba(165, 139, 255, 0.1), rgba(92, 200, 255, 0.04));
  box-shadow: inset 0 0 0 1px rgba(165, 139, 255, 0.16);
}

/* A spark of the prism marks each AI tool on the rail. */
.rt-toolbar__spark {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rt-prism);
}

/* A rail taller than the screen scrolls; the end with more fades out. */
.rt-toolbar--more-after .rt-toolbar__scroll {
  mask-image: linear-gradient(to bottom, #000 calc(100% - 36px), transparent);
}

.rt-toolbar--more-before .rt-toolbar__scroll {
  mask-image: linear-gradient(to top, #000 calc(100% - 36px), transparent);
}

.rt-toolbar--more-before.rt-toolbar--more-after .rt-toolbar__scroll {
  mask-image: linear-gradient(to bottom, transparent, #000 36px, #000 calc(100% - 36px), transparent);
}

/* Short screens (a 768 px laptop): a denser rail keeps every tool in view.
   Column rails with a mouse or trackpad only: touch keeps 44 px targets. */
@media (max-height: 820px) and (min-width: 761px) and (orientation: landscape) and (pointer: fine),
  (max-height: 820px) and (min-width: 1025px) and (pointer: fine) {
  .rt-toolbar__btn {
    height: 40px;
  }

  .rt-toolbar__sep {
    margin: 4px 0;
  }

  .rt-toolbar__group--ai {
    padding: 3px 0;
  }

  .rt-toolbar__toggle {
    height: 32px;
  }

  .rt-toolbar__btn--active::before {
    top: 10px;
    bottom: 10px;
  }
}

/* Names toggle, at the foot of the rail */
.rt-toolbar__toggle {
  position: relative;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 44px;
  height: 36px;
  margin-top: auto;
  padding: 0;
  border: none;
  border-radius: var(--rt-radius-md);
  background: transparent;
  color: var(--rt-text-3);
  font-family: inherit;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
}

.rt-toolbar__toggle:hover {
  background: var(--rt-control);
  color: var(--rt-text-1);
}

.rt-toolbar__toggle svg {
  width: 18px;
  height: 18px;
}

/* Expanded: a wider rail with names, group titles and keys — only while
   the rail is a column on a screen with room for it (the stacked phone and
   tablet layouts keep the compact row, and a phone on its side the icons). */
@media (min-width: 761px) and (orientation: landscape) and (min-height: 501px),
  (min-width: 1025px) and (min-height: 501px) {
  .rt-toolbar--expanded {
    width: 212px;
  }

  .rt-toolbar--expanded .rt-toolbar__scroll {
    align-items: stretch;
    padding: 8px;
  }

  .rt-toolbar--expanded .rt-toolbar__groups,
  .rt-toolbar--expanded .rt-toolbar__group {
    align-items: stretch;
  }

  .rt-toolbar--expanded .rt-toolbar__group-label {
    display: block;
    padding: 8px 10px 4px;
    color: var(--rt-text-3);
    font: 600 10px / 1.2 var(--rt-font-ui);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .rt-toolbar--expanded .rt-toolbar__group--ai {
    padding: 2px 4px 4px;
  }

  .rt-toolbar--expanded .rt-toolbar__group--ai .rt-toolbar__group-label {
    background: linear-gradient(90deg, #ffc457, #8ce99a, #5cc8ff, #a58bff);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .rt-toolbar--expanded .rt-toolbar__sep {
    width: auto;
    margin: 6px 4px;
  }

  .rt-toolbar--expanded .rt-toolbar__btn,
  .rt-toolbar--expanded .rt-toolbar__toggle {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 11px;
    width: 100%;
    height: 38px;
    padding: 0 10px;
  }

  .rt-toolbar--expanded .rt-toolbar__btn svg,
  .rt-toolbar--expanded .rt-toolbar__toggle svg {
    flex: none;
  }

  .rt-toolbar--expanded .rt-toolbar__text {
    position: static;
    display: grid;
    width: auto;
    height: auto;
    min-width: 0;
    clip-path: none;
    text-align: left;
  }

  .rt-toolbar--expanded .rt-toolbar__label,
  .rt-toolbar--expanded .rt-toolbar__desc {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rt-toolbar--expanded .rt-toolbar__label {
    font-size: var(--rt-type-md);
    font-weight: 500;
  }

  .rt-toolbar--expanded .rt-toolbar__desc {
    color: var(--rt-text-3);
    font-size: var(--rt-type-xs);
  }

  .rt-toolbar--expanded .rt-toolbar__btn--ai-tool {
    height: auto;
    min-height: 44px;
    padding-block: 6px;
  }

  .rt-toolbar--expanded .rt-toolbar__key {
    display: inline-block;
    margin-left: auto;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--rt-control);
    color: var(--rt-text-3);
    font: 500 var(--rt-type-xs) var(--rt-font-mono);
  }

  .rt-toolbar--expanded .rt-toolbar__btn--active::before {
    left: -8px;
  }

  .rt-toolbar--expanded .rt-toolbar__btn--touched::after,
  .rt-toolbar--expanded .rt-toolbar__spark {
    top: 7px;
    right: auto;
    left: 24px;
  }
}

@media (max-height: 820px) and (min-width: 761px) and (orientation: landscape) and (pointer: fine),
  (max-height: 820px) and (min-width: 1025px) and (pointer: fine) {
  .rt-toolbar--expanded .rt-toolbar__btn,
  .rt-toolbar--expanded .rt-toolbar__toggle {
    height: 34px;
  }

  .rt-toolbar--expanded .rt-toolbar__btn--ai-tool {
    min-height: 40px;
    padding-block: 4px;
  }

  .rt-toolbar--expanded .rt-toolbar__group-label {
    padding: 6px 10px 3px;
  }
}

/* The AI launcher wears the prism: light split into its spectrum. */
.rt-toolbar__btn--ai {
  border: 1.5px solid transparent;
  background:
    linear-gradient(var(--rt-surface-raised), var(--rt-surface-raised)) padding-box,
    var(--rt-prism) border-box;
  color: var(--rt-text-1);
}

.rt-toolbar__btn--ai:hover,
.rt-toolbar__btn--ai.rt-toolbar__btn--active {
  background:
    linear-gradient(var(--rt-surface-overlay), var(--rt-surface-overlay)) padding-box,
    var(--rt-prism) border-box;
}

.rt-tooltip {
  position: fixed;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  border: 1px solid var(--rt-line);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-surface-overlay);
  color: var(--rt-text-1);
  font-size: var(--rt-type-sm);
  font-weight: 500;
  white-space: nowrap;
  box-shadow: var(--rt-shadow-md);
  pointer-events: none;
  transform: translateY(-50%);
}

.rt-tooltip[data-side="top"] {
  transform: translate(-50%, -100%);
}

.rt-tooltip[hidden] {
  display: none;
}

.rt-tooltip kbd {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--rt-control-hover);
  color: var(--rt-text-2);
  font: 500 var(--rt-type-xs) var(--rt-font-mono);
}

/* AI tools menu */
.rt-flyout {
  position: fixed;
  z-index: 40;
  display: grid;
  gap: 2px;
  width: 352px;
  max-width: calc(100vw - 16px);
  padding: 6px;
  border: 1px solid var(--rt-line-strong);
  border-radius: var(--rt-radius-lg);
  background: var(--rt-surface-overlay);
  box-shadow: var(--rt-shadow-lg);
  animation: rt-pop-in var(--rt-dur-2) var(--rt-ease-decel);
}

.rt-flyout[hidden] {
  display: none;
}

.rt-flyout__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 6px 8px 8px;
}

.rt-flyout__title {
  color: var(--rt-text-1);
  font-size: var(--rt-type-md);
  font-weight: 650;
}

.rt-flyout__subtitle,
.rt-flyout__foot {
  color: var(--rt-text-3);
  font-size: var(--rt-type-sm);
}

.rt-flyout__foot {
  margin: 4px 0 0;
  padding: 8px 8px 4px;
  border-top: 1px solid var(--rt-line);
}

.rt-flyout__list {
  display: grid;
  gap: 2px;
}

.rt-flyout__row {
  display: flex;
  align-items: center;
  gap: 2px;
}

/* Pin a tool onto the rail: outlined when it's in the menu, lit when pinned. */
.rt-flyout__pin {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-3);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
}

.rt-flyout__pin:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-flyout__pin[aria-pressed="true"] {
  color: var(--rt-accent);
}

.rt-flyout__pin[aria-pressed="true"] svg path:first-child {
  fill: currentColor;
}

.rt-flyout__pin svg {
  width: 16px;
  height: 16px;
}

.rt-flyout__item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: var(--rt-radius-md);
  background: transparent;
  color: var(--rt-text-1);
  text-align: left;
  font-family: inherit;
  cursor: pointer;
}

.rt-flyout__item:hover,
.rt-flyout__item:focus-visible {
  background: var(--rt-control-hover);
}

.rt-flyout__item--active {
  background: var(--rt-accent-soft);
}

.rt-flyout__icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--rt-control);
}

.rt-flyout__icon svg {
  width: 18px;
  height: 18px;
}

.rt-flyout__text {
  display: grid;
  min-width: 0;
}

.rt-flyout__name {
  font-size: var(--rt-type-md);
  font-weight: 600;
}

.rt-flyout__desc {
  overflow: hidden;
  color: var(--rt-text-3);
  font-size: var(--rt-type-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-flyout__badge {
  padding: 3px 6px;
  border-radius: 6px;
  background: var(--rt-control);
  color: var(--rt-text-2);
  font: 500 var(--rt-type-xs) var(--rt-font-mono);
  white-space: nowrap;
}

/* ── Canvas area ───────────────────────────── */

/* The stage: a light table, a soft neutral pool of light under the print.
   The bottom padding leaves room for the zoom controls. */
.rt-editor__canvas-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 16px 24px 60px;
  border-radius: var(--rt-radius-lg);
  background:
    radial-gradient(65% 60% at 50% 45%, var(--rt-surface-wash), transparent 72%),
    var(--rt-surface-subtle);
}

.rt-stage--zoomed.rt-stage--grab {
  cursor: grab;
}

.rt-stage--panning,
.rt-stage--panning * {
  cursor: grabbing !important;
}

/* Zoom controls, floating at the foot of the stage */
.rt-zoom {
  position: absolute;
  left: 50%;
  bottom: 12px;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border: 1px solid var(--rt-line);
  border-radius: var(--rt-radius-full);
  background: var(--rt-surface-glass);
  box-shadow: var(--rt-shadow-md);
  backdrop-filter: blur(12px);
  transform: translateX(-50%);
}

.rt-zoom[hidden] {
  display: none;
}

.rt-zoom button {
  display: grid;
  place-items: center;
  height: 30px;
  min-width: 30px;
  padding: 0 9px;
  border: none;
  border-radius: var(--rt-radius-full);
  background: transparent;
  color: var(--rt-text-2);
  font: 500 var(--rt-type-sm) var(--rt-font-mono);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
}

.rt-zoom button:hover:not([disabled]) {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-zoom button[disabled] {
  opacity: 0.35;
  cursor: default;
}

.rt-zoom button svg {
  width: 16px;
  height: 16px;
}

.rt-zoom__value {
  min-width: 52px;
  color: var(--rt-text-1);
  font: 500 var(--rt-type-sm) var(--rt-font-mono);
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.rt-zoom__sep {
  width: 1px;
  height: 16px;
  margin: 0 2px;
  background: var(--rt-line-strong);
}

.rt-editor__canvas-pane {
  flex: 1;
  min-width: 0;
  min-height: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  position: relative;
}

.rt-editor__pane-content {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.rt-editor__canvas-area--split {
  gap: 24px;
}

.rt-editor__canvas-area--split .rt-editor__canvas-pane {
  background: var(--rt-surface-wash);
  border: 1px solid var(--rt-line);
  border-radius: var(--rt-radius-lg);
  padding: 0 14px 14px;
  overflow: hidden;
}

.rt-compare-header {
  width: 100%;
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--rt-text-2);
  padding: 10px 0;
  border-bottom: 1px solid var(--rt-line);
  margin-bottom: 14px;
  flex: none;
}

/* 90%: the same fit margin the renderer gives the edited side. */
.rt-compare-pane canvas {
  max-width: 90%;
  max-height: 90%;
  border-radius: 2px;
}

.rt-editor__compare-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--rt-line-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--rt-text-2);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), border-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-editor__compare-btn svg {
  width: 16px;
  height: 16px;
}

.rt-editor__compare-btn:hover {
  border-color: var(--rt-line-loud);
  color: var(--rt-text-1);
}

.rt-editor__compare-btn--active,
.rt-editor__compare-btn--active:hover {
  background: var(--rt-accent);
  border-color: var(--rt-accent);
  color: var(--rt-on-accent);
}

/* Sized by its canvas, so zooming can grow it past the stage (which clips
   it); zoom and pan are transforms on this element, overlays included. */
.rt-editor__canvas-container {
  position: relative;
  flex-shrink: 0;
  box-shadow: 0 26px 64px -22px rgba(0, 0, 0, 0.8);
}

.rt-editor__canvas-container .canvas-container {
  border-radius: var(--rt-radius-sm);
  box-shadow: var(--rt-shadow-lg);
  overflow: hidden;
}

.rt-editor__canvas-container .canvas-container canvas {
  display: block;
}

.rt-editor__canvas-container .upper-canvas {
  pointer-events: none;
}

/* ── Crop overlay ──────────────────────────── */

.rt-crop {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
}

/* One screen pixel inside the stage: the stage view scales the canvas
   container past the preview's resolution, and overlay chrome divides
   that back out so frames and handles keep their size at any zoom. */
.rt-editor__canvas-container {
  --rt-px: calc(1px / var(--rt-view-scale, 1));
}

.rt-crop__mask {
  position: absolute;
  background: var(--rt-scrim);
  pointer-events: none;
}

.rt-crop__selection {
  position: absolute;
  border: calc(2 * var(--rt-px, 1px)) solid var(--rt-on-media);
  pointer-events: auto;
  cursor: move;
}

.rt-crop__grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  grid-template-rows: 1fr 1fr 1fr;
  pointer-events: none;
}

.rt-crop__grid-cell {
  border-right: var(--rt-px, 1px) solid var(--rt-on-media-faint);
  border-bottom: var(--rt-px, 1px) solid var(--rt-on-media-faint);
}

.rt-crop__grid-cell:nth-child(3n) { border-right: none; }
.rt-crop__grid-cell:nth-child(n+7) { border-bottom: none; }

.rt-crop__handle {
  --rt-handle-offset: calc(-6 * var(--rt-px, 1px));
  position: absolute;
  width: calc(12 * var(--rt-px, 1px));
  height: calc(12 * var(--rt-px, 1px));
  background: var(--rt-on-media);
  border-radius: calc(2 * var(--rt-px, 1px));
  box-shadow: var(--rt-shadow-sm);
  pointer-events: auto;
}

.rt-crop__handle--nw { top: var(--rt-handle-offset); left: var(--rt-handle-offset); cursor: nw-resize; }
.rt-crop__handle--ne { top: var(--rt-handle-offset); right: var(--rt-handle-offset); cursor: ne-resize; }
.rt-crop__handle--sw { bottom: var(--rt-handle-offset); left: var(--rt-handle-offset); cursor: sw-resize; }
.rt-crop__handle--se { bottom: var(--rt-handle-offset); right: var(--rt-handle-offset); cursor: se-resize; }
.rt-crop__handle--n { top: var(--rt-handle-offset); left: 50%; transform: translateX(-50%); cursor: n-resize; }
.rt-crop__handle--s { bottom: var(--rt-handle-offset); left: 50%; transform: translateX(-50%); cursor: s-resize; }
.rt-crop__handle--w { top: 50%; left: var(--rt-handle-offset); transform: translateY(-50%); cursor: w-resize; }
.rt-crop__handle--e { top: 50%; right: var(--rt-handle-offset); transform: translateY(-50%); cursor: e-resize; }

/* ── Context dock (controls below the canvas) ─
   One horizontal pane per tool, floating on the shared surface. */

.rt-dock {
  /* Fixed height: switching tools must never move the tray. Sized to the
     tallest pane (filter filmstrip + intensity row). */
  height: var(--rt-dock-h);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  flex-shrink: 0;
}

/* ── Inspector: the active tool's controls, on the right ── */

.rt-editor__inspector {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.rt-inspector__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-shrink: 0;
  padding: 14px 12px 10px 16px;
}

.rt-inspector__titles {
  flex: 1;
  min-width: 0;
}

.rt-inspector__title:focus {
  outline: none;
}

/* Resets the active tool; there only while that tool has changes. */
.rt-inspector__reset {
  flex-shrink: 0;
  height: 26px;
  margin-top: -2px;
  padding: 0 10px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-control);
  color: var(--rt-text-2);
  font: 600 var(--rt-type-sm) var(--rt-font-ui);
  cursor: pointer;
  animation: rt-pane-in var(--rt-dur-2) var(--rt-ease-decel);
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
}

.rt-inspector__reset:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-inspector__title {
  color: var(--rt-text-1);
  font-size: var(--rt-type-lg);
  font-weight: 650;
  letter-spacing: -0.005em;
  line-height: 1.3;
}

.rt-inspector__desc {
  margin-top: 2px;
  color: var(--rt-text-3);
  font-size: var(--rt-type-sm);
}

.rt-inspector__desc[hidden],
.rt-inspector__hist[hidden] {
  display: none;
}

.rt-inspector__hist {
  display: block;
  flex-shrink: 0;
  width: calc(100% - 32px);
  height: 64px;
  margin: 0 16px 8px;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-wash);
  box-shadow: inset 0 0 0 1px var(--rt-line);
}

.rt-inspector__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 16px;
  scrollbar-width: thin;
  scrollbar-color: var(--rt-line-strong) transparent;
}

/* The tool panes were laid out as one horizontal strip; in the inspector
   they stack: rows wrap, sliders take the full width with their value on
   the label's line, and the filter filmstrip becomes a grid. */
.rt-editor__inspector .rt-dock {
  display: block;
  height: auto;
  padding: 0;
}

.rt-editor__inspector .rt-dock__pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.rt-editor__inspector .rt-dock__row {
  flex-wrap: wrap;
  justify-content: flex-start;
  overflow: visible;
  gap: 8px;
}

.rt-editor__inspector .rt-dock__stack {
  align-items: stretch;
  gap: 14px;
}

.rt-editor__inspector .rt-dock__group {
  flex-wrap: wrap;
}

.rt-editor__inspector .rt-dock__divider {
  display: none;
}

.rt-editor__inspector .rt-dock__row-title {
  flex-basis: 100%;
  margin-top: 4px;
}

.rt-editor__inspector .rt-dock__slider {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 6px 8px;
  width: 100%;
}

.rt-editor__inspector .rt-dock__slider .rt-dock__slider-label {
  grid-column: 1;
  grid-row: 1;
}

.rt-editor__inspector .rt-dock__slider .rt-dock__slider-value {
  grid-column: 2;
  grid-row: 1;
}

.rt-editor__inspector .rt-dock__slider > :not(.rt-dock__slider-label):not(.rt-dock__slider-value):not(input) {
  grid-column: 3;
  grid-row: 1;
}

.rt-editor__inspector .rt-dock__slider input[type="range"] {
  grid-column: 1 / -1;
  grid-row: 2;
  width: 100%;
}

/* Status and hint lines get their own line and wrap. */
.rt-editor__inspector .rt-dock__status,
.rt-editor__inspector .rt-dock__hint,
.rt-editor__inspector .rt-liquify__hint {
  flex: 1 1 100%;
  min-width: 0;
  margin-left: 0;
  white-space: normal;
  text-wrap: pretty;
}

/* ── Crop pane: aspect tiles, the straighten ruler, turns and flips ── */

.rt-dock__pane.rt-crop-pane {
  gap: 18px;
}

.rt-aspects {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.rt-aspect {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 8px;
  height: 66px;
  padding: 0;
  border: 1px solid var(--rt-line);
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-wash);
  color: var(--rt-text-2);
  font: 500 var(--rt-type-sm) var(--rt-font-ui);
  cursor: pointer;
  transition: border-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), background-color var(--rt-dur-1) var(--rt-ease);
}

.rt-aspect:hover {
  border-color: var(--rt-line-loud);
  color: var(--rt-text-1);
}

.rt-aspect[aria-pressed="true"] {
  border-color: var(--rt-accent);
  background: var(--rt-accent-soft);
  color: var(--rt-text-1);
}

.rt-aspect__glyph {
  display: block;
  border: 1.5px solid currentColor;
  border-radius: 3px;
}

.rt-aspect--free .rt-aspect__glyph {
  border-style: dashed;
}

.rt-ruler-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-ruler__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: var(--rt-text-2);
  font-size: var(--rt-type-md);
}

.rt-ruler__value {
  color: var(--rt-text-3);
  font: 500 var(--rt-type-sm) / 1 var(--rt-font-mono);
  font-variant-numeric: tabular-nums;
}

.rt-ruler-field--changed .rt-ruler__value {
  color: var(--rt-text-1);
}

.rt-ruler {
  position: relative;
  height: 52px;
  overflow: hidden;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-wash);
  box-shadow: inset 0 0 0 1px var(--rt-line);
  cursor: ew-resize;
  touch-action: none;
  user-select: none;
}

/* The tape fades out toward the ends, so the center mark reads as "here". */
.rt-ruler::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  background: linear-gradient(90deg, var(--rt-surface-raised), transparent 24%, transparent 76%, var(--rt-surface-raised));
  pointer-events: none;
}

.rt-ruler::after {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  z-index: 2;
  width: 2px;
  margin-left: -1px;
  border-radius: 2px;
  background: var(--rt-accent);
  box-shadow: 0 0 10px var(--rt-accent-glow);
}

.rt-ruler:focus-visible {
  outline: 2px solid var(--rt-focus);
  outline-offset: 2px;
}

.rt-ruler__ticks {
  position: absolute;
  top: 8px;
  bottom: 20px;
  left: 50%;
  /* Majors every 5 units, minors every unit (half height). */
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.55) 0 1px, transparent 1px calc(var(--rt-ruler-unit) * 5)),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.2) 0 1px, transparent 1px var(--rt-ruler-unit)) 0 50% / 100% 50% no-repeat;
}

.rt-ruler__mark {
  position: absolute;
  bottom: -16px;
  color: var(--rt-text-3);
  font: 10px / 1 var(--rt-font-mono);
  transform: translateX(-50%);
}

.rt-transform-btns {
  display: flex;
  gap: 6px;
}

.rt-transform-btns .rt-dock__icon-btn {
  flex: 1;
  height: 34px;
  border-radius: var(--rt-radius-md);
}

.rt-crop-pane__note {
  margin: 0;
  line-height: 1.5;
}

.rt-dock__pane.rt-transform-pane {
  gap: 0;
}

/* ── AI tool cards: what it does, what it downloads, then the run ── */

.rt-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border-radius: var(--rt-radius-lg);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
  box-shadow: inset 0 0 0 1px var(--rt-line);
}

/* The prism's light along the top edge marks on-device AI. */
.rt-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 16px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #ffc457, #8ce99a, #5cc8ff, #a58bff, transparent);
  opacity: 0.85;
}

.rt-card__desc {
  margin: 0;
  color: var(--rt-text-2);
  font-size: var(--rt-type-md);
  line-height: 1.5;
}

.rt-card__facts {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 7px 14px;
  margin: 0;
  font-size: var(--rt-type-sm);
}

.rt-card__facts dt {
  color: var(--rt-text-3);
}

.rt-card__facts dd {
  margin: 0;
  color: var(--rt-text-1);
  font: 500 var(--rt-type-xs) / 1.6 var(--rt-font-mono);
}

.rt-card__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-dock__status:empty {
  display: none;
}

/* The run button for a model: the prism ring, with a sparkle. */
.rt-dock__chip.rt-dock__chip--ai,
.rt-dock__chip.rt-dock__chip--ai:hover {
  gap: 8px;
  border: 1.5px solid transparent;
  background:
    linear-gradient(var(--rt-surface-overlay), var(--rt-surface-overlay)) padding-box,
    var(--rt-prism) border-box;
  color: var(--rt-text-1);
  font-weight: 600;
}

.rt-dock__chip.rt-dock__chip--ai:hover:not([disabled]) {
  box-shadow: 0 0 0 4px rgba(165, 139, 255, 0.12), 0 0 24px rgba(92, 200, 255, 0.18);
}

.rt-dock__chip--ai svg {
  flex: none;
  width: 14px;
  height: 14px;
}

.rt-card__body > .rt-dock__chip--ai {
  justify-content: center;
  width: 100%;
  height: 42px;
  border-radius: var(--rt-radius-md);
  font-size: var(--rt-type-md);
}

.rt-steps {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rt-step {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px 10px;
  color: var(--rt-text-3);
  font-size: var(--rt-type-sm);
  transition: color var(--rt-dur-2) var(--rt-ease);
}

.rt-step__mark {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1.5px var(--rt-line-loud);
  transition: background-color var(--rt-dur-2) var(--rt-ease);
}

.rt-step__mark svg {
  width: 12px;
  height: 12px;
  stroke-width: 2.5;
}

.rt-step[data-state="active"] {
  color: var(--rt-text-1);
}

.rt-step[data-state="active"] .rt-step__mark {
  box-shadow: inset 0 0 0 2px var(--rt-accent);
  animation: rt-breathe 1s ease-in-out infinite;
}

.rt-step[data-state="done"] {
  color: var(--rt-text-2);
}

.rt-step[data-state="done"] .rt-step__mark {
  background: var(--rt-success);
  box-shadow: none;
  color: #06140d;
}

.rt-step[data-state="failed"] {
  color: var(--rt-danger-text);
}

.rt-step[data-state="failed"] .rt-step__mark {
  background: var(--rt-danger);
  box-shadow: none;
  color: #fff;
}

.rt-step__detail {
  color: var(--rt-text-3);
  font: 500 var(--rt-type-xs) / 1 var(--rt-font-mono);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rt-step__bar {
  grid-column: 2 / -1;
  height: 3px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--rt-control);
}

.rt-step__bar i {
  display: block;
  width: 0;
  height: 100%;
  background: linear-gradient(90deg, #ffc457, #5cc8ff, #a58bff);
  transition: width var(--rt-dur-2) var(--rt-ease);
}

@keyframes rt-breathe {
  50% { box-shadow: inset 0 0 0 2px var(--rt-accent), 0 0 0 4px var(--rt-accent-glow); }
}

.rt-visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  border: 0;
  white-space: nowrap;
}

/* ── Inspector controls: sections, tiles, segmented buttons ── */

.rt-section + .rt-section {
  border-top: 1px solid var(--rt-line);
}

.rt-section__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 2px 8px;
  list-style: none;
}

.rt-section__head::-webkit-details-marker {
  display: none;
}

.rt-section--collapsible > .rt-section__head {
  cursor: pointer;
  border-radius: var(--rt-radius-sm);
}

.rt-section--collapsible > .rt-section__head:hover .rt-section__title {
  color: var(--rt-text-1);
}

.rt-section--collapsible > .rt-section__head:focus-visible {
  outline: 2px solid var(--rt-focus);
  outline-offset: 2px;
}

.rt-editor__inspector .rt-section__title,
.rt-section__title {
  flex-basis: auto;
  margin: 0;
  color: var(--rt-text-2);
  font-size: var(--rt-type-xs);
  transition: color var(--rt-dur-1) var(--rt-ease);
}

.rt-section__count {
  min-width: 18px;
  padding: 3px 5px;
  border-radius: var(--rt-radius-full);
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  font: 600 10px / 1 var(--rt-font-mono);
  text-align: center;
}

.rt-section__count[hidden] {
  display: none;
}

.rt-section__chevron {
  margin-left: auto;
  color: var(--rt-text-3);
  transition: transform var(--rt-dur-2) var(--rt-ease);
}

.rt-section__chevron svg {
  display: block;
  width: 15px;
  height: 15px;
}

.rt-section[open] > .rt-section__head .rt-section__chevron {
  transform: rotate(180deg);
}

.rt-section__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px 0 14px;
}

.rt-tiles {
  display: grid;
  grid-template-columns: repeat(var(--rt-tile-cols, 3), minmax(0, 1fr));
  gap: 12px 8px;
}

.rt-tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--rt-text-2);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rt-tile__frame {
  position: relative;
  display: block;
  overflow: hidden;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-wash);
  box-shadow: 0 0 0 1px var(--rt-line);
  transition: box-shadow var(--rt-dur-1) var(--rt-ease);
}

.rt-tile__img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  transition: transform var(--rt-dur-3) var(--rt-ease);
}

.rt-tile__img:not([src]) {
  visibility: hidden;
}

.rt-tile:hover .rt-tile__frame {
  box-shadow: 0 0 0 1px var(--rt-line-loud);
}

.rt-tile:hover .rt-tile__img {
  transform: scale(1.04);
}

.rt-tile[aria-pressed="true"] .rt-tile__frame {
  box-shadow: 0 0 0 2px var(--rt-accent), 0 0 0 5px var(--rt-accent-glow);
}

.rt-tile:focus-visible {
  outline: none;
}

.rt-tile:focus-visible .rt-tile__frame {
  box-shadow: 0 0 0 2px var(--rt-focus), 0 0 0 5px var(--rt-accent-glow);
}

.rt-tile__label {
  overflow: hidden;
  font-size: var(--rt-type-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rt-tile[aria-pressed="true"] .rt-tile__label {
  color: var(--rt-text-1);
}

.rt-segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-subtle);
  box-shadow: inset 0 0 0 1px var(--rt-line);
}

.rt-segmented__btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--rt-text-2);
  font: 600 var(--rt-type-sm) / 1 var(--rt-font-mono);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
}

.rt-segmented__btn:hover {
  color: var(--rt-text-1);
}

.rt-segmented__btn[aria-pressed="true"] {
  background: var(--rt-surface-overlay);
  color: var(--rt-text-1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), inset 0 0 0 1px var(--rt-line-strong);
}

.rt-segmented__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

/* hidden always wins inside the editor, whatever display a class sets. */
.rt-editor-overlay [hidden] {
  display: none !important;
}

.rt-dock__pane {
  width: 100%;
  min-width: 0;
  animation: rt-pane-in var(--rt-dur-2) var(--rt-ease-decel);
}

.rt-dock__row {
  display: flex;
  align-items: center;
  /* safe: an overflowing row scrolls from its first item instead of
     pushing it out of reach (plain center is the fallback). */
  justify-content: center;
  justify-content: safe center;
  gap: 10px;
  min-width: 0;
  /* Panes center their rows in a column; a row wider than the pane must
     scroll inside it rather than spill past both edges. */
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 2px 0;
}

.rt-dock__row::-webkit-scrollbar {
  display: none;
}

.rt-dock__group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.rt-dock__divider {
  width: 1px;
  height: 22px;
  background: var(--rt-line-strong);
  margin: 0 6px;
  flex-shrink: 0;
}

.rt-dock__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-control);
  color: var(--rt-text-2);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  flex-shrink: 0;
}

.rt-dock__icon-btn:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-dock__icon-btn svg {
  width: 16px;
  height: 16px;
}

.rt-dock__chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--rt-control);
  color: var(--rt-text-2);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
  flex-shrink: 0;
}

.rt-dock__chip:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-dock__chip--active {
  background: var(--rt-accent-glow);
  color: var(--rt-accent-text);
}

.rt-dock__chip--primary {
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  font-weight: 600;
}

.rt-dock__chip--primary:hover {
  background: var(--rt-accent-hover);
  color: var(--rt-on-accent);
}

.rt-dock__chip[disabled] {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}

/* Dot marking an adjustment that is away from neutral */
.rt-dock__chip--touched::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 9px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--rt-accent);
}

/* Status line inside a tool pane (model download, tile progress, hints). */
.rt-dock__status {
  font-size: 12px;
  color: var(--rt-text-3);
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.rt-dock__slider {
  gap: 10px;
}

.rt-dock__slider-label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: var(--rt-type-md);
  color: var(--rt-text-2);
  white-space: nowrap;
  flex-shrink: 0;
  user-select: none;
  transition: color var(--rt-dur-1) var(--rt-ease);
}

.rt-dock__slider-value {
  font: 500 var(--rt-type-sm) / 1 var(--rt-font-mono);
  color: var(--rt-text-3);
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
  transition: color var(--rt-dur-1) var(--rt-ease);
}

/* The value doubles as a field: type a number, ↑/↓ to step. */
input.rt-dock__slider-value {
  width: 58px;
  height: 24px;
  margin: 0 -6px 0 0;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  cursor: text;
}

input.rt-dock__slider-value:hover:not([disabled]) {
  background: var(--rt-control);
}

input.rt-dock__slider-value:focus {
  border-color: var(--rt-line-strong);
  background: var(--rt-surface-subtle);
  color: var(--rt-text-1);
  outline: none;
}

input.rt-dock__slider-value:focus-visible {
  box-shadow: 0 0 0 2px var(--rt-focus);
}

/* The track: 4px, 6px under the pointer or keyboard. The fill runs from
   the anchor (--rt-fill-a) to the thumb (--rt-fill-b), set by
   refreshRangeFill; .rt-slider--track swaps in a semantic gradient. */
.rt-dock__slider input[type="range"] {
  --rt-range-h: 4px;
  --rt-range-bg: linear-gradient(to right,
    var(--rt-track) min(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)),
    var(--rt-track-fill) min(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)) max(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)),
    var(--rt-track) max(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)));
  width: 220px;
  height: 18px;
  margin: 0;
  -webkit-appearance: none;
  appearance: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}

.rt-dock__slider input[type="range"]:hover:not([disabled]),
.rt-dock__slider input[type="range"]:focus-visible {
  --rt-range-h: 6px;
}

.rt-slider--track input[type="range"] {
  --rt-range-bg: var(--rt-slider-track);
}

.rt-dock__slider input[type="range"]::-webkit-slider-runnable-track {
  height: var(--rt-range-h);
  border-radius: var(--rt-radius-full);
  background: var(--rt-range-bg);
  transition: height var(--rt-dur-1) var(--rt-ease);
}

.rt-dock__slider input[type="range"]::-moz-range-track {
  height: var(--rt-range-h);
  border-radius: var(--rt-radius-full);
  background: var(--rt-range-bg);
}

.rt-dock__slider input[type="range"][disabled] {
  opacity: 0.4;
  cursor: default;
}

.rt-dock__slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  margin-top: calc((var(--rt-range-h) - 16px) / 2);
  border-radius: 50%;
  background: var(--rt-on-media);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: transform var(--rt-dur-2) var(--rt-ease-spring);
}

.rt-dock__slider input[type="range"]:active::-webkit-slider-thumb {
  transform: scale(1.18);
}

.rt-dock__slider input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: var(--rt-on-media);
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: transform var(--rt-dur-2) var(--rt-ease-spring);
}

.rt-dock__slider input[type="range"]:active::-moz-range-thumb {
  transform: scale(1.18);
}

/* A dot beside the label while the slider is off neutral. */
.rt-slider__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rt-accent);
  opacity: 0;
  transform: scale(0.3);
  transition: opacity var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-2) var(--rt-ease-spring);
}

.rt-slider--changed .rt-slider__dot {
  opacity: 1;
  transform: none;
}

.rt-slider--changed .rt-dock__slider-label,
.rt-slider--changed .rt-dock__slider-value {
  color: var(--rt-text-1);
}

.rt-slider--disabled .rt-dock__slider-label,
.rt-slider--disabled .rt-dock__slider-value {
  color: var(--rt-text-disabled);
}

/* Stacked dock pane (Transform: turns/straighten row above, perspective below) */

.rt-dock__stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.rt-dock__row-title {
  color: var(--rt-text-3);
  text-transform: uppercase;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

/* Curves pane: channels · full-width curve over the histogram · readout */

.rt-curves {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rt-curves__canvas {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-wash);
  box-shadow: inset 0 0 0 1px var(--rt-line);
  cursor: crosshair;
  touch-action: none;
}

.rt-curves__canvas--grab {
  cursor: grab;
}

.rt-curves__canvas--grab:active {
  cursor: grabbing;
}

.rt-curves__readout {
  min-height: 1.5em;
  margin: 0;
  color: var(--rt-text-3);
  font: var(--rt-type-xs) / 1.5 var(--rt-font-mono);
  font-variant-numeric: tabular-nums;
}

/* A channel whose curve has been shaped */
.rt-segmented__btn--touched::after {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--rt-accent);
}

/* White-balance eyedropper */

.rt-adjust__wb {
  margin-left: 2px;
}

.rt-editor__canvas-area--picking,
.rt-editor__canvas-area--picking canvas {
  cursor: crosshair !important;
}

/* Selective masks: gizmo overlay + pane */

.rt-mask-overlay {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
  overflow: visible;
  z-index: 2;
}

.rt-mask-overlay__line,
.rt-mask-overlay__ellipse {
  fill: none;
  stroke: var(--rt-on-media);
  stroke-width: calc(2 * var(--rt-px, 1px));
  stroke-dasharray: calc(6 * var(--rt-px, 1px)) calc(4 * var(--rt-px, 1px));
}

.rt-mask-overlay__handle {
  r: calc(7 * var(--rt-px, 1px));
  fill: var(--rt-accent);
  stroke: var(--rt-on-media);
  stroke-width: calc(2 * var(--rt-px, 1px));
  pointer-events: auto;
  cursor: grab;
}

.rt-mask-overlay__handle--end {
  fill: var(--rt-surface-overlay);
}

/* Transparent pixels (a cutout) read as a checkerboard, not as the stage. */
.rt-editor__canvas-container .lower-canvas,
.rt-reveal__layer {
  background: repeating-conic-gradient(#2c2c30 0% 25%, #212124 0% 50%) 0 0 / 16px 16px;
}

/* ctx.reveal: a tool's result wipes in over the photo, led by a bright edge. */
.rt-reveal {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.rt-reveal__layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.rt-reveal__edge {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: calc(2 * var(--rt-px, 1px));
  margin-left: calc(-1 * var(--rt-px, 1px));
  background: #fff;
  box-shadow:
    0 0 calc(18 * var(--rt-px, 1px)) calc(4 * var(--rt-px, 1px)) rgba(255, 255, 255, 0.5),
    0 0 calc(44 * var(--rt-px, 1px)) rgba(165, 139, 255, 0.55);
}

/* Compare: the before/after divider on the photo. Sized in --rt-px so the
   line, grip and tags keep their size however far the stage zooms. */
.rt-split {
  --rt-split: 50%;
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}

.rt-split__line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--rt-split);
  width: calc(24 * var(--rt-px, 1px));
  margin-left: calc(-12 * var(--rt-px, 1px));
  cursor: ew-resize;
  pointer-events: auto;
  touch-action: none;
}

.rt-split__line::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: calc(2 * var(--rt-px, 1px));
  margin-left: calc(-1 * var(--rt-px, 1px));
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 0 0 var(--rt-px, 1px) rgba(0, 0, 0, 0.25);
}

.rt-split__grip {
  position: absolute;
  top: 50%;
  left: 50%;
  display: grid;
  place-items: center;
  width: calc(36 * var(--rt-px, 1px));
  height: calc(36 * var(--rt-px, 1px));
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(18, 18, 20, 0.55);
  backdrop-filter: blur(8px);
  box-shadow: 0 0 0 calc(2 * var(--rt-px, 1px)) rgba(255, 255, 255, 0.92), 0 6px 18px rgba(0, 0, 0, 0.45);
  color: var(--rt-on-media);
  cursor: ew-resize;
  transform: translate(-50%, -50%);
  transition: transform var(--rt-dur-2) var(--rt-ease-spring);
}

.rt-split--dragging .rt-split__grip,
.rt-split__grip:hover {
  transform: translate(-50%, -50%) scale(1.08);
}

.rt-split__grip svg {
  width: calc(18 * var(--rt-px, 1px));
  height: calc(18 * var(--rt-px, 1px));
}

.rt-split__grip:focus-visible {
  outline: calc(2 * var(--rt-px, 1px)) solid var(--rt-focus);
  outline-offset: calc(3 * var(--rt-px, 1px));
}

.rt-split__tag {
  position: absolute;
  top: calc(12 * var(--rt-px, 1px));
  padding: calc(5 * var(--rt-px, 1px)) calc(8 * var(--rt-px, 1px));
  border-radius: calc(6 * var(--rt-px, 1px));
  background: rgba(10, 10, 12, 0.55);
  backdrop-filter: blur(6px);
  color: var(--rt-on-media);
  font: 600 calc(11 * var(--rt-px, 1px)) / 1 var(--rt-font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.rt-split__tag--before {
  left: calc(12 * var(--rt-px, 1px));
}

.rt-split__tag--after {
  right: calc(12 * var(--rt-px, 1px));
}

/* Masks pane: add buttons, the list, the selected mask's sliders */

.rt-masks {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-masks__add {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.rt-masks__add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 0 10px;
  border: 1px dashed var(--rt-line-strong);
  border-radius: var(--rt-radius-md);
  background: transparent;
  color: var(--rt-text-2);
  font: 500 var(--rt-type-md) var(--rt-font-ui);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), border-color var(--rt-dur-1) var(--rt-ease);
}

.rt-masks__add-btn:hover {
  border-color: var(--rt-line-loud);
  background: var(--rt-control);
  color: var(--rt-text-1);
}

.rt-masks__add-btn svg {
  width: 16px;
  height: 16px;
}

.rt-masks__empty {
  margin: 0;
}

.rt-masklist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rt-masklist__row {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: var(--rt-radius-md);
  transition: background-color var(--rt-dur-1) var(--rt-ease);
}

.rt-masklist__row:hover {
  background: var(--rt-surface-wash);
}

.rt-masklist__row--selected,
.rt-masklist__row--selected:hover {
  background: var(--rt-control);
  box-shadow: inset 0 0 0 1px var(--rt-line-strong);
}

.rt-masklist__select {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 34px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--rt-text-2);
  font: 500 var(--rt-type-md) var(--rt-font-ui);
  text-align: left;
  cursor: pointer;
}

.rt-masklist__select:hover,
.rt-masklist__row--selected .rt-masklist__select {
  color: var(--rt-text-1);
}

.rt-masklist__select svg {
  flex: none;
  width: 18px;
  height: 18px;
  color: var(--rt-text-3);
}

.rt-masklist__row--selected .rt-masklist__select svg {
  color: var(--rt-accent);
}

.rt-masklist__name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.rt-masklist__dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rt-accent);
  opacity: 0;
}

.rt-masklist__dot--on {
  opacity: 1;
}

.rt-masklist__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--rt-text-3);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
}

.rt-masklist__icon:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-masklist__icon[aria-pressed="true"] {
  color: var(--rt-accent);
}

.rt-masklist__icon svg {
  width: 16px;
  height: 16px;
}

/* Liquify */

.rt-liquify-overlay {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  pointer-events: auto;
  overflow: visible;
  z-index: 2;
  cursor: crosshair;
  touch-action: none;
}

/* The brush ring (liquify): its size is the brush. A dark halo under a
   light ring reads on any photo; widths divide out the stage zoom. */
.rt-liquify-overlay {
  cursor: none;
}

.rt-brush-ring {
  pointer-events: none;
}

.rt-brush-ring circle {
  fill: none;
}

.rt-brush-ring__halo {
  stroke: rgba(0, 0, 0, 0.45);
  stroke-width: calc(3.5 * var(--rt-px, 1px));
}

.rt-brush-ring__ring {
  stroke: var(--rt-on-media);
  stroke-width: calc(1.5 * var(--rt-px, 1px));
}

.rt-brush-ring .rt-brush-ring__dot {
  r: calc(2 * var(--rt-px, 1px));
  fill: var(--rt-on-media);
  stroke: rgba(0, 0, 0, 0.5);
  stroke-width: var(--rt-px, 1px);
}

.rt-liquify {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Stylize pane: effect tiles, then the effect's parameters */

.rt-stylize,
.rt-filters {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.rt-stylize__params {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-stylize__colors {
  display: flex;
  gap: 16px;
}

.rt-stylize__swatch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--rt-text-2);
  font-size: var(--rt-type-md);
  cursor: pointer;
}

.rt-stylize__color {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: none;
  cursor: pointer;
}

.rt-stylize__color::-webkit-color-swatch-wrapper {
  padding: 0;
}

.rt-stylize__color::-webkit-color-swatch {
  border: none;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.rt-stylize__color::-moz-color-swatch {
  border: none;
  border-radius: 50%;
}

/* Color mix pane: band swatches over three band-colored sliders */

.rt-hsl,
.rt-hsl__sliders {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rt-swatches {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 8px;
  padding: 4px 2px 6px;
}

.rt-swatch {
  position: relative;
  aspect-ratio: 1;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--rt-swatch);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  transition: transform var(--rt-dur-2) var(--rt-ease-spring), box-shadow var(--rt-dur-1) var(--rt-ease);
}

.rt-swatch:hover {
  transform: scale(1.08);
}

.rt-swatch[aria-pressed="true"] {
  box-shadow: 0 0 0 2px var(--rt-surface-raised), 0 0 0 4px var(--rt-swatch);
}

.rt-swatch:focus-visible {
  outline: 2px solid var(--rt-focus);
  outline-offset: 4px;
}

/* A band with changes */
.rt-swatch--touched::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -9px;
  width: 4px;
  height: 4px;
  margin-left: -2px;
  border-radius: 50%;
  background: var(--rt-text-2);
}

.rt-hsl__band {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 4px;
  color: var(--rt-text-1);
  font-size: var(--rt-type-md);
  font-weight: 600;
}

.rt-hsl__name::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 8px;
  border-radius: 50%;
  background: var(--rt-swatch);
  vertical-align: 1px;
}

/* Adjust pane: four sections of sliders */

.rt-adjust {
  display: flex;
  flex-direction: column;
}

.rt-dock__chips {
  justify-content: center;
  justify-content: safe center;
  gap: 6px;
  max-width: 100%;
}

/* Trim pane: inline stats */

.rt-trim {
  gap: 10px;
}

.rt-dock__stat {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.rt-dock__stat-label {
  font-size: 12px;
  color: var(--rt-text-3);
}

.rt-dock__stat-value {
  font-size: 12px;
  color: var(--rt-text-1);
  font-variant-numeric: tabular-nums;
}

.rt-dock__hint {
  font-size: 11px;
  color: var(--rt-text-3);
  white-space: nowrap;
  margin-left: 6px;
}

/* ── Video transport bar ───────────────────── */

.rt-video-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  flex-shrink: 0;
}

.rt-video-bar__btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: var(--rt-control);
  color: var(--rt-text-1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-video-bar__btn:hover {
  background: var(--rt-control-hover);
}

.rt-video-bar__btn svg {
  width: 16px;
  height: 16px;
}

.rt-video-bar__time {
  font-size: 12px;
  color: var(--rt-text-2);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.rt-video-bar__speed-wrap {
  position: relative;
  flex-shrink: 0;
}

.rt-video-bar__speed {
  min-width: 44px;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-control);
  color: var(--rt-text-2);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

.rt-video-bar__speed:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-video-bar__speed-menu {
  display: none;
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  z-index: 10;
  flex-direction: column;
  background: var(--rt-surface-overlay);
  border: 1px solid var(--rt-line-strong);
  border-radius: var(--rt-radius-md);
  padding: 4px;
  box-shadow: var(--rt-shadow-md);
}

.rt-video-bar__speed-menu--open {
  display: flex;
  animation: rt-pop-in var(--rt-dur-1) var(--rt-ease-decel);
  transform-origin: bottom right;
}

.rt-video-bar__speed-option {
  padding: 6px 18px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  text-align: center;
  font-family: inherit;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease);
}

.rt-video-bar__speed-option:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

/* ── Filmstrip scrubber ────────────────────── */

.rt-filmstrip {
  position: relative;
  flex: 1;
  height: 48px;
  min-width: 0;
  border-radius: var(--rt-radius-sm);
  overflow: hidden;
  background: var(--rt-surface-wash);
  cursor: pointer;
  touch-action: none;
}

.rt-filmstrip__thumbs {
  position: absolute;
  inset: 0;
  display: flex;
}

.rt-filmstrip__thumb-slot {
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
}

.rt-filmstrip__thumb-slot canvas {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}

.rt-filmstrip__shade {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--rt-scrim-heavy);
  pointer-events: none;
}

.rt-filmstrip__shade--left {
  border-radius: var(--rt-radius-sm) 0 0 var(--rt-radius-sm);
}

.rt-filmstrip__shade--right {
  border-radius: 0 var(--rt-radius-sm) var(--rt-radius-sm) 0;
}

.rt-filmstrip__playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--rt-on-media);
  box-shadow: var(--rt-shadow-sm);
  transform: translateX(-1px);
  pointer-events: none;
}

.rt-filmstrip__handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 12px;
  background: var(--rt-accent);
  cursor: ew-resize;
  display: none;
  z-index: 2;
}

.rt-filmstrip--editable .rt-filmstrip__handle {
  display: block;
}

.rt-filmstrip__handle--in {
  border-radius: var(--rt-radius-sm) 0 0 var(--rt-radius-sm);
}

.rt-filmstrip__handle--out {
  transform: translateX(-100%);
  border-radius: 0 var(--rt-radius-sm) var(--rt-radius-sm) 0;
}

.rt-filmstrip__handle::after {
  content: "";
  position: absolute;
  left: 4.5px;
  right: 4.5px;
  top: 15px;
  bottom: 15px;
  background: var(--rt-on-accent);
  opacity: 0.55;
  border-radius: 1.5px;
}

.rt-filmstrip__handle:focus-visible {
  outline: 2px solid var(--rt-on-media);
  outline-offset: 1px;
}

/* ── Export sheet ──────────────────────────── */

.rt-export-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--rt-scrim-heavy);
  backdrop-filter: blur(6px);
  animation: rt-fade-in var(--rt-dur-2) var(--rt-ease);
}

.rt-export-overlay--finished {
  animation: rt-export-out 700ms var(--rt-ease) forwards;
}

.rt-export-overlay__card {
  width: min(560px, 100%);
  max-height: calc(100vh - 32px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  border-radius: var(--rt-radius-lg);
  background: var(--rt-surface-raised);
  box-shadow: var(--rt-shadow-lg), 0 0 0 1px var(--rt-line-strong);
  color: var(--rt-text-1);
  animation: rt-pop-in var(--rt-dur-2) var(--rt-ease-decel);
}

.rt-export-overlay__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.rt-export-overlay__title {
  font-size: var(--rt-type-lg);
  font-weight: 650;
}

.rt-export-overlay__count {
  flex: none;
  font: 500 var(--rt-type-sm) / 1 var(--rt-font-mono);
  color: var(--rt-text-3);
  font-variant-numeric: tabular-nums;
}

.rt-export-overlay__bar {
  height: 4px;
  border-radius: 4px;
  background: var(--rt-control);
  overflow: hidden;
}

.rt-export-overlay__fill {
  height: 100%;
  width: 0%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--rt-accent), color-mix(in oklab, var(--rt-accent) 55%, #FFC457));
  transition: width var(--rt-dur-2) var(--rt-ease);
}

/* Every file as its picture, with a ring that fills as it exports. */
.rt-export-overlay__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 96px));
  justify-content: center;
  gap: 8px;
  min-height: 0;
  padding: 3px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--rt-line-strong) transparent;
}

.rt-export-overlay__item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  background: var(--rt-surface-overlay);
}

.rt-export-overlay__item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: filter var(--rt-dur-3) var(--rt-ease);
}

.rt-export-overlay__ext {
  display: grid;
  place-items: center;
  height: 100%;
  font: 600 var(--rt-type-xs) / 1 var(--rt-font-mono);
  color: var(--rt-text-3);
}

.rt-export-overlay__item--waiting img {
  filter: grayscale(0.7) brightness(0.5);
}

/* An outline paints over the picture, where an inset shadow wouldn't. */
.rt-export-overlay__item--active {
  outline: 2px solid var(--rt-accent);
  outline-offset: -2px;
}

.rt-export-overlay__item--error img {
  filter: grayscale(0.5) brightness(0.6);
}

.rt-export-overlay__badge {
  position: absolute;
  right: 5px;
  bottom: 5px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: var(--rt-on-media);
  transition: background-color var(--rt-dur-2) var(--rt-ease), opacity var(--rt-dur-2) var(--rt-ease);
}

.rt-export-overlay__badge > * {
  grid-area: 1 / 1;
  transition: opacity var(--rt-dur-2) var(--rt-ease);
}

.rt-export-overlay__item--waiting .rt-export-overlay__badge {
  opacity: 0;
}

.rt-export-overlay__ring {
  width: 24px;
  height: 24px;
  transform: rotate(-90deg);
}

.rt-export-overlay__ring circle {
  fill: none;
  stroke-width: 3;
}

.rt-export-overlay__ring-track {
  stroke: rgba(255, 255, 255, 0.2);
}

.rt-export-overlay__ring-fill {
  stroke: var(--rt-on-media);
  stroke-linecap: round;
  stroke-dasharray: 0 100;
  transition: stroke-dasharray var(--rt-dur-2) var(--rt-ease);
}

/* Images report no progress: a turning arc until they're done. */
.rt-export-overlay__item--active:not(.rt-export-overlay__item--measured) .rt-export-overlay__ring-fill {
  stroke-dasharray: 28 100;
}

.rt-export-overlay__item--active:not(.rt-export-overlay__item--measured) .rt-export-overlay__ring {
  animation: rt-spin 0.9s linear infinite;
}

.rt-export-overlay__badge svg:not(.rt-export-overlay__ring) {
  width: 14px;
  height: 14px;
  stroke-width: 2.6;
  opacity: 0;
}

.rt-export-overlay__bang {
  font: 700 13px / 1 var(--rt-font-ui);
  opacity: 0;
}

.rt-export-overlay__item--done .rt-export-overlay__badge {
  background: var(--rt-success);
  color: #06140D;
}

.rt-export-overlay__item--error .rt-export-overlay__badge {
  background: var(--rt-danger);
}

.rt-export-overlay__item--done .rt-export-overlay__ring,
.rt-export-overlay__item--error .rt-export-overlay__ring {
  opacity: 0;
}

.rt-export-overlay__item--done .rt-export-overlay__badge svg:not(.rt-export-overlay__ring),
.rt-export-overlay__item--error .rt-export-overlay__bang {
  opacity: 1;
}

.rt-export-overlay__foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.rt-export-overlay__eta {
  font-size: var(--rt-type-sm);
  color: var(--rt-text-2);
  font-variant-numeric: tabular-nums;
}

.rt-export-overlay__cancel {
  height: 34px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  border: 0;
  border-radius: var(--rt-radius-md);
  background: var(--rt-control);
  color: var(--rt-text-1);
  font: 600 var(--rt-type-md) / 1 var(--rt-font-ui);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-export-overlay__cancel:hover {
  background: var(--rt-control-hover);
}

.rt-export-overlay__cancel[disabled] {
  opacity: 0.6;
  cursor: default;
}

@media (pointer: coarse) {
  .rt-export-overlay__cancel {
    height: 44px;
    padding: 0 18px;
  }
}

/* ── Toasts ────────────────────────────────── */

/* Bottom center over the drop zone and gallery; just under the top bar while
   the editor is open. Either way they float over content, never a control. */
.rt-toasts {
  position: fixed;
  left: 50%;
  bottom: max(20px, calc(env(safe-area-inset-bottom, 0px) + 12px));
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  /* left: 50% would otherwise cap the stack at half the viewport */
  width: max-content;
  max-width: calc(100vw - 32px);
  pointer-events: none;
}

body:has(> .rt-editor-overlay) .rt-toasts {
  top: 64px;
  bottom: auto;
}

.rt-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: min(460px, calc(100vw - 32px));
  padding: 8px 16px 8px 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--rt-surface-overlay) 94%, transparent);
  backdrop-filter: blur(14px);
  border: 1px solid var(--rt-line-strong);
  color: var(--rt-text-1);
  font-family: var(--rt-font-ui);
  font-size: var(--rt-type-md);
  line-height: 1.4;
  box-shadow: var(--rt-shadow-lg);
  cursor: pointer;
  opacity: 0;
  transform: translateY(10px) scale(0.98);
  transition: opacity var(--rt-dur-2) var(--rt-ease-decel), transform var(--rt-dur-3) var(--rt-ease-spring);
}

.rt-toast:has(.rt-toast__action) {
  padding-right: 8px;
}

/* Under the top bar they drop in from above instead of rising. */
body:has(> .rt-editor-overlay) .rt-toast:not(.rt-toast--visible) {
  transform: translateY(-10px) scale(0.98);
}

.rt-toast--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.rt-toast__icon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 8px;
}

.rt-toast__icon svg {
  width: 16px;
  height: 16px;
}

.rt-toast--error .rt-toast__icon {
  background: var(--rt-danger-soft);
  color: var(--rt-danger-text);
}

.rt-toast--info .rt-toast__icon {
  background: var(--rt-accent-soft);
  color: var(--rt-accent-text);
}

.rt-toast--success .rt-toast__icon {
  background: color-mix(in srgb, var(--rt-success) 16%, transparent);
  color: var(--rt-success);
}

.rt-toast__body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.rt-toast__text {
  font-weight: 600;
}

.rt-toast__detail {
  font-size: var(--rt-type-sm);
  color: var(--rt-text-2);
}

.rt-toast__action {
  flex: none;
  height: 30px;
  margin-left: 6px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
  font: 600 var(--rt-type-md) / 1 var(--rt-font-ui);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-toast__action:hover {
  background: color-mix(in srgb, var(--rt-text-1) 22%, transparent);
}

@media (pointer: coarse) {
  .rt-toast__action {
    height: 40px;
    padding: 0 16px;
  }
}

/* ── AI chat (anchored to the stage corner) ── */

.rt-ai {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 20;
}

.rt-ai__trigger {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  height: 40px;
  padding: 0 13px 0 16px;
  border-radius: 999px;
  /* The prism ring marks AI, as on the rail's AI launcher. */
  border: 1.5px solid transparent;
  background:
    linear-gradient(var(--rt-surface-overlay), var(--rt-surface-overlay)) padding-box,
    var(--rt-prism) border-box;
  color: var(--rt-text-1);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--rt-shadow-md);
  transition: filter var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-ai__trigger:hover {
  filter: brightness(1.15);
}

.rt-ai__trigger svg {
  width: 15px;
  height: 15px;
  color: var(--rt-text-1);
}

.rt-ai__kbd {
  padding: 2px 5px;
  border-radius: 4px;
  border: 1px solid var(--rt-line-strong);
  background: var(--rt-control);
  color: var(--rt-text-3);
  font-size: 10px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
}

.rt-ai--open .rt-ai__trigger {
  display: none;
}

/* Vertical chat panel, anchored to the trigger corner */

.rt-ai__panel {
  display: none;
  flex-direction: column;
  width: min(400px, 86vw);
  height: min(480px, 64vh);
  min-width: 300px;
  min-height: 260px;
  max-width: 640px;
  max-height: 80vh;
  resize: both;
  border-radius: var(--rt-radius-lg);
  border: 1px solid var(--rt-line-strong);
  background: var(--rt-surface-glass);
  box-shadow: var(--rt-shadow-lg);
  backdrop-filter: blur(14px);
  overflow: hidden;
}

.rt-ai--open .rt-ai__panel {
  display: flex;
  animation: rt-pop-in var(--rt-dur-2) var(--rt-ease-decel);
  transform-origin: top right;
}

.rt-ai__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border-bottom: 1px solid var(--rt-line);
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.rt-ai__header--dragging {
  cursor: grabbing;
}

.rt-ai__header-icon {
  display: flex;
  color: var(--rt-accent-text);
}

.rt-ai__header-icon svg {
  width: 15px;
  height: 15px;
}

.rt-ai--busy .rt-ai__header-icon {
  animation: rt-ai-pulse 1s ease-in-out infinite;
}

@keyframes rt-ai-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.rt-ai__title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--rt-text-1);
}

.rt-ai__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-3);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-ai__close:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-ai__close svg {
  width: 14px;
  height: 14px;
}

.rt-ai__messages {
  flex: 1;
  min-height: 72px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  scrollbar-width: thin;
  scrollbar-color: var(--rt-line-loud) transparent;
}

.rt-ai__messages::-webkit-scrollbar {
  width: 8px;
}

.rt-ai__messages::-webkit-scrollbar-track {
  background: transparent;
}

.rt-ai__messages::-webkit-scrollbar-thumb {
  background: var(--rt-line-loud);
  border-radius: 4px;
}

.rt-ai__empty {
  font-size: 12px;
  line-height: 1.5;
  color: var(--rt-text-3);
}

.rt-ai__msg {
  max-width: 88%;
  padding: 7px 11px;
  border-radius: var(--rt-radius-md);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: break-word;
}

.rt-ai__msg--user {
  align-self: flex-end;
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  border-bottom-right-radius: 4px;
}

.rt-ai__msg--assistant,
.rt-ai__msg--busy,
.rt-ai__msg--error {
  align-self: flex-start;
  background: var(--rt-control);
  color: var(--rt-text-1);
  border-bottom-left-radius: 4px;
}

.rt-ai__msg--busy {
  color: var(--rt-text-3);
  animation: rt-ai-pulse 1.2s ease-in-out infinite;
}

.rt-ai__msg--error {
  background: var(--rt-danger-soft);
  color: var(--rt-danger-text);
}

/* One-tap prompts above the input */
.rt-ai__suggestions {
  display: flex;
  gap: 6px;
  padding: 0 12px 10px;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}

.rt-ai__suggestions::-webkit-scrollbar {
  display: none;
}

.rt-ai__suggestion {
  flex: none;
  height: 28px;
  padding: 0 11px;
  border: 1px solid var(--rt-line-strong);
  border-radius: var(--rt-radius-full);
  background: var(--rt-surface-wash);
  color: var(--rt-text-1);
  font: 500 var(--rt-type-sm) var(--rt-font-ui);
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), border-color var(--rt-dur-1) var(--rt-ease);
}

.rt-ai__suggestion:hover {
  border-color: var(--rt-line-loud);
  background: var(--rt-control-hover);
}

.rt-ai--busy .rt-ai__suggestion {
  opacity: 0.5;
  pointer-events: none;
}

/* A reply is a card: what the AI did, the values it set, and Undo. */
.rt-ai__card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: 94%;
  padding: 10px 11px;
}

.rt-ai__card-text {
  margin: 0;
}

.rt-ai__deltas {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rt-ai__deltas li {
  padding: 4px 7px;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-accent-soft);
  color: var(--rt-accent-text);
  font: 500 var(--rt-type-xs) / 1.2 var(--rt-font-mono);
  white-space: nowrap;
}

.rt-ai__card--undone .rt-ai__card-text,
.rt-ai__card--undone .rt-ai__deltas li {
  opacity: 0.55;
  text-decoration: line-through;
}

.rt-ai__undo {
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
  font: 600 var(--rt-type-sm) var(--rt-font-ui);
  cursor: pointer;
}

.rt-ai__undo:hover {
  background: var(--rt-line-loud);
}

.rt-ai__undone {
  color: var(--rt-text-3);
  font-size: var(--rt-type-xs);
}

.rt-ai__form {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-top: 1px solid var(--rt-line);
  flex-shrink: 0;
  transition: border-color var(--rt-dur-1) var(--rt-ease);
}

.rt-ai__form:focus-within {
  border-top-color: var(--rt-accent);
}

.rt-ai__input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--rt-text-1);
  font-size: 13px;
  font-family: inherit;
  caret-color: var(--rt-accent);
}

.rt-ai__input:focus-visible {
  outline: none;
}

.rt-ai__input::placeholder {
  color: var(--rt-text-3);
}

.rt-ai__send {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-ai__send:hover {
  background: var(--rt-accent-hover);
}

.rt-ai__send[disabled] {
  opacity: 0.5;
  cursor: default;
}

.rt-ai__send svg {
  width: 14px;
  height: 14px;
}

.rt-ai__popover {
  padding: 12px;
  border-top: 1px solid var(--rt-line);
  background: var(--rt-surface-wash);
}

.rt-ai__popover-text {
  font-size: 12px;
  line-height: 1.5;
  color: var(--rt-text-2);
  margin-bottom: 10px;
}

.rt-ai__popover-row {
  display: flex;
  gap: 8px;
}

.rt-ai__key-input {
  flex: 1;
  min-width: 0;
  background: var(--rt-control);
  border: 1px solid var(--rt-line);
  border-radius: var(--rt-radius-sm);
  padding: 7px 12px;
  color: var(--rt-text-1);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--rt-dur-1) var(--rt-ease);
  caret-color: var(--rt-accent);
}

.rt-ai__key-input:focus-visible {
  outline: none;
  border-color: var(--rt-accent);
}

.rt-ai__save {
  height: 32px;
  padding: 0 14px;
  display: inline-flex;
  align-items: center;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

/* ── Narrow screens ────────────────────────── */

/* The sheet's grab bar only appears in the stacked layout, and the
   header's Ask AI on phones. */
.rt-sheet__grab,
.rt-inspector__ask {
  display: none;
}

/* Hints for a keyboard, and their touch wording; a screen without hover
   gets the second. */
.rt-touch {
  display: none;
}

@media (hover: none) {
  .rt-keys {
    display: none;
  }
  .rt-touch {
    display: inline;
  }
}

/* Narrow windows and upright tablets (where three columns would leave the
   stage a sliver): the panels stack. The stage (and video transport) on
   top, the controls beneath it as a bottom sheet, and the tool rail as a
   row along the bottom edge, within thumb reach. A phone on its side keeps
   the three columns. The query is repeated in editor/layout.ts. */
@media (max-width: 760px) and (min-height: 501px), (max-width: 1024px) and (orientation: portrait) {
  .rt-editor-overlay {
    gap: 6px;
    padding:
      max(6px, env(safe-area-inset-top))
      max(6px, env(safe-area-inset-right))
      max(6px, env(safe-area-inset-bottom))
      max(6px, env(safe-area-inset-left));
  }
  .rt-editor__body {
    flex-direction: column;
    gap: 6px;
  }
  .rt-editor__center {
    flex: 1 1 auto;
    min-height: 0;
    gap: 6px;
  }
  /* The controls as a bottom sheet. sheet.ts sets its height (just the
     header, about half, or most of the screen); this is the start. */
  .rt-editor__inspector {
    order: 1;
    width: auto;
    height: min(40%, 340px);
    border-radius: 22px 22px var(--rt-radius-lg) var(--rt-radius-lg);
    transition: height var(--rt-dur-3) var(--rt-ease-decel);
  }
  .rt-sheet--dragging,
  .rt-sheet--instant {
    transition: none;
  }
  .rt-sheet--dragging,
  .rt-sheet--dragging * {
    cursor: grabbing;
  }
  .rt-sheet__grab {
    position: relative;
    display: block;
    flex: none;
    width: 100%;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 22px 22px 0 0;
    background: transparent;
    cursor: grab;
    touch-action: none;
  }
  .rt-sheet__grab::before {
    content: '';
    position: absolute;
    top: 8px;
    left: 50%;
    width: 40px;
    height: 5px;
    margin-left: -20px;
    border-radius: 3px;
    background: var(--rt-line-loud);
    transition: background-color var(--rt-dur-1) var(--rt-ease), width var(--rt-dur-2) var(--rt-ease), margin var(--rt-dur-2) var(--rt-ease);
  }
  .rt-sheet__grab:hover::before,
  .rt-sheet--dragging .rt-sheet__grab::before {
    width: 52px;
    margin-left: -26px;
    background: var(--rt-text-3);
  }
  .rt-sheet__grab:focus-visible {
    outline-offset: -3px;
  }
  /* The header drags the sheet too. */
  .rt-editor__inspector .rt-inspector__head {
    padding-top: 0;
    touch-action: none;
  }
  /* Folded: only the header shows, and the rest is out of reach of Tab. */
  .rt-editor__inspector[data-sheet="peek"] .rt-inspector__body,
  .rt-editor__inspector[data-sheet="peek"] .rt-inspector__hist {
    visibility: hidden;
  }
  .rt-toolbar {
    order: 2;
    flex-direction: row;
  }
  /* A row of tools to swipe through, settling on whole buttons. */
  .rt-toolbar__scroll {
    flex-direction: row;
    padding: 6px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 6px;
  }
  .rt-toolbar__btn {
    scroll-snap-align: start;
  }
  .rt-toolbar__sep {
    width: 1px;
    height: 24px;
    margin: 0 6px;
  }
  .rt-toolbar__groups,
  .rt-toolbar__group {
    flex-direction: row;
  }
  .rt-toolbar__group--ai {
    padding: 0 5px;
  }
  .rt-toolbar__toggle {
    display: none;
  }
  .rt-toolbar--more-after .rt-toolbar__scroll {
    mask-image: linear-gradient(to right, #000 calc(100% - 36px), transparent);
  }
  .rt-toolbar--more-before .rt-toolbar__scroll {
    mask-image: linear-gradient(to left, #000 calc(100% - 36px), transparent);
  }
  .rt-toolbar--more-before.rt-toolbar--more-after .rt-toolbar__scroll {
    mask-image: linear-gradient(to right, transparent, #000 36px, #000 calc(100% - 36px), transparent);
  }
  .rt-toolbar__btn--active::before {
    left: 12px;
    right: 12px;
    top: auto;
    bottom: -7px;
    width: auto;
    height: 3px;
  }
  .rt-editor__canvas-area {
    padding: 12px 12px 56px;
  }
}

/* A phone on its side: the three columns, made compact. */
@media (max-height: 500px) and (orientation: landscape) {
  .rt-editor-overlay {
    gap: 6px;
    padding:
      max(6px, env(safe-area-inset-top))
      max(6px, env(safe-area-inset-right))
      max(6px, env(safe-area-inset-bottom))
      max(6px, env(safe-area-inset-left));
  }
  .rt-editor__body,
  .rt-editor__center {
    gap: 6px;
  }
  .rt-editor__topbar {
    height: 44px;
  }
  .rt-editor__topbar-title {
    display: none;
  }
  .rt-editor__text-btn span {
    display: none;
  }
  .rt-editor__text-btn svg {
    display: block;
  }
  .rt-editor__inspector {
    width: 272px;
  }
  .rt-inspector__hist {
    display: none;
  }
  .rt-toolbar__toggle {
    display: none;
  }
  .rt-editor__canvas-area {
    padding: 8px 8px 52px;
  }
}

/* Phones: the top bar compacts too. The title gives way, button labels
   collapse to icons, and the action group scrolls instead of pushing Done
   off screen. */
@media (max-width: 560px) {
  .rt-editor__topbar {
    padding: 0 8px;
  }
  .rt-editor__topbar-title {
    display: none;
  }
  .rt-editor__topbar-left {
    flex: 0 0 auto;
  }
  .rt-editor__topbar-right {
    min-width: 0;
    justify-content: safe flex-end;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .rt-editor__topbar-right::-webkit-scrollbar {
    display: none;
  }
  /* The history menu would be clipped by the scrolling group; undo and redo stay. */
  .rt-editor__history .rt-history {
    display: none;
  }
  .rt-editor__btn-cancel {
    padding: 0 10px;
  }
  .rt-editor__compare-btn,
  .rt-editor__btn-capture,
  .rt-editor__text-btn {
    padding: 0 9px;
  }
  .rt-editor__compare-btn span,
  .rt-editor__btn-capture span,
  .rt-editor__text-btn span {
    display: none;
  }
  .rt-editor__text-btn svg {
    display: block;
  }
  .rt-editor__btn-done {
    padding: 0 16px;
  }
  .rt-editor__topbar-end .rt-editor__divider {
    display: none;
  }
  /* The histogram costs a phone's sheet too much room. */
  .rt-inspector__hist {
    display: none;
  }
  /* The AI tools menu spans the screen above the rail. */
  .rt-flyout {
    width: calc(100vw - 16px);
  }
  /* Curves goes wide rather than square, so the whole graph fits the sheet. */
  .rt-curves__canvas {
    aspect-ratio: 4 / 3;
  }
  .rt-editor__canvas-area {
    padding: 10px 10px 52px;
  }
  /* Video: the filmstrip takes a row of its own, the full width, so the
     trim handles have room; the buttons go under it. */
  .rt-video-bar {
    flex-wrap: wrap;
    gap: 6px 10px;
    padding: 8px;
  }
  .rt-filmstrip {
    order: -1;
    flex: 1 1 100%;
  }
  .rt-video-bar__time {
    margin-right: auto;
  }
  /* Ask AI moves from the stage's corner (where crop handles go) to the
     sheet's header; open, the chat pins under the top bar at full width,
     clear of the on-screen keyboard. */
  .rt-ai__trigger {
    display: none;
  }
  .rt-inspector__ask {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    margin: -6px -4px 0 0;
    padding: 0;
    border: 1.5px solid transparent;
    border-radius: 50%;
    background:
      linear-gradient(var(--rt-surface-overlay), var(--rt-surface-overlay)) padding-box,
      var(--rt-prism) border-box;
    color: var(--rt-text-1);
    cursor: pointer;
  }
  .rt-inspector__ask svg {
    width: 17px;
    height: 17px;
  }
  .rt-ai.rt-ai--open {
    position: fixed;
    top: calc(max(6px, env(safe-area-inset-top)) + 62px);
    right: max(8px, env(safe-area-inset-right));
    bottom: auto;
    left: max(8px, env(safe-area-inset-left));
    z-index: 30;
  }
  .rt-ai__panel {
    width: auto;
    min-width: 0;
    max-width: none;
    height: min(420px, 52dvh);
    min-height: 0;
    resize: none;
  }
  .rt-ai__header {
    cursor: default;
  }
}

/* Touch: every target a fingertip wide (44 px), the zoom controls only
   once the photo is zoomed (pinching gets you there; Fit gets you back),
   and handles on the photo with room around them to land a finger. */
@media (pointer: coarse) {
  .rt-editor__btn-cancel,
  .rt-editor__text-btn,
  .rt-editor__btn-capture,
  .rt-editor__compare-btn,
  .rt-editor__btn-done {
    height: 44px;
  }
  .rt-editor__icon-btn {
    width: 44px;
    height: 44px;
  }
  .rt-editor__canvas-area:not(.rt-stage--zoomed) .rt-zoom {
    display: none;
  }
  .rt-editor__canvas-area {
    padding-bottom: 12px;
    touch-action: none;
    -webkit-touch-callout: none;
    user-select: none;
  }
  .rt-zoom button {
    height: 40px;
    min-width: 40px;
  }
  .rt-inspector__reset {
    height: 36px;
    padding: 0 14px;
  }
  .rt-section--collapsible > .rt-section__head {
    min-height: 44px;
  }
  .rt-segmented__btn {
    height: 40px;
  }
  .rt-dock__icon-btn,
  .rt-transform-btns .rt-dock__icon-btn {
    width: 44px;
    height: 44px;
  }
  .rt-dock__chip {
    height: 40px;
    padding: 0 16px;
  }
  .rt-masks__add-btn,
  .rt-masklist__select {
    height: 44px;
  }
  .rt-masklist__icon {
    width: 44px;
    height: 44px;
  }
  input.rt-dock__slider-value {
    width: 64px;
    height: 40px;
  }
  /* Color mix's eight swatches share one row; each catches touches into the gaps. */
  .rt-swatch::before {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: 50%;
  }
  /* iOS zooms the page in on any field set under 16 px. */
  .rt-editor-overlay input:not([type="range"]):not([type="checkbox"]):not([type="radio"]),
  .rt-editor-overlay textarea {
    font-size: 16px;
  }
  /* Sliders: a bigger thumb, on a taller strip that's easier to catch. */
  .rt-dock__slider input[type="range"] {
    height: 32px;
  }
  .rt-dock__slider input[type="range"]::-webkit-slider-thumb {
    width: 24px;
    height: 24px;
    margin-top: calc((var(--rt-range-h) - 24px) / 2);
  }
  .rt-dock__slider input[type="range"]::-moz-range-thumb {
    width: 24px;
    height: 24px;
  }
  .rt-crop__handle {
    --rt-handle-offset: calc(-8 * var(--rt-px, 1px));
    width: calc(16 * var(--rt-px, 1px));
    height: calc(16 * var(--rt-px, 1px));
  }
  .rt-crop__handle::before {
    content: '';
    position: absolute;
    inset: calc(-14 * var(--rt-px, 1px));
  }
  .rt-mask-overlay__handle {
    r: calc(12 * var(--rt-px, 1px));
  }
  .rt-split__line {
    width: calc(44 * var(--rt-px, 1px));
    margin-left: calc(-22 * var(--rt-px, 1px));
  }
  .rt-split__grip {
    width: calc(44 * var(--rt-px, 1px));
    height: calc(44 * var(--rt-px, 1px));
  }
  .rt-video-bar__btn {
    width: 44px;
    height: 44px;
  }
  .rt-video-bar__speed {
    height: 44px;
    min-width: 52px;
  }
  .rt-video-bar__speed-option {
    padding: 11px 22px;
    font-size: 13px;
  }
  .rt-filmstrip__handle {
    width: 22px;
  }
  .rt-flyout__item {
    min-height: 52px;
  }
  .rt-flyout__pin {
    width: 44px;
    height: 44px;
  }
  .rt-ai__trigger {
    height: 44px;
  }
  .rt-ai__send,
  .rt-ai__close {
    width: 44px;
    height: 44px;
  }
  .rt-ai__suggestion {
    min-height: 40px;
  }
  .rt-ai__kbd {
    display: none;
  }
}

/* ── Motion ────────────────────────────────── */

@keyframes rt-overlay-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes rt-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes rt-pane-in {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: none; }
}

@keyframes rt-pop-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

/* The selection loop, drawn on like a grease pencil */
@property --rt-sweep {
  syntax: '<angle>';
  inherits: false;
  initial-value: 360deg;
}

@keyframes rt-loop-draw {
  from { --rt-sweep: 0deg; }
  to { --rt-sweep: 360deg; }
}

@keyframes rt-spin {
  from { transform: rotate(-90deg); }
  to { transform: rotate(270deg); }
}

/* The export sheet holds its checks a beat, then lets go */
@keyframes rt-export-out {
  0%, 55% { opacity: 1; }
  100% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .rt-root, .rt-root *, .rt-root *::before, .rt-root *::after,
  .rt-editor-overlay, .rt-editor-overlay *, .rt-editor-overlay *::before, .rt-editor-overlay *::after,
  .rt-export-overlay, .rt-export-overlay *, .rt-export-overlay *::before, .rt-export-overlay *::after,
  .rt-toasts, .rt-toasts *, .rt-toasts *::before, .rt-toasts *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;

let injected = false;

export function injectStyles(): void {
  if (injected) return;
  // Tokens go first in <head> so their layer ranks below any layer the host
  // declares. Component rules stay appended after the host's stylesheets,
  // as they always were, so host resets can't win ties against them.
  if (!document.getElementById(TOKENS_ID)) {
    const tokens = document.createElement("style");
    tokens.id = TOKENS_ID;
    tokens.textContent = TOKENS;
    document.head.prepend(tokens);
  }
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  injected = true;
}
