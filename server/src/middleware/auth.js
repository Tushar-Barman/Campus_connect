import { User } from '../models/User.js';
import { verifyToken } from '../utils/auth.js';
import { HttpError, asyncHandler } from '../utils/http.js';

/**
 * Requires `Authorization: Bearer <token>`. Otherwise responds 401.
 * On success sets both:
 *   req.userId   — string (used by P1's routes)
 *   req.user._id — the same string (used by P3's media/AI route snippets)
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Not logged in');

  let userId;
  try {
    ({ userId } = verifyToken(token));
  } catch {
    throw new HttpError(401, 'Session expired, please log in again');
  }

  // A valid token for a deleted account must not keep working.
  if (!(await User.exists({ _id: userId }))) throw new HttpError(401, 'Account no longer exists');

  req.userId = userId;
  req.user = { _id: userId };
  next();
});
