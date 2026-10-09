import { Conversation, makePrivateKey } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User, PUBLIC_USER_FIELDS } from '../models/User.js';
import { loadConversationForUser } from '../middleware/membership.js';
import { notifyConversationCreated } from '../socket/notify.js'; // P3's broadcast helpers
import { HttpError } from '../utils/http.js';
import { isValidId } from '../utils/validate.js';
import { toObjectId, sameId } from '../utils/ids.js';
import { serializeMessageFor } from './messages.js';
import { maskPresence } from './blocks.js';

/** Populates what the chat list needs: participants (public fields) and the last message with its sender. */
const withDetails = (query) =>
  query
    .populate('participants', PUBLIC_USER_FIELDS)
    .populate({ path: 'lastMessage', populate: { path: 'senderId', select: PUBLIC_USER_FIELDS } });

/**
 * Per-viewer data for decorating chats: their stars, who they blocked, and (Round 2)
 * everyone in a block relation with them, either way. Two queries in total.
 */
async function getViewer(userId) {
  const [me, blockedMe] = await Promise.all([
    User.findById(userId).select('+starredConversations +blockedUsers').lean(),
    User.find({ blockedUsers: toObjectId(userId) }).select('_id').lean(),
  ]);
  const blockedByMe = new Set((me?.blockedUsers || []).map(String));
  return {
    starred: new Set((me?.starredConversations || []).map(String)),
    blockedByMe,
    relations: new Set([...blockedByMe, ...blockedMe.map((u) => String(u._id))]),
  };
}

/**
 * Unread = messages from someone else that this user hasn't read.
 * One aggregation for all conversations instead of one query each.
 * Round 2: also counts unread messages that @mention this user.
 * Returns Map(conversationId → { count, mentions }).
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
    {
      $group: {
        _id: '$conversationId',
        count: { $sum: 1 },
        mentions: { $sum: { $cond: [{ $in: [uid, { $ifNull: ['$mentions', []] }] }, 1, 0] } },
      },
    },
  ]);
  return new Map(rows.map((row) => [String(row._id), { count: row.count, mentions: row.mentions }]));
}

// The sidebar preview: tombstone if deleted, null if this user deleted it "for me".
// Receipts are dropped because the list never shows them.
function previewFor(message, userId) {
  const shaped = serializeMessageFor(message, userId);
  if (!shaped) return null;
  const { readBy: _r, deliveredTo: _d, ...rest } = shaped;
  return rest;
}

const decorate = (conversation, viewer, unread, userId) => ({
  ...conversation,
  // Round 2: no status / last seen between people in a block relation.
  participants: conversation.participants.map((p) => maskPresence(p, viewer.relations)),
  lastMessage: previewFor(conversation.lastMessage, userId),
  isStarred: viewer.starred.has(String(conversation._id)),
  // Round 2: only the blocker learns about a block; there is deliberately no blockedMe.
  blockedByMe:
    conversation.type === 'private' &&
    conversation.participants.some((p) => !sameId(p._id ?? p, userId) && viewer.blockedByMe.has(String(p._id ?? p))),
  unreadCount: unread.get(String(conversation._id))?.count || 0,
  hasUnreadMention: (unread.get(String(conversation._id))?.mentions || 0) > 0, // Round 2
});

/** GET /conversations: the user's chats, newest activity first, with isStarred and unreadCount. */
export async function listConversationsForUser(userId) {
  const conversations = await withDetails(
    Conversation.find({ participants: userId }).sort({ lastMessageAt: -1 })
  ).lean();

  const [viewer, unread] = await Promise.all([
    getViewer(userId),
    getUnreadCounts(conversations.map((c) => c._id), userId),
  ]);
  return conversations.map((c) => decorate(c, viewer, unread, userId));
}

/** GET /conversations/:id, same shape as one list item. 404 if not a member. */
export async function getConversationDetails(conversationId, userId) {
  const { _id } = await loadConversationForUser(conversationId, userId, { lean: true });
  const conversation = await withDetails(Conversation.findById(_id)).lean();
  if (!conversation) throw new HttpError(404, 'Conversation not found');

  const [viewer, unread] = await Promise.all([getViewer(userId), getUnreadCounts([_id], userId)]);
  return decorate(conversation, viewer, unread, userId);
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
  // Round 2: blocks. The blocker is told why; the blocked person gets a generic error.
  const [iBlocked, theyBlocked] = await Promise.all([
    User.exists({ _id: meId, blockedUsers: toObjectId(otherId) }),
    User.exists({ _id: otherId, blockedUsers: toObjectId(meId) }),
  ]);
  if (iBlocked) throw new HttpError(403, 'You blocked this person. Unblock them to chat.');
  if (theyBlocked) throw new HttpError(403, "Can't start this chat");

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
