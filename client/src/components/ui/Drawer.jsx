import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/** Right-hand side panel: full screen on phones, 420 px wide on larger screens. */
export default function Drawer({ open, onClose, title, icon: Icon, children, footer }) {
  const titleId = useId();
  const panelRef = useRef(null);
  // Keep the latest onClose without re-running the open/focus effect on every render
  // (re-running it would steal focus from inputs inside after each keystroke).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus(); // keep autoFocus inputs focused
    const onKey = (event) => {
      // A confirm dialog opened from inside the drawer handles its own Escape first.
      if (event.key === 'Escape' && !document.querySelector('[role=dialog][aria-modal=true]:not([data-drawer])')) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/30 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        data-drawer=""
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-full w-full flex-col bg-surface shadow-pop animate-slide-in focus:outline-none sm:max-w-[420px]"
      >
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          {Icon ? <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" /> : null}
          <h2 id={titleId} className="flex-1 text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer ? <footer className="border-t border-border px-4 py-3">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}
