import { useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { useSocketEvent } from '@p3/hooks/useSocketEvent.js';

/** Shows when the live connection drops. Listens through P3's useSocketEvent (no direct socket access). */
export default function ConnectionBanner() {
  const [state, setState] = useState('ok'); // 'ok' | 'reconnecting' | 'error'
  useSocketEvent('connect', () => setState('ok'));
  useSocketEvent('disconnect', (reason) => setState(reason === 'io client disconnect' ? 'ok' : 'reconnecting'));
  useSocketEvent('connect_error', () => setState((s) => (s === 'ok' ? 'error' : s)));

  if (state === 'reconnecting') {
    return (
      <div role="status" className="flex items-center justify-center gap-2 bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-ink">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        Reconnecting… messages will send when you're back online
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div role="alert" className="flex items-center justify-center gap-2 bg-danger-soft px-3 py-1.5 text-xs font-medium text-danger">
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        Can't connect to live chat. Refresh the page or try again later.
      </div>
    );
  }
  return null;
}
