import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import { Alert } from '../ui/Feedback.jsx';
import { getErrorMessage } from '../../lib/api.js';
import { isHexColour, WALLPAPERS } from '../../lib/wallpapers.js';

/**
 * Round 2: pick this chat's wallpaper (only you see it). Previews follow the current theme.
 * onChange(background) saves it and may reject.
 */
export default function WallpaperPicker({ open, onClose, value, onChange }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [colour, setColour] = useState(isHexColour(value) ? value : '#1f5f59');

  const choose = async (background) => {
    setBusy(background || 'reset');
    setError('');
    try {
      await onChange(background);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not change the wallpaper.'));
    } finally {
      setBusy(null);
    }
  };

  const tile = (selected) =>
    `relative h-24 overflow-hidden rounded-xl border-2 text-left transition-transform duration-150 hover:scale-[1.02] ${
      selected ? 'border-brand-500' : 'border-border'
    }`;

  return (
    <Modal open={open} onClose={onClose} title="Chat wallpaper" size="lg">
      <p className="mb-4 text-sm text-ink-muted">Only you see this wallpaper, and only in this chat.</p>
      {error ? <Alert className="mb-3">{error}</Alert> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {WALLPAPERS.map(({ id, label }) => (
          <button key={id} type="button" onClick={() => choose(id)} disabled={Boolean(busy)} className={tile(value === id)} aria-pressed={value === id} aria-label={`${label} wallpaper`}>
            <span className={`cc-wall cc-wall-${id}`} aria-hidden="true" />
            <span className="absolute top-3 left-2 max-w-[70%] rounded-lg rounded-bl-sm bg-surface px-2 py-1 text-[10px] text-ink shadow-sm">Hi!</span>
            <span className="absolute right-2 bottom-6 rounded-lg rounded-br-sm bg-brand-600 px-2 py-1 text-[10px] text-white shadow-sm">Hey 👋</span>
            <span className="absolute bottom-1 left-2 text-[11px] font-semibold text-ink">{label}</span>
            {value === id ? <Check className="absolute top-1.5 right-1.5 h-4 w-4 text-accent" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label htmlFor="wallpaper-colour" className="text-sm font-medium text-ink">
          Plain colour
        </label>
        <input
          id="wallpaper-colour"
          type="color"
          value={colour}
          onChange={(e) => setColour(e.target.value)}
          className="h-10 w-14 cursor-pointer rounded-lg border border-border bg-surface p-1"
        />
        <Button variant="secondary" size="sm" onClick={() => choose(colour)} loading={busy === colour}>
          Use colour
        </Button>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => choose('')} loading={busy === 'reset'} disabled={!value}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Default
        </Button>
      </div>
    </Modal>
  );
}
