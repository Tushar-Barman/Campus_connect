import {
  loadConversationForUser,
  createMessage,
  resolveReplyTo,
  populateMessage,
  assertCanMessage,
  HttpError,
  Message,
  User,
} from '../socket/deps.js';
import { publishMessage, notifyMessageUpdated } from '../socket/notify.js';
import { isObjectId } from '../socket/validate.js';
import { getCampus } from '../config/campuses.js';
import { isOnCampus } from '../utils/geo.js';
import { LOCATION_REQUEST_TTL_MS } from './messages.js';

/**
 * Round 2: location sharing. Nothing is ever shared automatically: every location
 * message comes from an explicit POST by its sender.
 *
 *   ask:     POST /messages/:cid/location-request              → location_request (pending)
 *   share:   POST /messages/:cid/location { ..., respondsTo? } → location message
 *   decline: POST /messages/:cid/location-request/:mid/decline
 *
 * Only someone other than the requester may answer, the first answer wins, and
 * requests expire after 10 minutes (computed on read, no cron job).
 */

const MAX_LABEL = 60;
const MAX_ACCURACY_M = 5000;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

function parseLocation(body = {}) {
  const { lat, lng, accuracy, label } = body;
  if (!isNumber(lat) || lat < -90 || lat > 90) throw new HttpError(400, 'Latitude must be a number between -90 and 90');
  if (!isNumber(lng) || lng < -180 || lng > 180) throw new HttpError(400, 'Longitude must be a number between -180 and 180');
  if (!isNumber(accuracy) || accuracy < 0 || accuracy > MAX_ACCURACY_M) {
    throw new HttpError(400, `Accuracy must be between 0 and ${MAX_ACCURACY_M} metres`);
  }
  if (label !== undefined && label !== null && typeof label !== 'string') throw new HttpError(400, 'Label must be text');
  const cleanLabel = (label ?? '').trim();
  if (cleanLabel.length > MAX_LABEL) throw new HttpError(400, `Label must be at most ${MAX_LABEL} characters`);
  return { lat, lng, accuracy: Math.round(accuracy), label: cleanLabel };
}

async function loadConversation(conversationId, userId, { sending = true } = {}) {
  if (!isObjectId(conversationId)) throw new HttpError(404, 'Conversation not found');
  const conversation = await loadConversationForUser(conversationId, String(userId));
  if (sending) await assertCanMessage(conversation, String(userId)); // Round 2: blocked private chats
  return conversation;
}

const stillPending = () => ({ requestStatus: 'pending', createdAt: { $gte: new Date(Date.now() - LOCATION_REQUEST_TTL_MS) } });

/**
 * Atomically moves a request from pending to `status` for `userId`, or explains why not.
 * Returns the request as it was before the change.
 */
async function claimRequest(conversation, requestId, userId, status) {
  if (!isObjectId(requestId)) throw new HttpError(404, 'Location request not found');
  const claimed = await Message.findOneAndUpdate(
    {
      _id: requestId,
      conversationId: conversation._id,
      messageType: 'location_request',
      senderId: { $ne: userId },
      deletedAt: { $exists: false },
      ...stillPending(),
    },
    { $set: { requestStatus: status } },
    { new: false }
  ).lean();
  if (claimed) return claimed;

  const request = await Message.findOne({ _id: requestId, conversationId: conversation._id, messageType: 'location_request' }).lean();
  if (!request || request.deletedAt) throw new HttpError(404, 'Location request not found');
  if (String(request.senderId) === String(userId)) throw new HttpError(403, "You can't answer your own request");
  if (request.requestStatus === 'pending') throw new HttpError(409, 'This request has expired');
  throw new HttpError(409, 'Someone already answered this request');
}

async function broadcastRequest(conversation, requestId) {
  const request = await populateMessage(Message.findById(requestId)).lean();
  if (request) await notifyMessageUpdated(conversation, request);
}

/** POST /messages/:cid/location → the location message as clients receive it. */
export async function shareLocation({ conversationId, userId, body = {} }) {
  const conversation = await loadConversation(conversationId, userId);
  const point = parseLocation(body);
  const respondsTo = body.respondsTo ?? undefined;
  // A response is always a reply to the request.
  const replyTo = await resolveReplyTo(conversation, respondsTo ?? body.replyTo, String(userId));

  // onCampus is recomputed here from the sender's own campus; the client's value is ignored.
  const sender = await User.findById(userId).select('campus').lean();
  const campus = getCampus(sender?.campus);
  const location = { ...point, campus: campus?.id ?? '', onCampus: isOnCampus(campus, point) };

  const request = respondsTo ? await claimRequest(conversation, respondsTo, userId, 'accepted') : null;
  let created;
  try {
    created = await createMessage({ conversationId: conversation._id, senderId: String(userId), messageType: 'location', location, replyTo });
  } catch (err) {
    // Give the request back, so someone can still answer it.
    if (request) await Message.updateOne({ _id: request._id, requestStatus: 'accepted' }, { $set: { requestStatus: 'pending' } });
    throw err;
  }
  const message = await publishMessage(conversation, created);

  if (request) {
    await Message.updateOne({ _id: request._id }, { $set: { respondedWith: created._id } });
    await broadcastRequest(conversation, request._id);
  }
  return message;
}

/** POST /messages/:cid/location-request → the request message. */
export async function requestLocation({ conversationId, userId }) {
  const conversation = await loadConversation(conversationId, userId);
  const created = await createMessage({ conversationId: conversation._id, senderId: String(userId), messageType: 'location_request' });
  return publishMessage(conversation, created);
}

/** POST /messages/:cid/location-request/:mid/decline → { messageId, requestStatus: 'declined' } */
export async function declineLocationRequest({ conversationId, messageId, userId }) {
  const conversation = await loadConversation(conversationId, userId, { sending: false });
  await claimRequest(conversation, messageId, userId, 'declined');
  await broadcastRequest(conversation, messageId);
  return { messageId: String(messageId), requestStatus: 'declined' };
}
