import { idOf } from './conversation.js';

// Same windows as the server (server/src/services/messages.js). The server re-checks.
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_WINDOW_MS = 60 * 60 * 1000;

const age = (message, now) => now - new Date(message.createdAt).getTime();

export const isDeleted = (message) => Boolean(message?.deletedAt);

export function canEdit(message, myId, now = Date.now()) {
  return (
    Boolean(message?._id) &&
    !isDeleted(message) &&
    message.messageType === 'text' &&
    idOf(message.senderId) === myId &&
    age(message, now) <= EDIT_WINDOW_MS
  );
}

export function canDeleteForEveryone(message, myId, now = Date.now()) {
  return Boolean(message?._id) && !isDeleted(message) && idOf(message.senderId) === myId && age(message, now) <= DELETE_WINDOW_MS;
}
