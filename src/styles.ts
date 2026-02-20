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
  padding: 48px;
  box-shadow: var(--rt-shadow-md);
}

.rt-dropzone {
  border: 2px dashed var(--rt-border-strong);
  border-radius: var(--rt-radius-lg);
  padding: 80px 40px;
  text-align: center;
  cursor: pointer;
  transition: var(--rt-transition);
  position: relative;
  overflow: hidden;
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
  padding: 32px;
  box-shadow: var(--rt-shadow-md);
}

.rt-gallery__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--rt-border);
}

.rt-gallery__count {
  font-size: 14px;
  color: var(--rt-text-secondary);
}

.rt-gallery__count strong {
  color: var(--rt-text);
  font-weight: 600;
}

.rt-gallery__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.rt-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--rt-border);
  border-radius: var(--rt-radius-sm);
  background: var(--rt-bg-elevated);
  font-size: 13px;
  font-weight: 500;
  color: var(--rt-text-secondary);
  cursor: pointer;
  transition: var(--rt-transition);
  font-family: inherit;
  line-height: 1;
}

.rt-btn:hover {
  border-color: var(--rt-border-strong);
  color: var(--rt-text);
}

.rt-btn svg {
  width: 14px;
  height: 14px;
}

.rt-btn--accent {
  background: var(--rt-accent);
  border-color: var(--rt-accent);
  color: white;
}

.rt-btn--accent:hover {
  background: var(--rt-accent-hover);
  border-color: var(--rt-accent-hover);
  color: white;
}

.rt-gallery__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.rt-gallery__item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--rt-radius-md);
  overflow: hidden;
  cursor: pointer;
}

.rt-gallery__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.rt-gallery__item:hover img {
  transform: scale(1.04);
}

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

.rt-gallery__item:hover .rt-gallery__item-overlay {
  opacity: 1;
}

.rt-gallery__item-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.rt-gallery__item-name {
  font-size: 12px;
  color: rgba(255,255,255,0.85);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 55%;
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
}

.rt-gallery__item:hover .rt-gallery__item-remove {
  opacity: 1;
}

.rt-gallery__item-remove:hover {
  background: rgba(220, 50, 50, 0.8);
}

.rt-gallery__item-remove svg {
  width: 12px;
  height: 12px;
}

.rt-gallery__footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--rt-border);
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
