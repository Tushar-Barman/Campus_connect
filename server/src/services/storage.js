import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

/**
 * Cloudinary via its signed REST API (no SDK dependency).
 * Only the server talks to Cloudinary; the API secret never leaves this file.
 */

const API = 'https://api.cloudinary.com/v1_1';
const TIMEOUT_MS = 30_000;

export const isStorageConfigured = () => Boolean(env.cloudinary);

export function requireStorage() {
  if (!env.cloudinary) throw new HttpError(503, 'File uploads are not configured on this server');
  return env.cloudinary;
}

/**
 * Cloudinary request signature: every parameter except file, api_key,
 * resource_type and cloud_name, sorted by name, joined as key=value with "&",
 * followed by the API secret, then SHA-1 (hex).
 */
export function signParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');
}

function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

async function callCloudinary(path, form, what) {
  let res;
  try {
    res = await fetch(`${API}/${path}`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error(`[cloudinary] ${what} request failed:`, err.message);
    throw new HttpError(502, 'Upload service is unreachable. Please try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`[cloudinary] ${what} failed (${res.status}):`, data?.error?.message);
    throw new HttpError(502, 'Upload failed. Please try again.');
  }
  return data;
}

/**
 * Uploads a buffer. resourceType: 'image' for images, 'video' for audio
 * (Cloudinary stores audio under "video").
 * With a publicId, re-uploading replaces the old file (profile/group pictures).
 */
export async function uploadBuffer(buffer, { mime, folder, publicId, resourceType = 'image', transformation }) {
  const { cloudName, apiKey, apiSecret } = requireStorage();
  const params = cleanParams({
    folder,
    public_id: publicId,
    overwrite: publicId ? 'true' : undefined,
    invalidate: publicId ? 'true' : undefined,
    transformation,
    timestamp: Math.floor(Date.now() / 1000),
  });

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), 'upload');
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));
  form.append('api_key', apiKey);
  form.append('signature', signParams(params, apiSecret));

  const data = await callCloudinary(`${cloudName}/${resourceType}/upload`, form, 'upload');
  return {
    url: data.secure_url,
    publicId: data.public_id,
    duration: typeof data.duration === 'number' ? Math.round(data.duration * 10) / 10 : undefined,
  };
}

/** Deletes a stored file. Missing files are fine (already gone). */
export async function destroyAsset(publicId, resourceType = 'image') {
  const { cloudName, apiKey, apiSecret } = requireStorage();
  const params = { public_id: publicId, invalidate: 'true', timestamp: Math.floor(Date.now() / 1000) };

  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, String(value));
  form.append('api_key', apiKey);
  form.append('signature', signParams(params, apiSecret));

  const data = await callCloudinary(`${cloudName}/${resourceType}/destroy`, form, 'delete');
  return data.result === 'ok' || data.result === 'not found';
}

/**
 * Recovers { publicId, resourceType } from a Cloudinary delivery URL, e.g.
 *   https://res.cloudinary.com/<cloud>/video/upload/v17/campusconnect/voice/abc.mp3
 *   → { publicId: 'campusconnect/voice/abc', resourceType: 'video' }
 * Raw files keep their extension in the public id. Returns null for other URLs.
 */
export function assetFromUrl(url) {
  if (typeof url !== 'string') return null;
  const match = url.match(/^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|video|raw)\/upload\/(.+)$/);
  if (!match) return null;
  const [, resourceType, rest] = match;
  // Drop transformation segments ("c_fill,w_512") and the version ("v1712345").
  const parts = rest.split('/');
  while (parts.length > 1 && (/^v\d+$/.test(parts[0]) || parts[0].includes(','))) parts.shift();
  let publicId = decodeURIComponent(parts.join('/'));
  if (resourceType !== 'raw') publicId = publicId.replace(/\.[a-z0-9]+$/i, '');
  return publicId ? { publicId, resourceType } : null;
}

/** Best-effort delete of the file behind a message. Never throws. */
export async function destroyMediaUrl(url) {
  const asset = assetFromUrl(url);
  if (!asset || !isStorageConfigured()) return false;
  try {
    return await destroyAsset(asset.publicId, asset.resourceType);
  } catch (err) {
    console.warn('[cloudinary] could not delete', asset.publicId, err.message);
    return false;
  }
}

/** Deterministic ids, so a new picture replaces the old one instead of piling up. */
export const avatarPublicId = (userId) => `campusconnect/avatars/user_${userId}`;
export const groupPicturePublicId = (conversationId) => `campusconnect/groups/group_${conversationId}`;
