// STAND-IN for P3's hooks/useReceipts.js
import { useEffect } from 'react';
import { dispatch, tabVisible } from '../store.js';
import { emit, onSocketEvent } from '../lib/socket.js';

const idOf = (v) => (v && typeof v === 'object' ? v._id : v);

/** Mount once on the Chat page: marks the open chat read (on open, on tab focus, on connect). */
export function useReceiptSync(openConversationId, currentUserId) {
  useEffect(() => {
    if (!openConversationId || !currentUserId) return undefined;
    const markRead = () => {
      if (!tabVisible()) return;
      emit('message_read', { conversationId: openConversationId });
      dispatch({ type: 'MARK_READ_LOCAL', conversationId: openConversationId });
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);
    const off = onSocketEvent('connect', markRead);
    return () => {
      document.removeEventListener('visibilitychange', markRead);
      off();
    };
  }, [openConversationId, currentUserId]);
}

/** 'sending' | 'uploading' | 'failed' | 'sent' | 'delivered' | 'read' for the SENDER's own message. */
export function getReceiptStatus(message, participants = []) {
  if (message.status === 'failed') return 'failed';
  if (message.status === 'uploading') return 'uploading';
  if (!message._id || message.status === 'sending') return 'sending';
  const senderId = idOf(message.senderId);
  const others = participants.map(idOf).filter((id) => id && id !== senderId);
  if (others.length === 0) return 'sent';
  const readers = new Set((message.readBy || []).map((r) => idOf(r.user)));
  if (others.every((id) => readers.has(id))) return 'read';
  const delivered = new Set((message.deliveredTo || []).map((r) => idOf(r.user)));
  readers.forEach((id) => delivered.add(id));
  return others.every((id) => delivered.has(id)) ? 'delivered' : 'sent';
}
