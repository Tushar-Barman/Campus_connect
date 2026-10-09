import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { loadConversationForUser } from '../middleware/membership.js';
import { aiLimiter } from '../middleware/rateLimit.js';
import { asyncHandler } from '../utils/http.js';
import { summarizeConversation } from '../services/aiMemory.js'; // P3's Gemini Chat Memory

const router = Router();
router.use(requireAuth);

// POST /api/ai/summarize/:conversationId → { summary, keyDecisions[], actionItems[], importantDates[] }
// Membership is checked here (P1); P3's summarizeConversation does the Gemini work and throws
// HttpError 429 / 502 / 503 / 504 with friendly messages.
router.post(
  '/summarize/:conversationId',
  aiLimiter,
  asyncHandler(async (req, res) => {
    const conversation = await loadConversationForUser(req.params.conversationId, req.user._id);
    res.json(await summarizeConversation(conversation));
  })
);

export default router;
