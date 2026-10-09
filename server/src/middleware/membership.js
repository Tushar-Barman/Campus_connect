import { Conversation } from '../models/Conversation.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { isValidId } from '../utils/validate.js';

/**
 * THE authorization check for anything conversation-related (security rule 1).
 *
 * Returns the conversation if `userId` is a participant.
 * Throws HttpError(404) if the id is malformed, the chat doesn't exist,
 * or the user isn't in it — all three look identical on purpose (rule 2).
 *
 * REST:   const conv = await loadConversationForUser(req.params.conversationId, req.userId);
 * Socket: try { await loadConversationForUser(id, socket.userId) } catch (e) { ack({ ok: false, error: e.message }) }
 */
export async function loadConversationForUser(conversationId, userId, { lean = false } = {}) {
  const id = String(conversationId ?? '');
  if (!isValidId(id) || !isValidId(String(userId ?? ''))) {
    throw new HttpError(404, 'Conversation not found');
  }

  const query = Conversation.findOne({ _id: id, participants: userId });
  const conversation = lean ? await query.lean() : await query;
  if (!conversation) throw new HttpError(404, 'Conversation not found');
  return conversation;
}

/** Route middleware version: loads into `req.conversation`. Use after requireAuth. */
export const requireMembership = (param = 'conversationId') =>
  asyncHandler(async (req, _res, next) => {
    req.conversation = await loadConversationForUser(req.params[param], req.userId);
    next();
  });
