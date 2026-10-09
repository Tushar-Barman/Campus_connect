import { Conversation, makePrivateKey } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User, PUBLIC_USER_FIELDS } from '../models/User.js';
import { loadConversationForUser } from '../middleware/membership.js';
import { notifyConversationCreated } from '../socket/notify.js'; // P3's broadcast helpers
import { HttpError } from '../utils/http.js';
import { isValidId } from '../utils/validate.js';
import { toObjectId, sameId } from '../utils/ids.js';
import { serializeMessageFor } from './messages.js';

/** Populates what the chat list needs: participants (public fields) and the last message with its sender. */
const withDetails = (query) =>
  query
    .populate('participants', PUBLIC_USER_FIELDS)
    .populate({ path: 'lastMessage', populate: { path: 'senderId', select: PUBLIC_USER_FIELDS } });

async function getStarredSet(userId) {
  const me = await User.findById(userId).select('+starredConversations').lean();
  return new Set((me?.starredConversations || []).map(String));
}

/**
 * Unread = messages from someone else that this user hasn't read.
 * One aggregation for all conversations instead of one query each.
 */
async function getUnreadCounts(conversationIds, userId) {
  if (!conversationIds.length) return new Map();
  const uid = toObjectId(userId);
  const rows = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds.map(toObjectId) },
        senderId: { $ne: uid },
        'readBy.user': { $ne: uid },
      },
    },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [String(row._id), row.count]));
}

// The sidebar preview: tombstone if deleted, null if this user deleted it "for me".
// Receipts are dropped because the list never shows them.
function previewFor(message, userId) {
  const shaped = serializeMessageFor(message, userId);
  if (!shaped) return null;
  const { readBy: _r, deliveredTo: _d, ...rest } = shaped;
  return rest;
}

const decorate = (conversation, starred, unread, userId) => ({
  ...conversation,
  lastMessage: previewFor(conversation.lastMessage, userId),
  isStarred: starred.has(String(conversation._id)),
  unreadCount: unread.get(String(conversation._id)) || 0,
});

/** GET /conversations: the user's chats, newest activity first, with isStarred and unreadCount. */
export async function listConversationsForUser(userId) {
  const conversations = await withDetails(
    Conversation.find({ participants: userId }).sort({ lastMessageAt: -1 })
  ).lean();

  const [starred, unread] = await Promise.all([
    getStarredSet(userId),
    getUnreadCounts(conversations.map((c) => c._id), userId),
  ]);
  return conversations.map((c) => decorate(c, starred, unread, userId));
}

/** GET /conversations/:id, same shape as one list item. 404 if not a member. */
export async function getConversationDetails(conversationId, userId) {
  const { _id } = await loadConversationForUser(conversationId, userId, { lean: true });
  const conversation = await withDetails(Conversation.findById(_id)).lean();
  if (!conversation) throw new HttpError(404, 'Conversation not found');

  const [starred, unread] = await Promise.all([getStarredSet(userId), getUnreadCounts([_id], userId)]);
  return decorate(conversation, starred, unread, userId);
}

/**
 * Opens the private chat between `meId` and `otherId`, creating it if needed.
 * Safe under concurrency: the unique privateKey index guarantees one chat per pair.
 * On creation, P3's notifyConversationCreated() tells both users.
 */
export async function findOrCreatePrivate(meId, otherId) {
  if (typeof otherId !== 'string' || !isValidId(otherId)) {
    throw new HttpError(400, 'A valid userId is required');
  }
  if (sameId(meId, otherId)) throw new HttpError(400, "You can't start a chat with yourself");
  if (!(await User.exists({ _id: otherId }))) throw new HttpError(404, 'User not found');

  const privateKey = makePrivateKey(meId, otherId);
  let created = false;
  let existing = await Conversation.findOne({ privateKey }).select('_id').lean();

  if (!existing) {
    try {
      existing = await Conversation.create({ type: 'private', participants: [meId, otherId] });
      created = true;
    } catch (err) {
      if (err.code !== 11000) throw err;
      // The other user created it at the same moment: use theirs.
      existing = await Conversation.findOne({ privateKey }).select('_id').lean();
    }
  }

  const conversation = await getConversationDetails(existing._id, meId);

  if (created) {
    // Brand-new chat: no messages and nobody has starred it, so one payload fits both users.
    notifyConversationCreated({ ...conversation, isStarred: false, unreadCount: 0 });
  }
  return { conversation, created };
}

/** Star / unstar for this user only (stored on their own User document). */
export async function setStarred(conversationId, userId, starred) {
  const { _id } = await loadConversationForUser(conversationId, userId, { lean: true });
  const update = starred
    ? { $addToSet: { starredConversations: _id } }
    : { $pull: { starredConversations: _id } };
  await User.updateOne({ _id: userId }, update);
  return { conversationId: String(_id), isStarred: starred };
}
