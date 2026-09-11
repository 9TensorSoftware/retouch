/**
 * The shared icon set. One drawing grammar everywhere: a 24×24 grid,
 * currentColor strokes at 1.5 with round caps and joins. Solid shapes
 * (media glyphs, view-mode pictograms) opt into fills per element — filled
 * paths keep the inherited stroke so their corners round like everything
 * else. Icons are sized by the stylesheet (`svg { width; height }` on the
 * host) and colored by the host's `color`.
 */
const icon = (art: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${art}</svg>`;

/** Parse an icon string into a detached element, for `h()`-built trees. */
export function iconElement(markup: string): SVGElement {
  const tpl = document.createElement("template");
  tpl.innerHTML = markup;
  return tpl.content.firstElementChild as unknown as SVGElement;
}

// ── Tool tabs ────────────────────────────────────────────────────────────

export const ICON_TOOL_TRIM = icon(
  '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.5 8L21 19M8.5 16L21 5"/>',
);
export const ICON_TOOL_CROP = icon(
  '<path d="M6 2v14a2 2 0 002 2h14"/><path d="M2 6h14a2 2 0 012 2v14"/>',
);
export const ICON_TOOL_TRANSFORM = icon(
  '<path d="M3 9V5a2 2 0 012-2h4M21 15v4a2 2 0 01-2 2h-4M3 15v4a2 2 0 002 2h4M21 9V5a2 2 0 00-2-2h-4"/><path d="M9 15l6-6"/>',
);
export const ICON_TOOL_LIQUIFY = icon(
  '<circle cx="10" cy="10" r="6"/><path d="M14.5 14.5L21 21M3 21c3-1 4.5-3 5-6"/>',
);
export const ICON_TOOL_CURVES = icon(
  '<path d="M3 21C10 21 14 3 21 3"/><circle cx="8.2" cy="14.8" r="1.6" fill="currentColor" stroke="none"/><circle cx="15.8" cy="6.4" r="1.6" fill="currentColor" stroke="none"/>',
);
export const ICON_TOOL_HSL = icon(
  '<circle cx="12" cy="12" r="9"/><path d="M12 3v9M12 12l7.8 4.5M12 12l-7.8 4.5"/>',
);
export const ICON_TOOL_MASKS = icon(
  '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 000 18z" fill="currentColor" stroke="none" opacity="0.55"/>',
);
export const ICON_TOOL_STYLIZE = icon(
  '<path d="M15 4V2M15 10V8M11 6h2M19 6h2M17.5 7.5L21 11l-9.5 9.5a1.77 1.77 0 01-2.5-2.5L18.5 8.5z"/>',
);
export const ICON_TOOL_ADJUST = icon(
  '<circle cx="12.5" cy="5" r="2.5"/><circle cx="8" cy="12" r="2.5"/><circle cx="16.5" cy="19" r="2.5"/><path d="M4 5h4.5M16.5 5H20M12 12h8M4 19h8.5"/>',
);
export const ICON_TOOL_FILTERS = icon(
  '<circle cx="9" cy="9" r="6"/><circle cx="15" cy="15" r="6"/>',
);
export const ICON_TOOL_FALLBACK = icon(
  '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 12h6"/>',
);

// ── Editor chrome ────────────────────────────────────────────────────────

export const ICON_UNDO = icon('<path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10h-1"/>');
export const ICON_REDO = icon('<path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10h1"/>');
export const ICON_EYE = icon(
  '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
);
export const ICON_HISTORY = icon(
  '<path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.8 8.8 0 005.6 6.1L3.5 8.2"/><path d="M3.5 3.5v4.7h4.7"/><path d="M12 7.5V12l3.2 1.9"/>',
);
export const ICON_CAMERA = icon(
  '<path d="M3 8a2 2 0 012-2h2l1.5-2h7L17 6h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/><circle cx="12" cy="13" r="3.5"/>',
);
export const ICON_CHECK = icon('<path d="M4.5 12.5l5 5L19.5 6.5"/>');
export const ICON_POSTER = icon(
  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15l5-5 5 5 4-4 4 4"/><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none"/>',
);

// ── Transform operations ─────────────────────────────────────────────────

export const ICON_ROTATE_CCW = icon('<path d="M4 10a8 8 0 108-8"/><path d="M4 3v7h7"/>');
export const ICON_ROTATE_CW = icon('<path d="M20 10a8 8 0 10-8-8"/><path d="M20 3v7h-7"/>');
export const ICON_FLIP_H = icon('<path d="M12 2v20M8 7H4v10h4zM16 7h4v10h-4z"/>');
export const ICON_FLIP_V = icon('<path d="M2 12h20M7 8V4h10v4zM7 16v4h10v-4z"/>');
export const ICON_EYEDROPPER = icon(
  '<path d="M13.6 4.4l6 6M15.5 8.5L6.2 17.8a2 2 0 01-.9.5l-2.8.7.7-2.8a2 2 0 01.5-.9l9.3-9.3a2.1 2.1 0 013 3z"/>',
);

// ── Video transport ──────────────────────────────────────────────────────

export const ICON_PLAY = icon('<path d="M9 6.2v11.6L18.8 12z" fill="currentColor"/>');
export const ICON_PAUSE = icon(
  '<rect x="6.5" y="5.5" width="3.6" height="13" rx="1.3" fill="currentColor" stroke="none"/><rect x="13.9" y="5.5" width="3.6" height="13" rx="1.3" fill="currentColor" stroke="none"/>',
);
export const ICON_SOUND = icon(
  '<path d="M5 9.5v5h3l4.5 3.8V5.7L8 9.5H5z" fill="currentColor"/><path d="M15.5 9.5a3.6 3.6 0 010 5"/><path d="M18 7.2a7 7 0 010 9.6"/>',
);
export const ICON_MUTED = icon(
  '<path d="M5 9.5v5h3l4.5 3.8V5.7L8 9.5H5z" fill="currentColor"/><path d="M16 10l5 4M21 10l-5 4"/>',
);

// ── AI chat ──────────────────────────────────────────────────────────────

export const ICON_SPARKLE = icon(
  '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" fill="currentColor"/><path d="M19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9z" fill="currentColor" stroke="none"/>',
);
export const ICON_SEND = icon('<path d="M12 19V5"/><path d="M5.5 11.5L12 5l6.5 6.5"/>');
export const ICON_CLOSE = icon('<path d="M6 6l12 12M18 6L6 18"/>');

// ── Gallery ──────────────────────────────────────────────────────────────

export const ICON_UPLOAD = icon(
  '<path d="M4 14.899A7 7 0 1115.71 8h1.79a4.5 4.5 0 012.5 8.242"/><path d="M12 12v9m0-9l-3 3m3-3 3 3"/>',
);
export const ICON_DOWNLOAD = icon(
  '<path d="M12 4v10M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19.5h14"/>',
);
export const ICON_EDIT = icon('<path d="M16.5 3.5a2.121 2.121 0 013 3L7.5 19l-4 1 1-4z"/>');
export const ICON_REMOVE = ICON_CLOSE;
export const ICON_PLAY_BADGE = ICON_PLAY;

// View-mode pictograms: solid bars read crisper than outlines at 16px.
const bar = (x: number, y: number, w: number, h: number, r: number): string =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="currentColor" stroke="none"/>`;

export const ICON_VIEW_COLS_2 = icon(bar(3.5, 4.5, 7.5, 15, 1.5) + bar(13, 4.5, 7.5, 15, 1.5));
export const ICON_VIEW_COLS_3 = icon(
  bar(3.5, 4.5, 4.6, 15, 1.3) + bar(9.7, 4.5, 4.6, 15, 1.3) + bar(15.9, 4.5, 4.6, 15, 1.3),
);
export const ICON_VIEW_COLS_4 = icon(
  bar(3.5, 4.5, 3.2, 15, 1.1) +
    bar(8.1, 4.5, 3.2, 15, 1.1) +
    bar(12.7, 4.5, 3.2, 15, 1.1) +
    bar(17.3, 4.5, 3.2, 15, 1.1),
);
export const ICON_VIEW_WIDTH_FIT = icon(bar(3.5, 6.5, 17, 11, 1.5));
export const ICON_VIEW_HEIGHT_FIT = icon(bar(3.5, 6.5, 9.5, 11, 1.5) + bar(15, 6.5, 5.5, 11, 1.5));
export const ICON_VIEW_LIST = icon(
  bar(3.5, 4.5, 17, 3, 1.5) + bar(3.5, 10.5, 17, 3, 1.5) + bar(3.5, 16.5, 17, 3, 1.5),
);
