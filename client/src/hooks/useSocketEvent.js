import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getSocket, subscribeSocket } from '../lib/socket.js';

export function useSocket() {
  return useSyncExternalStore(subscribeSocket, getSocket, () => null);
}

function useLatest(value) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

// Subscribes to a server event for the lifetime of the component.
// The handler may change every render without re-subscribing.
export function useSocketEvent(event, handler) {
  const socket = useSocket();
  const handlerRef = useLatest(handler);

  useEffect(() => {
    if (!socket) return undefined;
    const listener = (...args) => handlerRef.current(...args);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event, handlerRef]);
}

// Runs after the socket reconnects (not on the first connect), so callers
// can refetch whatever they may have missed while offline.
export function useSocketReconnect(handler) {
  const socket = useSocket();
  const handlerRef = useLatest(handler);

  useEffect(() => {
    if (!socket) return undefined;
    const listener = () => handlerRef.current();
    socket.io.on('reconnect', listener);
    return () => {
      socket.io.off('reconnect', listener);
    };
  }, [socket, handlerRef]);
}
