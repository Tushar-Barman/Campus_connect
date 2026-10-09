import { Fragment, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, Loader2, MessageCircle } from 'lucide-react';
import { getReceiptStatus } from '@p3/hooks/useReceipts.js';
import MessageBubble from './MessageBubble.jsx';
import TypingIndicator from './TypingIndicator.jsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback.jsx';
import { formatDayLabel, isSameDay } from '../../lib/format.js';
import { errorText, idOf, typingLabel } from '../../lib/conversation.js';

const NEAR_BOTTOM_PX = 120;
const LOAD_OLDER_PX = 80;

// Stable identity for scroll bookkeeping only (a draft keeps its clientId after it is confirmed).
const scrollKey = (m) => (m ? m.clientId || m._id : null);

function LoadingBubbles() {
  return (
    <div className="space-y-3 py-4" aria-label="Loading messages">
      {['w-48', 'w-64 ml-auto', 'w-40', 'w-56 ml-auto', 'w-36'].map((w, i) => (
        <Skeleton key={i} className={`h-10 rounded-bubble ${w}`} />
      ))}
    </div>
  );
}

/** `chat` is the object returned by P3's useMessages(conversationId, currentUser). */
export default function MessageList({ conversation, chat, myId, typingUsers, pinnedIds, highlightId, onPin, onUnpin, onEdit, onDelete }) {
  const scrollRef = useRef(null);
  const atBottomRef = useRef(true);
  const prevRef = useRef({ first: null, last: null, length: 0, scrollHeight: 0 });
  const [unseen, setUnseen] = useState(0);

  const { messages, hasMore, loading, loadingOlder, error, loadOlder, reload, retryMessage, discardMessage } = chat;
  const isGroup = conversation.type === 'group';
  const typingText = typingLabel(typingUsers);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    atBottomRef.current = true;
    setUnseen(0);
  }, []);

  // Keep the view where the user expects it after every change to the list.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = prevRef.current;
    const first = scrollKey(messages[0]);
    const last = scrollKey(messages[messages.length - 1]);

    if (prev.length === 0 && messages.length > 0) {
      el.scrollTop = el.scrollHeight; // first load: start at the newest message
    } else if (first !== prev.first && last === prev.last && messages.length > prev.length) {
      el.scrollTop += el.scrollHeight - prev.scrollHeight; // older page prepended: don't jump
    } else if (last !== prev.last && messages.length > 0) {
      const newest = messages[messages.length - 1];
      if (idOf(newest.senderId) === myId || atBottomRef.current) el.scrollTop = el.scrollHeight;
      else setUnseen((n) => n + 1);
    }
    prevRef.current = { first, last, length: messages.length, scrollHeight: el.scrollHeight };
  }, [messages, myId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && typingText && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [typingText]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance < NEAR_BOTTOM_PX;
    if (atBottomRef.current && unseen) setUnseen(0);
    prevRef.current.scrollHeight = el.scrollHeight;
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) loadOlder();
  };

  let content;
  if (loading && messages.length === 0) {
    content = <LoadingBubbles />;
  } else if (error && messages.length === 0) {
    content = <ErrorState title="Couldn't load messages" message={errorText(error)} onRetry={reload} className="h-full" />;
  } else if (messages.length === 0) {
    content = <EmptyState icon={MessageCircle} title="Say hello 👋" description="This is the start of your conversation." className="h-full" />;
  } else {
    content = (
      <>
        <div className="flex h-8 items-center justify-center">
          {loadingOlder ? (
            <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-label="Loading older messages" />
          ) : !hasMore ? (
            <span className="text-[11px] text-ink-subtle">Start of conversation</span>
          ) : null}
        </div>
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const senderId = idOf(message.senderId);
          const mine = senderId === myId;
          const newDay = !previous || !isSameDay(new Date(previous.createdAt), new Date(message.createdAt));
          const grouped = !newDay && previous && idOf(previous.senderId) === senderId;
          return (
            // P3 rendering rule: key = message._id ?? message.clientId
            <Fragment key={message._id ?? message.clientId}>
              {newDay ? (
                <div className="my-4 flex justify-center">
                  <span className="rounded-full bg-surface px-3 py-1 text-[11px] font-medium text-ink-muted shadow-sm">
                    {formatDayLabel(message.createdAt)}
                  </span>
                </div>
              ) : null}
              <MessageBubble
                message={message}
                mine={mine}
                myId={myId}
                status={mine ? getReceiptStatus(message, conversation.participants) : undefined}
                isPinned={Boolean(message._id && pinnedIds.has(message._id))}
                showSender={isGroup && !mine && !grouped}
                groupedWithPrevious={grouped}
                highlighted={highlightId && message._id === highlightId}
                onRetry={() => retryMessage(message.clientId)}
                onDiscard={() => discardMessage(message.clientId)}
                onPin={() => onPin(message)}
                onUnpin={() => onUnpin(message)}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            </Fragment>
          );
        })}
      </>
    );
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="h-full overflow-y-auto px-3 pb-3 sm:px-6"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
      >
        {content}
        {typingText ? <TypingIndicator label={typingText} /> : null}
      </div>
      {unseen > 0 ? (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-pop animate-slide-up hover:bg-brand-700"
        >
          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
          {unseen} new {unseen === 1 ? 'message' : 'messages'}
        </button>
      ) : null}
    </div>
  );
}
