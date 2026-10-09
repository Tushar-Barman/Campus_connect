import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Mic, SendHorizontal } from 'lucide-react';
import { useVoiceRecorder } from '@p3/hooks/useVoiceRecorder.js';
import Button from '../ui/Button.jsx';
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

/**
 * Text input + voice notes.
 * onInput → P3 useTyping().notifyTyping · onStopTyping → stopTyping · onRecorded → P3 useMessages().sendVoiceNote
 */
export default function Composer({ onSend, onInput, onStopTyping, onRecorded }) {
  const [text, setText] = useState('');
  const [shownError, setShownError] = useState('');
  const ref = useRef(null);

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

  const send = () => {
    if (!canSend) return;
    onSend(trimmed);
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
      {shownError ? (
        <p className="mb-2 text-xs text-danger" role="alert">
          {shownError}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        {isRecording ? (
          <RecordingBar elapsedMs={elapsedMs} maxDurationMs={maxDurationMs} />
        ) : (
          <div className="relative flex-1">
            <label htmlFor="composer" className="sr-only">Message</label>
            <textarea
              id="composer"
              ref={ref}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (e.target.value.trim()) onInput();
                else onStopTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              onBlur={onStopTyping}
              placeholder="Type a message"
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

        {trimmed && !isRecording ? (
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
