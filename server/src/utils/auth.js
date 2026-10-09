import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { isValidId } from './validate.js';

/** Creates a signed JWT. The user id is in both `userId` and the standard `sub` claim. */
export function signToken(userId) {
  const id = String(userId);
  return jwt.sign({ userId: id, sub: id }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
    algorithm: 'HS256',
  });
}

/**
 * Verifies a JWT and returns its decoded payload, always with `payload.userId`
 * set to the user id (string). P3's socket auth reads `payload.userId`.
 * Throws if the token is missing, tampered with, expired, or malformed.
 */
export function verifyToken(token) {
  if (!token || typeof token !== 'string') throw new Error('No token');
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  const userId = String(payload.userId ?? payload.sub ?? '');
  if (!isValidId(userId)) throw new Error('Invalid token subject');
  return { ...payload, userId };
}
