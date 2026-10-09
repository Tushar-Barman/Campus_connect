import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

const tooMany = (what) => ({ error: `Too many ${what}. Please wait a little and try again.` });

/** Limits register/login attempts per IP (brute-force protection). Responds 429. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.authRateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('attempts'),
});

// The limiters below run after requireAuth and count per USER, not per IP,
// so many students behind the same campus Wi-Fi don't block each other.
const perUser = (req) => `user:${req.userId}`;

/** Uploads (pictures, voice notes, images): 30 per user per 10 minutes. */
export const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('uploads'),
});

/** AI Chat Memory: 10 per user per minute (P3's request; protects the Gemini quota). */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('Chat Memory requests'),
});

/** Round 2: location shares and requests: 10 per user per minute. */
export const locationLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: perUser,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: tooMany('location shares'),
});
