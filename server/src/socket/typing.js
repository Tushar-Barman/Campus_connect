import { loadConversationForUser, User, getBlockRelations } from './deps.js';
import { emitToUsers } from './emit.js';
import { idOf, isObjectId, othersIn } from './validate.js';

// Round 2: block relations are cached per socket for a short while, so typing
// (up to once a second) doesn't query them every time.
const BLOCK_CACHE_MS = 15_000;
async function blockRelations(socket) {
  const cached = socket.data.blockRel;
  if (cached && Date.now() - cached.at < BLOCK_CACHE_MS) return cached.set;
  const set = await getBlockRelations(socket.userId);
  socket.data.blockRel = { set, at: Date.now() };
  return set;
}

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
      const blocked = await blockRelations(socket);
      const recipients = othersIn(conversation.participants, socket.userId).filter((p) => !blocked.has(idOf(p)));
      emitToUsers(recipients, event, {
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
