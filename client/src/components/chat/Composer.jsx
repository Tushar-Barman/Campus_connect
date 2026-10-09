import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, FileUp, Mic, Paperclip, Pencil, Reply, SendHorizontal, X } from 'lucide-react';
import { useVoiceRecorder } from '@p3/hooks/useVoiceRecorder.js';
import Button from '../ui/Button.jsx';
import Avatar from '../ui/Avatar.jsx';
import { idOf, replySnippet } from '../../lib/conversation.js';
import { useMentionAutocomplete } from '../../lib/useMentionAutocomplete.js';
import { ATTACH_ACCEPT } from '../../lib/media.js';
import EmojiButton from './EmojiButton.jsx';
import { formatDuration } from '../../lib/media.js';

export const MESSAGE_MAX = 4000;
const COUNTER_FROM = 3500;
const MAX_HEIGHT_PX = 160;

function RecordingBar({ elapsedMs, maxDurationMs }) {
  return (
    <div className="flex h-11 flex-1 items-center gap-3 rounded-2xl border border-danger/30 bg-danger-soft px-3 animate-fade-in" role="status">
      <span className="h-2.5 w-2.5 rounded-full bg-danger animate-pulse-dot" aria-hidden="true" />
      <span className="text-sm font-semibold tabular-nums text-danger" aria-label={`Recording, ${formatDuration(elapsedMs / 1000)}`}>
        {formatDuration(elapsedMs / 1000)}
      </span>
      <span className="flex-1 truncate text-xs text-ink-muted">Release to send · slide away to cancel</span>
      <span className="hidden text-[11px] text-ink-subtle sm:inline">max {formatDuration(maxDurationMs / 1000)}</span>
    </div>
  );
}

function EditingBar({ onCancel }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-brand-500 bg-brand-50 px-3 py-1.5 text-xs animate-fade-in">
      <Pencil className="h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden="true" />
      <span className="flex-1 font-semibold text-brand-800">Editing message</span>
      <span className="hidden text-ink-subtle sm:inline">Esc to cancel</span>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel editing"
        className="flex h-6 w-6 items-center justify-center rounded-full text-ink-muted hover:bg-brand-100 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function ReplyBar({ message, myId, onCancel }) {
  const name = idOf(message.senderId) === myId ? 'yourself' : message.senderId?.name || 'Deleted user';
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-brand-500 bg-brand-50 px-3 py-1.5 text-xs animate-fade-in">
      <Reply className="h-3.5 w-3.5 shrink-0 text-brand-700" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-brand-800">Replying to {name}</span>
        <span className="block truncate text-ink-muted">{replySnippet(message)}</span>
      </span>
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel reply"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-brand-100 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function MentionList({ mentions }) {
  return (
    <ul
      role="listbox"
      aria-label="Mention someone"
      className="absolute bottom-full left-0 z-30 mb-2 w-full max-w-xs overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-pop animate-fade-in"
    >
      {mentions.suggestions.map((member, index) => (
        <li key={member._id} role="option" aria-selected={index === mentions.active}>
          <button
            type="button"
            // mousedown, so the textarea keeps focus
            onMouseDown={(e) => {
              e.preventDefault();
              mentions.select(member);
            }}
            onMouseEnter={() => mentions.setActive(index)}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${index === mentions.active ? 'bg-brand-50' : ''}`}
          >
            <Avatar name={member.name} src={member.profilePicture} size="xs" />
            <span className="truncate">{member.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * 📎 menu. "Photo or document" opens the file picker; `extraItems` ([{ key, label, Icon, onSelect }])
 * lets the chat add more (e.g. location sharing).
 */
function AttachMenu({ onFiles, extraItems = [] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const items = [
    { key: 'file', label: 'Photo or document', Icon: FileUp, onSelect: () => inputRef.current?.click() },
    ...extraItems,
  ];

  return (
    <div ref={rootRef} className="relative shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept={ATTACH_ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = ''; // picking the same file twice still fires change
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Attach"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Attach a photo or file"
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink"
      >
        <Paperclip className="h-4.5 w-4.5" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-12 left-0 z-30 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-pop animate-slide-up">
          {items.map(({ key, label, Icon, onSelect }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-muted"
            >
              <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Text input + voice notes.
 * onInput → P3 useTyping().notifyTyping · onStopTyping → stopTyping · onRecorded → P3 useMessages().sendVoiceNote
 * Round 2: `editing` (a message) switches to edit mode; onSubmitEdit(text) may reject with an axios error.
 * `replyingTo` shows the quote bar; `members` (groups only) enables @mentions. onSend(text, { mentions }).
 */
export default function Composer({
  onSend,
  onInput,
  onStopTyping,
  onRecorded,
  editing = null,
  onSubmitEdit,
  onCancelEdit,
  replyingTo = null,
  onCancelReply,
  myId,
  members = [],
  onAttachFiles,
  attachItems,
}) {
  const [text, setText] = useState('');
  const [shownError, setShownError] = useState('');
  const [saving, setSaving] = useState(false);
  const ref = useRef(null);
  const draftRef = useRef(''); // what was being typed before Edit was chosen
  const editingId = editing?._id ?? null;
  const replyingId = replyingTo?._id ?? null;
  const mentions = useMentionAutocomplete({ members, text, setText, inputRef: ref });

  useEffect(() => {
    if (replyingId) ref.current?.focus();
  }, [replyingId]);

  // Entering edit mode loads the message text; leaving it restores the earlier draft.
  useEffect(() => {
    if (!editingId) return undefined;
    setText((current) => {
      draftRef.current = current;
      return editing.text || '';
    });
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => setText(draftRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  // Round 2: put an emoji where the caret is (or at the end) and keep typing from there.
  const insertEmoji = (emoji) => {
    const el = ref.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText((current) => current.slice(0, start) + emoji + current.slice(end));
    onInput();
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = start + emoji.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const flashError = (message) => {
    setShownError(message);
    setTimeout(() => setShownError(''), 4000);
  };

  // P3's recorder: <button {...holdProps}>, hold to record, release to send, slide away to cancel.
  const recorder = useVoiceRecorder(onRecorded);
  const { isSupported, isRecording, elapsedMs, maxDurationMs, error, holdProps } = recorder;

  useEffect(() => {
    if (!error) return undefined;
    setShownError(typeof error === 'string' ? error : error.message || 'Recording failed');
    const id = setTimeout(() => setShownError(''), 4000);
    return () => clearTimeout(id);
  }, [error]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text, isRecording]);

  const trimmed = text.trim();
  const tooLong = text.length > MESSAGE_MAX;
  const canSend = trimmed.length > 0 && !tooLong;

  const send = async () => {
    if (!canSend || saving) return;
    if (editingId) {
      if (trimmed === (editing.text || '').trim()) {
        onCancelEdit?.();
        return;
      }
      setSaving(true);
      try {
        await onSubmitEdit(trimmed);
        onCancelEdit?.();
      } catch (err) {
        flashError(err?.response?.data?.error || 'Could not edit the message');
      } finally {
        setSaving(false);
      }
      return;
    }
    onSend(trimmed, { mentions: mentions.mentionIdsIn(trimmed) });
    mentions.reset();
    setText('');
    ref.current?.focus();
  };

  return (
    <form
      className="border-t border-border bg-surface px-3 py-3 sm:px-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      {editingId ? <EditingBar onCancel={onCancelEdit} /> : null}
      {replyingTo && !editingId ? <ReplyBar message={replyingTo} myId={myId} onCancel={onCancelReply} /> : null}
      {shownError ? (
        <p className="mb-2 text-xs text-danger" role="alert">
          {shownError}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        {onAttachFiles && !editingId && !isRecording ? <AttachMenu onFiles={onAttachFiles} extraItems={attachItems} /> : null}
        {!isRecording ? <EmojiButton onPick={insertEmoji} /> : null}
        {isRecording ? (
          <RecordingBar elapsedMs={elapsedMs} maxDurationMs={maxDurationMs} />
        ) : (
          <div className="relative flex-1">
            {mentions.open ? <MentionList mentions={mentions} /> : null}
            <label htmlFor="composer" className="sr-only">Message</label>
            <textarea
              id="composer"
              ref={ref}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                mentions.track(e.target.value, e.target.selectionStart);
                if (e.target.value.trim()) onInput();
                else onStopTyping();
              }}
              onKeyDown={(e) => {
                if (mentions.onKeyDown(e)) return;
                if (e.key === 'Escape' && editingId) {
                  e.preventDefault();
                  onCancelEdit?.();
                  return;
                }
                if (e.key === 'Escape' && replyingId) {
                  e.preventDefault();
                  onCancelReply?.();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              onBlur={() => {
                onStopTyping();
                mentions.close();
              }}
              onPaste={(e) => {
                // Round 2: paste a screenshot/photo straight into the chat.
                const files = e.clipboardData?.files;
                if (onAttachFiles && !editingId && files?.length) {
                  e.preventDefault();
                  onAttachFiles(files);
                }
              }}
              aria-autocomplete={members.length ? 'list' : undefined}
              aria-expanded={members.length ? mentions.open : undefined}
              placeholder={editingId ? 'Edit your message' : 'Type a message'}
              aria-invalid={tooLong || undefined}
              className="block max-h-40 w-full resize-none rounded-2xl border border-border bg-canvas px-4 py-2.5 text-sm placeholder:text-ink-subtle focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15 focus:outline-none"
            />
            {text.length >= COUNTER_FROM ? (
              <span className={`absolute right-3 -top-5 text-[11px] ${tooLong ? 'text-danger' : 'text-ink-subtle'}`} aria-live="polite">
                {text.length}/{MESSAGE_MAX}
              </span>
            ) : null}
          </div>
        )}

        {editingId ? (
          <Button type="submit" size="icon" className="rounded-full" disabled={!canSend} loading={saving} aria-label="Save edit">
            {saving ? null : <Check className="h-4.5 w-4.5" aria-hidden="true" />}
          </Button>
        ) : trimmed && !isRecording ? (
          <Button type="submit" size="icon" className="rounded-full" disabled={!canSend} aria-label="Send message">
            <SendHorizontal className="h-4.5 w-4.5" aria-hidden="true" />
          </Button>
        ) : isSupported ? (
          // P3 rules: holdProps, `touch-none select-none`, aria-label, hidden when !isSupported
          <button
            type="button"
            {...holdProps}
            aria-label={isRecording ? 'Recording: release to send' : 'Hold to record a voice note'}
            title="Hold to record a voice note"
            className={`flex h-10 w-10 shrink-0 touch-none items-center justify-center rounded-full transition-colors select-none ${
              isRecording ? 'scale-110 bg-danger text-white' : 'border border-border bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink'
            }`}
          >
            <Mic className="h-4.5 w-4.5" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p className="mt-1.5 hidden text-[11px] text-ink-subtle sm:block">
        Enter to send · Shift + Enter for a new line{isSupported ? ' · hold the mic for a voice note' : ''}
      </p>
    </form>
  );
}
