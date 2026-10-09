import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe2, MapPin } from 'lucide-react';
import { campusLabel } from '../../lib/campuses.js';

/**
 * "📍 IIT Mandi ▾" chip for people search. value: '' (my campus) | campus id | 'all'.
 */
export default function CampusScopeChip({ campuses, myCampus, value, onChange }) {
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

  const effective = value || myCampus || 'all';
  const label = effective === 'all' ? 'All campuses' : campusLabel(campuses, effective);
  const Icon = effective === 'all' ? Globe2 : MapPin;

  // My campus first, then the rest, then "All campuses".
  const ordered = [...campuses].sort((a, b) => (a.id === myCampus ? -1 : b.id === myCampus ? 1 : 0));
  const options = [...ordered.map((c) => ({ id: c.id, label: c.shortName, mine: c.id === myCampus })), { id: 'all', label: 'All campuses' }];

  const pick = (id) => {
    onChange(id === myCampus ? '' : id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Searching ${label}. Change campus`}
        className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-xs font-semibold text-ink-muted transition-colors hover:border-brand-300 hover:text-ink"
      >
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        {label}
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute left-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-pop animate-fade-in">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={effective === option.id}
              onClick={() => pick(option.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted"
            >
              {option.id === 'all' ? (
                <Globe2 className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
              ) : (
                <MapPin className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
              )}
              <span className="flex-1">
                {option.label}
                {option.mine ? <span className="ml-1 text-xs text-ink-subtle">(yours)</span> : null}
              </span>
              {effective === option.id ? <Check className="h-4 w-4 text-accent" aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
