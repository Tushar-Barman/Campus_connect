import { loadConversationForUser, Conversation, Message } from './deps.js';
import { emitToUsers } from './emit.js';
import { idOf, isObjectId, othersIn } from './validate.js';

const logError = (label) => (err) => {
  if (!err?.status) console.error(label, err);
};

// Tells each sender which of their messages just reached `userId`.
function notifySenders(messages, userId, at) {
  const groups = new Map();
  for (const m of messages) {
    const key = `${idOf(m.conversationId)}|${idOf(m.senderId)}`;
    if (!groups.has(key)) groups.set(key, { conversationId: idOf(m.conversationId), senderId: idOf(m.senderId), messageIds: [] });
    groups.get(key).messageIds.push(idOf(m._id));
  }
  for (const { conversationId, senderId, messageIds } of groups.values()) {
    emitToUsers([senderId], 'message_delivered', { conversationId, messageIds, userId, at });
  }
}

// Called on connect: everything sent to this user while they were offline
// has now been delivered.
export async function deliverPending(socket) {
  const { userId } = socket;
  const conversationIds = await Conversation.distinct('_id', { participants: userId });
  if (!conversationIds.length) return;

  const filter = {
    conversationId: { $in: conversationIds },
    senderId: { $ne: userId },
    'deliveredTo.user': { $ne: userId },
  };
  const pending = await Message.find(filter).select('_id conversationId senderId').lean();
  if (!pending.length) return;

  const at = new Date();
  await Message.updateMany(
    { ...filter, _id: { $in: pending.map((m) => m._id) } },
    { $push: { deliveredTo: { user: userId, at } } },
  );
  notifySenders(pending, userId, at);
}

export function registerReceiptHandlers(socket) {
  const { userId } = socket;

  socket.on('message_delivered', async (payload) => {
    try {
      const messageId = payload?.messageId;
      if (!isObjectId(messageId)) return;

      const message = await Message.findById(messageId).select('conversationId senderId').lean();
      if (!message || idOf(message.senderId) === userId) return;
      await loadConversationForUser(idOf(message.conversationId), userId);

      const at = new Date();
      const result = await Message.updateOne(
        { _id: messageId, 'deliveredTo.user': { $ne: userId } },
        { $push: { deliveredTo: { user: userId, at } } },
      );
      if (result.modifiedCount) notifySenders([{ ...message, _id: messageId }], userId, at);
    } catch (err) {
      logError('message_delivered failed:')(err);
    }
  });

  socket.on('message_read', async (payload) => {
    try {
      const conversationId = payload?.conversationId;
      if (!isObjectId(conversationId)) return;

      const conversation = await loadConversationForUser(conversationId, userId);
      const at = new Date();
      const unread = {
        conversationId: conversation._id,
        senderId: { $ne: userId },
        createdAt: { $lte: at },
      };

      // Reading implies delivery; keep both arrays consistent for the ticks.
      await Message.updateMany(
        { ...unread, 'deliveredTo.user': { $ne: userId } },
        { $push: { deliveredTo: { user: userId, at } } },
      );
      const result = await Message.updateMany(
        { ...unread, 'readBy.user': { $ne: userId } },
        { $push: { readBy: { user: userId, at } } },
      );
      if (!result.modifiedCount) return;

      emitToUsers(othersIn(conversation.participants, userId), 'message_read', {
        conversationId: idOf(conversation),
        userId,
        at,
      });
    } catch (err) {
      logError('message_read failed:')(err);
    }
  });
}
