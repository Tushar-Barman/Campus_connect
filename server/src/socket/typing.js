import { loadConversationForUser, User } from './deps.js';
import { emitToUsers } from './emit.js';
import { isObjectId, othersIn } from './validate.js';

// Clients send `typing` at most every 2 s; this guards against floods.
const MIN_TYPING_INTERVAL_MS = 1000;

async function senderName(socket) {
  if (socket.data.name === undefined) {
    const user = await User.findById(socket.userId).select('name').lean();
    socket.data.name = user?.name ?? '';
  }
  return socket.data.name;
}

export function registerTypingHandlers(socket) {
  const lastTypingAt = new Map();

  const relay = (event) => async (payload) => {
    try {
      const conversationId = payload?.conversationId;
      if (!isObjectId(conversationId)) return;

      if (event === 'typing') {
        const now = Date.now();
        if (now - (lastTypingAt.get(conversationId) ?? 0) < MIN_TYPING_INTERVAL_MS) return;
        lastTypingAt.set(conversationId, now);
      } else {
        lastTypingAt.delete(conversationId);
      }

      // Membership is checked on every event, so removed members are cut off at once.
      const conversation = await loadConversationForUser(conversationId, socket.userId);
      emitToUsers(othersIn(conversation.participants, socket.userId), event, {
        conversationId,
        userId: socket.userId,
        name: await senderName(socket),
      });
    } catch (err) {
      if (!err?.status) console.error(`${event} failed:`, err);
    }
  };

  socket.on('typing', relay('typing'));
  socket.on('stop_typing', relay('stop_typing'));
}
