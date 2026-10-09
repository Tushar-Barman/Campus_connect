import { useId } from 'react';

/**
 * Segmented control (a radio group that looks like buttons).
 * options: [{ value, label, Icon? }]. Arrow keys move between options.
 */
export default function Segmented({ label, value, onChange, options, description }) {
  const id = useId();
  const index = options.findIndex((o) => o.value === value);

  const onKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const next = options[(index + step + options.length) % options.length];
    onChange(next.value);
    document.getElementById(`${id}-${next.value}`)?.focus();
  };

  return (
    <div>
      <p id={`${id}-label`} className="text-sm font-medium text-ink">
        {label}
      </p>
      {description ? <p className="mt-0.5 text-xs text-ink-subtle">{description}</p> : null}
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        onKeyDown={onKeyDown}
        className="mt-2 inline-flex flex-wrap gap-1 rounded-xl border border-border bg-surface-muted p-1"
      >
        {options.map(({ value: optionValue, label: text, Icon }) => {
          const selected = optionValue === value;
          return (
            <button
              key={optionValue}
              id={`${id}-${optionValue}`}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (index === -1 && optionValue === options[0].value) ? 0 : -1}
              onClick={() => onChange(optionValue)}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors duration-150 ${
                selected ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
