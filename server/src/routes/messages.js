import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import {
  notifyMessageHidden,
  notifyMessagePinned,
  notifyMessageUnpinned,
  notifyMessageUpdated,
} from '../socket/notify.js'; // P3
import { mediaUpload, createMediaMessage } from '../services/media.js'; // P3
import { asyncHandler } from '../utils/http.js';
import { invalidateChatMemory } from '../services/aiMemory.js'; // P3
import { destroyMediaUrl } from '../services/storage.js';
import {
  deleteMessage,
  editMessage,
  getMessages,
  getPinnedMessages,
  serializeMessageFor,
  setPinned,
} from '../services/messages.js';

// Text messages are SENT over Socket.IO (P3's send_message → publishMessage → createMessage).
// This router serves history, pin/unpin, and P3's media upload.

const router = Router();
router.use(requireAuth);

// GET /api/messages/:conversationId?before=<ISO date>&limit=30 → { messages (oldest → newest), hasMore }
router.get(
  '/:conversationId',
  asyncHandler(async (req, res) => {
    const { before, limit } = req.query;
    res.json(await getMessages(req.params.conversationId, req.userId, { before, limit }));
  })
);

// GET /api/messages/:conversationId/pinned → { messages }
router.get(
  '/:conversationId/pinned',
  asyncHandler(async (req, res) => {
    res.json({ messages: await getPinnedMessages(req.params.conversationId, req.userId) });
  })
);

// POST /api/messages/:conversationId/pin/:messageId → { message }   + P3's notifyMessagePinned
router.post(
  '/:conversationId/pin/:messageId',
  asyncHandler(async (req, res) => {
    const { conversationId, messageId } = req.params;
    const { message, conversation } = await setPinned(conversationId, messageId, req.userId, true);
    notifyMessagePinned(conversation, message);
    res.json({ message });
  })
);

// DELETE /api/messages/:conversationId/pin/:messageId → { message } + P3's notifyMessageUnpinned
router.delete(
  '/:conversationId/pin/:messageId',
  asyncHandler(async (req, res) => {
    const { conversationId, messageId } = req.params;
    const { message, conversation } = await setPinned(conversationId, messageId, req.userId, false);
    notifyMessageUnpinned(conversation, String(message._id));
    res.json({ message });
  })
);

// POST /api/messages/:conversationId/media  (P3's implementation, wired as agreed)
// multipart `file` + `duration` → 201 { message }. P3's createMediaMessage does the membership check,
// magic-byte check, Cloudinary upload, createMessage and the `new_message` broadcast.
router.post(
  '/:conversationId/media',
  uploadLimiter,
  mediaUpload,
  asyncHandler(async (req, res) => {
    const message = await createMediaMessage({
      conversationId: req.params.conversationId,
      userId: req.user._id,
      file: req.file,
      duration: req.body?.duration,
    });
    res.status(201).json({ message });
  })
);

// ── Round 2: edit and delete ───────────────────────────────

// PATCH /api/messages/:conversationId/:messageId  { text } → { message }
// Sender only, text messages only, within 15 minutes. Broadcasts message_updated.
router.patch(
  '/:conversationId/:messageId',
  asyncHandler(async (req, res) => {
    const { conversationId, messageId } = req.params;
    const { message, conversation } = await editMessage(conversationId, messageId, req.userId, req.body?.text);
    invalidateChatMemory(conversation._id);
    await notifyMessageUpdated(conversation, message);
    res.json({ message: serializeMessageFor(message, req.userId) });
  })
);

// DELETE /api/messages/:conversationId/:messageId?scope=everyone|me
//   everyone → { message } (tombstone), broadcasts message_updated (+ message_unpinned if it was pinned)
//   me       → { messageId, hidden: true }, tells only this user's own tabs
router.delete(
  '/:conversationId/:messageId',
  asyncHandler(async (req, res) => {
    const { conversationId, messageId } = req.params;
    const scope = typeof req.query.scope === 'string' ? req.query.scope : 'everyone';
    const result = await deleteMessage(conversationId, messageId, req.userId, scope);

    if (result.scope === 'me') {
      notifyMessageHidden(req.userId, result.conversation._id, result.message._id);
      return res.json({ messageId: String(result.message._id), hidden: true });
    }

    const { message, conversation } = result;
    invalidateChatMemory(conversation._id);
    if (result.wasPinned) notifyMessageUnpinned(conversation, String(message._id));
    await notifyMessageUpdated(conversation, message);
    // Best effort: a failed Cloudinary delete never blocks the delete itself.
    if (result.mediaUrl) destroyMediaUrl(result.mediaUrl);
    return res.json({ message: serializeMessageFor(message, req.userId) });
  })
);

export default router;
