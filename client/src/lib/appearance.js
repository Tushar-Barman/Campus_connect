import { useSyncExternalStore } from 'react';

/**
 * Round 2: theme, accent, density, font size and bubble shape.
 *
 * Applied as data-* attributes on <html> (see index.css). Saved in localStorage for an
 * instant start (index.html applies it before first paint), and synced to the server
 * (PUT /users/settings) so it follows the user to other devices.
 * The inline script in index.html must stay in step with KEY and the attribute names.
 */

export const APPEARANCE_KEY = 'cc_appearance';

export const THEMES = ['light', 'dark', 'system'];
export const ACCENTS = [
  { id: 'teal', label: 'Himalayan teal' },
  { id: 'indigo', label: 'Indigo' },
  { id: 'rose', label: 'Rose' },
  { id: 'amber', label: 'Amber' },
  { id: 'violet', label: 'Violet' },
  { id: 'slate', label: 'Slate' },
];
export const DENSITIES = ['comfortable', 'compact'];
export const FONT_SCALES = ['sm', 'md', 'lg'];
export const BUBBLE_STYLES = ['rounded', 'soft', 'sharp'];

export const APPEARANCE_DEFAULTS = Object.freeze({
  theme: 'system',
  accent: 'teal',
  density: 'comfortable',
  fontScale: 'md',
  bubbleStyle: 'rounded',
});

const APPEARANCE_KEYS = Object.keys(APPEARANCE_DEFAULTS);

/** Only known keys with allowed values; anything else falls back to the default. */
export function cleanAppearance(input = {}) {
  const allowed = {
    theme: THEMES,
    accent: ACCENTS.map((a) => a.id),
    density: DENSITIES,
    fontScale: FONT_SCALES,
    bubbleStyle: BUBBLE_STYLES,
  };
  return Object.fromEntries(
    APPEARANCE_KEYS.map((key) => [key, allowed[key].includes(input?.[key]) ? input[key] : APPEARANCE_DEFAULTS[key]]),
  );
}

export const pickAppearance = (settings) => cleanAppearance(settings);

function readSaved() {
  try {
    return cleanAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}'));
  } catch {
    return { ...APPEARANCE_DEFAULTS };
  }
}

function save(appearance) {
  try {
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
  } catch {
    /* storage blocked: it still applies for this tab */
  }
}

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const resolveTheme = (theme) => (theme === 'system' ? (darkQuery?.matches ? 'dark' : 'light') : theme);

let current = readSaved();
const listeners = new Set();

function paint() {
  const root = document.documentElement;
  const resolved = resolveTheme(current.theme);
  root.dataset.theme = resolved;
  root.dataset.accent = current.accent;
  root.dataset.density = current.density;
  root.dataset.font = current.fontScale;
  root.dataset.bubble = current.bubbleStyle;
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#0d1514' : '#f4f7f6');
}

/** Applies (and remembers) a full or partial appearance. */
export function applyAppearance(patch) {
  current = cleanAppearance({ ...current, ...patch });
  save(current);
  paint();
  listeners.forEach((listener) => listener());
}

export const getAppearance = () => current;

// "system" follows the OS live.
darkQuery?.addEventListener?.('change', () => {
  if (current.theme !== 'system') return;
  paint();
  listeners.forEach((listener) => listener());
});

// Another tab changed it.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== APPEARANCE_KEY) return;
    current = readSaved();
    paint();
    listeners.forEach((listener) => listener());
  });
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => `${JSON.stringify(current)}|${resolveTheme(current.theme)}`;

/** → { appearance, resolvedTheme: 'light' | 'dark' } and re-renders on change. */
export function useAppearance() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return { appearance: current, resolvedTheme: resolveTheme(current.theme) };
}

paint();
