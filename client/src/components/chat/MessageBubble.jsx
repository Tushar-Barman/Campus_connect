import { memo, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Check,
  CheckCheck,
  Clock,
  Copy,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Reply,
  RotateCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { formatTime } from '../../lib/format.js';
import { canDeleteForEveryone, canEdit, isDeleted } from '../../lib/messageRules.js';
import { useBubbleGestures } from '../../lib/useBubbleGestures.js';
import { idOf, replySnippet } from '../../lib/conversation.js';
import VoicePlayer from '../media/VoicePlayer.jsx';
import MessageText from './MessageText.jsx';

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

// Items are worked out when the menu opens, so the edit/delete time windows are current.
function menuItems({ message, myId, isPinned, onPin, onUnpin, onEdit, onDelete, onReply }) {
  if (isDeleted(message)) {
    return onDelete ? [{ key: 'hide', label: 'Delete for me', Icon: Trash2, onSelect: () => onDelete(message), danger: true }] : [];
  }
  const now = Date.now();
  const items = [];
  if (onReply) items.push({ key: 'reply', label: 'Reply', Icon: Reply, onSelect: () => onReply(message) });
  items.push(
    isPinned
      ? { key: 'unpin', label: 'Unpin', Icon: PinOff, onSelect: onUnpin }
      : { key: 'pin', label: 'Pin message', Icon: Pin, onSelect: onPin },
  );
  if (message.text) {
    items.push({
      key: 'copy',
      label: 'Copy text',
      Icon: Copy,
      onSelect: () => navigator.clipboard?.writeText(message.text || '').catch(() => {}),
    });
  }
  if (onEdit && canEdit(message, myId, now)) {
    items.push({ key: 'edit', label: 'Edit', Icon: Pencil, onSelect: () => onEdit(message) });
  }
  if (onDelete) {
    const label = canDeleteForEveryone(message, myId, now) ? 'Delete' : 'Delete for me';
    items.push({ key: 'delete', label, Icon: Trash2, onSelect: () => onDelete(message), danger: true });
  }
  return items;
}

function MessageMenu({ open, setOpen, mine, items }) {
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
  }, [open, setOpen]);

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
          className={`absolute top-8 z-20 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-pop animate-fade-in ${mine ? 'right-0' : 'left-0'}`}
        >
          {items.map(({ key, label, Icon, onSelect, danger }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-muted ${danger ? 'text-danger' : ''}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Round 2: the quoted message at the top of a reply. Clicking it jumps to the original.
function ReplyQuote({ quote, mine, myId, onJump }) {
  const name = !quote?.senderId ? '' : idOf(quote.senderId) === myId ? 'You' : quote.senderId.name || 'Deleted user';
  const content = (
    <>
      {name ? <span className={`block text-xs font-semibold ${mine ? 'text-white' : 'text-brand-700'}`}>{name}</span> : null}
      <span className={`block truncate text-xs ${mine ? 'text-brand-100' : 'text-ink-muted'} ${quote?.deleted || !quote ? 'italic' : ''}`}>
        {replySnippet(quote)}
      </span>
    </>
  );
  const box = `mb-1.5 block w-full min-w-0 rounded-lg border-l-4 px-2.5 py-1 text-left ${
    mine ? 'border-white/70 bg-white/15' : 'border-brand-500 bg-brand-50'
  }`;
  if (!quote?._id || !onJump) return <div className={box}>{content}</div>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onJump(String(quote._id));
      }}
      className={`${box} hover:opacity-90`}
      aria-label={`Go to the message from ${name || 'someone'}: ${replySnippet(quote)}`}
    >
      {content}
    </button>
  );
}

function MessageBody({ message, mine, myId, people }) {
  if (isDeleted(message)) {
    return (
      <p className={`flex items-center gap-1.5 italic ${mine ? 'text-brand-100' : 'text-ink-subtle'}`}>
        <Ban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        This message was deleted
      </p>
    );
  }
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
  return <MessageText message={message} people={people} myId={myId} mine={mine} />;
}

function MessageBubble({
  message,
  mine,
  myId,
  status,
  isPinned,
  showSender,
  groupedWithPrevious,
  highlighted,
  onRetry,
  onDiscard,
  onPin,
  onUnpin,
  onEdit,
  onDelete,
  onReply,
  onJump,
  people,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const failed = status === 'failed';
  const confirmed = Boolean(message._id);
  const deleted = isDeleted(message);
  const items = menuOpen ? menuItems({ message, myId, isPinned, onPin, onUnpin, onEdit, onDelete, onReply }) : null;
  const hasMenu = confirmed && (!deleted || Boolean(onDelete));
  const canReply = confirmed && !deleted && Boolean(onReply);
  const gestures = useBubbleGestures({
    onLongPress: hasMenu ? () => setMenuOpen(true) : null,
    onSwipeRight: canReply ? () => onReply(message) : null,
  });

  return (
    <div
      id={message._id ? `msg-${message._id}` : undefined}
      className={`group flex items-end gap-1 ${mine ? 'flex-row-reverse' : ''} ${groupedWithPrevious ? 'mt-0.5' : 'mt-3'}`}
    >
      <div className={`flex max-w-[82%] flex-col sm:max-w-[70%] ${mine ? 'items-end' : 'items-start'}`}>
        <div
          {...gestures.handlers}
          onDoubleClick={canReply ? () => onReply(message) : undefined}
          style={gestures.offset ? { transform: `translateX(${gestures.offset}px)` } : undefined}
          className={[
            'touch-pan-y px-3.5 py-2 text-sm shadow-sm transition-shadow duration-300 rounded-bubble',
            mine ? (failed ? 'bg-danger text-white' : 'bg-brand-600 text-white') : 'bg-surface text-ink',
            mine && !groupedWithPrevious ? 'rounded-br-md' : '',
            !mine && !groupedWithPrevious ? 'rounded-bl-md' : '',
            status === 'sending' || status === 'uploading' ? 'opacity-80' : '',
            deleted ? 'opacity-90' : '',
            highlighted ? 'ring-4 ring-star/60' : '',
          ].join(' ')}
        >
          {showSender ? <p className="mb-0.5 text-xs font-semibold text-brand-700">{message.senderId?.name || 'Deleted user'}</p> : null}
          {message.replyTo !== undefined && !deleted ? <ReplyQuote quote={message.replyTo} mine={mine} myId={myId} onJump={onJump} /> : null}
          <MessageBody message={message} mine={mine} myId={myId} people={people} />
          {status === 'uploading' ? (
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/25" role="progressbar" aria-label="Uploading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((message.progress || 0) * 100)}>
              <div className="h-full bg-white transition-[width] duration-200" style={{ width: `${Math.round((message.progress || 0) * 100)}%` }} />
            </div>
          ) : null}
          <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${mine ? 'text-brand-100' : 'text-ink-subtle'}`}>
            {isPinned && !deleted ? <Pin className="h-3 w-3" aria-label="Pinned" role="img" /> : null}
            {message.editedAt && !deleted ? <span>edited</span> : null}
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
            {mine && !deleted ? <ReceiptTicks status={status} /> : null}
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
      {hasMenu ? <MessageMenu open={menuOpen} setOpen={setMenuOpen} mine={mine} items={items ?? []} /> : null}
    </div>
  );
}

export default memo(MessageBubble);
