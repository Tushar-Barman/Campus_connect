import { User, Conversation } from './deps.js';
import { emitToUsers } from './emit.js';

// Long enough that a page refresh never shows the user going offline.
const OFFLINE_GRACE_MS = 3000;

// In-memory, so the server must run as a single instance.
const socketsByUser = new Map();
const offlineTimers = new Map();

const logError = (label) => (err) => console.error(label, err);

async function chatPartners(userId) {
  const ids = await Conversation.distinct('participants', { participants: userId });
  return ids.map(String).filter((id) => id !== userId);
}

// Nobody is connected right after a restart.
export async function resetPresence() {
  await User.updateMany({ status: 'online' }, { status: 'offline' });
}

export function isOnline(userId) {
  return socketsByUser.has(String(userId));
}

async function goOnline(userId) {
  await User.updateOne({ _id: userId }, { status: 'online' });
  emitToUsers(await chatPartners(userId), 'user_online', { userId });
}

async function goOffline(userId) {
  const lastSeen = new Date();
  await User.updateOne({ _id: userId }, { status: 'offline', lastSeen });
  if (isOnline(userId)) return goOnline(userId); // reconnected while we were writing
  emitToUsers(await chatPartners(userId), 'user_offline', { userId, lastSeen });
}

export function trackPresence(socket) {
  const { userId } = socket;

  const pendingOffline = offlineTimers.get(userId);
  if (pendingOffline) {
    clearTimeout(pendingOffline);
    offlineTimers.delete(userId);
  }

  let sockets = socketsByUser.get(userId);
  if (!sockets) {
    sockets = new Set();
    socketsByUser.set(userId, sockets);
    // A pending offline timer means partners still see this user as online.
    if (!pendingOffline) goOnline(userId).catch(logError('presence: going online failed:'));
  }
  sockets.add(socket.id);

  socket.on('disconnect', () => {
    const current = socketsByUser.get(userId);
    if (!current) return;
    current.delete(socket.id);
    if (current.size) return;

    socketsByUser.delete(userId);
    offlineTimers.set(
      userId,
      setTimeout(() => {
        offlineTimers.delete(userId);
        if (!isOnline(userId)) goOffline(userId).catch(logError('presence: going offline failed:'));
      }, OFFLINE_GRACE_MS),
    );
  });
}
