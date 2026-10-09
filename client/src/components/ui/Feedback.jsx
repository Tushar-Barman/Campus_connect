import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import Button from './Button.jsx';

export function Spinner({ className = 'h-5 w-5', label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex">
      <Loader2 className={`animate-spin text-brand-600 ${className}`} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export function FullScreenLoader({ label = 'Loading CampusConnect' }) {
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Spinner className="h-7 w-7" label={label} />
        <p className="text-sm">{label}…</p>
      </div>
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <span className={`block animate-pulse rounded-lg bg-surface-muted ${className}`} aria-hidden="true" />;
}

export function EmptyState({ icon: Icon, title, description, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-10 text-center animate-fade-in ${className}`}>
      {Icon ? (
        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-xs text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className = '' }) {
  return (
    <div role="alert" className={`flex flex-col items-center justify-center px-6 py-10 text-center animate-fade-in ${className}`}>
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {message ? <p className="mt-1 max-w-xs text-sm text-ink-muted">{message}</p> : null}
      {onRetry ? (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function Alert({ children, className = '' }) {
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-sm text-danger animate-fade-in ${className}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function Badge({ children, tone = 'brand', className = '', ...props }) {
  const tones = {
    brand: 'bg-brand-600 text-white',
    soft: 'bg-brand-50 text-brand-700',
    neutral: 'bg-surface-muted text-ink-muted',
    warning: 'bg-warning-soft text-warning-ink',
  };
  return (
    <span className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold ${tones[tone]} ${className}`} {...props}>
      {children}
    </span>
  );
}
