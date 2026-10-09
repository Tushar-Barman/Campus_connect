import { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * ⋮ button with a dropdown. items: [{ key, label, Icon, onSelect, danger? }].
 * Closes on outside click, Esc, or choosing an item.
 */
export default function Menu({ items, label = 'More options', align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!ref.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!items?.length) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <MoreVertical className="h-4.5 w-4.5" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-11 z-30 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-pop animate-fade-in ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {items.map(({ key, label: text, Icon, onSelect, danger }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-muted ${danger ? 'text-danger' : ''}`}
            >
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
