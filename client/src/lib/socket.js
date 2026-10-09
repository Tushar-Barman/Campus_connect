import { io } from 'socket.io-client';

// One socket per logged-in session. Created by AuthContext after login,
// destroyed on logout. Components never create sockets themselves.
let socket = null;
const subscribers = new Set();

function notify() {
  subscribers.forEach((listener) => listener());
}

export function connectSocket(token, { onUnauthorized } = {}) {
  disconnectSocket();
  // forceNew: never reuse a cached connection that carries a previous user's token.
  socket = io(import.meta.env.VITE_API_URL, { auth: { token }, forceNew: true });
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') onUnauthorized?.();
  });
  notify();
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  notify();
}

export function getSocket() {
  return socket;
}

// Lets hooks re-subscribe when the socket is replaced (login/logout).
export function subscribeSocket(listener) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}
