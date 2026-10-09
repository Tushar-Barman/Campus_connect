// STAND-IN for P3's hooks/useTyping.js
// useTyping(conversationId) → { typingUsers: [{ userId, name }], notifyTyping, stopTyping }
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../store.js';
import { emit } from '../lib/socket.js';

const THROTTLE_MS = 2000;
const IDLE_MS = 2000;
const NONE = {};

export function useTyping(conversationId) {
  const map = useStore((s) => (conversationId ? s.typing[conversationId] : undefined)) || NONE;
  const lastSent = useRef(0);
  const idle = useRef(null);
  const active = useRef(false);

  const stopTyping = useCallback(() => {
    clearTimeout(idle.current);
    if (active.current) emit('stop_typing', { conversationId });
    active.current = false;
    lastSent.current = 0;
  }, [conversationId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastSent.current >= THROTTLE_MS) {
      emit('typing', { conversationId });
      lastSent.current = now;
      active.current = true;
    }
    clearTimeout(idle.current);
    idle.current = setTimeout(stopTyping, IDLE_MS);
  }, [conversationId, stopTyping]);

  useEffect(() => stopTyping, [stopTyping]);

  const typingUsers = useMemo(() => Object.entries(map).map(([userId, name]) => ({ userId, name })), [map]);
  return { typingUsers, notifyTyping, stopTyping };
}

export default useTyping;
