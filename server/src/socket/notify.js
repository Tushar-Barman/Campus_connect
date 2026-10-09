import { PUBLIC_USER_FIELDS, Conversation, Message } from './deps.js';
import { emitToUsers } from './emit.js';
import { idOf, othersIn } from './validate.js';

// Shared by the send_message handler and the media upload route: bumps the
// conversation, populates the sender and broadcasts new_message to every
// participant. Returns the message exactly as clients receive it.
export async function publishMessage(conversation, created, extra = {}) {
  await Conversation.updateOne(
    { _id: conversation._id },
    { lastMessage: created._id, lastMessageAt: created.createdAt ?? new Date() },
  );
  const saved = await Message.findById(created._id).populate('senderId', PUBLIC_USER_FIELDS).lean();
  const message = { ...saved, ...extra };
  emitToUsers(conversation.participants, 'new_message', { message });
  return message;
}

// The helpers below are called from P1's REST routes after the database write.
// `conversation` is the saved conversation with participants populated.

export function notifyConversationCreated(conversation) {
  emitToUsers(conversation.participants, 'conversation_created', { conversation });
}

export function notifyMemberAdded(conversation, userId) {
  const conversationId = idOf(conversation);
  emitToUsers(othersIn(conversation.participants, userId), 'group_member_added', {
    conversationId,
    userId: idOf(userId),
  });
  emitToUsers([userId], 'conversation_created', { conversation });
}

// `conversation` is the state after removal; the removed user is notified too.
export function notifyMemberRemoved(conversation, userId) {
  emitToUsers([...conversation.participants, userId], 'group_member_removed', {
    conversationId: idOf(conversation),
    userId: idOf(userId),
  });
}

export function notifyMessagePinned(conversation, message) {
  emitToUsers(conversation.participants, 'message_pinned', { message });
}

export function notifyMessageUnpinned(conversation, messageId) {
  emitToUsers(conversation.participants, 'message_unpinned', {
    conversationId: idOf(conversation),
    messageId: idOf(messageId),
  });
}
