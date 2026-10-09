// Round 2: chat wallpaper presets. The look lives in index.css (.cc-wall-<id>, with dark
// variants); the ids are mirrored in server/src/services/conversations.js.
export const WALLPAPERS = [
  { id: 'mist', label: 'Mist' },
  { id: 'dawn', label: 'Dawn' },
  { id: 'pine', label: 'Pine' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'sand', label: 'Sand' },
  { id: 'contour', label: 'Contours' },
  { id: 'dots', label: 'Dots' },
  { id: 'grid', label: 'Grid' },
];

export const isHexColour = (value) => /^#[0-9a-f]{6}$/i.test(value || '');

/** Props for the wallpaper layer: a preset class or an inline colour; null for none. */
export function wallpaperLayer(background) {
  if (!background) return null;
  if (isHexColour(background)) return { className: 'cc-wall', style: { backgroundColor: background } };
  if (WALLPAPERS.some((w) => w.id === background)) return { className: `cc-wall cc-wall-${background}` };
  return null;
}
