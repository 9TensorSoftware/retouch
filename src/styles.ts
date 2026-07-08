const STYLE_ID = "rt-styles";

const CSS = /* css */ `
/* Tokens live on every mount point — .rt-root plus the overlays that attach
   straight to <body> (editor, export progress, toasts). */
.rt-root, .rt-editor-overlay, .rt-export-overlay, .rt-toasts {
  --rt-bg: #F7F5F2;
  --rt-bg-elevated: #FFFFFF;
  --rt-bg-subtle: #EEEAE5;
  --rt-border: #DDD8D0;
  --rt-border-strong: #C5BFB5;
  --rt-text: #1A1815;
  --rt-text-secondary: #6B6560;
  --rt-text-tertiary: #9E9890;
  --rt-accent: #E8703C;
  --rt-accent-hover: #D4572A;
  --rt-accent-soft: rgba(232, 112, 60, 0.1);
  --rt-accent-glow: rgba(232, 112, 60, 0.16);
  /* Editor (dark) — dark stage for the media, a lighter tray for controls */
  --rt-dark-stage: #18181A;
  --rt-dark-tray: #222226;
  --rt-dark-elevated: #2E2E30;
  --rt-dark-line: rgba(255,255,255,0.08);
  --rt-shadow-sm: 0 1px 3px rgba(26,24,21,0.06);
  --rt-shadow-md: 0 4px 16px rgba(26,24,21,0.08);
  --rt-shadow-lg: 0 12px 48px rgba(26,24,21,0.12);
  --rt-radius-sm: 6px;
  --rt-radius-md: 10px;
  --rt-radius-lg: 16px;
  --rt-radius-xl: 24px;
  --rt-transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.rt-root {
  color: var(--rt-text);
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

/* ── Drop Zone ─────────────────────────────── */

.rt-dropzone-wrapper {
  background: var(--rt-bg-elevated);
  border-radius: var(--rt-radius-xl);
  padding: 24px;
  box-shadow: var(--rt-shadow-md);
}

.rt-dropzone {
  width: 100%;
  border: 2px dashed var(--rt-border-strong);
  border-radius: var(--rt-radius-lg);
  padding: 48px 32px;
  text-align: center;
  cursor: pointer;
  transition: var(--rt-transition);
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
  transition: var(--rt-transition);
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
  color: white;
}

.rt-dropzone__icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--rt-bg-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
  transition: var(--rt-transition);
}

.rt-dropzone:hover .rt-dropzone__icon {
  background: var(--rt-accent-glow);
  transform: scale(1.05);
}

.rt-dropzone__icon svg {
  width: 24px;
  height: 24px;
  color: var(--rt-text-secondary);
  transition: var(--rt-transition);
}

.rt-dropzone:hover .rt-dropzone__icon svg {
  color: var(--rt-accent);
}

.rt-dropzone__text {
  font-size: 16px;
  color: var(--rt-text-secondary);
  margin-bottom: 4px;
  position: relative;
}

.rt-dropzone__text strong {
  color: var(--rt-accent);
  font-weight: 500;
}

.rt-dropzone__hint {
  font-size: 13px;
  color: var(--rt-text-tertiary);
  position: relative;
}

/* ── Gallery ───────────────────────────────── */

.rt-gallery {
  background: var(--rt-bg-elevated);
  border-radius: var(--rt-radius-xl);
  padding: 24px;
  box-shadow: var(--rt-shadow-md);
  max-height: 100%;
  overflow: auto;
}

.rt-gallery__toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--rt-border);
}

.rt-gallery__views {
  display: flex;
  gap: 4px;
}

.rt-gallery__view-btn {
  width: 30px;
  height: 30px;
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: var(--rt-text-tertiary);
  cursor: pointer;
  transition: var(--rt-transition);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.rt-gallery__view-btn svg {
  width: 14px;
  height: 14px;
}

.rt-gallery__view-btn:hover {
  border-color: var(--rt-border-strong);
  color: var(--rt-text);
}

.rt-gallery__view-btn--active {
  background: var(--rt-accent);
  border-color: var(--rt-accent);
  color: white;
}

.rt-gallery__view-btn--active:hover {
  background: var(--rt-accent-hover);
  border-color: var(--rt-accent-hover);
  color: white;
}

.rt-gallery__add-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  border: none;
  border-radius: 999px;
  background: var(--rt-accent);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
}

.rt-gallery__add-btn:hover {
  background: var(--rt-accent-hover);
}

.rt-gallery__add-btn svg {
  width: 14px;
  height: 14px;
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
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.rt-gallery__flow-item:hover img {
  transform: scale(1.04);
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
}

.rt-gallery__height-fit::-webkit-scrollbar {
  height: 6px;
}

.rt-gallery__height-fit::-webkit-scrollbar-track {
  background: var(--rt-bg-subtle);
  border-radius: 3px;
}

.rt-gallery__height-fit::-webkit-scrollbar-thumb {
  background: var(--rt-border-strong);
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
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.rt-gallery__height-fit-item:hover img {
  transform: scale(1.04);
}

/* ── Shared overlay ──────────────────────── */

.rt-gallery__item-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(26,24,21,0.7) 0%, transparent 50%);
  opacity: 0;
  transition: var(--rt-transition);
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
  color: rgba(255,255,255,0.85);
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
  background: rgba(255,255,255,0.15);
  color: white;
  border: none;
  border-radius: var(--rt-radius-sm);
  cursor: pointer;
  transition: var(--rt-transition);
  backdrop-filter: blur(4px);
}

.rt-gallery__item-download:hover {
  background: rgba(255,255,255,0.3);
  transform: translateY(-1px);
}

.rt-gallery__item-download svg {
  width: 14px;
  height: 14px;
}

.rt-gallery__item-edit {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: var(--rt-accent);
  color: white;
  border: none;
  border-radius: var(--rt-radius-sm);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
  text-transform: uppercase;
}

.rt-gallery__item-edit:hover {
  background: var(--rt-accent-hover);
  transform: translateY(-1px);
}

.rt-gallery__item-edit svg {
  width: 12px;
  height: 12px;
}

.rt-gallery__item-status {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--rt-bg-elevated);
}

.rt-gallery__item-status--edited {
  background: #22C55E;
}

.rt-gallery__item-status--pending {
  background: var(--rt-text-tertiary);
}

.rt-gallery__item-remove {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  border: none;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: var(--rt-transition);
  backdrop-filter: blur(4px);
  z-index: 1;
}

.rt-gallery__flow-item:hover .rt-gallery__item-remove,
.rt-gallery__height-fit-item:hover .rt-gallery__item-remove {
  opacity: 1;
}

.rt-gallery__item-remove:hover {
  background: rgba(220, 50, 50, 0.8);
}

.rt-gallery__item-remove svg {
  width: 12px;
  height: 12px;
}

/* ── Add cell (+) ─────────────────────────── */

/* ── Editor ────────────────────────────────── */

.rt-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--rt-dark-stage, #18181A);
  display: flex;
  flex-direction: column;
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
  background: var(--rt-dark-tray, #222226);
  border-bottom: 1px solid var(--rt-dark-line);
  flex-shrink: 0;
}

/* Control tray — clearly separated from the stage above it */
.rt-editor__tray {
  display: flex;
  flex-direction: column;
  background: var(--rt-dark-tray, #222226);
  border-top: 1px solid var(--rt-dark-line);
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
  background: var(--rt-dark-elevated, #2E2E30);
  border: 1px solid var(--rt-dark-line);
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 10px 32px rgba(0,0,0,0.5);
}

.rt-history-menu__item {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255,255,255,0.75);
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
}

.rt-history-menu__item:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.95);
}

.rt-history-menu__item--current {
  background: var(--rt-accent-glow);
  color: var(--rt-accent);
}

.rt-editor__divider {
  width: 1px;
  height: 20px;
  background: var(--rt-dark-line);
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
  color: rgba(255,255,255,0.75);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rt-editor__dimensions {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  padding: 3px 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
}

.rt-editor__topbar-right {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.rt-editor__btn-cancel {
  padding: 7px 14px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: rgba(255,255,255,0.65);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
}

.rt-editor__btn-capture {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 12px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: rgba(255,255,255,0.65);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
}

.rt-editor__btn-capture:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.95);
}

.rt-editor__btn-capture svg {
  width: 15px;
  height: 15px;
}

.rt-editor__history {
  display: flex;
  gap: 2px;
  margin-right: 4px;
}

.rt-editor__text-btn {
  padding: 6px 12px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: rgba(255,255,255,0.65);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
}

.rt-editor__text-btn:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.95);
}

.rt-editor__icon-btn.rt-editor__icon-btn--active {
  background: var(--rt-accent-glow);
  color: var(--rt-accent);
}

.rt-editor__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: rgba(255,255,255,0.65);
  cursor: pointer;
  transition: var(--rt-transition);
}

.rt-editor__icon-btn:hover:not([disabled]) {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.95);
}

.rt-editor__icon-btn[disabled] {
  opacity: 0.3;
  cursor: default;
}

.rt-editor__icon-btn svg {
  width: 17px;
  height: 17px;
}

.rt-editor__btn-cancel:hover {
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.95);
}

.rt-editor__btn-done {
  padding: 8px 20px;
  border: none;
  border-radius: 999px;
  background: var(--rt-accent);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: var(--rt-transition);
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
  gap: 8px;
  padding: 14px 10px;
  background: var(--rt-dark-tray, #222226);
  border-right: 1px solid var(--rt-dark-line);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  flex-shrink: 0;
}

.rt-toolbar::-webkit-scrollbar {
  display: none;
}

.rt-toolbar__btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 74px;
  padding: 12px 0;
  border: 1px solid transparent;
  background: rgba(255,255,255,0.06);
  border-radius: 10px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
  flex-shrink: 0;
}

.rt-toolbar__btn:hover {
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.95);
}

.rt-toolbar__btn--active {
  background: var(--rt-accent-glow);
  border-color: rgba(232, 112, 60, 0.35);
  color: var(--rt-accent);
}

.rt-toolbar__btn svg {
  width: 19px;
  height: 19px;
}

.rt-toolbar__btn span {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.2px;
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
  padding: 8px 24px 16px;
}

.rt-editor__canvas-container {
  position: relative;
  max-width: 100%;
  max-height: 100%;
}

.rt-editor__canvas-container .canvas-container {
  border-radius: var(--rt-radius-sm);
  box-shadow: 0 12px 48px rgba(0,0,0,0.45);
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
  background: rgba(0,0,0,0.45);
  pointer-events: none;
}

.rt-crop__selection {
  position: absolute;
  border: 2px solid white;
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
  border-right: 1px solid rgba(255,255,255,0.2);
  border-bottom: 1px solid rgba(255,255,255,0.2);
}

.rt-crop__grid-cell:nth-child(3n) { border-right: none; }
.rt-crop__grid-cell:nth-child(n+7) { border-bottom: none; }

.rt-crop__handle {
  position: absolute;
  width: 12px;
  height: 12px;
  background: white;
  border-radius: 2px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
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
  height: 128px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  flex-shrink: 0;
}

.rt-dock__pane {
  width: 100%;
  min-width: 0;
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
  background: var(--rt-dark-line);
  margin: 0 6px;
  flex-shrink: 0;
}

.rt-dock__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  transition: var(--rt-transition);
  flex-shrink: 0;
}

.rt-dock__icon-btn:hover {
  background: rgba(255,255,255,0.13);
  color: rgba(255,255,255,0.95);
}

.rt-dock__icon-btn svg {
  width: 16px;
  height: 16px;
}

.rt-dock__chip {
  position: relative;
  padding: 7px 13px;
  border: none;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.6);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
  flex-shrink: 0;
}

.rt-dock__chip:hover {
  background: rgba(255,255,255,0.13);
  color: rgba(255,255,255,0.9);
}

.rt-dock__chip--active {
  background: var(--rt-accent-glow);
  color: var(--rt-accent);
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

.rt-dock__slider {
  gap: 10px;
}

.rt-dock__slider-label {
  font-size: 12px;
  color: rgba(255,255,255,0.55);
  white-space: nowrap;
  flex-shrink: 0;
}

.rt-dock__slider-value {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
  min-width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rt-dock__slider input[type="range"] {
  width: 220px;
  height: 3px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255,255,255,0.14);
  border-radius: 2px;
  outline: none;
  flex-shrink: 0;
}

.rt-dock__slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 13px;
  height: 13px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  cursor: pointer;
}

.rt-dock__slider input[type="range"]::-moz-range-thumb {
  width: 13px;
  height: 13px;
  border: none;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  cursor: pointer;
}

/* Adjust pane: slider row above, adjustment chips below */

.rt-adjust {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
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
  gap: 7px;
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
}

.rt-dock__filter-thumb {
  width: 58px;
  height: 58px;
  object-fit: cover;
  display: block;
  border-radius: 8px;
  border: 2px solid transparent;
  transition: var(--rt-transition);
}

.rt-dock__filter-btn:hover .rt-dock__filter-thumb {
  border-color: rgba(255,255,255,0.3);
}

.rt-dock__filter-btn--active .rt-dock__filter-thumb {
  border-color: var(--rt-accent);
}

.rt-dock__filter-label {
  font-size: 10.5px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: var(--rt-transition);
}

.rt-dock__filter-btn--active .rt-dock__filter-label {
  color: var(--rt-accent);
}

/* Trim pane: inline stats */

.rt-dock__stat {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.rt-dock__stat-label {
  font-size: 12px;
  color: rgba(255,255,255,0.45);
}

.rt-dock__stat-value {
  font-size: 12.5px;
  color: rgba(255,255,255,0.85);
  font-variant-numeric: tabular-nums;
}

.rt-dock__hint {
  font-size: 11px;
  color: rgba(255,255,255,0.35);
  white-space: nowrap;
  margin-left: 6px;
}

/* ── Video gallery badges ──────────────────── */

.rt-gallery__item-duration {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 2px 7px;
  border-radius: 10px;
  background: rgba(0,0,0,0.65);
  color: rgba(255,255,255,0.9);
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
  background: rgba(0,0,0,0.5);
  color: rgba(255,255,255,0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 1;
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
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.9);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: var(--rt-transition);
}

.rt-video-bar__btn:hover {
  background: rgba(255,255,255,0.16);
}

.rt-video-bar__btn svg {
  width: 16px;
  height: 16px;
}

.rt-video-bar__time {
  font-size: 12px;
  color: rgba(255,255,255,0.6);
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
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.7);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
}

.rt-video-bar__speed:hover {
  background: rgba(255,255,255,0.16);
  color: rgba(255,255,255,0.95);
}

.rt-video-bar__speed-menu {
  display: none;
  position: absolute;
  bottom: calc(100% + 6px);
  right: 0;
  z-index: 10;
  flex-direction: column;
  background: var(--rt-dark-elevated, #2E2E2E);
  border: 1px solid var(--rt-dark-line);
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}

.rt-video-bar__speed-menu--open {
  display: flex;
}

.rt-video-bar__speed-option {
  padding: 6px 18px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: rgba(255,255,255,0.75);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  text-align: center;
  font-family: inherit;
}

.rt-video-bar__speed-option:hover {
  background: rgba(255,255,255,0.08);
  color: #fff;
}

/* ── Filmstrip scrubber ────────────────────── */

.rt-filmstrip {
  position: relative;
  flex: 1;
  height: 48px;
  min-width: 0;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(255,255,255,0.05);
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
  background: rgba(0,0,0,0.7);
  pointer-events: none;
}

.rt-filmstrip__playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #fff;
  box-shadow: 0 0 4px rgba(0,0,0,0.6);
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
  border-radius: 6px 0 0 6px;
}

.rt-filmstrip__handle--out {
  transform: translateX(-100%);
  border-radius: 0 6px 6px 0;
}

.rt-filmstrip__handle::after {
  content: "";
  position: absolute;
  left: 4.5px;
  right: 4.5px;
  top: 15px;
  bottom: 15px;
  background: rgba(255,255,255,0.75);
  border-radius: 1.5px;
}

.rt-filmstrip__handle:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 1px;
}

/* ── Export overlay ────────────────────────── */

.rt-export-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0,0,0,0.75);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rt-export-overlay__card {
  width: min(420px, 90vw);
  background: var(--rt-dark-elevated, #2E2E2E);
  border: 1px solid var(--rt-dark-line);
  border-radius: 12px;
  padding: 24px;
  color: #fff;
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
  color: rgba(255,255,255,0.7);
}

.rt-export-overlay__name span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-export-overlay__pct {
  font-variant-numeric: tabular-nums;
  color: rgba(255,255,255,0.5);
  flex-shrink: 0;
}

.rt-export-overlay__bar {
  height: 4px;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.rt-export-overlay__fill {
  height: 100%;
  width: 0%;
  background: var(--rt-accent);
  transition: width 0.15s ease;
}

.rt-export-overlay__fill--error {
  background: #c0392b;
}

.rt-export-overlay__cancel {
  margin-top: 16px;
  padding: 7px 16px;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: rgba(255,255,255,0.6);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
}

.rt-export-overlay__cancel:hover {
  border-color: rgba(255,255,255,0.3);
  color: rgba(255,255,255,0.9);
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
  border-radius: 8px;
  background: var(--rt-dark-elevated, #2E2E2E);
  color: rgba(255,255,255,0.92);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 6px 24px rgba(0,0,0,0.35);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-8px);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.rt-toast--visible {
  opacity: 1;
  transform: translateY(0);
}

.rt-toast--error {
  border-left: 3px solid #e07a6a;
}

.rt-toast--info {
  border-left: 3px solid var(--rt-accent);
}

/* ── AI chat (bottom-left of the stage) ────── */

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
  height: 42px;
  font-size: 14px;
  padding: 0 13px 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(30,30,32,0.88);
  color: rgba(255,255,255,0.85);
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 20px rgba(0,0,0,0.45);
  backdrop-filter: blur(8px);
  transition: var(--rt-transition);
}

.rt-ai__trigger:hover {
  border-color: rgba(255,255,255,0.3);
  background: rgba(40,40,42,0.92);
  color: #fff;
}

.rt-ai__trigger svg {
  width: 15px;
  height: 15px;
  color: var(--rt-accent);
}

.rt-ai__kbd {
  padding: 2px 5px;
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.45);
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
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(32,32,34,0.96);
  box-shadow: 0 12px 40px rgba(0,0,0,0.55);
  backdrop-filter: blur(14px);
  overflow: hidden;
}

.rt-ai--open .rt-ai__panel {
  display: flex;
}

.rt-ai__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 12px;
  border-bottom: 1px solid var(--rt-dark-line);
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
  color: var(--rt-accent);
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
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
}

.rt-ai__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: var(--rt-transition);
}

.rt-ai__close:hover {
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.95);
}

.rt-ai__close svg {
  width: 13px;
  height: 13px;
}

.rt-ai__messages {
  flex: 1;
  min-height: 72px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.rt-ai__empty {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255,255,255,0.4);
}

.rt-ai__msg {
  max-width: 88%;
  padding: 7px 11px;
  border-radius: 12px;
  font-size: 12.5px;
  line-height: 1.45;
  overflow-wrap: break-word;
}

.rt-ai__msg--user {
  align-self: flex-end;
  background: var(--rt-accent);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.rt-ai__msg--assistant,
.rt-ai__msg--busy,
.rt-ai__msg--error {
  align-self: flex-start;
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.88);
  border-bottom-left-radius: 4px;
}

.rt-ai__msg--busy {
  color: rgba(255,255,255,0.5);
  animation: rt-ai-pulse 1.2s ease-in-out infinite;
}

.rt-ai__msg--error {
  background: rgba(224,122,106,0.14);
  color: #e8988c;
}

.rt-ai__form {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border-top: 1px solid var(--rt-dark-line);
  flex-shrink: 0;
}

.rt-ai__input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: rgba(255,255,255,0.92);
  font-size: 13px;
  font-family: inherit;
}

.rt-ai__input::placeholder {
  color: rgba(255,255,255,0.35);
}

.rt-ai__send {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--rt-accent);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: var(--rt-transition);
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
  border-top: 1px solid var(--rt-dark-line);
  background: rgba(255,255,255,0.03);
}

.rt-ai__popover-text {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255,255,255,0.6);
  margin-bottom: 10px;
}

.rt-ai__popover-row {
  display: flex;
  gap: 8px;
}

.rt-ai__key-input {
  flex: 1;
  min-width: 0;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: var(--rt-radius-sm);
  padding: 7px 12px;
  color: rgba(255,255,255,0.9);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.rt-ai__save {
  padding: 7px 14px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
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
