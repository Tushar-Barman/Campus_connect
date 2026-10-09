import { Router } from 'express';
import {
  User,
  PUBLIC_USER_FIELDS,
  ACCENTS,
  BUBBLE_STYLES,
  DENSITIES,
  FONT_SCALES,
  THEMES,
  settingsOf,
} from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { escapeRegex, isValidId, requireCampus, requireString } from '../utils/validate.js';
import { IMAGE_TYPES } from '../utils/fileType.js';
import { readUpload } from '../utils/multipart.js';
import { avatarPublicId, destroyAsset, requireStorage, uploadBuffer } from '../services/storage.js';

const SEARCH_LIMIT = 20;
const MAX_QUERY_LENGTH = 50;
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

const router = Router();
router.use(requireAuth);

// GET /api/users/search?q=&campus=  → { users }  (name or email, case-insensitive, excludes you, max 20)
// Round 2: campus defaults to your own campus; "all" searches every campus; anything else must be a campus id.
// Accounts without a campus yet are only found with campus=all.
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    // ?q[$ne]=x arrives as an object and ?q=a&q=b as an array: treat both as empty.
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) return res.json({ users: [] });
    if (q.length > MAX_QUERY_LENGTH) throw new HttpError(400, `Search must be at most ${MAX_QUERY_LENGTH} characters`);

    const filter = { _id: { $ne: req.userId } };
    const scope = req.query.campus;
    if (scope === 'all') {
      // every campus
    } else if (scope === undefined || scope === '') {
      const me = await User.findById(req.userId).select('campus').lean();
      if (me?.campus) filter.campus = me.campus;
    } else {
      filter.campus = requireCampus(typeof scope === 'string' ? scope : '');
    }

    const pattern = new RegExp(escapeRegex(q), 'i');
    const users = await User.find({
      ...filter,
      $or: [{ name: pattern }, { email: pattern }],
    })
      .select(PUBLIC_USER_FIELDS)
      .sort({ name: 1 })
      .limit(SEARCH_LIMIT)
      .lean();

    return res.json({ users });
  })
);

// PUT /api/users/profile  { name?, bio?, campus? } → { user }
// Only name, bio and campus are editable here; email, password, status etc. are ignored.
router.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const update = {};
    if (body.name !== undefined) update.name = requireString(body.name, 'Name', { max: 50 });
    if (body.bio !== undefined) update.bio = requireString(body.bio, 'Bio', { min: 0, max: 200 });
    if (body.campus !== undefined) update.campus = requireCampus(body.campus); // Round 2
    if (!Object.keys(update).length) throw new HttpError(400, 'Nothing to update. Send name, bio and/or campus.');

    const user = await User.findByIdAndUpdate(req.userId, update, { new: true, runValidators: true })
      .select(PUBLIC_USER_FIELDS)
      .lean();
    res.json({ user });
  })
);

// PUT /api/users/settings  { readReceipts?, theme?, accent?, density?, fontScale?, bubbleStyle? } → { settings }
// Round 2. Only the owner's own settings; unknown keys or values are a 400.
const SETTING_RULES = {
  readReceipts: (v) => typeof v === 'boolean',
  theme: (v) => THEMES.includes(v),
  accent: (v) => ACCENTS.includes(v),
  density: (v) => DENSITIES.includes(v),
  fontScale: (v) => FONT_SCALES.includes(v),
  bubbleStyle: (v) => BUBBLE_STYLES.includes(v),
};

router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Send settings as a JSON object');
    const keys = Object.keys(body);
    if (!keys.length) throw new HttpError(400, 'Nothing to update');
    const $set = {};
    for (const key of keys) {
      const valid = SETTING_RULES[key];
      if (!valid) throw new HttpError(400, `Unknown setting: ${key.slice(0, 40)}`);
      if (!valid(body[key])) throw new HttpError(400, `Invalid value for ${key}`);
      $set[`settings.${key}`] = body[key];
    }
    const user = await User.findByIdAndUpdate(req.userId, { $set }, { new: true, runValidators: true }).select('settings').lean();
    res.json({ settings: settingsOf(user) });
  })
);

// POST /api/users/profile-picture  multipart field "picture" (jpeg/png/webp, ≤ 5 MB) → { user }
// Upload and replace are the same call: the file is stored under a fixed id per user,
// so a new picture overwrites the old one. The returned URL changes (new version),
// so browsers never show a stale cached picture.
router.post(
  '/profile-picture',
  uploadLimiter,
  asyncHandler(async (req, res) => {
    const { file } = await readUpload(req, { field: 'picture', allowed: IMAGE_TYPES, maxBytes: MAX_PICTURE_BYTES });
    const stored = await uploadBuffer(file.buffer, {
      mime: file.mime,
      publicId: avatarPublicId(req.userId),
      resourceType: 'image',
      transformation: 'c_fill,g_face,w_512,h_512', // square, face-centred, small
    });
    const user = await User.findByIdAndUpdate(req.userId, { profilePicture: stored.url }, { new: true })
      .select(PUBLIC_USER_FIELDS)
      .lean();
    res.json({ user });
  })
);

// DELETE /api/users/profile-picture → { user }  (picture removed from storage, field reset to '')
router.delete(
  '/profile-picture',
  asyncHandler(async (req, res) => {
    requireStorage();
    const current = await User.findById(req.userId).select('profilePicture').lean();
    if (current?.profilePicture) await destroyAsset(avatarPublicId(req.userId), 'image');
    const user = await User.findByIdAndUpdate(req.userId, { profilePicture: '' }, { new: true })
      .select(PUBLIC_USER_FIELDS)
      .lean();
    res.json({ user });
  })
);

// GET /api/users/:id → { user }  (public fields only)
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!isValidId(req.params.id)) throw new HttpError(404, 'User not found');
    const user = await User.findById(req.params.id).select(PUBLIC_USER_FIELDS).lean();
    if (!user) throw new HttpError(404, 'User not found');
    res.json({ user });
  })
);

export default router;
