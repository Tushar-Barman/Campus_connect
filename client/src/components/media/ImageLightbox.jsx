import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { downloadUrl } from '../../lib/media.js';

/** Full-screen photo viewer. Esc or the backdrop closes it. */
export default function ImageLightbox({ src, alt = 'Shared photo', caption, onClose }) {
  const closeRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!src) return undefined;
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    const onKey = (event) => event.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [src]);

  if (!src) return null;

  const button = 'flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20';

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Photo viewer" className="fixed inset-0 z-50 flex flex-col bg-scrim/90 animate-fade-in">
      <div className="flex justify-end gap-2 p-3">
        <a href={downloadUrl(src)} download className={button} aria-label="Download photo" title="Download">
          <Download className="h-5 w-5" aria-hidden="true" />
        </a>
        <button ref={closeRef} type="button" onClick={onClose} className={button} aria-label="Close photo viewer">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3" onClick={onClose}>
        <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg object-contain shadow-pop" onClick={(e) => e.stopPropagation()} />
      </div>
      {caption ? <p className="px-4 pb-5 text-center text-sm text-white">{caption}</p> : null}
    </div>,
    document.body,
  );
}
