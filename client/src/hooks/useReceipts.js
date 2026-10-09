import { useCallback, useEffect, useRef } from 'react';
import { getSocket } from '../lib/socket.js';
import { useSocketEvent, useSocketReconnect } from './useSocketEvent.js';
import { idOf } from './messageState.js';

export { getReceiptStatus } from './messageState.js';

// Mount ONCE for the whole chat screen (not per message or per conversation).
// Reports delivery for every incoming message, and reads for the open chat
// while the tab is visible.
export function useReceiptSync(openConversationId, currentUserId) {
  const openRef = useRef(openConversationId);

  useEffect(() => {
    openRef.current = openConversationId;
  }, [openConversationId]);

  const markRead = useCallback((conversationId) => {
    if (conversationId && document.visibilityState === 'visible') {
      getSocket()?.emit('message_read', { conversationId });
    }
  }, []);

  useSocketEvent('new_message', ({ message } = {}) => {
    if (!message?._id || idOf(message.senderId) === String(currentUserId)) return;
    getSocket()?.emit('message_delivered', { messageId: message._id });
    if (String(message.conversationId) === String(openRef.current)) markRead(openRef.current);
  });

  useEffect(() => {
    markRead(openConversationId);
  }, [openConversationId, markRead]);

  useEffect(() => {
    const onVisibilityChange = () => markRead(openRef.current);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [markRead]);

  useSocketReconnect(() => markRead(openRef.current));
}
