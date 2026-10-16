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
.rt-gallery__view-btn:active,
.rt-gallery__item-edit:active,
.rt-gallery__item-download:active,
.rt-gallery__names-btn:active,
.rt-video-bar__btn:active,
.rt-video-bar__speed:active,
.rt-video-bar__speed-option:active,
.rt-export-overlay__cancel:active,
.rt-ai__send:active:not([disabled]),
.rt-ai__save:active,
.rt-ai__close:active {
  transform: scale(0.97);
}

/* ── Drop Zone ─────────────────────────────── */

.rt-dropzone-wrapper {
  background: var(--rt-surface-raised);
  border-radius: var(--rt-radius-xl);
  padding: 24px;
  box-shadow: var(--rt-shadow-md);
}

.rt-dropzone {
  width: 100%;
  border: 2px dashed var(--rt-line-strong);
  border-radius: var(--rt-radius-lg);
  padding: 48px 32px;
  text-align: center;
  cursor: pointer;
  transition: border-color var(--rt-dur-2) var(--rt-ease), background-color var(--rt-dur-2) var(--rt-ease);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.rt-dropzone::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--rt-accent-soft);
  opacity: 0;
  transition: opacity var(--rt-dur-2) var(--rt-ease);
}

.rt-dropzone:hover {
  border-color: var(--rt-accent);
}

.rt-dropzone:hover::before {
  opacity: 1;
}

.rt-dropzone--active {
  border-color: var(--rt-accent);
  border-style: solid;
  background: var(--rt-accent-soft);
}

.rt-dropzone--active .rt-dropzone__icon {
  background: var(--rt-accent);
  transform: scale(1.1);
}

.rt-dropzone--active .rt-dropzone__icon svg {
  color: var(--rt-on-accent);
}

.rt-dropzone__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--rt-surface-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  transition: background-color var(--rt-dur-2) var(--rt-ease), transform var(--rt-dur-2) var(--rt-ease);
}

.rt-dropzone:hover .rt-dropzone__icon {
  background: var(--rt-accent-glow);
  transform: scale(1.05);
}

.rt-dropzone__icon svg {
  width: 24px;
  height: 24px;
  color: var(--rt-text-2);
  transition: color var(--rt-dur-2) var(--rt-ease);
}

.rt-dropzone:hover .rt-dropzone__icon svg {
  color: var(--rt-accent-text);
}

.rt-dropzone__text {
  font-size: 15px;
  color: var(--rt-text-2);
  margin-bottom: 4px;
  position: relative;
}

.rt-dropzone__text strong {
  color: var(--rt-accent-text);
  font-weight: 500;
}

.rt-dropzone__hint {
  font-size: 12px;
  color: var(--rt-text-3);
  position: relative;
}

/* ── Gallery ───────────────────────────────── */

.rt-gallery {
  background: var(--rt-surface-raised);
  border-radius: var(--rt-radius-xl);
  padding: 24px;
  box-shadow: var(--rt-shadow-md);
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

.rt-gallery__toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  row-gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--rt-line);
}

.rt-gallery__views {
  display: flex;
  gap: 4px;
}

.rt-gallery__view-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--rt-line);
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-3);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), border-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.rt-gallery__view-btn svg {
  width: 16px;
  height: 16px;
}

.rt-gallery__view-btn:hover {
  border-color: var(--rt-line-strong);
  color: var(--rt-text-1);
}

.rt-gallery__view-btn--active {
  background: var(--rt-accent);
  border-color: var(--rt-accent);
  color: var(--rt-on-accent);
}

.rt-gallery__view-btn--active:hover {
  background: var(--rt-accent-hover);
  border-color: var(--rt-accent-hover);
  color: var(--rt-on-accent);
}

.rt-gallery__add-zone {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border: 1.5px dashed var(--rt-line-strong);
  border-radius: var(--rt-radius-md);
  background: transparent;
  color: var(--rt-text-2);
  font-size: 13px;
  cursor: pointer;
  transition: border-color var(--rt-dur-1) var(--rt-ease), background-color var(--rt-dur-1) var(--rt-ease);
  user-select: none;
}

.rt-gallery__add-zone strong {
  color: var(--rt-accent-text);
  font-weight: 500;
}

.rt-gallery__add-zone:hover,
.rt-gallery__add-zone--active {
  border-color: var(--rt-accent);
  background: var(--rt-accent-soft);
}

.rt-gallery__add-zone--active {
  border-style: solid;
}

.rt-gallery__add-zone svg {
  width: 16px;
  height: 16px;
  color: var(--rt-text-3);
  transition: color var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__add-zone:hover svg,
.rt-gallery__add-zone--active svg {
  color: var(--rt-accent-text);
}

/* Done — the host's exit, so it wears the primary treatment */
.rt-gallery__done {
  display: inline-flex;
  align-items: center;
  align-self: stretch; /* same height as the add zone beside it */
  margin-left: 12px;
  padding: 0 20px;
  border: 1.5px solid transparent;
  border-radius: var(--rt-radius-md);
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), opacity var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__done:hover {
  background: var(--rt-accent-hover);
}

.rt-gallery__done[disabled] {
  opacity: 0.5;
  cursor: progress;
}

.rt-gallery__content--dropping {
  outline: 2px dashed var(--rt-accent);
  outline-offset: 6px;
  border-radius: var(--rt-radius-md);
}

/* ── Column layouts (cols-2, cols-3, cols-4) ── */

.rt-gallery__cols {
  display: grid;
  gap: 12px;
  align-items: start;
}

.rt-gallery__cols--2 { grid-template-columns: repeat(2, 1fr); }
.rt-gallery__cols--3 { grid-template-columns: repeat(3, 1fr); }
.rt-gallery__cols--4 { grid-template-columns: repeat(4, 1fr); }

@media (max-width: 480px) {
  .rt-gallery__cols--3 { grid-template-columns: repeat(2, 1fr); }
  .rt-gallery__cols--4 { grid-template-columns: repeat(2, 1fr); }
}

/* ── Flow item (natural aspect ratio card) ── */

.rt-gallery__flow-item {
  position: relative;
  border-radius: var(--rt-radius-md);
  overflow: hidden;
  cursor: pointer;
}

.rt-gallery__flow-item img {
  width: 100%;
  height: auto;
  display: block;
  transition: transform var(--rt-dur-3) var(--rt-ease);
}

.rt-gallery__flow-item:hover img {
  transform: scale(1.03);
}

/* ── Width-fit (single column, full width) ── */

.rt-gallery__width-fit {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Height-fit (horizontal filmstrip) ──── */

.rt-gallery__height-fit {
  display: flex;
  flex-direction: row;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 8px;
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
  scrollbar-color: var(--rt-line-strong) transparent;
}

.rt-gallery__height-fit::-webkit-scrollbar {
  height: 6px;
}

.rt-gallery__height-fit::-webkit-scrollbar-track {
  background: var(--rt-surface-subtle);
  border-radius: 3px;
}

.rt-gallery__height-fit::-webkit-scrollbar-thumb {
  background: var(--rt-line-strong);
  border-radius: 3px;
}

.rt-gallery__height-fit-item {
  position: relative;
  flex-shrink: 0;
  border-radius: var(--rt-radius-md);
  overflow: hidden;
  cursor: pointer;
}

.rt-gallery__height-fit-item img {
  height: 100%;
  width: auto;
  display: block;
  transition: transform var(--rt-dur-3) var(--rt-ease);
}

.rt-gallery__height-fit-item:hover img {
  transform: scale(1.03);
}

/* ── Shared overlay ──────────────────────── */

.rt-gallery__item-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, var(--rt-scrim-heavy) 0%, transparent 55%);
  opacity: 0;
  transition: opacity var(--rt-dur-2) var(--rt-ease);
  display: flex;
  align-items: flex-end;
  padding: 12px;
}

.rt-gallery__flow-item:hover .rt-gallery__item-overlay,
.rt-gallery__height-fit-item:hover .rt-gallery__item-overlay {
  opacity: 1;
}

.rt-gallery__item-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 8px;
}

.rt-gallery__item-name {
  font-size: 12px;
  color: var(--rt-on-media);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1;
}

.rt-gallery__item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.rt-gallery__item-download {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: var(--rt-glass);
  color: var(--rt-on-media);
  border: none;
  border-radius: var(--rt-radius-sm);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  backdrop-filter: blur(4px);
}

.rt-gallery__item-download:hover {
  background: var(--rt-glass-hover);
  transform: translateY(-1px);
}

.rt-gallery__item-download svg {
  width: 16px;
  height: 16px;
}

.rt-gallery__item-edit {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: var(--rt-accent);
  color: var(--rt-on-accent);
  border: none;
  border-radius: var(--rt-radius-sm);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
  text-transform: uppercase;
}

.rt-gallery__item-edit:hover {
  background: var(--rt-accent-hover);
  transform: translateY(-1px);
}

.rt-gallery__item-edit svg {
  width: 13px;
  height: 13px;
}

.rt-gallery__item-status {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--rt-on-media);
}

.rt-gallery__item-status--edited {
  background: var(--rt-success);
}

.rt-gallery__item-status--pending {
  background: var(--rt-line-loud);
}

.rt-gallery__item-remove {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--rt-scrim);
  border: none;
  color: var(--rt-on-media);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--rt-dur-2) var(--rt-ease), background-color var(--rt-dur-1) var(--rt-ease);
  backdrop-filter: blur(4px);
  z-index: 1;
}

.rt-gallery__flow-item:hover .rt-gallery__item-remove,
.rt-gallery__height-fit-item:hover .rt-gallery__item-remove {
  opacity: 1;
}

.rt-gallery__item-remove:hover {
  background: var(--rt-danger);
}

.rt-gallery__item-remove svg {
  width: 12px;
  height: 12px;
}

/* ── List view ─────────────────────────────── */

.rt-gallery__names {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rt-gallery__names-item {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border-radius: var(--rt-radius-md);
  transition: background-color var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__names-item:hover {
  background: var(--rt-surface-subtle);
}

.rt-gallery__names-thumb {
  width: 44px;
  height: 44px;
  object-fit: cover;
  border-radius: var(--rt-radius-sm);
  display: block;
  background: var(--rt-surface-subtle);
}

.rt-gallery__names-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rt-gallery__names-filename {
  font-size: 13px;
  font-weight: 500;
  color: var(--rt-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rt-gallery__names-size {
  font-size: 11px;
  color: var(--rt-text-3);
  font-variant-numeric: tabular-nums;
}

.rt-gallery__names-status {
  display: flex;
  align-items: center;
}

.rt-gallery__names-status .rt-gallery__item-status {
  position: static;
  border-color: transparent;
}

.rt-gallery__names-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__names-item:hover .rt-gallery__names-actions,
.rt-gallery__names-item:focus-within .rt-gallery__names-actions {
  opacity: 1;
}

.rt-gallery__names-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  cursor: pointer;
  transition: background-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-gallery__names-btn:hover {
  background: var(--rt-control-hover);
  color: var(--rt-text-1);
}

.rt-gallery__names-btn svg {
  width: 16px;
  height: 16px;
}

/* ── Editor ────────────────────────────────── */

/* The darkroom: floating panels (top bar, tool rail, stage, inspector) on a
   graphite ground, so the photo is the brightest thing on screen. */
.rt-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--rt-surface);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px;
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

/* Tool rail: grouped icon buttons; names and shortcuts live in a tooltip. */
.rt-toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 6px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  flex-shrink: 0;
}

.rt-toolbar::-webkit-scrollbar {
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

.rt-toolbar__label {
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
  width: 316px;
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

.rt-flyout__item {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
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

/* ── Video gallery badges ──────────────────── */

.rt-gallery__item-duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rt-scrim-heavy);
  color: var(--rt-on-media);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  z-index: 1;
}

.rt-gallery__item-play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--rt-scrim);
  color: var(--rt-on-media);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
  backdrop-filter: blur(4px);
}

.rt-gallery__item-play svg {
  width: 22px;
  height: 22px;
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

/* ── Export overlay ────────────────────────── */

.rt-export-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: var(--rt-scrim-heavy);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: rt-fade-in var(--rt-dur-2) var(--rt-ease);
}

.rt-export-overlay__card {
  width: min(420px, 90vw);
  background: var(--rt-surface-overlay);
  border: 1px solid var(--rt-line-strong);
  border-radius: var(--rt-radius-lg);
  padding: 24px;
  color: var(--rt-text-1);
  box-shadow: var(--rt-shadow-lg);
  animation: rt-pop-in var(--rt-dur-2) var(--rt-ease-decel);
}

.rt-export-overlay__title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 16px;
}

.rt-export-overlay__row {
  margin: 12px 0;
}

.rt-export-overlay__name {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--rt-text-2);
}

.rt-export-overlay__name span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-export-overlay__pct {
  font-variant-numeric: tabular-nums;
  color: var(--rt-text-3);
  flex-shrink: 0;
}

.rt-export-overlay__bar {
  height: 4px;
  background: var(--rt-control);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.rt-export-overlay__fill {
  height: 100%;
  width: 0%;
  background: var(--rt-accent);
  transition: width var(--rt-dur-1) var(--rt-ease);
}

.rt-export-overlay__fill--error {
  background: var(--rt-danger);
}

.rt-export-overlay__cancel {
  margin-top: 16px;
  height: 32px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--rt-line-strong);
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
  font-family: inherit;
}

.rt-export-overlay__cancel:hover {
  border-color: var(--rt-line-loud);
  color: var(--rt-text-1);
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
  padding: 8px 14px 8px 8px;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-overlay);
  border: 1px solid var(--rt-line-strong);
  color: var(--rt-text-1);
  font-family: var(--rt-font-ui);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  box-shadow: var(--rt-shadow-lg);
  cursor: pointer;
  opacity: 0;
  transform: translateY(10px) scale(0.98);
  transition: opacity var(--rt-dur-2) var(--rt-ease-decel), transform var(--rt-dur-2) var(--rt-ease-decel);
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
  width: 26px;
  height: 26px;
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

/* Narrow windows and upright tablets (where three columns would leave the
   stage a sliver): the panels stack. The stage (and video transport) on
   top, the inspector beneath it, and the tool rail as a row along the
   bottom edge, within thumb reach. */
@media (max-width: 760px), (max-width: 1024px) and (orientation: portrait) {
  .rt-editor-overlay {
    gap: 6px;
    padding: 6px;
  }
  .rt-editor__body {
    flex-direction: column;
    gap: 6px;
  }
  .rt-editor__center {
    flex: 1 1 auto;
    min-height: 200px;
    gap: 6px;
  }
  .rt-editor__inspector {
    order: 1;
    width: auto;
    max-height: 42vh;
  }
  .rt-toolbar {
    order: 2;
    flex-direction: row;
    padding: 6px;
    overflow-x: auto;
    overflow-y: hidden;
  }
  .rt-toolbar__sep {
    width: 1px;
    height: 24px;
    margin: 0 6px;
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
  .rt-editor__btn-capture {
    padding: 0 9px;
  }
  .rt-editor__compare-btn span,
  .rt-editor__btn-capture span {
    display: none;
  }
  .rt-editor__btn-done {
    padding: 0 16px;
  }
  .rt-editor__topbar-end .rt-editor__divider {
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
