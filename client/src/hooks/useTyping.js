import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../lib/socket.js';
import { useSocketEvent } from './useSocketEvent.js';
import { idOf } from './messageState.js';

const SEND_INTERVAL_MS = 2000;
const IDLE_MS = 2000;
const RECEIVE_TIMEOUT_MS = 5000;

// Call notifyTyping() on every input change and stopTyping() when the message
// is sent. typingUsers lists the other people typing in this conversation.
export function useTyping(conversationId) {
  const [typingUsers, setTypingUsers] = useState([]); // [{ userId, name }]

  const lastSentRef = useRef(0);
  const idleTimerRef = useRef(null);
  const activeConversationRef = useRef(null);
  const expiryTimersRef = useRef(new Map());

  const stopTyping = useCallback(() => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    const cid = activeConversationRef.current;
    if (!cid) return;
    activeConversationRef.current = null;
    lastSentRef.current = 0;
    getSocket()?.emit('stop_typing', { conversationId: cid });
  }, []);

  const notifyTyping = useCallback(() => {
    const socket = getSocket();
    if (!conversationId || !socket?.connected) return;
    if (activeConversationRef.current && activeConversationRef.current !== conversationId) stopTyping();

    const now = Date.now();
    if (now - lastSentRef.current >= SEND_INTERVAL_MS) {
      socket.emit('typing', { conversationId });
      lastSentRef.current = now;
      activeConversationRef.current = conversationId;
    }
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stopTyping, IDLE_MS);
  }, [conversationId, stopTyping]);

  // Leaving a conversation (or unmounting) stops our own indicator.
  useEffect(() => stopTyping, [conversationId, stopTyping]);

  const removeTyper = useCallback((userId) => {
    const timers = expiryTimersRef.current;
    clearTimeout(timers.get(userId));
    timers.delete(userId);
    setTypingUsers((list) => list.filter((u) => u.userId !== userId));
  }, []);

  useEffect(() => {
    const timers = expiryTimersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      setTypingUsers([]);
    };
  }, [conversationId]);

  const isThisConversation = (cid) => String(cid) === String(conversationId);

  useSocketEvent('typing', ({ conversationId: cid, userId, name } = {}) => {
    if (!userId || !isThisConversation(cid)) return;
    const id = String(userId);
    const timers = expiryTimersRef.current;
    clearTimeout(timers.get(id));
    // Auto-clear in case stop_typing never arrives (tab closed, network drop).
    timers.set(id, setTimeout(() => removeTyper(id), RECEIVE_TIMEOUT_MS));
    setTypingUsers((list) => (list.some((u) => u.userId === id) ? list : [...list, { userId: id, name }]));
  });

  useSocketEvent('stop_typing', ({ conversationId: cid, userId } = {}) => {
    if (userId && isThisConversation(cid)) removeTyper(String(userId));
  });

  useSocketEvent('new_message', ({ message } = {}) => {
    if (message && isThisConversation(message.conversationId)) removeTyper(idOf(message.senderId));
  });

  return { typingUsers, notifyTyping, stopTyping };
}
