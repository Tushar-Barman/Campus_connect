// STAND-IN for P3's hooks/useSocketEvent.js
import { useEffect, useRef } from 'react';
import { onSocketEvent } from '../lib/socket.js';

export function useSocketEvent(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onSocketEvent(event, (...args) => ref.current?.(...args)), [event]);
}

/** Runs after the socket reconnects (not on the first connect). */
export function useSocketReconnect(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let connectedOnce = false;
    return onSocketEvent('connect', () => {
      if (connectedOnce) ref.current?.();
      connectedOnce = true;
    });
  }, []);
}

export default useSocketEvent;
