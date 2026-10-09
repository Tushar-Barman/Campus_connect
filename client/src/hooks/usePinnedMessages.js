import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api.js';
import { useSocketEvent, useSocketReconnect } from './useSocketEvent.js';

// Pinned messages of one conversation, kept in sync with message_pinned /
// message_unpinned. Pin and unpin themselves are REST calls (P1's routes).
export function usePinnedMessages(conversationId) {
  const [pinned, setPinned] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    if (!conversationId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/messages/${conversationId}/pinned`);
      if (requestId === requestRef.current) setPinned(data.messages);
    } catch (err) {
      if (requestId === requestRef.current) setError(err.response?.data?.error ?? 'Could not load pinned messages');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    setPinned([]);
    load();
  }, [load]);

  useSocketReconnect(load);

  const pin = useCallback(
    (messageId) => api.post(`/messages/${conversationId}/pin/${messageId}`),
    [conversationId],
  );

  const unpin = useCallback(
    (messageId) => api.delete(`/messages/${conversationId}/pin/${messageId}`),
    [conversationId],
  );

  useSocketEvent('message_pinned', ({ message } = {}) => {
    if (!message || String(message.conversationId) !== String(conversationId)) return;
    setPinned((list) => [message, ...list.filter((m) => String(m._id) !== String(message._id))]);
  });

  // Round 2: deleted (for everyone or for me) → gone from the pinned list; edited → new text.
  useSocketEvent('message_updated', ({ message } = {}) => {
    if (!message || String(message.conversationId) !== String(conversationId)) return;
    const id = String(message._id);
    setPinned((list) =>
      message.hidden || message.deletedAt
        ? list.filter((m) => String(m._id) !== id)
        : list.map((m) => (String(m._id) === id ? { ...m, text: message.text, editedAt: message.editedAt } : m)),
    );
  });

  useSocketEvent('message_unpinned', ({ conversationId: cid, messageId } = {}) => {
    if (String(cid) !== String(conversationId)) return;
    setPinned((list) => list.filter((m) => String(m._id) !== String(messageId)));
  });

  return { pinned, loading, error, pin, unpin, reload: load };
}
