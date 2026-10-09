import { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

const VARIANTS = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800 disabled:bg-brand-300 disabled:shadow-none',
  secondary:
    'bg-surface text-ink border border-border hover:bg-surface-muted hover:border-border-strong disabled:text-ink-subtle',
  ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink disabled:text-ink-subtle',
  danger: 'bg-danger text-white hover:opacity-90 disabled:opacity-50',
};

const SIZES = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-10 w-10',
  'icon-sm': 'h-8 w-8',
};

/** Same look as <Button>, for links (<Link className={buttonClass(...)}>) — never nest a button in a link. */
export function buttonClass({ variant = 'primary', size = 'md', fullWidth = false, className = '' } = {}) {
  return [
    'inline-flex shrink-0 items-center justify-center rounded-xl font-semibold transition-colors duration-150',
    VARIANTS[variant],
    SIZES[size],
    fullWidth ? 'w-full' : '',
    className,
  ].join(' ');
}

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, className = '', disabled, type = 'button', children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth, className: `disabled:cursor-not-allowed ${className}` })}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export default Button;
