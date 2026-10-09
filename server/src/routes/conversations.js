import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { IMAGE_TYPES } from '../utils/fileType.js';
import { readUpload, formText } from '../utils/multipart.js';
import {
  findOrCreatePrivate,
  getConversationDetails,
  listConversationsForUser,
  setStarred,
} from '../services/conversations.js';
import { addMember, createGroup, loadGroupAsAdmin, removeMember, updateGroup } from '../services/groups.js';

const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

const router = Router();
router.use(requireAuth);

// GET /api/conversations → { conversations }  newest first, with isStarred + unreadCount
router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ conversations: await listConversationsForUser(req.userId) });
  })
);

// POST /api/conversations  { userId } → { conversation, created }  (201 if new, 200 if it existed)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { conversation, created } = await findOrCreatePrivate(req.userId, req.body?.userId);
    res.status(created ? 201 : 200).json({ conversation, created });
  })
);

// GET /api/conversations/:id → { conversation }
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ conversation: await getConversationDetails(req.params.id, req.userId) });
  })
);

// POST /api/conversations/:id/star   → { conversationId, isStarred: true }
// DELETE /api/conversations/:id/star → { conversationId, isStarred: false }
router.post(
  '/:id/star',
  asyncHandler(async (req, res) => {
    res.json(await setStarred(req.params.id, req.userId, true));
  })
);
router.delete(
  '/:id/star',
  asyncHandler(async (req, res) => {
    res.json(await setStarred(req.params.id, req.userId, false));
  })
);

// ── Groups ─────────────────────────────────────────────────

// POST /api/conversations/group  { name, memberIds[] } → 201 { conversation }  (you become admin)
router.post(
  '/group',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const conversation = await createGroup(req.userId, { name: body.name, memberIds: body.memberIds });
    res.status(201).json({ conversation });
  })
);

// PUT /api/conversations/:id  (admin only) → { conversation }
//   JSON:      { groupName?, groupPicture?: "" }   ("" removes the picture)
//   multipart: groupName? + picture file (jpeg/png/webp, ≤ 5 MB)
router.put(
  '/:id',
  uploadLimiter,
  asyncHandler(async (req, res) => {
    let groupName;
    let picture;

    if (req.is('multipart/form-data')) {
      await loadGroupAsAdmin(req.params.id, req.userId); // check before reading the upload
      const { fields, file } = await readUpload(req, {
        field: 'picture',
        allowed: IMAGE_TYPES,
        maxBytes: MAX_PICTURE_BYTES,
        required: false,
      });
      groupName = formText(fields, 'groupName');
      picture = file ?? undefined;
    } else {
      const body = req.body || {};
      groupName = body.groupName;
      if (body.groupPicture !== undefined) {
        if (body.groupPicture !== '') {
          throw new HttpError(400, 'To set a picture, upload it as multipart field "picture". Send "" to remove it.');
        }
        picture = null;
      }
    }

    res.json({ conversation: await updateGroup(req.params.id, req.userId, { groupName, picture }) });
  })
);

// POST /api/conversations/:id/members  { userId }  (admin only) → { conversation }
router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const conversation = await addMember(req.params.id, req.userId, req.body?.userId);
    res.json({ conversation });
  })
);

// DELETE /api/conversations/:id/members/:userId  (admin, or yourself to leave)
//   → { conversationId, userId, deleted, groupAdmin }
router.delete(
  '/:id/members/:userId',
  asyncHandler(async (req, res) => {
    res.json(await removeMember(req.params.id, req.userId, req.params.userId));
  })
);

export default router;
