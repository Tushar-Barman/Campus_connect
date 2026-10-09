import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { User } from '../models/User.js';
import { loadConversationForUser } from '../middleware/membership.js';
// P3's broadcast helpers (server/src/socket/). Routes never touch io directly.
import { emitToUsers } from '../socket/emit.js';
import { notifyConversationCreated, notifyMemberAdded, notifyMemberRemoved } from '../socket/notify.js';
import { HttpError } from '../utils/http.js';
import { isValidId, requireString } from '../utils/validate.js';
import { sameId } from '../utils/ids.js';
import { getConversationDetails } from './conversations.js';
import { markRead } from './messages.js';
import { destroyAsset, groupPicturePublicId, isStorageConfigured, uploadBuffer } from './storage.js';

export const MAX_GROUP_MEMBERS = 50;

const isMember = (conversation, userId) => conversation.participants.some((p) => sameId(p, userId));

/**
 * Per-user fields (isStarred, unreadCount) differ between members, so events
 * sent to everyone carry the shared fields only; clients keep their own values.
 */
// lastMessage is per-viewer too (deleted "for me" differs per user), so clients keep their own.
const sharedView = ({ isStarred, unreadCount, lastMessage, ...rest }) => rest;

/** Member + group + admin, else 404 / 400 / 403. */
export async function loadGroupAsAdmin(conversationId, userId) {
  const conversation = await loadConversationForUser(conversationId, userId, { lean: true });
  if (conversation.type !== 'group') throw new HttpError(400, 'This is not a group');
  // 403 (not 404) is fine here: the user is a member, so the group's existence isn't a secret.
  if (!sameId(conversation.groupAdmin, userId)) throw new HttpError(403, 'Only the group admin can do this');
  return conversation;
}

/** POST /conversations/group { name, memberIds[] }: creator becomes admin. */
export async function createGroup(creatorId, { name, memberIds }) {
  const groupName = requireString(name, 'Group name', { max: 50 });
  if (!Array.isArray(memberIds)) throw new HttpError(400, 'memberIds must be a list of user ids');
  if (!memberIds.every((id) => typeof id === 'string' && isValidId(id))) {
    throw new HttpError(400, 'memberIds contains an invalid id');
  }

  const others = [...new Set(memberIds)].filter((id) => !sameId(id, creatorId));
  if (others.length < 1) throw new HttpError(400, 'Add at least one other member');
  if (others.length + 1 > MAX_GROUP_MEMBERS) {
    throw new HttpError(400, `A group can have at most ${MAX_GROUP_MEMBERS} members`);
  }
  if ((await User.countDocuments({ _id: { $in: others } })) !== others.length) {
    throw new HttpError(400, 'Some selected users no longer exist');
  }

  const created = await Conversation.create({
    type: 'group',
    participants: [creatorId, ...others],
    groupName,
    groupAdmin: creatorId,
    lastMessageAt: new Date(),
  });

  const conversation = await getConversationDetails(created._id, creatorId);
  // Brand-new: nothing unread, nobody starred it, so one payload fits everyone.
  notifyConversationCreated({ ...conversation, isStarred: false, unreadCount: 0 });
  return conversation;
}

/**
 * PUT /conversations/:id: admin renames the group and/or changes its picture.
 * picture: { buffer, mime } to set, null to remove, undefined to leave as is.
 */
export async function updateGroup(conversationId, adminId, { groupName, picture }) {
  const group = await loadGroupAsAdmin(conversationId, adminId);
  const update = {};

  if (groupName !== undefined) update.groupName = requireString(groupName, 'Group name', { max: 50 });

  if (picture) {
    const stored = await uploadBuffer(picture.buffer, {
      mime: picture.mime,
      publicId: groupPicturePublicId(group._id),
      resourceType: 'image',
      transformation: 'c_fill,w_512,h_512',
    });
    update.groupPicture = stored.url;
  } else if (picture === null) {
    if (group.groupPicture && isStorageConfigured()) await destroyAsset(groupPicturePublicId(group._id), 'image');
    update.groupPicture = '';
  }

  if (!Object.keys(update).length) {
    throw new HttpError(400, 'Nothing to update. Send groupName and/or a picture.');
  }

  await Conversation.updateOne({ _id: group._id }, update);
  const conversation = await getConversationDetails(group._id, adminId);
  // Not covered by notify.js, so it goes through P3's generic emitToUsers (contract addition).
  emitToUsers(group.participants, 'conversation_updated', { conversation: sharedView(conversation) });
  return conversation;
}

/** POST /conversations/:id/members { userId }: admin adds someone. */
export async function addMember(conversationId, adminId, userId) {
  const group = await loadGroupAsAdmin(conversationId, adminId);
  if (typeof userId !== 'string' || !isValidId(userId)) throw new HttpError(400, 'A valid userId is required');
  if (isMember(group, userId)) throw new HttpError(409, 'Already in the group');
  if (group.participants.length >= MAX_GROUP_MEMBERS) {
    throw new HttpError(400, `A group can have at most ${MAX_GROUP_MEMBERS} members`);
  }
  if (!(await User.exists({ _id: userId }))) throw new HttpError(404, 'User not found');

  // Conditional update: two admins' tabs adding the same person can't add them twice.
  const updated = await Conversation.findOneAndUpdate(
    { _id: group._id, participants: { $ne: userId } },
    { $push: { participants: userId } },
    { new: true }
  ).lean();
  if (!updated) throw new HttpError(409, 'Already in the group');

  // The newcomer can read the history, but it shouldn't arrive as 200 "unread",
  // and old messages should stay "read by everyone" for their senders' ticks.
  await markRead(group._id, userId);

  // P3: existing members get group_member_added; the newcomer gets conversation_created
  // with this conversation (built from the newcomer's point of view: 0 unread, not starred).
  notifyMemberAdded(await getConversationDetails(group._id, userId), String(userId));

  return getConversationDetails(group._id, adminId);
}

/**
 * DELETE /conversations/:id/members/:userId
 * Admin removes someone, or any member removes themselves (= leave).
 * If the admin leaves, the longest-standing remaining member becomes admin.
 * If the last member leaves, the group and its messages are deleted.
 */
export async function removeMember(conversationId, actorId, targetId) {
  const group = await loadConversationForUser(conversationId, actorId, { lean: true });
  if (group.type !== 'group') throw new HttpError(400, 'This is not a group');

  const leaving = sameId(actorId, targetId);
  if (!leaving && !sameId(group.groupAdmin, actorId)) {
    throw new HttpError(403, 'Only the group admin can remove members');
  }
  if (!isValidId(String(targetId ?? '')) || !isMember(group, targetId)) {
    throw new HttpError(404, 'Member not found');
  }

  const remaining = group.participants.filter((p) => !sameId(p, targetId));
  const payload = { conversationId: String(group._id), userId: String(targetId) };

  // Their personal star for this chat goes away with them.
  await User.updateOne({ _id: targetId }, { $pull: { starredConversations: group._id } });

  if (remaining.length === 0) {
    await Message.deleteMany({ conversationId: group._id });
    await Conversation.deleteOne({ _id: group._id });
    if (group.groupPicture && isStorageConfigured()) {
      await destroyAsset(groupPicturePublicId(group._id), 'image').catch(() => {});
    }
    notifyMemberRemoved({ ...group, participants: [] }, String(targetId));
    return { ...payload, deleted: true, groupAdmin: null };
  }

  // participants keeps join order, so remaining[0] is the longest-standing member.
  const newAdmin = sameId(group.groupAdmin, targetId) ? remaining[0] : group.groupAdmin;
  await Conversation.updateOne(
    { _id: group._id },
    { $pull: { participants: targetId }, $set: { groupAdmin: newAdmin } }
  );

  const after = await getConversationDetails(group._id, remaining[0]);
  notifyMemberRemoved(sharedView(after), String(targetId));
  if (!sameId(newAdmin, group.groupAdmin)) {
    emitToUsers(remaining, 'conversation_updated', { conversation: sharedView(after) });
  }
  return { ...payload, deleted: false, groupAdmin: String(newAdmin) };
}
