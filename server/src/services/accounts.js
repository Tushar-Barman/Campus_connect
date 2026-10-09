import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { Conversation } from '../models/Conversation.js';
import { Message } from '../models/Message.js';
import { HttpError } from '../utils/http.js';
import { toObjectId } from '../utils/ids.js';
import { disconnectUser } from '../socket/emit.js';
import { notifyConversationRemoved } from '../socket/notify.js';
import { invalidateChatMemory } from './aiMemory.js';
import { removeMember } from './groups.js';
import { tombstoneUpdate } from './messages.js';
import { avatarPublicId, destroyAsset, destroyMediaUrl, isStorageConfigured } from './storage.js';

/**
 * Round 2: DELETE /api/users/me { password }.
 *
 * Every step re-reads the current state and is safe to repeat, so if the
 * deletion stops halfway (crash, timeout) the user can simply try again:
 *   1. groups:        their messages become tombstones, then they leave (removeMember
 *                     hands over admin and deletes groups that become empty)
 *   2. private chats: deleted with their messages; the other person gets conversation_removed
 *   3. other users:   pulled from everyone's blockedUsers, stars on deleted chats dropped
 *   4. avatar:        deleted from Cloudinary (best effort)
 *   5. the User document
 *   6. every open socket of this user is disconnected
 */

// Best effort, a few at a time: a failed Cloudinary delete never blocks the account deletion.
async function destroyMediaOf(filter) {
  if (!isStorageConfigured()) return;
  const urls = (await Message.find({ ...filter, mediaUrl: { $nin: ['', null] } }).select('mediaUrl').lean()).map((m) => m.mediaUrl);
  for (let i = 0; i < urls.length; i += 5) {
    await Promise.allSettled(urls.slice(i, i + 5).map((url) => destroyMediaUrl(url)));
  }
}

export async function deleteAccount(userId, password) {
  if (typeof password !== 'string' || !password) throw new HttpError(400, 'Enter your password to delete your account');
  const user = await User.findById(userId).select('+passwordHash profilePicture').lean();
  if (!user) throw new HttpError(404, 'Account not found');
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new HttpError(401, 'Incorrect password');

  const uid = toObjectId(userId);

  // 1. Groups: soft-delete their messages, then leave.
  const groups = await Conversation.find({ type: 'group', participants: uid }).select('_id').lean();
  for (const { _id } of groups) {
    const theirs = { conversationId: _id, senderId: uid, deletedAt: { $exists: false } };
    await destroyMediaOf(theirs);
    await Message.updateMany(theirs, tombstoneUpdate());
    invalidateChatMemory(_id);
    await removeMember(String(_id), String(userId), String(userId));
  }

  // 2. Private chats: gone for both people.
  const privates = await Conversation.find({ type: 'private', participants: uid }).select('_id participants').lean();
  for (const chat of privates) {
    await destroyMediaOf({ conversationId: chat._id });
    await Message.deleteMany({ conversationId: chat._id });
    await Conversation.deleteOne({ _id: chat._id });
    invalidateChatMemory(chat._id);
    notifyConversationRemoved(chat.participants, chat._id);
  }

  // 3. References held by other users.
  await User.updateMany({ blockedUsers: uid }, { $pull: { blockedUsers: uid } });
  if (privates.length) {
    const removed = privates.map((c) => c._id);
    await User.updateMany({ starredConversations: { $in: removed } }, { $pull: { starredConversations: { $in: removed } } });
  }

  // 4. Avatar (best effort).
  if (user.profilePicture && isStorageConfigured()) {
    await destroyAsset(avatarPublicId(userId), 'image').catch(() => {});
  }

  // 5. The account itself. 6. Then close every tab's socket.
  await User.deleteOne({ _id: uid });
  disconnectUser(userId);

  return { deleted: true, groupsLeft: groups.length, chatsDeleted: privates.length };
}
