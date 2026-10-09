import { useRef, useState } from 'react';
import { Camera, Trash2 } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { getErrorMessage } from '../../lib/api.js';
import { IMAGE_TYPES, resizeImage, validateImage } from '../../lib/media.js';

/**
 * Avatar with upload / replace / remove. Used for your profile picture and for group pictures.
 * onUpload(file, onProgress) and onRemove() are async and should throw on failure.
 */
export default function PictureUploader({ name, src, onUpload, onRemove, editable = true, onDone, label = 'photo' }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState('');
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const busy = progress !== null;

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const invalid = validateImage(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    const local = URL.createObjectURL(file);
    setPreview(local);
    setProgress(0);
    try {
      const resized = await resizeImage(file);
      await onUpload(resized, setProgress);
      onDone?.(src ? `${label[0].toUpperCase()}${label.slice(1)} updated` : `${label[0].toUpperCase()}${label.slice(1)} added`);
    } catch (err) {
      setError(getErrorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setProgress(null);
      setPreview('');
      URL.revokeObjectURL(local);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <Avatar name={name} src={preview || src} size="xl" />
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/50 text-sm font-semibold text-white">
            {Math.round(progress * 100)}%
          </span>
        ) : null}
        {editable ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label={src ? `Change ${label}` : `Upload ${label}`}
            className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white shadow-card ring-2 ring-surface hover:bg-brand-700"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {editable ? (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
            {src ? `Change ${label}` : `Upload ${label}`}
          </Button>
          {src ? (
            <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(true)} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-center text-xs text-ink-subtle">JPG, PNG or WebP · up to 5 MB</p>
      {error ? <p className="text-center text-xs text-danger" role="alert">{error}</p> : null}

      <input ref={inputRef} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={pick} aria-hidden="true" tabIndex={-1} />

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remove ${label}?`}
        message="Your initials will be shown instead."
        confirmLabel="Remove"
        danger
        onConfirm={async () => {
          await onRemove();
          onDone?.(`${label[0].toUpperCase()}${label.slice(1)} removed`);
        }}
      />
    </div>
  );
}
