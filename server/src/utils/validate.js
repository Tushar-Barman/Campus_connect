import { HttpError } from './http.js';

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True only for a 24-character hex string (a real MongoDB ObjectId). */
export const isValidId = (id) => typeof id === 'string' && OBJECT_ID_RE.test(id);

/** Escape user input before putting it inside a RegExp (prevents regex injection / ReDoS). */
export const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Trimmed string with length limits, or a 400. */
export function requireString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} is required`);
  const trimmed = value.trim();
  if (trimmed.length < min) {
    throw new HttpError(400, min === 1 ? `${field} is required` : `${field} must be at least ${min} characters`);
  }
  if (trimmed.length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return trimmed;
}

/** Lowercased, trimmed, plausibly-shaped email, or a 400. */
export function requireEmail(value) {
  const email = requireString(value, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email is not valid');
  return email;
}

/** 8–72 characters. bcrypt ignores everything after 72 bytes, so longer is rejected. */
export function requirePassword(value) {
  if (typeof value !== 'string' || value.length === 0) throw new HttpError(400, 'Password is required');
  if (value.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (Buffer.byteLength(value, 'utf8') > 72) throw new HttpError(400, 'Password must be at most 72 characters');
  return value;
}
