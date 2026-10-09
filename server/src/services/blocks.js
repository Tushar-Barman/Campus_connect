import { User, PUBLIC_USER_FIELDS } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { isValidId } from '../utils/validate.js';
import { sameId, toObjectId } from '../utils/ids.js';

/**
 * Round 2: blocking. A block works in both directions for everything below,
 * but only the blocker is ever told about it (blockedByMe); the blocked person
 * just sees generic errors and no presence.
 *
 * Effects (wired where each thing happens):
 *   - private chat: no messages either way (assertCanMessage on every send path)
 *   - no new private chat (POST /conversations)
 *   - hidden from each other's search
 *   - no typing, online/offline events, status or last seen between them
 *   - no delivered/read receipts between them
 * Groups still work; only presence, typing and receipts between the two are hidden.
 */

const idOf = (value) => String(value?._id ?? value);

function checkTarget(meId, targetId) {
  if (typeof targetId !== 'string' || !isValidId(targetId)) throw new HttpError(404, 'User not found');
  if (sameId(meId, targetId)) throw new HttpError(400, "You can't block yourself");
}

export async function blockUser(meId, targetId) {
  checkTarget(meId, targetId);
  if (!(await User.exists({ _id: targetId }))) throw new HttpError(404, 'User not found');
  await User.updateOne({ _id: meId }, { $addToSet: { blockedUsers: toObjectId(targetId) } });
  return { userId: targetId, blocked: true };
}

export async function unblockUser(meId, targetId) {
  checkTarget(meId, targetId);
  await User.updateOne({ _id: meId }, { $pull: { blockedUsers: toObjectId(targetId) } });
  return { userId: targetId, blocked: false };
}

/** GET /users/blocked: the people this user blocked (public fields). */
export async function listBlocked(meId) {
  const me = await User.findById(meId).select('+blockedUsers').lean();
  if (!me?.blockedUsers?.length) return [];
  return User.find({ _id: { $in: me.blockedUsers } }).select(PUBLIC_USER_FIELDS).sort({ name: 1 }).lean();
}

/** Ids this user blocked. */
export async function getBlockedByMe(userId) {
  const me = await User.findById(userId).select('+blockedUsers').lean();
  return new Set((me?.blockedUsers ?? []).map(String));
}

/** Everyone in a block relation with `userId`, either direction. Two small queries. */
export async function getBlockRelations(userId) {
  const [mine, theirs] = await Promise.all([
    getBlockedByMe(userId),
    User.find({ blockedUsers: toObjectId(userId) }).select('_id').lean(),
  ]);
  for (const { _id } of theirs) mine.add(String(_id));
  return mine;
}

export async function isBlockedBetween(a, b) {
  return Boolean(
    await User.exists({
      $or: [
        { _id: a, blockedUsers: toObjectId(b) },
        { _id: b, blockedUsers: toObjectId(a) },
      ],
    })
  );
}

/**
 * Every send path calls this after the membership check: send_message, media,
 * location and location-request answers. Private chats only; groups are not affected.
 */
export async function assertCanMessage(conversation, senderId) {
  if (conversation.type !== 'private') return;
  const other = conversation.participants.find((p) => !sameId(idOf(p), senderId));
  if (other && (await isBlockedBetween(senderId, idOf(other)))) {
    throw new HttpError(403, "You can't send messages in this chat");
  }
}

/**
 * For a set of participants, in one query: who has read receipts off, and who blocked whom.
 * Returns { receiptsOff: Set, blockedBy: Map(userId → Set of ids they blocked) }.
 */
export async function loadPrivacy(participantIds) {
  const ids = [...new Set((participantIds ?? []).map(idOf))].filter(isValidId);
  if (!ids.length) return { receiptsOff: new Set(), blockedBy: new Map() };
  const rows = await User.find({ _id: { $in: ids } }).select('+blockedUsers settings.readReceipts').lean();
  const receiptsOff = new Set(rows.filter((r) => r.settings?.readReceipts === false).map((r) => String(r._id)));
  const blockedBy = new Map(rows.map((r) => [String(r._id), new Set((r.blockedUsers ?? []).map(String))]));
  return { receiptsOff, blockedBy };
}

/** Within a loaded privacy set: the ids in a block relation with `viewerId`. */
export function relationsFrom(privacy, viewerId) {
  const viewer = String(viewerId);
  const out = new Set(privacy.blockedBy.get(viewer) ?? []);
  for (const [userId, blocked] of privacy.blockedBy) if (blocked.has(viewer)) out.add(userId);
  return out;
}

/** Status and last seen are not shared between people in a block relation. */
export const maskPresence = (user, relations) =>
  user && relations.has(idOf(user)) ? { ...user, status: 'offline', lastSeen: null } : user;
