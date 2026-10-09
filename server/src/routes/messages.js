import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { notifyMessagePinned, notifyMessageUnpinned } from '../socket/notify.js'; // P3
import { mediaUpload, createMediaMessage } from '../services/media.js'; // P3
import { asyncHandler } from '../utils/http.js';
import { getMessages, getPinnedMessages, setPinned } from '../services/messages.js';

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

export default router;
