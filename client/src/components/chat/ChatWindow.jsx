import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileUp, LocateFixed, MapPin, MessageSquareOff } from 'lucide-react';
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
import MessageInfoPanel from './MessageInfoPanel.jsx';
import LocationShareSheet from '../location/LocationShareSheet.jsx';
import { findCampus, useCampuses } from '../../lib/campuses.js';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import AttachSheet from '../media/AttachSheet.jsx';
import { classifyAttachment } from '../../lib/media.js';
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

  const [panel, setPanel] = useState(null); // 'info' | 'memory' | 'message' | null
  const [infoId, setInfoId] = useState(null); // message shown in the Message info drawer
  // Round 2: location sheet. { respondsTo?: request message } while open, null when closed.
  const [locationSheet, setLocationSheet] = useState(null);
  const { campuses } = useCampuses();
  const myCampus = findCampus(campuses, user?.campus);
  const closePanel = useCallback(() => setPanel(null), []);
  const [highlightId, setHighlightId] = useState(null);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null); // message being edited in the Composer
  const [deleting, setDeleting] = useState(null); // message waiting for delete confirmation
  const [replyingTo, setReplyingTo] = useState(null); // message quoted in the Composer
  const [attachment, setAttachment] = useState(null); // { file, kind, mime } waiting in the preview sheet
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
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
  const showInfo = useCallback((message) => {
    setInfoId(message._id);
    setPanel('message');
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

  // Round 2: turning read receipts on/off changes which reads the server shows us; refetch.
  const receiptsSetting = user?.settings?.readReceipts;
  const reloadRef = useRef(chat.reload);
  reloadRef.current = chat.reload;
  const firstReceiptsRun = useRef(true);
  useEffect(() => {
    if (firstReceiptsRun.current) {
      firstReceiptsRun.current = false;
      return;
    }
    reloadRef.current?.();
  }, [receiptsSetting]);

  // @mention candidates: everyone else in a group. Private chats have no mentions.
  const members = useMemo(
    () => (conversation.type === 'group' ? conversation.participants.filter((p) => idOf(p) !== user?._id) : []),
    [conversation.type, conversation.participants, user?._id],
  );

  // Round 2: files from the 📎 picker, paste or drag-and-drop. One at a time, previewed first.
  const canAttach = Boolean(chat.sendFile);
  const pickFiles = (files) => {
    const file = files?.[0];
    if (!file) return;
    const result = classifyAttachment(file);
    if (result.error) {
      flash(result.error);
      return;
    }
    if (files.length > 1) flash('One file at a time: sending the first one.');
    setAttachment({ file, ...result });
  };
  const sendAttachment = (caption) => {
    chat.sendFile(attachment.file, { mime: attachment.mime, caption, replyTo: replyingTo });
    setAttachment(null);
    setReplyingTo(null);
  };
  const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
  const dropHandlers = canAttach
    ? {
        onDragEnter: (e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        },
        onDragOver: (e) => {
          if (hasFiles(e)) e.preventDefault();
        },
        onDragLeave: (e) => {
          if (!hasFiles(e)) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (!dragDepth.current) setDragging(false);
        },
        onDrop: (e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          pickFiles(e.dataTransfer.files);
        },
      }
    : {};

  // Round 2: location sharing (hidden in mock mode, where these don't exist).
  const canLocate = Boolean(chat.sendLocation);
  const attachItems = canLocate
    ? [
        { key: 'location', label: 'Share my location', Icon: MapPin, onSelect: () => setLocationSheet({}) },
        {
          key: 'ask-location',
          label: 'Ask for location',
          Icon: LocateFixed,
          onSelect: () => chat.requestLocation().catch((err) => flash(getErrorMessage(err, 'Could not send the request.'))),
        },
      ]
    : undefined;
  const sendLocation = (point) => {
    const respondsTo = locationSheet?.respondsTo;
    const replyTo = respondsTo ? undefined : replyingTo;
    return chat.sendLocation(point, { respondsTo, replyTo }).then(() => {
      if (!respondsTo) setReplyingTo(null);
    });
  };
  const onLocationShare = useCallback((request) => setLocationSheet({ respondsTo: request }), []);
  const declineRef = useRef(chat.declineLocationRequest);
  declineRef.current = chat.declineLocationRequest;
  const onLocationDecline = useCallback((request) => declineRef.current(request._id), []);

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
    <div className="relative flex h-full flex-col bg-canvas" {...dropHandlers}>
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-40 flex flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-brand-500 bg-brand-50/90 text-brand-800 animate-fade-in">
          <FileUp className="h-8 w-8" aria-hidden="true" />
          <p className="text-sm font-semibold">Drop to share</p>
          <p className="text-xs text-brand-700">Photos up to 5 MB · PDF, Word, Excel, PowerPoint, .txt up to 10 MB</p>
        </div>
      ) : null}
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
        onInfo={showInfo}
        onLocationShare={canLocate ? onLocationShare : undefined}
        onLocationDecline={canLocate ? onLocationDecline : undefined}
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
        onAttachFiles={canAttach ? pickFiles : undefined}
        attachItems={attachItems}
      />

      <LocationShareSheet
        open={Boolean(locationSheet)}
        onClose={() => setLocationSheet(null)}
        onSend={sendLocation}
        campus={myCampus}
        title={locationSheet?.respondsTo ? 'Share your location' : 'Send your location'}
        intro={
          locationSheet?.respondsTo
            ? `${(locationSheet.respondsTo.senderId?.name || 'Someone').split(' ')[0]} asked where you are.`
            : undefined
        }
      />

      <AttachSheet attachment={attachment} onSend={sendAttachment} onCancel={() => setAttachment(null)} />

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
      <MessageInfoPanel
        open={panel === 'message'}
        onClose={closePanel}
        message={infoId ? chat.messages.find((m) => m._id === infoId) : null}
        conversation={conversation}
        myId={user?._id}
        receiptsOff={user?.settings?.readReceipts === false}
      />
    </div>
  );
}
