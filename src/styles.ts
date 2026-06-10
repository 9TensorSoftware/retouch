const STYLE_ID = "rt-styles";

const CSS = /* css */ `
.rt-root {
  --rt-bg: #F7F5F2;
  --rt-bg-elevated: #FFFFFF;
  --rt-bg-subtle: #EEEAE5;
  --rt-border: #DDD8D0;
  --rt-border-strong: #C5BFB5;
  --rt-text: #1A1815;
  --rt-text-secondary: #6B6560;
  --rt-text-tertiary: #9E9890;
  --rt-accent: #D4572A;
  --rt-accent-hover: #BF4D24;
  --rt-accent-soft: rgba(212, 87, 42, 0.08);
  --rt-accent-glow: rgba(212, 87, 42, 0.15);
  --rt-shadow-sm: 0 1px 3px rgba(26,24,21,0.06);
  --rt-shadow-md: 0 4px 16px rgba(26,24,21,0.08);
  --rt-shadow-lg: 0 12px 48px rgba(26,24,21,0.12);
  --rt-radius-sm: 6px;
  --rt-radius-md: 10px;
  --rt-radius-lg: 16px;
  --rt-radius-xl: 24px;
  --rt-transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--rt-text);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  position: relative;
  width: 100%;
}

.rt-root *, .rt-root *::before, .rt-root *::after {
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

.rt-gallery__height-fit .rt-gallery__add-cell {
  flex-shrink: 0;
  width: 180px;
  padding: 16px;
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

.rt-gallery__add-cell {
  border: 2px dashed var(--rt-border-strong);
  border-radius: var(--rt-radius-md);
  cursor: pointer;
  transition: var(--rt-transition);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.rt-gallery__cols .rt-gallery__add-cell {
  min-height: 120px;
}

.rt-gallery__add-cell:hover {
  border-color: var(--rt-accent);
  background: var(--rt-accent-soft);
}

.rt-gallery__add-cell--active {
  border-color: var(--rt-accent);
  border-style: solid;
  background: var(--rt-accent-soft);
}

.rt-gallery__add-cell-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--rt-text-tertiary);
  transition: var(--rt-transition);
}

.rt-gallery__add-cell:hover .rt-gallery__add-cell-inner {
  color: var(--rt-accent);
}

.rt-gallery__add-cell-inner svg {
  width: 24px;
  height: 24px;
}

.rt-gallery__add-cell-inner span {
  font-size: 12px;
  font-weight: 500;
  color: var(--rt-text-secondary);
}

.rt-gallery__add-cell-inner span strong {
  color: var(--rt-accent);
  font-weight: 500;
}

/* ── Toolbar divider ──────────────────────── */

.rt-gallery__toolbar-divider {
  width: 1px;
  height: 20px;
  background: var(--rt-border);
  margin: 0 8px;
  flex-shrink: 0;
}

/* ── Size variants ───────────────────────── */

/* Big: images fill full column width */
.rt-gallery--big .rt-gallery__height-fit-item { height: 320px; }
.rt-gallery--big .rt-gallery__height-fit .rt-gallery__add-cell { height: 320px; }
.rt-gallery--big .rt-gallery__names-thumb { width: 56px; height: 56px; }

/* Medium: images at 70% of column width */
.rt-gallery--medium .rt-gallery__flow-item,
.rt-gallery--medium .rt-gallery__cols .rt-gallery__add-cell,
.rt-gallery--medium .rt-gallery__width-fit .rt-gallery__add-cell {
  max-width: 70%;
  margin: 0 auto;
}

.rt-gallery--medium .rt-gallery__height-fit-item { height: 220px; }
.rt-gallery--medium .rt-gallery__height-fit .rt-gallery__add-cell { height: 220px; }

/* Small: images at 45% of column width */
.rt-gallery--small .rt-gallery__cols { gap: 8px; }
.rt-gallery--small .rt-gallery__width-fit { gap: 8px; }

.rt-gallery--small .rt-gallery__flow-item,
.rt-gallery--small .rt-gallery__cols .rt-gallery__add-cell,
.rt-gallery--small .rt-gallery__width-fit .rt-gallery__add-cell {
  max-width: 45%;
  margin: 0 auto;
}

.rt-gallery--small .rt-gallery__cols .rt-gallery__add-cell {
  min-height: 80px;
}

.rt-gallery--small .rt-gallery__height-fit-item { height: 140px; }
.rt-gallery--small .rt-gallery__height-fit .rt-gallery__add-cell { height: 140px; }
.rt-gallery--small .rt-gallery__names-thumb { width: 24px; height: 24px; }

/* ── Names list ───────────────────────────── */

.rt-gallery__names {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rt-gallery__names-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--rt-radius-sm);
  transition: var(--rt-transition);
}

.rt-gallery__names-item:hover {
  background: var(--rt-bg-subtle);
}

.rt-gallery__names-thumb {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.rt-gallery__names-details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rt-gallery__names-filename {
  font-size: 13px;
  font-weight: 500;
  color: var(--rt-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rt-gallery__names-size {
  font-size: 11px;
  color: var(--rt-text-tertiary);
}

.rt-gallery__names-status {
  flex-shrink: 0;
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
  transition: var(--rt-transition);
}

.rt-gallery__names-item:hover .rt-gallery__names-actions {
  opacity: 1;
}

.rt-gallery__names-actions button {
  width: 28px;
  height: 28px;
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-bg-elevated);
  color: var(--rt-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--rt-transition);
  padding: 0;
}

.rt-gallery__names-actions button:hover {
  border-color: var(--rt-border-strong);
  color: var(--rt-text);
}

.rt-gallery__names-actions button svg {
  width: 12px;
  height: 12px;
}

.rt-gallery__names-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-top: 4px;
  border: 2px dashed var(--rt-border-strong);
  border-radius: var(--rt-radius-sm);
  color: var(--rt-text-tertiary);
  cursor: pointer;
  transition: var(--rt-transition);
  font-size: 13px;
  font-weight: 500;
  background: transparent;
  font-family: inherit;
}

.rt-gallery__names-add:hover {
  border-color: var(--rt-accent);
  color: var(--rt-accent);
  background: var(--rt-accent-soft);
}

.rt-gallery__names-add svg {
  width: 16px;
  height: 16px;
}

/* ── Editor ────────────────────────────────── */

.rt-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: #1A1815;
  display: flex;
  flex-direction: column;
}

.rt-editor__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #222019;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.rt-editor__topbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.rt-editor__filename {
  font-size: 13px;
  color: rgba(255,255,255,0.6);
  font-weight: 400;
}

.rt-editor__dimensions {
  font-size: 11px;
  color: rgba(255,255,255,0.3);
  padding: 3px 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
}

.rt-editor__topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rt-editor__btn-cancel {
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

.rt-editor__btn-capture {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
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

.rt-editor__btn-capture:hover {
  border-color: rgba(255,255,255,0.3);
  color: rgba(255,255,255,0.9);
}

.rt-editor__btn-capture svg {
  width: 15px;
  height: 15px;
}

.rt-editor__btn-cancel:hover {
  border-color: rgba(255,255,255,0.25);
  color: rgba(255,255,255,0.85);
}

.rt-editor__btn-done {
  padding: 7px 20px;
  border: none;
  border-radius: var(--rt-radius-sm);
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

.rt-editor__body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* ── Toolbar (left sidebar) ────────────────── */

.rt-toolbar {
  width: 64px;
  background: #1E1C18;
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  gap: 4px;
  flex-shrink: 0;
}

.rt-toolbar__btn {
  width: 44px;
  height: 44px;
  border: none;
  background: transparent;
  border-radius: var(--rt-radius-sm);
  color: rgba(255,255,255,0.4);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  transition: var(--rt-transition);
  position: relative;
}

.rt-toolbar__btn:hover {
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.7);
}

.rt-toolbar__btn--active {
  background: rgba(212, 87, 42, 0.15);
  color: var(--rt-accent);
}

.rt-toolbar__btn--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--rt-accent);
  border-radius: 0 2px 2px 0;
}

.rt-toolbar__btn svg {
  width: 20px;
  height: 20px;
}

.rt-toolbar__btn span {
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.3px;
}

/* ── Canvas area ───────────────────────────── */

.rt-editor__canvas-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  background:
    repeating-conic-gradient(
      rgba(255,255,255,0.03) 0% 25%,
      transparent 0% 50%
    )
    0 0 / 24px 24px;
}

.rt-editor__canvas-container {
  position: relative;
  max-width: 90%;
  max-height: 90%;
}

.rt-editor__canvas-container .canvas-container {
  border-radius: var(--rt-radius-sm);
  box-shadow: 0 8px 40px rgba(0,0,0,0.3);
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

/* ── Properties panel (right) ──────────────── */

.rt-props {
  width: 260px;
  background: #1E1C18;
  border-left: 1px solid rgba(255,255,255,0.06);
  padding: 20px 16px;
  overflow-y: auto;
  flex-shrink: 0;
}

.rt-props__title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.35);
  margin-bottom: 16px;
}

.rt-props__row {
  margin-bottom: 16px;
}

.rt-props__label {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  margin-bottom: 6px;
}

.rt-props__slider {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rt-props__slider input[type="range"] {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255,255,255,0.1);
  border-radius: 2px;
  outline: none;
}

.rt-props__slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  cursor: pointer;
}

.rt-props__slider-value {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  width: 36px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.rt-props__aspect-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.rt-props__aspect-btn {
  padding: 8px 4px;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--rt-radius-sm);
  background: transparent;
  color: rgba(255,255,255,0.5);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: var(--rt-transition);
  text-align: center;
  font-family: inherit;
}

.rt-props__aspect-btn:hover {
  border-color: rgba(255,255,255,0.2);
  color: rgba(255,255,255,0.8);
}

.rt-props__aspect-btn--active {
  border-color: var(--rt-accent);
  background: rgba(212, 87, 42, 0.12);
  color: var(--rt-accent);
}

.rt-props__divider {
  height: 1px;
  background: rgba(255,255,255,0.06);
  margin: 20px 0;
}

.rt-props__filters-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.rt-props__filter-btn {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.rt-props__filter-thumb {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  display: block;
  border-radius: var(--rt-radius-sm);
  border: 2px solid transparent;
  transition: var(--rt-transition);
}

.rt-props__filter-btn:hover .rt-props__filter-thumb {
  border-color: rgba(255,255,255,0.25);
}

.rt-props__filter-btn--active .rt-props__filter-thumb {
  border-color: var(--rt-accent);
}

.rt-props__filter-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  text-align: center;
  transition: var(--rt-transition);
}

.rt-props__filter-btn--active .rt-props__filter-label {
  color: var(--rt-accent);
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

.rt-editor__center {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.rt-video-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #1E1C18;
  border-top: 1px solid rgba(255,255,255,0.06);
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
  background: rgba(10,9,8,0.72);
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

/* ── Trim panel ────────────────────────────── */

.rt-props__trim-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rt-props__trim-value {
  width: auto;
  color: rgba(255,255,255,0.85);
}

.rt-props__hint {
  font-size: 11px;
  line-height: 1.5;
  color: rgba(255,255,255,0.35);
  margin-top: 12px;
}

/* ── Export overlay ────────────────────────── */

.rt-export-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(10,9,8,0.8);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.rt-export-overlay__card {
  width: min(420px, 90vw);
  background: #1E1C18;
  border: 1px solid rgba(255,255,255,0.08);
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

/* ── AI command bar ────────────────────────── */

.rt-ai-bar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  background: #14120F;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.rt-ai-bar__icon {
  display: flex;
  color: var(--rt-accent);
  flex-shrink: 0;
}

.rt-ai-bar__icon svg {
  width: 16px;
  height: 16px;
}

.rt-ai-bar--busy .rt-ai-bar__icon {
  animation: rt-ai-pulse 1s ease-in-out infinite;
}

@keyframes rt-ai-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

.rt-ai-bar__input {
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
  transition: var(--rt-transition);
}

.rt-ai-bar__input:focus {
  border-color: var(--rt-accent);
}

.rt-ai-bar__input::placeholder {
  color: rgba(255,255,255,0.3);
}

.rt-ai-bar__submit {
  padding: 7px 14px;
  border: none;
  border-radius: var(--rt-radius-sm);
  background: var(--rt-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: var(--rt-transition);
  flex-shrink: 0;
}

.rt-ai-bar__submit:hover {
  background: var(--rt-accent-hover);
}

.rt-ai-bar__submit[disabled] {
  opacity: 0.5;
  cursor: default;
}

.rt-ai-bar__status {
  font-size: 12px;
  color: rgba(255,255,255,0.5);
  max-width: 32%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rt-ai-bar__status--ok { color: #6fbf73; }
.rt-ai-bar__status--error { color: #e07a6a; }

.rt-ai-bar__popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 16px;
  right: 16px;
  max-width: 460px;
  z-index: 5;
  background: #1E1C18;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 14px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.4);
}

.rt-ai-bar__popover-text {
  font-size: 12px;
  line-height: 1.5;
  color: rgba(255,255,255,0.6);
  margin-bottom: 10px;
}

.rt-ai-bar__popover-row {
  display: flex;
  gap: 8px;
}

.rt-ai-bar__key-input {
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
