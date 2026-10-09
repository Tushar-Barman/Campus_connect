import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User, PUBLIC_USER_FIELDS, toOwnUser } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { signToken } from '../utils/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';
import { requireCampus, requireEmail, requirePassword, requireString } from '../utils/validate.js';

const BCRYPT_ROUNDS = 10;
const INVALID_LOGIN = 'Invalid email or password';

// Compared against when the email doesn't exist, so "no such user" and
// "wrong password" take the same time (no account enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);

const router = Router();

// POST /api/auth/register  { name, email, password, campus } → 201 { token, user }
router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = requireString(body.name, 'Name', { max: 50 });
    const email = requireEmail(body.email);
    const password = requirePassword(body.password);
    const campus = requireCampus(body.campus); // Round 2: required for new accounts

    if (await User.exists({ email })) {
      throw new HttpError(409, 'An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user;
    try {
      user = await User.create({ name, email, passwordHash, campus });
    } catch (err) {
      // Two simultaneous registrations with the same email
      if (err.code === 11000) throw new HttpError(409, 'An account with this email already exists');
      throw err;
    }

    res.status(201).json({ token: signToken(user._id), user: toOwnUser(user) });
  })
);

// POST /api/auth/login  { email, password } → 200 { token, user }
router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email || !body.password) {
      throw new HttpError(400, 'Email and password are required');
    }
    const email = body.email.trim().toLowerCase();

    const user = await User.findOne({ email }).select('+passwordHash +settings');
    const passwordOk = await bcrypt.compare(body.password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !passwordOk) throw new HttpError(401, INVALID_LOGIN);

    res.json({ token: signToken(user._id), user: toOwnUser(user) });
  })
);

// POST /api/auth/logout → { ok: true }
// JWTs are stateless: the client deletes its token. Presence (offline) is
// handled by the socket disconnect, not here.
router.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

// GET /api/auth/me → { user }
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.userId).select(`${PUBLIC_USER_FIELDS} settings`).lean();
    if (!user) throw new HttpError(401, 'Account no longer exists');
    res.json({ user: toOwnUser(user) });
  })
);

export default router;
