import { Message, MAX_TEXT_LENGTH, MESSAGE_TYPES } from '../models/Message.js';
import { User, PUBLIC_USER_FIELDS } from '../models/User.js';
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
const REPLY_SNIPPET_LENGTH = 120;

/** A location request nobody answered within this time counts as expired (computed on read). */
export const LOCATION_REQUEST_TTL_MS = 10 * 60 * 1000;

const MESSAGE_NOT_FOUND = 'Message not found';

const idOf = (value) => String(value?._id ?? value);

/**
 * Populates everything a client renders: the sender (same shape as P3's `new_message`),
 * who pinned it, and the quoted message for replies.
 */
export const populateMessage = (query) =>
  query
    .populate('senderId', PUBLIC_USER_FIELDS)
    .populate('pinnedBy', PUBLIC_USER_FIELDS)
    .populate({
      path: 'replyTo',
      select: 'senderId messageType text fileName deletedAt',
      populate: { path: 'senderId', select: 'name' },
    });

// ── Serializer (Round 2) ────────────────────────────────────

function replyPreview(original) {
  if (!original || typeof original !== 'object' || !original._id) return null;
  const deleted = Boolean(original.deletedAt);
  const sender = original.senderId && typeof original.senderId === 'object' ? original.senderId : null;
  return {
    _id: original._id,
    senderId: sender ? { _id: sender._id, name: sender.name } : null,
    messageType: original.messageType,
    text: deleted ? '' : (original.text || '').slice(0, REPLY_SNIPPET_LENGTH),
    ...(original.fileName && !deleted ? { fileName: original.fileName } : {}),
    deleted,
  };
}

/** 'pending' requests older than the TTL are reported as 'expired'. */
export function effectiveRequestStatus(message, now = Date.now()) {
  if (message.messageType !== 'location_request') return message.requestStatus;
  const status = message.requestStatus || 'pending';
  if (status === 'pending' && now - new Date(message.createdAt).getTime() > LOCATION_REQUEST_TTL_MS) {
    return 'expired';
  }
  return status;
}

/**
 * The ONE place a message is shaped for a client. Every path that sends a message
 * to a browser (GET /messages, pinned, the send ack, new_message, message_updated,
 * the sidebar's lastMessage) goes through here.
 *
 *   viewerId  who will see it (null for a payload that is identical for everyone)
 *   ctx       receipt privacy for this viewer, from buildViewerContexts():
 *               ctx.viewerReceiptsOff  viewer turned read receipts off → sees nobody's reads
 *               ctx.receiptsOff        Set of user ids whose reads are hidden from others
 *               ctx.blocked            Set of user ids in a block relation with the viewer
 *
 * Returns null if the viewer deleted the message "for me".
 */
export function serializeMessageFor(message, viewerId, ctx = {}) {
  if (!message) return null;
  const viewer = viewerId ? String(viewerId) : null;
  if (viewer && (message.hiddenFor || []).some((id) => idOf(id) === viewer)) return null;

  if (message.deletedAt) {
    return {
      _id: message._id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      createdAt: message.createdAt,
      deletedAt: message.deletedAt,
      messageType: message.messageType,
      ...(message.clientId ? { clientId: message.clientId } : {}),
    };
  }

  // Never send anyone's "deleted for me" list.
  const { hiddenFor: _hidden, ...out } = message;

  if (message.replyTo !== undefined) out.replyTo = replyPreview(message.replyTo);
  if (message.messageType === 'location_request') out.requestStatus = effectiveRequestStatus(message);

  const isViewer = (userId) => viewer !== null && userId === viewer;
  const hideRead = (userId) =>
    !isViewer(userId) &&
    Boolean(ctx.viewerReceiptsOff || ctx.receiptsOff?.has(userId) || ctx.blocked?.has(userId));
  const hideDelivered = (userId) => !isViewer(userId) && Boolean(ctx.blocked?.has(userId));

  if (Array.isArray(out.readBy)) out.readBy = out.readBy.filter((r) => !hideRead(idOf(r.user)));
  if (Array.isArray(out.deliveredTo)) out.deliveredTo = out.deliveredTo.filter((r) => !hideDelivered(idOf(r.user)));
  return out;
}

/**
 * Receipt-privacy context for each viewer of a conversation, loaded once per
 * request or socket event (never one query per message).
 * Returns (viewerId) => ctx for serializeMessageFor().
 */
export async function buildViewerContexts(participantIds) {
  const receiptsOff = await getReceiptsOff(participantIds);
  return (viewerId) => ({ receiptsOff, viewerReceiptsOff: receiptsOff.has(String(viewerId)) });
}

/**
 * Round 2: which of these users turned read receipts off. One query.
 * Their reads are still stored (unread counts need them) but hidden from others,
 * and they don't see anyone else's reads either.
 */
export async function getReceiptsOff(userIds) {
  const ids = [...new Set((userIds ?? []).map(idOf))].filter(isValidId);
  if (!ids.length) return new Set();
  const rows = await User.find({ _id: { $in: ids }, 'settings.readReceipts': false }).select('_id').lean();
  return new Set(rows.map((r) => String(r._id)));
}

/** Shorthand for a single viewer. */
export async function buildViewerContext(viewerId, participantIds) {
  return (await buildViewerContexts(participantIds))(String(viewerId));
}

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

// ── Replies and mentions (Round 2) ──────────────────────────

const MAX_MENTIONS = 50; // = max group size

/**
 * Validates a reply target for `senderId` in `conversation`: a real message in the
 * same chat that the sender hasn't deleted "for me". Returns its ObjectId, or
 * undefined when there is no reply. Throws HttpError(400) otherwise.
 */
export async function resolveReplyTo(conversation, replyTo, senderId) {
  if (replyTo === undefined || replyTo === null || replyTo === '') return undefined;
  if (typeof replyTo !== 'string' || !isValidId(replyTo)) throw new HttpError(400, 'Invalid reply target');
  const exists = await Message.exists({
    _id: replyTo,
    conversationId: conversation._id,
    hiddenFor: { $ne: toObjectId(senderId) },
  });
  if (!exists) throw new HttpError(400, 'The message you are replying to is not in this chat');
  return toObjectId(replyTo);
}

/**
 * Keeps only mentions of people who are in this group (private chats have none).
 * Invalid entries are dropped rather than rejected, so a stale autocomplete never blocks a send.
 */
export function cleanMentions(conversation, mentions) {
  if (conversation.type !== 'group' || !Array.isArray(mentions)) return [];
  const members = new Set(conversation.participants.map(idOf));
  const ids = mentions.filter((id) => typeof id === 'string' && isValidId(id) && members.has(id));
  return [...new Set(ids)].slice(0, MAX_MENTIONS).map(toObjectId);
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
  // Round 2: callers validate these first (resolveReplyTo / cleanMentions).
  if (fields.replyTo) doc.replyTo = fields.replyTo;
  if (Array.isArray(fields.mentions) && fields.mentions.length) doc.mentions = fields.mentions;

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
    // Round 2: documents. media.js sanitises fileName and checks the type.
    if (messageType === 'file') {
      doc.fileName = typeof fields.fileName === 'string' ? fields.fileName.slice(0, 120) : 'file';
      doc.fileSize = Number.isFinite(fields.fileSize) ? fields.fileSize : undefined;
      doc.mimeType = typeof fields.mimeType === 'string' ? fields.mimeType.slice(0, 100) : undefined;
    }
  }

  return Message.create(doc);
}

/**
 * One page of history, returned oldest → newest.
 * `before` = ISO date cursor (send the createdAt of the oldest message you have).
 * Messages the user deleted "for me" are left out.
 */
export async function getMessages(conversationId, userId, { before, limit } = {}) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  const pageSize = parsePageSize(limit);
  const beforeDate = parseBefore(before);

  const filter = { conversationId: conversation._id, hiddenFor: { $ne: toObjectId(userId) } };
  if (beforeDate) filter.createdAt = { $lt: beforeDate };

  // Fetch one extra row to know whether older messages exist.
  const [rows, ctx] = await Promise.all([
    populateMessage(Message.find(filter).sort({ createdAt: -1, _id: -1 }).limit(pageSize + 1)).lean(),
    buildViewerContext(userId, conversation.participants),
  ]);

  const hasMore = rows.length > pageSize;
  if (hasMore) rows.pop();
  const messages = rows.reverse().map((m) => serializeMessageFor(m, userId, ctx)).filter(Boolean);
  return { messages, hasMore };
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

/**
 * Pins (pinned = true) or unpins a message. Any member may do either.
 * The returned message goes to every member, so it carries no receipts.
 */
export async function setPinned(conversationId, messageId, userId, pinned) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  if (!isValidId(String(messageId ?? ''))) throw new HttpError(404, MESSAGE_NOT_FOUND);

  const update = pinned
    ? { $set: { isPinned: true, pinnedAt: new Date(), pinnedBy: toObjectId(userId) } }
    : { $set: { isPinned: false }, $unset: { pinnedAt: 1, pinnedBy: 1 } };

  // Filtering on conversationId too stops pinning a message from another chat via this one.
  // A message deleted for everyone can't be pinned.
  const filter = { _id: messageId, conversationId: conversation._id };
  if (pinned) filter.deletedAt = { $exists: false };
  const saved = await populateMessage(Message.findOneAndUpdate(filter, update, { new: true })).lean();
  if (!saved) throw new HttpError(404, MESSAGE_NOT_FOUND);

  const { readBy: _r, deliveredTo: _d, ...message } = serializeMessageFor(saved, null);
  return { message, conversation };
}

// ── Edit and delete (Round 2) ───────────────────────────────

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_WINDOW_MS = 60 * 60 * 1000;

const within = (message, windowMs) => Date.now() - new Date(message.createdAt).getTime() <= windowMs;

async function loadMessageIn(conversation, messageId) {
  if (!isValidId(String(messageId ?? ''))) throw new HttpError(404, MESSAGE_NOT_FOUND);
  const message = await Message.findOne({ _id: messageId, conversationId: conversation._id }).lean();
  if (!message) throw new HttpError(404, MESSAGE_NOT_FOUND);
  return message;
}

const isSender = (message, userId) => idOf(message.senderId) === String(userId);

/**
 * PATCH /messages/:cid/:mid { text }: the sender edits their own text message
 * within 15 minutes. Returns { message (populated), conversation }.
 */
export async function editMessage(conversationId, messageId, userId, text) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  const existing = await loadMessageIn(conversation, messageId);
  if (!isSender(existing, userId)) throw new HttpError(403, 'You can only edit your own messages');
  if (existing.deletedAt) throw new HttpError(400, 'This message was deleted');
  if (existing.messageType !== 'text') throw new HttpError(400, 'Only text messages can be edited');
  if (!within(existing, EDIT_WINDOW_MS)) throw new HttpError(403, 'Messages can only be edited within 15 minutes of sending');
  const clean = cleanText(text, { required: true });

  const message = await populateMessage(
    Message.findOneAndUpdate(
      { _id: existing._id, deletedAt: { $exists: false } },
      { $set: { text: clean, editedAt: new Date() } },
      { new: true }
    )
  ).lean();
  if (!message) throw new HttpError(404, MESSAGE_NOT_FOUND);
  return { message, conversation };
}

/**
 * DELETE /messages/:cid/:mid?scope=everyone|me
 *   everyone: sender only, within 1 hour. Content is cleared and it is unpinned.
 *   me:       any member; only hides it for them.
 * Returns { scope, message (populated), conversation, wasPinned, mediaUrl, messageType }.
 * Deleting twice is harmless (same result, no error).
 */
export async function deleteMessage(conversationId, messageId, userId, scope) {
  if (scope !== 'everyone' && scope !== 'me') throw new HttpError(400, 'scope must be "everyone" or "me"');
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  const existing = await loadMessageIn(conversation, messageId);

  if (scope === 'me') {
    await Message.updateOne({ _id: existing._id }, { $addToSet: { hiddenFor: toObjectId(userId) } });
    return { scope, message: existing, conversation };
  }

  if (!isSender(existing, userId)) throw new HttpError(403, 'You can only delete your own messages for everyone');
  if (!existing.deletedAt && !within(existing, DELETE_WINDOW_MS)) {
    throw new HttpError(403, 'Messages can only be deleted for everyone within 1 hour of sending');
  }

  const message = await populateMessage(
    Message.findOneAndUpdate(
      { _id: existing._id },
      {
        $set: { deletedAt: existing.deletedAt ?? new Date(), text: '', mediaUrl: '', isPinned: false },
        $unset: {
          mediaType: 1, duration: 1, fileName: 1, fileSize: 1, mimeType: 1, location: 1,
          mentions: 1, replyTo: 1, pinnedAt: 1, pinnedBy: 1, requestStatus: 1, respondedWith: 1,
        },
      },
      { new: true }
    )
  ).lean();

  return {
    scope,
    message,
    conversation,
    wasPinned: Boolean(existing.isPinned),
    mediaUrl: existing.mediaUrl,
    messageType: existing.messageType,
  };
}

/** Pinned messages of a conversation, most recently pinned first. */
export async function getPinnedMessages(conversationId, userId) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  const [rows, ctx] = await Promise.all([
    populateMessage(
      Message.find({ conversationId: conversation._id, isPinned: true, hiddenFor: { $ne: toObjectId(userId) } })
        .sort({ pinnedAt: -1 })
        .limit(MAX_PINNED)
    ).lean(),
    buildViewerContext(userId, conversation.participants),
  ]);
  return rows.map((m) => serializeMessageFor(m, userId, ctx)).filter(Boolean);
}
