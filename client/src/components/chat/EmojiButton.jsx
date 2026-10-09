import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { Spinner } from '../ui/Feedback.jsx';
import { useAppearance } from '../../lib/appearance.js';

// Loaded on first open, so the picker never weighs on the first page load.
const EmojiPicker = lazy(() => import('emoji-picker-react'));

/**
 * Round 2: 😊 button for the Composer. A popover on desktop, a bottom sheet on phones.
 * Follows the app theme; the picker keeps its own "recently used" list.
 */
export default function EmojiButton({ onPick }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const { resolvedTheme } = useAppearance();

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Emoji"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Emoji"
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Smile className="h-4.5 w-4.5" aria-hidden="true" />
      </button>
      {open ? (
        <>
          {/* Phone: dimmed backdrop + sheet from the bottom. Desktop: popover above the button. */}
          <div className="fixed inset-0 z-30 bg-scrim/30 sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Emoji picker"
            className="cc-emoji fixed inset-x-0 bottom-0 z-40 animate-slide-up sm:absolute sm:inset-x-auto sm:bottom-12 sm:left-0"
          >
            <Suspense
              fallback={
                <div className="flex h-80 w-full items-center justify-center rounded-t-card bg-surface shadow-pop sm:w-[340px] sm:rounded-card">
                  <Spinner label="Loading emoji" />
                </div>
              }
            >
              <EmojiPicker
                theme={resolvedTheme}
                width="100%"
                height={380}
                lazyLoadEmojis
                previewConfig={{ showPreview: false }}
                skinTonesDisabled={false}
                onEmojiClick={({ emoji }) => onPick(emoji)}
                style={{ width: 'min(100vw, 340px)', margin: '0 auto' }}
              />
            </Suspense>
          </div>
        </>
      ) : null}
    </div>
  );
}
