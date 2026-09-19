const STYLE_ID = "rt-styles";

const CSS = /* css */ `
/* ═══════════════════════════════════════════════════════════════════════
   Design tokens — "Warm Atelier / Neutral Darkroom".
   The shell (drop zone + gallery) is warm gallery-paper; the editor,
   export progress, and toasts invert to a true-neutral darkroom so the
   chrome never color-casts the image being judged. One terracotta accent
   spans both worlds. Embedders theme by overriding these custom
   properties: light values on .rt-root, dark values on the three
   body-attached overlay roots below.
   ═══════════════════════════════════════════════════════════════════════ */

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
  /* Accent (terracotta — deep on paper, luminous in the dark) */
  --rt-accent: #D4572A;
  --rt-accent-hover: #BF4D25;
  --rt-accent-soft: rgba(212, 87, 42, 0.08);
  --rt-accent-glow: rgba(212, 87, 42, 0.14);
  --rt-accent-text: #B84A20;
  --rt-on-accent: #221008;
  /* Status */
  --rt-success: #1FA355;
  --rt-danger: #C64830;
  --rt-danger-soft: rgba(198, 72, 48, 0.12);
  --rt-danger-text: #B03A25;
  --rt-focus: #D4572A;
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
  /* Elevation */
  --rt-shadow-sm: 0 1px 3px rgba(26, 24, 21, 0.07);
  --rt-shadow-md: 0 4px 16px rgba(26, 24, 21, 0.08);
  --rt-shadow-lg: 0 16px 48px rgba(26, 24, 21, 0.14);
  /* Radii */
  --rt-radius-sm: 6px;
  --rt-radius-md: 10px;
  --rt-radius-lg: 16px;
  --rt-radius-xl: 24px;
  /* Motion */
  --rt-dur-1: 120ms;
  --rt-dur-2: 200ms;
  --rt-dur-3: 320ms;
  --rt-ease: cubic-bezier(0.2, 0, 0, 1);
  --rt-ease-decel: cubic-bezier(0.05, 0.7, 0.1, 1);
  /* Layout */
  --rt-dock-h: 128px;

  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

/* Darkroom overrides — the editor and its body-attached siblings. Every
   descendant (menus, AI panel, compare panes, tool overlays) inherits. */
.rt-editor-overlay, .rt-export-overlay, .rt-toasts {
  --rt-surface: #141414;
  --rt-surface-raised: #1D1D1D;
  --rt-surface-overlay: #262626;
  --rt-surface-subtle: #101010;
  --rt-surface-wash: rgba(255, 255, 255, 0.04);
  --rt-surface-glass: rgba(22, 22, 22, 0.9);
  --rt-control: rgba(255, 255, 255, 0.07);
  --rt-control-hover: rgba(255, 255, 255, 0.13);
  --rt-text-1: rgba(255, 255, 255, 0.93);
  --rt-text-2: rgba(255, 255, 255, 0.7);
  --rt-text-3: rgba(255, 255, 255, 0.54);
  --rt-text-disabled: rgba(255, 255, 255, 0.35);
  --rt-line: rgba(255, 255, 255, 0.07);
  --rt-line-strong: rgba(255, 255, 255, 0.16);
  --rt-line-loud: rgba(255, 255, 255, 0.32);
  --rt-accent: #E8703C;
  --rt-accent-hover: #F0824F;
  --rt-accent-soft: rgba(232, 112, 60, 0.12);
  --rt-accent-glow: rgba(232, 112, 60, 0.18);
  --rt-accent-text: #E8703C;
  --rt-success: #3DCB77;
  --rt-danger: #E5533D;
  --rt-danger-soft: rgba(229, 83, 61, 0.14);
  --rt-danger-text: #F08E7D;
  --rt-focus: #E8703C;
  --rt-track: rgba(255, 255, 255, 0.14);
  --rt-track-fill: rgba(255, 255, 255, 0.5);
  --rt-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --rt-shadow-md: 0 8px 28px rgba(0, 0, 0, 0.45);
  --rt-shadow-lg: 0 16px 56px rgba(0, 0, 0, 0.55);
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
.rt-dock__filter-btn:active,
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

.rt-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--rt-surface);
  display: flex;
  flex-direction: column;
  animation: rt-overlay-in var(--rt-dur-3) var(--rt-ease-decel);
}

.rt-editor-overlay:focus {
  outline: none;
}

/* Three-zone top bar: Cancel | title (truly centered) | actions + Done */
.rt-editor__topbar {
  display: flex;
  align-items: center;
  height: 52px;
  padding: 0 16px;
  background: var(--rt-surface-raised);
  border-bottom: 1px solid var(--rt-line);
  flex-shrink: 0;
}

/* Control tray — clearly separated from the stage above it */
.rt-editor__tray {
  display: flex;
  flex-direction: column;
  background: var(--rt-surface-raised);
  border-top: 1px solid var(--rt-line);
  flex-shrink: 0;
}

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
}

.rt-editor__topbar-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
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
}

.rt-editor__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rt-toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 10px;
  background: var(--rt-surface-raised);
  border-right: 1px solid var(--rt-line);
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 76px;
  padding: 12px 0 10px;
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
  background: var(--rt-accent-glow);
  color: var(--rt-accent-text);
}

.rt-toolbar__btn--touched::after {
  content: '';
  position: absolute;
  top: 8px;
  right: 10px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--rt-accent);
}

.rt-toolbar__btn svg {
  width: 20px;
  height: 20px;
}

.rt-toolbar__btn span {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

/* ── Canvas area ───────────────────────────── */

.rt-editor__canvas-area {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  padding: 16px 24px;
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

.rt-compare-pane canvas {
  max-width: 100%;
  max-height: 100%;
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

.rt-editor__canvas-container {
  position: relative;
  max-width: 100%;
  max-height: 100%;
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

.rt-crop__mask {
  position: absolute;
  background: var(--rt-scrim);
  pointer-events: none;
}

.rt-crop__selection {
  position: absolute;
  border: 2px solid var(--rt-on-media);
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
  border-right: 1px solid var(--rt-on-media-faint);
  border-bottom: 1px solid var(--rt-on-media-faint);
}

.rt-crop__grid-cell:nth-child(3n) { border-right: none; }
.rt-crop__grid-cell:nth-child(n+7) { border-bottom: none; }

.rt-crop__handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: var(--rt-on-media);
  border-radius: 2px;
  box-shadow: var(--rt-shadow-sm);
  pointer-events: auto;
}

.rt-crop__handle--nw { top: -6px; left: -6px; cursor: nw-resize; }
.rt-crop__handle--ne { top: -6px; right: -6px; cursor: ne-resize; }
.rt-crop__handle--sw { bottom: -6px; left: -6px; cursor: sw-resize; }
.rt-crop__handle--se { bottom: -6px; right: -6px; cursor: se-resize; }
.rt-crop__handle--n { top: -6px; left: 50%; transform: translateX(-50%); cursor: n-resize; }
.rt-crop__handle--s { bottom: -6px; left: 50%; transform: translateX(-50%); cursor: s-resize; }
.rt-crop__handle--w { top: 50%; left: -6px; transform: translateY(-50%); cursor: w-resize; }
.rt-crop__handle--e { top: 50%; right: -6px; transform: translateY(-50%); cursor: e-resize; }

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

.rt-dock__pane {
  width: 100%;
  min-width: 0;
  animation: rt-pane-in var(--rt-dur-2) var(--rt-ease-decel);
}

.rt-dock__row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-width: 0;
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
  font-size: 12px;
  color: var(--rt-text-3);
  white-space: nowrap;
  flex-shrink: 0;
}

.rt-dock__slider-value {
  font-size: 12px;
  color: var(--rt-text-2);
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rt-dock__slider input[type="range"] {
  width: 220px;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  border-radius: 2px;
  flex-shrink: 0;
  /* Filled between the anchor (--rt-fill-a) and the thumb (--rt-fill-b);
     set by refreshRangeFill. Unwired inputs degrade to an empty track. */
  background: linear-gradient(to right,
    var(--rt-track) min(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)),
    var(--rt-track-fill) min(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)) max(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)),
    var(--rt-track) max(var(--rt-fill-a, 0%), var(--rt-fill-b, 0%)));
}

.rt-dock__slider input[type="range"][disabled] {
  opacity: 0.4;
}

.rt-dock__slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: var(--rt-on-media);
  border-radius: 50%;
  box-shadow: var(--rt-shadow-sm);
  cursor: pointer;
  transition: transform var(--rt-dur-1) var(--rt-ease);
}

.rt-dock__slider input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.rt-dock__slider input[type="range"]::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border: none;
  background: var(--rt-on-media);
  border-radius: 50%;
  box-shadow: var(--rt-shadow-sm);
  cursor: pointer;
  transition: transform var(--rt-dur-1) var(--rt-ease);
}

.rt-dock__slider input[type="range"]::-moz-range-thumb:hover {
  transform: scale(1.15);
}

/* Stacked dock pane (Transform: turns/straighten row above, perspective below) */

.rt-dock__stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.rt-dock__stack .rt-dock__slider input[type="range"] {
  width: 170px;
}

.rt-dock__row-title {
  color: var(--rt-text-3);
  text-transform: uppercase;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

/* Curves pane: channel chips · curve canvas over histogram · reset */

.rt-curves {
  gap: 12px;
}

.rt-curves__canvas {
  width: 196px;
  height: 104px;
  border-radius: var(--rt-radius-md);
  cursor: crosshair;
  touch-action: none;
  flex-shrink: 0;
}

.rt-curves__channels {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rt-curves__chip {
  height: 22px;
  padding: 0 10px;
  font-size: 11px;
  border-left: 3px solid var(--rt-curve-color, transparent);
  border-radius: var(--rt-radius-sm);
}

.rt-curves__side {
  display: flex;
  flex-direction: column;
  gap: 6px;
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
  stroke-width: 2;
  stroke-dasharray: 6 4;
}

.rt-mask-overlay__handle {
  fill: var(--rt-accent);
  stroke: var(--rt-on-media);
  stroke-width: 2;
  pointer-events: auto;
  cursor: grab;
}

.rt-mask-overlay__handle--end {
  fill: var(--rt-surface-overlay);
}

.rt-masks .rt-dock__slider input[type="range"] {
  width: 200px;
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

.rt-liquify-overlay__cursor {
  fill: var(--rt-glass);
  stroke: var(--rt-on-media);
  stroke-width: 1.5;
  pointer-events: none;
}

.rt-liquify__hint {
  white-space: nowrap;
  opacity: 0.8;
}

/* Stylize pane */

.rt-stylize__color {
  width: 34px;
  height: 26px;
  padding: 2px;
  border: 1px solid var(--rt-line-strong);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-control);
  cursor: pointer;
}

/* HSL mixer pane */

.rt-hsl__slider input[type="range"] {
  width: 150px;
}

.rt-hsl__chip {
  border-left: 3px solid var(--rt-band-color, transparent);
  border-radius: var(--rt-radius-sm);
}

/* Adjust pane: slider row above, adjustment chips below */

.rt-adjust {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.rt-adjust .rt-dock__slider input[type="range"] {
  width: min(380px, 42vw);
}

.rt-dock__chips {
  justify-content: center;
  justify-content: safe center;
  gap: 6px;
  max-width: 100%;
}

/* Filters pane: intensity above, thumbnail filmstrip below */

.rt-filters {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.rt-dock__filters {
  display: flex;
  gap: 10px;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
  justify-content: center;
  justify-content: safe center;
  padding: 2px 4px;
}

.rt-dock__filters::-webkit-scrollbar {
  display: none;
}

.rt-dock__filter-btn {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 58px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
  transition: transform var(--rt-dur-1) var(--rt-ease);
}

.rt-dock__filter-thumb {
  width: 58px;
  height: 58px;
  object-fit: cover;
  display: block;
  border-radius: var(--rt-radius-md);
  border: 2px solid transparent;
  transition: border-color var(--rt-dur-1) var(--rt-ease);
}

.rt-dock__filter-btn:hover .rt-dock__filter-thumb {
  border-color: var(--rt-line-loud);
}

.rt-dock__filter-btn--active .rt-dock__filter-thumb {
  border-color: var(--rt-accent);
}

.rt-dock__filter-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--rt-text-3);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--rt-dur-1) var(--rt-ease);
}

.rt-dock__filter-btn--active .rt-dock__filter-label {
  color: var(--rt-accent-text);
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
  padding: 10px 16px 0;
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

.rt-toasts {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10001;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  pointer-events: none;
}

.rt-toast {
  pointer-events: auto;
  max-width: min(440px, 90vw);
  padding: 10px 16px;
  border-radius: var(--rt-radius-md);
  background: var(--rt-surface-overlay);
  border: 1px solid var(--rt-line-strong);
  color: var(--rt-text-1);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: var(--rt-shadow-md);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
  transition: opacity var(--rt-dur-2) var(--rt-ease-decel), transform var(--rt-dur-2) var(--rt-ease-decel);
}

.rt-toast--visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.rt-toast--error {
  border-left: 3px solid var(--rt-danger);
}

.rt-toast--info {
  border-left: 3px solid var(--rt-accent);
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
  border: 1px solid var(--rt-line-strong);
  background: var(--rt-surface-glass);
  color: var(--rt-text-1);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  box-shadow: var(--rt-shadow-md);
  backdrop-filter: blur(8px);
  transition: border-color var(--rt-dur-1) var(--rt-ease), color var(--rt-dur-1) var(--rt-ease), transform var(--rt-dur-1) var(--rt-ease);
}

.rt-ai__trigger:hover {
  border-color: var(--rt-line-loud);
  color: var(--rt-text-1);
}

.rt-ai__trigger svg {
  width: 15px;
  height: 15px;
  color: var(--rt-accent-text);
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
  if (injected || document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
  injected = true;
}
