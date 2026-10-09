import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const Input = forwardRef(function Input(
  { label, error, hint, icon: Icon, trailing, className = '', id, type = 'text', ...props },
  ref,
) {
  const autoId = useId();
  const inputId = id || autoId;
  const messageId = `${inputId}-message`;
  const message = error || hint;

  return (
    <div className={className}>
      {label ? (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <div className="relative">
        {Icon ? (
          <Icon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden="true" />
        ) : null}
        <input
          ref={ref}
          id={inputId}
          type={type}
          aria-invalid={error ? true : undefined}
          aria-describedby={message ? messageId : undefined}
          className={[
            'h-11 w-full rounded-xl border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle',
            'transition-colors duration-150 focus:outline-none focus:ring-4',
            error
              ? 'border-danger focus:ring-danger/15'
              : 'border-border hover:border-border-strong focus:border-brand-500 focus:ring-brand-500/15',
            Icon ? 'pl-9' : '',
            trailing ? 'pr-11' : '',
            'disabled:cursor-not-allowed disabled:bg-surface-muted',
          ].join(' ')}
          {...props}
        />
        {trailing ? <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div> : null}
      </div>
      {message ? (
        <p id={messageId} className={`mt-1.5 text-xs ${error ? 'text-danger' : 'text-ink-subtle'}`} role={error ? 'alert' : undefined}>
          {message}
        </p>
      ) : null}
    </div>
  );
});

export const PasswordInput = forwardRef(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOff : Eye;
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink"
        >
          <Toggle className="h-4 w-4" aria-hidden="true" />
        </button>
      }
      {...props}
    />
  );
});

export default Input;
