// STAND-IN for P3's hooks/useConversations.js
// useConversations(currentUserId, openConversationId) → { conversations, loading, error, reload, patchConversation }
import { useCallback, useEffect, useMemo } from 'react';
import { dispatch, ensureOwner, getState, loadConversations, session, useStore } from '../store.js';

export function useConversations(currentUserId, openConversationId) {
  const slice = useStore((s) => s.conversations);

  useEffect(() => {
    if (!currentUserId) return;
    ensureOwner(currentUserId);
    session.myId = currentUserId;
    if (getState().conversations.status === 'idle') loadConversations();
  }, [currentUserId]);

  useEffect(() => {
    dispatch({ type: 'SET_ACTIVE', conversationId: openConversationId || null });
  }, [openConversationId]);

  const conversations = useMemo(() => slice.order.map((id) => slice.byId[id]), [slice]);
  const patchConversation = useCallback(
    (conversationId, patch) => dispatch({ type: 'CONVERSATION_PATCH', conversationId, patch }),
    [],
  );

  return {
    conversations,
    loading: slice.status === 'idle' || slice.status === 'loading',
    error: slice.error,
    reload: loadConversations,
    patchConversation,
  };
}

export default useConversations;
