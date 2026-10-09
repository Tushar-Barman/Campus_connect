import { useState } from 'react';
import { ChevronDown, Pin, PinOff } from 'lucide-react';
import { formatListTime } from '../../lib/format.js';
import { previewText } from '../../lib/conversation.js';

export default function PinnedBar({ pinned, onJump, onUnpin }) {
  const [open, setOpen] = useState(false);
  if (!pinned.length) return null;

  const latest = pinned[0];

  return (
    <div className="border-b border-border bg-surface/95">
      <div className="flex items-center gap-2 px-3 py-2 sm:px-4">
        <Pin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
        <button
          type="button"
          onClick={() => onJump(latest._id)}
          className="min-w-0 flex-1 text-left"
          title="Show pinned message"
        >
          <span className="block text-[11px] font-semibold text-brand-700">
            Pinned{pinned.length > 1 ? ` · ${pinned.length}` : ''}
          </span>
          <span className="block truncate text-xs text-ink-muted">{previewText(latest)}</span>
        </button>
        {pinned.length > 1 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Hide pinned messages' : 'Show all pinned messages'}
            aria-expanded={open}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {open ? (
        <ul className="max-h-48 overflow-y-auto border-t border-border px-2 py-1 animate-fade-in">
          {pinned.map((m) => (
            <li key={m._id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
              <button type="button" onClick={() => onJump(m._id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-xs text-ink">{previewText(m)}</span>
                <span className="block text-[10px] text-ink-subtle">
                  {m.senderId?.name} · {formatListTime(m.createdAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onUnpin(m)}
                aria-label="Unpin message"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface hover:text-ink"
              >
                <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
