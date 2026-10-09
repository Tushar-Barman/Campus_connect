import { idOf } from './validate.js';

let io = null;

export function setIO(instance) {
  io = instance;
}

export function getIO() {
  if (!io) throw new Error('Socket.IO has not been initialised');
  return io;
}

// Delivers an event to every socket of every listed user (all their tabs).
// Accepts raw ids or populated user documents.
export function emitToUsers(userIds, event, payload) {
  const rooms = [...new Set(userIds.map((id) => `user:${idOf(id)}`))];
  if (rooms.length) getIO().to(rooms).emit(event, payload);
}

// Round 2: closes every socket of a user (all tabs), e.g. after account deletion.
export function disconnectUser(userId) {
  getIO().in(`user:${idOf(userId)}`).disconnectSockets(true);
}
