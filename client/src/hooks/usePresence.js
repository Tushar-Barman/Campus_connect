import { useSyncExternalStore } from 'react';
import { getSocket, subscribeSocket } from '../lib/socket.js';
import { idOf } from './messageState.js';

// One app-wide store fed by user_online / user_offline, so a component that
// mounts later still sees changes that happened before it mounted.
const live = new Map(); // userId -> { online, lastSeen }
const listeners = new Set();
let version = 0;
let boundSocket = null;

function publish() {
  version += 1;
  listeners.forEach((listener) => listener());
}

const onOnline = ({ userId } = {}) => {
  if (!userId) return;
  live.set(String(userId), { online: true, lastSeen: null });
  publish();
};

const onOffline = ({ userId, lastSeen } = {}) => {
  if (!userId) return;
  live.set(String(userId), { online: false, lastSeen: lastSeen ?? null });
  publish();
};

// Events may have been missed while disconnected; fall back to fresh REST data.
const onReconnect = () => {
  live.clear();
  publish();
};

function bindToSocket() {
  const socket = getSocket();
  if (socket === boundSocket) return;
  if (boundSocket) {
    boundSocket.off('user_online', onOnline);
    boundSocket.off('user_offline', onOffline);
    boundSocket.io.off('reconnect', onReconnect);
  }
  boundSocket = socket;
  live.clear();
  publish();
  if (!socket) return;
  socket.on('user_online', onOnline);
  socket.on('user_offline', onOffline);
  socket.io.on('reconnect', onReconnect);
}

subscribeSocket(bindToSocket);
bindToSocket();

function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getVersion = () => version;

// `user` is a populated user from REST (with `status` and `lastSeen`).
// Returns { online, lastSeen }; live socket events override the REST snapshot.
export function usePresence(user) {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  if (!user) return { online: false, lastSeen: null };
  return live.get(idOf(user)) ?? { online: user.status === 'online', lastSeen: user.lastSeen ?? null };
}
