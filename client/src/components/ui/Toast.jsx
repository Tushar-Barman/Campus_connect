import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
const DURATION_MS = 3500;

const STYLES = {
  success: { Icon: CheckCircle2, className: 'text-success' },
  error: { Icon: AlertTriangle, className: 'text-danger' },
  info: { Icon: Info, className: 'text-accent' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((all) => all.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (kind, message) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, kind, message }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo(
    () => ({
      success: (m) => show('success', m),
      error: (m) => show('error', m),
      info: (m) => show('info', m),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
        aria-live="polite"
        role="status"
      >
        {toasts.map(({ id, kind, message }) => {
          const { Icon, className } = STYLES[kind];
          return (
            <div
              key={id}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm shadow-pop animate-slide-up"
            >
              <Icon className={`h-4.5 w-4.5 shrink-0 ${className}`} aria-hidden="true" />
              <span className="flex-1">{message}</span>
              <button
                type="button"
                onClick={() => dismiss(id)}
                aria-label="Dismiss notification"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-muted"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
