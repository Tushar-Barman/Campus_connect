// STAND-IN for P3's hooks/usePinnedMessages.js
// usePinnedMessages(conversationId) → { pinned, loading, error, pin(id), unpin(id), reload }
import { useCallback, useEffect } from 'react';
import { dispatch, getState, loadPinned, useStore } from '../store.js';
import { messagesApi } from '../../lib/api.js';

const EMPTY = [];

export function usePinnedMessages(conversationId) {
  const slice = useStore((s) => (conversationId ? s.pinned[conversationId] : undefined));

  useEffect(() => {
    if (conversationId && !getState().pinned[conversationId]) loadPinned(conversationId);
  }, [conversationId]);

  const pin = useCallback(
    async (messageId) => {
      const res = await messagesApi.pin(conversationId, messageId);
      const fallback = getState().messages[conversationId]?.items.find((m) => m._id === messageId);
      const message = res?.message || (fallback && { ...fallback, isPinned: true, pinnedAt: new Date().toISOString() });
      if (message) dispatch({ type: 'MESSAGE_PINNED', message });
    },
    [conversationId],
  );

  const unpin = useCallback(
    async (messageId) => {
      await messagesApi.unpin(conversationId, messageId);
      dispatch({ type: 'MESSAGE_UNPINNED', conversationId, messageId });
    },
    [conversationId],
  );

  return {
    pinned: slice?.items || EMPTY,
    loading: !slice,
    error: null,
    pin,
    unpin,
    reload: useCallback(() => loadPinned(conversationId), [conversationId]),
  };
}

export default usePinnedMessages;
