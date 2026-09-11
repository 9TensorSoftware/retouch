/**
 * ML tool-tab icons, drawn on the core set's grammar: a 24×24 grid,
 * currentColor strokes at 1.5 with round caps and joins. Tiny fills
 * (grain dots, the select prompt dot) stay where the silhouette needs
 * them; everything else is pure stroke.
 */
const icon = (art: string): string =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${art}</svg>`;

export const CUTOUT_ICON = icon(
  '<path d="M12 3a9 9 0 109 9" stroke-dasharray="3 3"/><circle cx="12" cy="10" r="3"/><path d="M6.5 19c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4"/>',
);

export const DETECT_ICON = icon(
  '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="10" cy="11" r="2.4"/><path d="M16 14.5c-.9-1.4-2.6-2.3-4.5-2.3s-3.6.9-4.5 2.3"/>',
);

export const ERASE_ICON = icon(
  '<path d="M14 4l6 6-9 9H7l-4-4 11-11z"/><path d="M9 9l6 6M3 21h18"/>',
);

export const DEPTH_ICON = icon(
  '<circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="6.6" opacity="0.55"/><circle cx="12" cy="12" r="9.6" opacity="0.25"/>',
);

export const SELECT_ICON = icon(
  '<circle cx="11" cy="11" r="6" stroke-dasharray="3 3"/><circle cx="11" cy="11" r="1.6" fill="currentColor" stroke="none"/><path d="M15.5 15.5L21 21"/>',
);

export const DENOISE_ICON = icon(
  '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none"/><circle cx="12.5" cy="6.8" r="0.7" fill="currentColor" stroke="none"/><circle cx="16.8" cy="8.6" r="0.8" fill="currentColor" stroke="none"/><circle cx="7" cy="12.5" r="0.7" fill="currentColor" stroke="none"/><path d="M15.6 12.6l1.1 2.4 2.4 1.1-2.4 1.1-1.1 2.4-1.1-2.4-2.4-1.1 2.4-1.1z"/>',
);

export const UPSCALE_ICON = icon(
  '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M9 15l-4 4M8 19H5v-3M15 9l4-4M16 5h3v3"/>',
);
