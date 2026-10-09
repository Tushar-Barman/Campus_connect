// STAND-IN for P3's client/src/lib/socket.js (same exports P2 uses: connectSocket, disconnectSocket).
// Used in mock mode, or until P3's real file is merged (vite.config.js chooses).

import { io } from 'socket.io-client';
import { SERVER_URL, USE_MOCKS } from '../../lib/api.js';
import { createMockSocket } from '../../lib/mock/mockSocket.js';
import { dispatch, ensureOwner, fetchConversation, getState, loadConversations, loadMessages, session, tabVisible } from '../store.js';

let socket = null;
const registry = new Map(); // event -> Set(handler), re-bound to every new socket

function userIdFromToken(token = '') {
  if (token.startsWith('mock.')) return token.slice(5);
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload.userId || payload.id || payload.sub || null;
  } catch {
    return null;
  }
}

export function getSocket() {
  return socket;
}

/** Subscribe to a socket event, now or once the socket exists. Returns an unsubscribe function. */
export function onSocketEvent(event, handler) {
  if (!registry.has(event)) registry.set(event, new Set());
  registry.get(event).add(handler);
  socket?.on(event, handler);
  return () => {
    registry.get(event)?.delete(handler);
    socket?.off(event, handler);
  };
}

export function emit(event, payload) {
  if (socket?.connected) socket.emit(event, payload);
}

export function emitWithAck(event, payload, timeoutMs = 10000) {
  return new Promise((resolve) => {
    if (!socket?.connected) {
      resolve({ ok: false, error: 'You are offline' });
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: 'The server did not respond' });
    }, timeoutMs);
    socket.emit(event, payload, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response && typeof response === 'object' ? response : { ok: false, error: 'Empty response' });
    });
  });
}

function wireStore(s) {
  const typingTimers = new Map();
  let everConnected = false;
  const myId = () => session.myId;

  s.on('connect', () => {
    if (everConnected) {
      loadConversations();
      const active = getState().activeId;
      if (active) loadMessages(active);
    }
    everConnected = true;
    const active = getState().activeId;
    if (active && tabVisible()) emit('message_read', { conversationId: active });
  });

  s.on('new_message', ({ message }) => {
    if (!message) return;
    const { conversationId } = message;
    const senderId = typeof message.senderId === 'object' ? message.senderId._id : message.senderId;
    const viewing = getState().activeId === conversationId && tabVisible();
    if (!getState().conversations.byId[conversationId]) fetchConversation(conversationId).catch(() => {});
    dispatch({ type: 'MESSAGE_RECEIVED', message, myId: myId(), isViewing: viewing });
    if (senderId !== myId()) {
      emit('message_delivered', { messageId: message._id });
      if (viewing) emit('message_read', { conversationId });
    }
  });

  s.on('conversation_created', ({ conversation }) => conversation && dispatch({ type: 'CONVERSATION_UPSERT', conversation }));

  s.on('typing', ({ conversationId, userId, name }) => {
    if (userId === myId()) return;
    dispatch({ type: 'TYPING_START', conversationId, userId, name });
    const key = `${conversationId}|${userId}`;
    clearTimeout(typingTimers.get(key));
    typingTimers.set(key, setTimeout(() => dispatch({ type: 'TYPING_STOP', conversationId, userId }), 6000));
  });
  s.on('stop_typing', ({ conversationId, userId }) => {
    clearTimeout(typingTimers.get(`${conversationId}|${userId}`));
    dispatch({ type: 'TYPING_STOP', conversationId, userId });
  });

  s.on('user_online', ({ userId }) => dispatch({ type: 'PRESENCE', userId, online: true }));
  s.on('user_offline', ({ userId, lastSeen }) => dispatch({ type: 'PRESENCE', userId, online: false, lastSeen }));
  s.on('message_delivered', (p) => dispatch({ type: 'RECEIPT_DELIVERED', ...p }));
  s.on('message_read', (p) => dispatch({ type: 'RECEIPT_READ', ...p, myId: myId() }));
  s.on('message_pinned', ({ message }) => message && dispatch({ type: 'MESSAGE_PINNED', message }));
  s.on('message_unpinned', ({ conversationId, messageId }) => dispatch({ type: 'MESSAGE_UNPINNED', conversationId, messageId }));

  s.on('group_member_added', ({ conversationId }) => fetchConversation(conversationId).catch(() => {}));
  s.on('group_member_removed', ({ conversationId, userId }) => {
    if (userId === myId()) dispatch({ type: 'CONVERSATION_REMOVE', conversationId });
    else fetchConversation(conversationId).catch(() => {});
  });
}

export function connectSocket(token, { onUnauthorized } = {}) {
  if (socket) return socket;
  const userId = userIdFromToken(token);
  ensureOwner(userId);
  session.myId = userId;
  socket = USE_MOCKS ? createMockSocket(token) : io(SERVER_URL, { auth: { token }, reconnection: true });
  wireStore(socket);
  registry.forEach((handlers, event) => handlers.forEach((h) => socket.on(event, h)));
  socket.on('connect_error', (err) => {
    if (/unauthori[sz]ed|jwt|token/i.test(err?.message || '')) onUnauthorized?.();
  });
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

// Mock mode only: run ccMock.dropConnection() in DevTools to test reconnecting.
if (USE_MOCKS && typeof window !== 'undefined') {
  window.ccMock = { dropConnection: (ms = 4000) => socket?.simulateDrop?.(ms) };
}
