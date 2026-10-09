/**
 * Test-only helper: stores a text message the way P3's publishMessage() does
 * (membership check → createMessage → lastMessage update), minus the socket emit.
 * Used by the smoke tests to create many messages quickly and deterministically.
 * Real sends in the app always go through P3's `send_message` socket handler.
 */
import { Conversation } from '../../src/models/Conversation.js';
import { Message } from '../../src/models/Message.js';
import { PUBLIC_USER_FIELDS } from '../../src/models/User.js';
import { loadConversationForUser } from '../../src/middleware/membership.js';
import { createMessage } from '../../src/services/messages.js';

export async function seedTextMessage({ conversationId, senderId, text }) {
  const conversation = await loadConversationForUser(conversationId, senderId, { lean: true });
  const created = await createMessage({ conversationId: conversation._id, senderId, messageType: 'text', text });
  await Conversation.updateOne(
    { _id: conversation._id },
    { lastMessage: created._id, lastMessageAt: created.createdAt }
  );
  const message = await Message.findById(created._id).populate('senderId', PUBLIC_USER_FIELDS).lean();
  return { message, conversation };
}
