import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageSquareOff } from 'lucide-react';
import { useMessages } from '@p3/hooks/useMessages.js';
import { usePinnedMessages } from '@p3/hooks/usePinnedMessages.js';
import { useTyping } from '@p3/hooks/useTyping.js';
import ChatHeader from './ChatHeader.jsx';
import PinnedBar from './PinnedBar.jsx';
import MessageList from './MessageList.jsx';
import Composer from './Composer.jsx';
import ConnectionBanner from './ConnectionBanner.jsx';
import GroupInfoPanel from '../group/GroupInfoPanel.jsx';
import ContactPanel from '../group/ContactPanel.jsx';
import ChatMemoryPanel from '../memory/ChatMemoryPanel.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { EmptyState } from '../ui/Feedback.jsx';
import { buttonClass } from '../ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useConversationList } from '../../context/ConversationsContext.jsx';
import { conversationsApi, getErrorMessage } from '../../lib/api.js';
import { idOf, isNotFoundError } from '../../lib/conversation.js';
import { canDeleteForEveryone, isDeleted } from '../../lib/messageRules.js';

const HIGHLIGHT_MS = 1600;

export default function ChatWindow({ conversation }) {
  const { user } = useAuth();
  const { patchConversation } = useConversationList();
  const id = conversation._id;

  // P3's hooks (CAUTION_AND_DIRECTION.md, P2 §3)
  const chat = useMessages(id, user);
  const pins = usePinnedMessages(id);
  const typing = useTyping(id);

  const pinnedIds = useMemo(() => new Set(pins.pinned.map((m) => m._id)), [pins.pinned]);

  const [panel, setPanel] = useState(null); // 'info' | 'memory' | null
  const closePanel = useCallback(() => setPanel(null), []);
  const [highlightId, setHighlightId] = useState(null);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // message being edited in the Composer
  const [deleting, setDeleting] = useState(null); // message waiting for delete confirmation
  const [replyingTo, setReplyingTo] = useState(null); // message quoted in the Composer
  const noticeTimer = useRef(null);

  const flash = useCallback((text) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3000);
  }, []);
  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const jumpTo = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) {
      flash('That message is further up. Scroll up to load it.');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(messageId);
    setTimeout(() => setHighlightId(null), HIGHLIGHT_MS);
  };

  const setPinned = async (messageId, value) => {
    try {
      if (value) await pins.pin(messageId);
      else await pins.unpin(messageId);
    } catch (error) {
      flash(getErrorMessage(error, value ? 'Could not pin the message.' : 'Could not unpin the message.'));
    }
  };

  // Star is REST + patchConversation (P3: "after star/unstar, call patchConversation(id, { isStarred })")
  const toggleStar = async () => {
    const next = !conversation.isStarred;
    patchConversation(id, { isStarred: next });
    try {
      if (next) await conversationsApi.star(id);
      else await conversationsApi.unstar(id);
    } catch (error) {
      patchConversation(id, { isStarred: !next });
      throw error;
    }
  };

  // Round 2: edit / delete. In mock mode (P2 stand-ins) these don't exist, so the menu hides them.
  const startEdit = useCallback((message) => {
    setReplyingTo(null);
    setEditing(message);
  }, []);
  const startReply = useCallback((message) => {
    setEditing(null);
    setReplyingTo(message);
  }, []);
  const askDelete = useCallback((message) => setDeleting(message), []);
  const onEdit = chat.editMessage ? startEdit : undefined;
  const onDelete = chat.deleteMessage ? askDelete : undefined;

  const deleteActions = deleting
    ? [
        ...(canDeleteForEveryone(deleting, user?._id)
          ? [{ label: 'Delete for everyone', danger: true, onConfirm: () => chat.deleteMessage(deleting._id, 'everyone') }]
          : []),
        { label: 'Delete for me', danger: !canDeleteForEveryone(deleting, user?._id), onConfirm: () => chat.deleteMessage(deleting._id, 'me') },
      ]
    : [];

  // If the message being edited or quoted gets deleted (e.g. from another tab), drop it.
  useEffect(() => {
    const gone = (target) => {
      const current = chat.messages.find((m) => m._id === target._id);
      return !current || isDeleted(current);
    };
    if (editing && gone(editing)) setEditing(null);
    if (replyingTo && gone(replyingTo)) setReplyingTo(null);
  }, [chat.messages, editing, replyingTo]);

  // @mention candidates: everyone else in a group. Private chats have no mentions.
  const members = useMemo(
    () => (conversation.type === 'group' ? conversation.participants.filter((p) => idOf(p) !== user?._id) : []),
    [conversation.type, conversation.participants, user?._id],
  );

  const sendVoice = (recording) => {
    chat.sendVoiceNote(recording, { replyTo: replyingTo });
    setReplyingTo(null);
  };

  const send = (text, { mentions } = {}) => {
    typing.stopTyping(); // P3: call stopTyping() right before sending
    chat.sendMessage(text, { replyTo: replyingTo, mentions });
    setReplyingTo(null);
  };

  if (isNotFoundError(chat.error)) {
    return (
      <EmptyState
        icon={MessageSquareOff}
        title="This conversation is no longer available"
        description="You may have been removed from this group."
        action={
          <Link to="/chat" className={buttonClass({ variant: 'secondary' })}>
            Back to chats
          </Link>
        }
        className="h-full bg-canvas"
      />
    );
  }

  return (
    <div className="flex h-full flex-col bg-canvas">
      <ChatHeader
        conversation={conversation}
        myId={user?._id}
        typingUsers={typing.typingUsers}
        onToggleStar={toggleStar}
        onOpenInfo={() => setPanel('info')}
        onOpenMemory={() => setPanel('memory')}
      />
      <ConnectionBanner />
      <PinnedBar pinned={pins.pinned} onJump={jumpTo} onUnpin={(m) => setPinned(m._id, false)} />
      {notice ? (
        <div role="status" className="bg-ink px-3 py-1.5 text-center text-xs text-white animate-fade-in">
          {notice}
        </div>
      ) : null}

      <MessageList
        conversation={conversation}
        chat={chat}
        myId={user?._id}
        typingUsers={typing.typingUsers}
        pinnedIds={pinnedIds}
        highlightId={highlightId}
        onPin={(m) => setPinned(m._id, true)}
        onUnpin={(m) => setPinned(m._id, false)}
        onEdit={onEdit}
        onDelete={onDelete}
        onReply={startReply}
        onJump={jumpTo}
      />

      <Composer
        onSend={send}
        onInput={typing.notifyTyping}
        onStopTyping={typing.stopTyping}
        onRecorded={sendVoice}
        editing={editing}
        onSubmitEdit={(text) => chat.editMessage(editing._id, text)}
        onCancelEdit={() => setEditing(null)}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        myId={user?._id}
        members={members}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Delete message?"
        message={
          deleting && isDeleted(deleting)
            ? 'This removes the deleted-message notice from your view only.'
            : deleting && canDeleteForEveryone(deleting, user?._id)
              ? 'Delete for everyone removes it for all members. Delete for me only hides it on your devices.'
              : 'This hides the message on your devices. Others in the chat will still see it.'
        }
        actions={deleteActions}
      />

      {conversation.type === 'group' ? (
        <GroupInfoPanel conversation={conversation} open={panel === 'info'} onClose={closePanel} />
      ) : (
        <ContactPanel conversation={conversation} open={panel === 'info'} onClose={closePanel} />
      )}
      <ChatMemoryPanel conversationId={id} open={panel === 'memory'} onClose={closePanel} />
    </div>
  );
}
