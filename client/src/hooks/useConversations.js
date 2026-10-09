import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api.js';
import { useSocketEvent, useSocketReconnect } from './useSocketEvent.js';
import { idOf } from './messageState.js';

// The sidebar's conversation list, kept live: new messages move a chat to the
// top and bump its unread count, new chats/groups appear, removed groups vanish.
export function useConversations(currentUserId, openConversationId) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const listRef = useRef(conversations);
  const openRef = useRef(openConversationId);
  const requestRef = useRef(0);

  useEffect(() => {
    listRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    openRef.current = openConversationId;
  }, [openConversationId]);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setError(null);
    try {
      const { data } = await api.get('/conversations');
      if (requestId === requestRef.current) setConversations(data.conversations);
    } catch (err) {
      if (requestId === requestRef.current) setError(err.response?.data?.error ?? 'Could not load conversations');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useSocketReconnect(load);

  const patchConversation = useCallback((conversationId, patch) => {
    setConversations((list) => list.map((c) => (idOf(c) === String(conversationId) ? { ...c, ...patch } : c)));
  }, []);

  // Opening a chat clears its unread badge.
  useEffect(() => {
    if (openConversationId) patchConversation(openConversationId, { unreadCount: 0, hasUnreadMention: false });
  }, [openConversationId, patchConversation]);

  useSocketEvent('new_message', ({ message } = {}) => {
    if (!message) return;
    const cid = String(message.conversationId);
    if (!listRef.current.some((c) => idOf(c) === cid)) {
      load(); // a chat we haven't loaded yet
      return;
    }
    const fromOther = idOf(message.senderId) !== String(currentUserId);
    const seen = cid === String(openRef.current) && document.visibilityState === 'visible';

    setConversations((list) => {
      const index = list.findIndex((c) => idOf(c) === cid);
      if (index === -1) return list;
      const current = list[index];
      const updated = {
        ...current,
        lastMessage: message,
        lastMessageAt: message.createdAt,
        unreadCount: fromOther && !seen ? (current.unreadCount ?? 0) + 1 : (current.unreadCount ?? 0),
        // Round 2: "@" badge until this user opens the chat.
        hasUnreadMention:
          fromOther && !seen && (message.mentions ?? []).some((id) => idOf(id) === String(currentUserId))
            ? true
            : Boolean(current.hasUnreadMention),
      };
      return [updated, ...list.slice(0, index), ...list.slice(index + 1)];
    });
  });

  // Round 2: keep the sidebar preview right when the last message is edited or deleted.
  useSocketEvent('message_updated', ({ message } = {}) => {
    if (!message?._id) return;
    setConversations((list) =>
      list.map((c) =>
        idOf(c) === String(message.conversationId) && c.lastMessage && idOf(c.lastMessage) === String(message._id)
          ? { ...c, lastMessage: message.hidden ? null : message }
          : c,
      ),
    );
  });

  useSocketEvent('conversation_created', ({ conversation } = {}) => {
    if (!conversation) return;
    setConversations((list) =>
      list.some((c) => idOf(c) === idOf(conversation))
        ? list
        : [{ isStarred: false, unreadCount: 0, ...conversation }, ...list],
    );
  });

  useSocketEvent('group_member_added', () => load());

  // P1 sends this after a group rename, picture change or admin change. The payload
  // leaves out per-user fields, so keep this user's own isStarred and unreadCount.
  useSocketEvent('conversation_updated', ({ conversation } = {}) => {
    if (!conversation) return;
    setConversations((list) =>
      list.map((c) =>
        idOf(c) === idOf(conversation)
          ? { ...c, ...conversation, isStarred: c.isStarred, unreadCount: c.unreadCount }
          : c,
      ),
    );
  });

  // Round 2: this user changed a chat's wallpaper (here or in another tab).
  useSocketEvent('conversation_background', ({ conversationId, background } = {}) => {
    if (conversationId) patchConversation(conversationId, { background: background ?? '' });
  });

  // Round 2: this user blocked/unblocked someone (here or in another tab).
  useSocketEvent('block_changed', ({ userId, blocked } = {}) => {
    if (!userId) return;
    setConversations((list) =>
      list.map((c) =>
        c.type === 'private' && c.participants.some((p) => idOf(p) === String(userId)) ? { ...c, blockedByMe: Boolean(blocked) } : c,
      ),
    );
  });

  // Round 2: the chat no longer exists (e.g. the other person deleted their account).
  useSocketEvent('conversation_removed', ({ conversationId } = {}) => {
    if (!conversationId) return;
    setConversations((list) => list.filter((c) => idOf(c) !== String(conversationId)));
  });

  useSocketEvent('group_member_removed', ({ conversationId, userId } = {}) => {
    if (String(userId) === String(currentUserId)) {
      setConversations((list) => list.filter((c) => idOf(c) !== String(conversationId)));
      return;
    }
    setConversations((list) =>
      list.map((c) =>
        idOf(c) === String(conversationId)
          ? { ...c, participants: c.participants.filter((p) => idOf(p) !== String(userId)) }
          : c,
      ),
    );
  });

  return { conversations, loading, error, reload: load, patchConversation };
}
