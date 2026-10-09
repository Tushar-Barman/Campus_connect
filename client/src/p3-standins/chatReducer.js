// STAND-IN for P3's real-time layer (used in mock mode or until P3's hooks are merged).
// Pure reducer: every REST response and socket event becomes one of these actions.

import { idOf } from '../lib/conversation.js';

export const initialChatState = {
  conversations: { status: 'idle', error: null, byId: {}, order: [] },
  messages: {}, // conversationId -> { items, hasMore, status, error, loadingOlder, olderError }
  pinned: {}, // conversationId -> { items, status }
  presence: {}, // userId -> { online, lastSeen }
  typing: {}, // conversationId -> { userId: name }
  activeId: null,
};

const time = (value) => (value ? new Date(value).getTime() : 0);

const conversationTime = (c) => time(c.lastMessageAt) || time(c.updatedAt) || time(c.createdAt);

function sortOrder(byId) {
  return Object.keys(byId).sort((a, b) => conversationTime(byId[b]) - conversationTime(byId[a]));
}

function seedPresence(presence, conversation, overwrite) {
  const next = { ...presence };
  (conversation.participants || []).forEach((p) => {
    if (!p || typeof p !== 'object' || !p.status) return;
    if (overwrite || !next[p._id]) next[p._id] = { online: p.status === 'online', lastSeen: p.lastSeen };
  });
  return next;
}

function unionReceipts(a = [], b = []) {
  const seen = new Map();
  [...a, ...b].forEach((r) => {
    const key = idOf(r.user);
    if (!seen.has(key)) seen.set(key, r);
  });
  return [...seen.values()];
}

function sameMessage(a, b) {
  return (a._id && b._id && a._id === b._id) || (a.clientId && b.clientId && a.clientId === b.clientId);
}

/** Insert or merge one message. Matches on _id or clientId, so a message is never shown twice. */
export function upsertMessage(items, incoming) {
  const index = items.findIndex((m) => sameMessage(m, incoming));
  let next;
  if (index >= 0) {
    const current = items[index];
    const merged = {
      ...current,
      ...incoming,
      clientId: current.clientId || incoming.clientId,
      status: incoming.status,
      deliveredTo: unionReceipts(current.deliveredTo, incoming.deliveredTo),
      readBy: unionReceipts(current.readBy, incoming.readBy),
    };
    next = [...items];
    next[index] = merged;
    if (merged._id) next = next.filter((m, i) => i === index || m._id !== merged._id);
  } else {
    next = [...items, incoming];
    const last = items[items.length - 1];
    if (last && time(incoming.createdAt) < time(last.createdAt)) {
      next.sort((x, y) => time(x.createdAt) - time(y.createdAt));
    }
  }
  return next;
}

function mergeLists(base, extra) {
  return extra.reduce((acc, m) => upsertMessage(acc, m), base);
}

function updateEntry(state, conversationId, updater) {
  const entry = state.messages[conversationId] || {
    items: [],
    hasMore: false,
    status: 'idle',
    error: null,
    loadingOlder: false,
    olderError: null,
  };
  return { ...state, messages: { ...state.messages, [conversationId]: updater(entry) } };
}

function updateConversation(state, conversationId, updater) {
  const current = state.conversations.byId[conversationId];
  if (!current) return state;
  const byId = { ...state.conversations.byId, [conversationId]: updater(current) };
  return { ...state, conversations: { ...state.conversations, byId, order: sortOrder(byId) } };
}

function mapMessages(state, conversationId, fn) {
  const entry = state.messages[conversationId];
  if (!entry) return state;
  return updateEntry(state, conversationId, (e) => ({ ...e, items: e.items.map(fn) }));
}

function clearTyping(typing, conversationId, userId) {
  if (!typing[conversationId]?.[userId]) return typing;
  const { [userId]: _removed, ...rest } = typing[conversationId];
  return { ...typing, [conversationId]: rest };
}

export function chatReducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return initialChatState;

    case 'CONVERSATIONS_LOADING':
      return { ...state, conversations: { ...state.conversations, status: 'loading', error: null } };

    case 'CONVERSATIONS_LOADED': {
      const byId = {};
      let presence = state.presence;
      action.conversations.forEach((c) => {
        byId[c._id] = c;
        presence = seedPresence(presence, c, true);
      });
      return { ...state, presence, conversations: { status: 'ready', error: null, byId, order: sortOrder(byId) } };
    }

    case 'CONVERSATIONS_FAILED':
      return { ...state, conversations: { ...state.conversations, status: 'error', error: action.error } };

    case 'CONVERSATION_UPSERT': {
      const c = action.conversation;
      const byId = { ...state.conversations.byId, [c._id]: { ...state.conversations.byId[c._id], ...c } };
      return {
        ...state,
        presence: seedPresence(state.presence, c, false),
        conversations: { ...state.conversations, byId, order: sortOrder(byId) },
      };
    }

    case 'SET_ACTIVE':
      return { ...state, activeId: action.conversationId };

    case 'MESSAGES_LOADING':
      return updateEntry(state, action.conversationId, (e) =>
        action.older ? { ...e, loadingOlder: true, olderError: null } : { ...e, status: 'loading', error: null },
      );

    case 'MESSAGES_LOADED':
      return updateEntry(state, action.conversationId, (e) =>
        action.older
          ? { ...e, items: mergeLists(action.messages, e.items), hasMore: action.hasMore, loadingOlder: false }
          : { ...e, items: mergeLists(action.messages, e.items), hasMore: action.hasMore, status: 'ready', error: null },
      );

    case 'MESSAGES_FAILED':
      return updateEntry(state, action.conversationId, (e) =>
        action.older ? { ...e, loadingOlder: false, olderError: action.error } : { ...e, status: 'error', error: action.error },
      );

    case 'MESSAGE_OPTIMISTIC': {
      const m = action.message;
      const next = updateEntry(state, m.conversationId, (e) => ({ ...e, items: upsertMessage(e.items, m) }));
      return updateConversation(next, m.conversationId, (c) => ({ ...c, lastMessage: m, lastMessageAt: m.createdAt }));
    }

    case 'MESSAGE_CONFIRMED':
      return updateEntry(state, action.message.conversationId, (e) => ({
        ...e,
        items: upsertMessage(e.items, { ...action.message, clientId: action.clientId, status: undefined }),
      }));

    case 'MESSAGE_FAILED':
      return mapMessages(state, action.conversationId, (m) =>
        m.clientId === action.clientId ? { ...m, status: 'failed', error: action.error } : m,
      );

    case 'MESSAGE_RETRYING':
      return mapMessages(state, action.conversationId, (m) =>
        m.clientId === action.clientId ? { ...m, status: m.messageType && m.messageType !== 'text' ? 'uploading' : 'sending', progress: 0, error: undefined } : m,
      );

    case 'MESSAGE_RECEIVED': {
      const m = { ...action.message, status: undefined };
      const senderId = idOf(m.senderId);
      const fromOther = senderId !== action.myId;
      let next = state;
      if (state.messages[m.conversationId]) {
        next = updateEntry(next, m.conversationId, (e) => ({ ...e, items: upsertMessage(e.items, m) }));
      }
      next = updateConversation(next, m.conversationId, (c) => {
        const newer = time(m.createdAt) >= time(c.lastMessageAt);
        return {
          ...c,
          ...(newer ? { lastMessage: m, lastMessageAt: m.createdAt } : {}),
          unreadCount: fromOther && !action.isViewing ? (c.unreadCount || 0) + 1 : c.unreadCount,
        };
      });
      return { ...next, typing: clearTyping(next.typing, m.conversationId, senderId) };
    }

    case 'RECEIPT_DELIVERED': {
      const ids = new Set(action.messageIds);
      return mapMessages(state, action.conversationId, (m) =>
        ids.has(m._id) && !(m.deliveredTo || []).some((r) => idOf(r.user) === action.userId)
          ? { ...m, deliveredTo: [...(m.deliveredTo || []), { user: action.userId, at: action.at }] }
          : m,
      );
    }

    case 'RECEIPT_READ': {
      let next = mapMessages(state, action.conversationId, (m) => {
        if (!m._id || idOf(m.senderId) === action.userId) return m;
        if (time(m.createdAt) > time(action.at)) return m;
        if ((m.readBy || []).some((r) => idOf(r.user) === action.userId)) return m;
        return { ...m, readBy: [...(m.readBy || []), { user: action.userId, at: action.at }] };
      });
      if (action.userId === action.myId) {
        next = updateConversation(next, action.conversationId, (c) => ({ ...c, unreadCount: 0 }));
      }
      return next;
    }

    case 'MARK_READ_LOCAL':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, unreadCount: 0 }));

    case 'PRESENCE':
      return {
        ...state,
        presence: {
          ...state.presence,
          [action.userId]: {
            online: action.online,
            lastSeen: action.lastSeen ?? state.presence[action.userId]?.lastSeen,
          },
        },
      };

    case 'TYPING_START':
      return {
        ...state,
        typing: {
          ...state.typing,
          [action.conversationId]: { ...state.typing[action.conversationId], [action.userId]: action.name || 'Someone' },
        },
      };

    case 'TYPING_STOP':
      return { ...state, typing: clearTyping(state.typing, action.conversationId, action.userId) };

    case 'STAR_SET':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, isStarred: action.value }));

    case 'PINNED_LOADED':
      return { ...state, pinned: { ...state.pinned, [action.conversationId]: { items: action.messages, status: 'ready' } } };

    case 'MESSAGE_PINNED': {
      const m = action.message;
      const next = mapMessages(state, m.conversationId, (x) =>
        x._id === m._id ? { ...x, isPinned: true, pinnedAt: m.pinnedAt, pinnedBy: m.pinnedBy } : x,
      );
      const current = next.pinned[m.conversationId]?.items || [];
      return {
        ...next,
        pinned: {
          ...next.pinned,
          [m.conversationId]: { items: [m, ...current.filter((x) => x._id !== m._id)], status: 'ready' },
        },
      };
    }

    case 'MESSAGE_UNPINNED': {
      const next = mapMessages(state, action.conversationId, (x) =>
        x._id === action.messageId ? { ...x, isPinned: false, pinnedAt: null, pinnedBy: null } : x,
      );
      const current = next.pinned[action.conversationId]?.items || [];
      return {
        ...next,
        pinned: {
          ...next.pinned,
          [action.conversationId]: { items: current.filter((x) => x._id !== action.messageId), status: 'ready' },
        },
      };
    }

    case 'CONVERSATION_REMOVE': {
      const { [action.conversationId]: _gone, ...byId } = state.conversations.byId;
      const { [action.conversationId]: _m, ...messages } = state.messages;
      const { [action.conversationId]: _p, ...pinned } = state.pinned;
      const { [action.conversationId]: _t, ...typing } = state.typing;
      return {
        ...state,
        conversations: { ...state.conversations, byId, order: state.conversations.order.filter((id) => id !== action.conversationId) },
        messages,
        pinned,
        typing,
        activeId: state.activeId === action.conversationId ? null : state.activeId,
      };
    }

    case 'MESSAGE_UPLOAD_PROGRESS':
      return mapMessages(state, action.conversationId, (m) =>
        m.clientId === action.clientId ? { ...m, status: 'uploading', progress: action.progress } : m,
      );

    case 'MESSAGE_DISCARD':
      if (!state.messages[action.conversationId]) return state;
      const next = updateEntry(state, action.conversationId, (e) => ({
        ...e,
        items: e.items.filter((m) => m._id || m.clientId !== action.clientId),
      }));
      // The sidebar preview must not keep showing a discarded draft.
      const items = next.messages[action.conversationId].items;
      return updateConversation(next, action.conversationId, (c) => {
        if (c.lastMessage?.clientId !== action.clientId || c.lastMessage?._id) return c;
        const latest = items[items.length - 1] || null;
        return { ...c, lastMessage: latest, lastMessageAt: latest?.createdAt || c.lastMessageAt };
      });

    case 'CONVERSATION_PATCH':
      return updateConversation(state, action.conversationId, (c) => ({ ...c, ...action.patch }));

    default:
      return state;
  }
}
