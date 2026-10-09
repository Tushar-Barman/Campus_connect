import { memo, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCheck, Clock, Copy, MoreVertical, Pin, PinOff, RotateCw, Trash2, UploadCloud } from 'lucide-react';
import { formatTime } from '../../lib/format.js';
import VoicePlayer from '../media/VoicePlayer.jsx';

const TICKS = {
  sending: { Icon: Clock, mine: 'text-brand-200', label: 'Sending' },
  uploading: { Icon: UploadCloud, mine: 'text-brand-200', label: 'Uploading' },
  sent: { Icon: Check, mine: 'text-brand-200', label: 'Sent' },
  delivered: { Icon: CheckCheck, mine: 'text-brand-200', label: 'Delivered' },
  read: { Icon: CheckCheck, mine: 'text-read', label: 'Read' },
  failed: { Icon: AlertCircle, mine: 'text-white', label: 'Failed to send' },
};

export function ReceiptTicks({ status }) {
  const tick = TICKS[status] || TICKS.sent;
  return <tick.Icon className={`h-3.5 w-3.5 ${tick.mine}`} aria-label={tick.label} role="img" />;
}

function MessageMenu({ message, mine, isPinned, onPin, onUnpin }) {
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

  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  const copy = () => navigator.clipboard?.writeText(message.text || '').catch(() => {});

  return (
    <div ref={ref} className="relative self-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Message options"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex h-7 w-7 items-center justify-center rounded-full text-ink-subtle transition-opacity hover:bg-surface-muted hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${open ? 'opacity-100' : 'opacity-0'}`}
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-8 z-20 w-40 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-pop animate-fade-in ${mine ? 'right-0' : 'left-0'}`}
        >
          {isPinned ? (
            <button type="button" role="menuitem" onClick={run(onUnpin)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted">
              <PinOff className="h-4 w-4" aria-hidden="true" /> Unpin
            </button>
          ) : (
            <button type="button" role="menuitem" onClick={run(onPin)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted">
              <Pin className="h-4 w-4" aria-hidden="true" /> Pin message
            </button>
          )}
          {message.text ? (
            <button type="button" role="menuitem" onClick={run(copy)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted">
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy text
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MessageBody({ message, mine }) {
  if (message.messageType === 'voice') {
    return <VoicePlayer src={message.mediaUrl} duration={message.duration} mine={mine} />;
  }
  if (message.messageType === 'image' && message.mediaUrl) {
    return (
      <a href={message.mediaUrl} target="_blank" rel="noopener noreferrer" className="-mx-1.5 -mt-0.5 block">
        <img src={message.mediaUrl} alt="Shared image" loading="lazy" className="max-h-72 rounded-xl object-cover" />
      </a>
    );
  }
  return <p className="break-words whitespace-pre-wrap">{message.text}</p>;
}

function MessageBubble({ message, mine, status, isPinned, showSender, groupedWithPrevious, highlighted, onRetry, onDiscard, onPin, onUnpin }) {
  const failed = status === 'failed';
  const confirmed = Boolean(message._id);

  return (
    <div
      id={message._id ? `msg-${message._id}` : undefined}
      className={`group flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''} ${groupedWithPrevious ? 'mt-0.5' : 'mt-3'}`}
    >
      <div className={`flex max-w-[82%] flex-col sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        <div
          className={[
            'px-3.5 py-2 text-sm shadow-sm transition-shadow duration-300 rounded-bubble',
            mine ? (failed ? 'bg-danger text-white' : 'bg-brand-600 text-white') : 'bg-surface text-ink',
            mine && !groupedWithPrevious ? 'rounded-br-md' : '',
            !mine && !groupedWithPrevious ? 'rounded-bl-md' : '',
            status === 'sending' || status === 'uploading' ? 'opacity-80' : '',
            highlighted ? 'ring-4 ring-star/60' : '',
          ].join(' ')}
        >
          {showSender ? <p className="mb-0.5 text-xs font-semibold text-brand-700">{message.senderId?.name}</p> : null}
          <MessageBody message={message} mine={mine} />
          {status === 'uploading' ? (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/25" role="progressbar" aria-label="Uploading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((message.progress || 0) * 100)}>
              <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${Math.round((message.progress || 0) * 100)}%` }} />
            </div>
          ) : null}
          <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-brand-100' : 'text-ink-subtle'}`}>
            {isPinned ? <Pin className="h-3 w-3" aria-label="Pinned" role="img" /> : null}
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            {mine ? <ReceiptTicks status={status} /> : null}
          </span>
        </div>
        {failed ? (
          // P3 rendering rule: 'failed' shows message.error with Retry and Discard
          <div className="mt-1 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs" role="alert">
            <span className="text-danger">Not sent{message.error ? ` · ${message.error}` : ''}</span>
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold text-danger hover:underline">
              <RotateCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
            <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1 font-semibold text-ink-muted hover:underline">
              <Trash2 className="h-3 w-3" aria-hidden="true" />
              Discard
            </button>
          </div>
        ) : null}
      </div>
      {confirmed ? <MessageMenu message={message} mine={mine} isPinned={isPinned} onPin={onPin} onUnpin={onUnpin} /> : null}
    </div>
  );
}

export default memo(MessageBubble);
