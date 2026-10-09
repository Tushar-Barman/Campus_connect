import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin } from 'lucide-react';
import { findCampus } from '../../lib/campuses.js';

/**
 * Searchable campus picker (combobox). Same look as <Input>; no extra dependency.
 * value = campus id ('' = none); onChange(id).
 */
export default function CampusSelect({ label = 'Campus', campuses, value, onChange, error, hint, autoFocus = false, className = '' }) {
  const id = useId();
  const listId = `${id}-list`;
  const messageId = `${id}-message`;
  const selected = findCampus(campuses, value);
  const [query, setQuery] = useState(selected?.name ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);

  // Show the chosen campus whenever the list closes or the value changes from outside.
  useEffect(() => {
    if (!open) setQuery(selected?.name ?? '');
  }, [open, selected?.name]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!open || !q || q === selected?.name.toLowerCase()) return campuses;
    return campuses.filter((c) => `${c.name} ${c.shortName} ${c.city}`.toLowerCase().includes(q));
  }, [campuses, query, open, selected?.name]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const choose = (campus) => {
    onChange(campus.id);
    setQuery(campus.name);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  };

  const message = error || hint;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? (
        <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && matches[active] ? `${id}-${matches[active].id}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="Search for your campus"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onKeyDown={onKeyDown}
          className={[
            'h-11 w-full rounded-xl border bg-surface pr-9 pl-9 text-sm text-ink placeholder:text-ink-subtle',
            'transition-colors duration-150 focus:outline-none focus:ring-4',
            error
              ? 'border-danger focus:ring-danger/15'
              : 'border-border hover:border-border-strong focus:border-brand-500 focus:ring-brand-500/15',
          ].join(' ')}
        />
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
      </div>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Campuses"
          className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-surface py-1 shadow-pop animate-fade-in"
        >
          {matches.length ? (
            matches.map((campus, index) => (
              <li
                key={campus.id}
                id={`${id}-${campus.id}`}
                role="option"
                aria-selected={campus.id === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(campus);
                }}
                onMouseEnter={() => setActive(index)}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${index === active ? 'bg-brand-50' : ''}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{campus.name}</span>
                  <span className="block truncate text-xs text-ink-subtle">{campus.city}</span>
                </span>
                {campus.id === value ? <Check className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" /> : null}
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-sm text-ink-subtle">No campus matches “{query.trim()}”</li>
          )}
        </ul>
      ) : null}
      {message ? (
        <p id={messageId} className={`mt-1.5 text-xs ${error ? 'text-danger' : 'text-ink-subtle'}`} role={error ? 'alert' : undefined}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
