import { Conversation, Message, serializeMessageFor, populateMessage, buildViewerContexts } from './deps.js';
import { emitToUsers } from './emit.js';
import { idOf, othersIn } from './validate.js';

// Shared by the send_message handler and the media upload route: bumps the
// conversation, populates the sender and broadcasts new_message to every
// participant. Returns the message exactly as clients receive it.
// A brand-new message has no receipts and isn't deleted or hidden, so the
// serialized payload is the same for every viewer: one emit is enough.
export async function publishMessage(conversation, created, extra = {}) {
  await Conversation.updateOne(
    { _id: conversation._id },
    { lastMessage: created._id, lastMessageAt: created.createdAt ?? new Date() },
  );
  const saved = await populateMessage(Message.findById(created._id)).lean();
  const message = serializeMessageFor({ ...saved, ...extra }, null);
  emitToUsers(conversation.participants, 'new_message', { message });
  return message;
}

// Round 2: an existing message changed (edit, delete for everyone, location
// request answered). Serialized per viewer, because receipt privacy can differ
// between members. `message` is a populated lean document.
export async function notifyMessageUpdated(conversation, message) {
  const contextFor = await buildViewerContexts(conversation.participants);
  for (const participant of conversation.participants) {
    const viewerId = idOf(participant);
    const shaped = serializeMessageFor(message, viewerId, contextFor(viewerId));
    if (shaped) emitToUsers([viewerId], 'message_updated', { message: shaped });
  }
}

// Round 2: "delete for me" only concerns that user's own tabs.
export function notifyMessageHidden(userId, conversationId, messageId) {
  emitToUsers([userId], 'message_updated', {
    message: { _id: idOf(messageId), conversationId: idOf(conversationId), hidden: true },
  });
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

// Round 2: a chat is gone for these users (e.g. the other person deleted their account).
export function notifyConversationRemoved(userIds, conversationId) {
  emitToUsers(userIds, 'conversation_removed', { conversationId: idOf(conversationId) });
}
