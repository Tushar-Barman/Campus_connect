import { Message, MAX_TEXT_LENGTH, MESSAGE_TYPES } from '../models/Message.js';
import { PUBLIC_USER_FIELDS } from '../models/User.js';
import { loadConversationForUser } from '../middleware/membership.js';
import { HttpError } from '../utils/http.js';
import { isValidId } from '../utils/validate.js';
import { toObjectId } from '../utils/ids.js';

/**
 * Message data layer (P1).
 *
 * Sending is owned by P3: their publishMessage() checks membership, calls
 * createMessage() below, updates lastMessage and emits `new_message`.
 * Everything here returns data and never emits socket events.
 */

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;
const MAX_PINNED = 50;
const MAX_DURATION_SECONDS = 600;

const MESSAGE_NOT_FOUND = 'Message not found';

// Same sender shape as P3's `new_message`, so history and live messages render identically.
const withSender = (query) =>
  query.populate('senderId', PUBLIC_USER_FIELDS).populate('pinnedBy', PUBLIC_USER_FIELDS);

function parsePageSize(limit) {
  if (limit === undefined || limit === '') return DEFAULT_PAGE_SIZE;
  const n = Number(limit);
  if (!Number.isInteger(n) || n < 1) throw new HttpError(400, '"limit" must be a positive whole number');
  return Math.min(n, MAX_PAGE_SIZE);
}

function parseBefore(before) {
  if (before === undefined || before === '') return null;
  const date = typeof before === 'string' ? new Date(before) : null;
  if (!date || Number.isNaN(date.getTime())) throw new HttpError(400, '"before" must be an ISO date');
  return date;
}

function cleanText(value, { required }) {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, 'Message text is required');
    return '';
  }
  if (typeof value !== 'string') throw new HttpError(400, 'Message text must be a string');
  const text = value.trim();
  if (required && !text) throw new HttpError(400, 'Message cannot be empty');
  if (text.length > MAX_TEXT_LENGTH) throw new HttpError(400, `Message must be at most ${MAX_TEXT_LENGTH} characters`);
  return text;
}

/**
 * Validates and saves one message, then returns the saved document (with _id and createdAt).
 *
 * Imported by P3 (socket/deps.js). By agreement it does NOT check membership,
 * update the conversation's lastMessage, or emit anything: P3's publishMessage()
 * does all three. Doing them here as well would double every message.
 *
 *   text:  { conversationId, senderId, messageType: 'text', text }
 *   media: { conversationId, senderId, messageType: 'voice' | 'image', mediaUrl, mediaType, duration, text? }
 *
 * Throws HttpError(400) on invalid input.
 */
export async function createMessage(fields = {}) {
  const { conversationId, senderId } = fields;
  const messageType = fields.messageType ?? 'text';

  if (!isValidId(String(conversationId ?? '')) || !isValidId(String(senderId ?? ''))) {
    throw new HttpError(400, 'Invalid conversation or sender');
  }
  if (!MESSAGE_TYPES.includes(messageType)) throw new HttpError(400, 'Unsupported message type');

  const doc = { conversationId, senderId, messageType };

  if (messageType === 'text') {
    doc.text = cleanText(fields.text, { required: true });
  } else {
    if (typeof fields.mediaUrl !== 'string' || !fields.mediaUrl.startsWith('https://')) {
      throw new HttpError(400, 'Media messages need an https mediaUrl');
    }
    doc.mediaUrl = fields.mediaUrl;
    doc.mediaType = typeof fields.mediaType === 'string' ? fields.mediaType.slice(0, 100) : '';
    doc.text = cleanText(fields.text, { required: false }); // optional caption
    const seconds = Number(fields.duration);
    if (fields.duration !== undefined && fields.duration !== '' && Number.isFinite(seconds) && seconds >= 0) {
      doc.duration = Math.min(Math.round(seconds * 10) / 10, MAX_DURATION_SECONDS);
    }
  }

  return Message.create(doc);
}

/**
 * One page of history, returned oldest → newest.
 * `before` = ISO date cursor (send the createdAt of the oldest message you have).
 */
export async function getMessages(conversationId, userId, { before, limit } = {}) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  const pageSize = parsePageSize(limit);
  const beforeDate = parseBefore(before);

  const filter = { conversationId: conversation._id };
  if (beforeDate) filter.createdAt = { $lt: beforeDate };

  // Fetch one extra row to know whether older messages exist.
  const rows = await withSender(
    Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageSize + 1)
  ).lean();

  const hasMore = rows.length > pageSize;
  if (hasMore) rows.pop();
  return { messages: rows.reverse(), hasMore };
}

/**
 * Marks every message from others in the conversation as read (and delivered)
 * by `userId`. Used by groups.addMember so a newcomer doesn't start with
 * hundreds of unread messages. (Live read receipts are P3's socket handlers.)
 * Returns the number of messages newly marked read.
 */
export async function markRead(conversationId, userId) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  const uid = toObjectId(userId);
  const at = new Date();
  const fromOthers = { conversationId: conversation._id, senderId: { $ne: uid }, createdAt: { $lte: at } };

  const readResult = await Message.updateMany(
    { ...fromOthers, 'readBy.user': { $ne: uid } },
    { $push: { readBy: { user: uid, at } } }
  );
  // Reading implies it was delivered.
  await Message.updateMany(
    { ...fromOthers, 'deliveredTo.user': { $ne: uid } },
    { $push: { deliveredTo: { user: uid, at } } }
  );
  return readResult.modifiedCount;
}

/** Pins (pinned = true) or unpins a message. Any member may do either. */
export async function setPinned(conversationId, messageId, userId, pinned) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  if (!isValidId(String(messageId ?? ''))) throw new HttpError(404, MESSAGE_NOT_FOUND);

  const update = pinned
    ? { $set: { isPinned: true, pinnedAt: new Date(), pinnedBy: toObjectId(userId) } }
    : { $set: { isPinned: false }, $unset: { pinnedAt: 1, pinnedBy: 1 } };

  // Filtering on conversationId too stops pinning a message from another chat via this one.
  const message = await withSender(
    Message.findOneAndUpdate({ _id: messageId, conversationId: conversation._id }, update, { new: true })
  ).lean();
  if (!message) throw new HttpError(404, MESSAGE_NOT_FOUND);

  return { message, conversation };
}

/** Pinned messages of a conversation, most recently pinned first. */
export async function getPinnedMessages(conversationId, userId) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  return withSender(
    Message.find({ conversationId: conversation._id, isPinned: true })
      .sort({ pinnedAt: -1 })
      .limit(MAX_PINNED)
  ).lean();
}
