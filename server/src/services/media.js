import crypto from 'node:crypto';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { loadConversationForUser, createMessage, resolveReplyTo, HttpError } from '../socket/deps.js';
import { publishMessage } from '../socket/notify.js';
import { isObjectId } from '../socket/validate.js';

const MB = 1024 * 1024;
const MAX_MEDIA_BYTES = 5 * MB; // voice notes and images
const MAX_DOCUMENT_BYTES = 10 * MB; // Round 2: documents
const MIN_VOICE_SECONDS = 1;
const MAX_VOICE_SECONDS = 125; // recorder stops at 120 s; allow for timer drift
const MAX_FILE_NAME = 120;

const ascii = (text) => [...text].map((char) => char.charCodeAt(0));
const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);
const extensionOf = (name = '') => (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] || '').toLowerCase();

// Round 2: Office files are ZIP archives. Besides the ZIP signature, the archive must
// contain [Content_Types].xml and the folder of its own kind (word/, xl/ or ppt/).
// ZIP stores entry names uncompressed, so a byte search is enough.
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const isOfficeZip = (folder) => (b) =>
  startsWith(b, ZIP_SIGNATURE) && b.includes('[Content_Types].xml', 0, 'latin1') && b.includes(folder, 0, 'latin1');

// Plain text: must be valid UTF-8 and contain no NUL bytes (which binaries always have).
function isUtf8Text(b) {
  if (b.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
}

// The declared MIME type must be whitelisted AND the file's first bytes must match it,
// so a renamed executable is rejected even if the browser labels it as audio.
// Documents (Round 2) must also have the matching extension.
const FORMATS = {
  'audio/webm': { kind: 'voice', matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  'audio/ogg': { kind: 'voice', matches: (b) => startsWith(b, ascii('OggS')) },
  'audio/mpeg': { kind: 'voice', matches: (b) => startsWith(b, ascii('ID3')) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  'audio/mp4': { kind: 'voice', matches: (b) => startsWith(b, ascii('ftyp'), 4) },
  'image/jpeg': { kind: 'image', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  'image/png': { kind: 'image', matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  'image/webp': { kind: 'image', matches: (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8) },
  'image/gif': { kind: 'image', matches: (b) => startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a')) },
  'application/pdf': { kind: 'file', ext: ['pdf'], matches: (b) => startsWith(b, ascii('%PDF-')) },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    kind: 'file',
    ext: ['docx'],
    matches: isOfficeZip('word/'),
  },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    kind: 'file',
    ext: ['xlsx'],
    matches: isOfficeZip('xl/'),
  },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': {
    kind: 'file',
    ext: ['pptx'],
    matches: isOfficeZip('ppt/'),
  },
  'text/plain': { kind: 'file', ext: ['txt'], matches: isUtf8Text },
};

// "audio/webm;codecs=opus" → "audio/webm"
const baseMime = (mime = '') => mime.split(';')[0].trim().toLowerCase();

const upload = multer({
  storage: multer.memoryStorage(),
  // The largest allowed type; voice notes and images are held to 5 MB after parsing.
  limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: (req, file, cb) =>
    FORMATS[baseMime(file.mimetype)] ? cb(null, true) : cb(new HttpError(400, 'Unsupported file type')),
});

// Express middleware for the `file` field. Turns multer errors into 413/400.
export function mediaUpload(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      return next(
        err.code === 'LIMIT_FILE_SIZE'
          ? new HttpError(413, 'File is too large (max 10 MB for documents, 5 MB for photos and voice notes)')
          : new HttpError(400, 'Invalid upload'),
      );
    }
    if (err instanceof HttpError) return next(err);
    // Anything else here is an unreadable multipart body (busboy), i.e. a bad request.
    return next(new HttpError(400, 'Could not read the upload'));
  });
}

let configured = false;

function cloudinaryClient() {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
      throw new HttpError(503, 'Media uploads are not configured');
    }
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    cloudinaryClient()
      .uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)))
      .end(buffer);
  });
}

function parseDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < MIN_VOICE_SECONDS || seconds > MAX_VOICE_SECONDS) {
    throw new HttpError(400, 'Invalid voice note duration');
  }
  return Math.round(seconds * 10) / 10;
}

/**
 * Round 2: a display-safe file name. Drops any path, control characters and
 * characters that are awkward in downloads, and keeps the extension within 120 chars.
 */
export function sanitizeFileName(original, fallbackExt) {
  const base = String(original ?? '').split(/[/\\]/).pop();
  // eslint-disable-next-line no-control-regex
  let name = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').replace(/\s+/g, ' ').trim();
  if (!name || name === '.' || name === '..') name = `file.${fallbackExt}`;
  if (name.length > MAX_FILE_NAME) {
    const ext = extensionOf(name);
    const keep = ext ? MAX_FILE_NAME - ext.length - 1 : MAX_FILE_NAME;
    name = ext ? `${name.slice(0, keep).trimEnd()}.${ext}` : name.slice(0, keep);
  }
  return name;
}

// Everything after multer: membership, content check, upload, save, broadcast.
// Returns the message as clients receive it over new_message.
// Round 2: documents (kind 'file'), an optional caption, an optional replyTo.
export async function createMediaMessage({ conversationId, userId, file, duration, replyTo, caption }) {
  if (!isObjectId(conversationId)) throw new HttpError(404, 'Conversation not found');
  const conversation = await loadConversationForUser(conversationId, String(userId));
  // Round 2: checked before the upload, so a bad reply target costs no Cloudinary call.
  const replyToId = await resolveReplyTo(conversation, replyTo, String(userId));

  if (!file) throw new HttpError(400, 'No file uploaded');
  const mime = baseMime(file.mimetype);
  const format = FORMATS[mime];
  if (!format || !format.matches(file.buffer)) {
    throw new HttpError(400, 'File content does not match its type');
  }
  const isVoice = format.kind === 'voice';
  const isDocument = format.kind === 'file';
  if (!isDocument && file.size > MAX_MEDIA_BYTES) {
    throw new HttpError(413, 'File is too large (max 5 MB for photos and voice notes)');
  }
  if (isDocument && !format.ext.includes(extensionOf(file.originalname))) {
    throw new HttpError(400, `This file must have a .${format.ext[0]} extension`);
  }
  if (caption !== undefined && typeof caption !== 'string') throw new HttpError(400, 'Caption must be text');
  const seconds = isVoice ? parseDuration(duration) : undefined;
  const fileName = isDocument ? sanitizeFileName(file.originalname, format.ext[0]) : undefined;

  let stored;
  try {
    // Cloudinary treats audio as a "video" resource, and documents as "raw".
    // Raw public ids keep their extension so the file downloads with the right type.
    stored = await uploadBuffer(file.buffer, {
      resource_type: isVoice ? 'video' : isDocument ? 'raw' : 'image',
      folder: `campusconnect/${format.kind}`,
      ...(isDocument ? { public_id: `${crypto.randomUUID()}.${format.ext[0]}` } : {}),
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error('Cloudinary upload failed:', err);
    throw new HttpError(502, 'Upload failed, please try again');
  }

  // Deliver voice notes as MP3 so they play everywhere, Safari included.
  const mediaUrl = isVoice
    ? cloudinary.url(stored.public_id, { resource_type: 'video', format: 'mp3', secure: true })
    : stored.secure_url;

  const created = await createMessage({
    conversationId: conversation._id,
    senderId: String(userId),
    messageType: format.kind,
    mediaUrl,
    mediaType: isVoice ? 'audio/mpeg' : mime,
    duration: seconds,
    text: isVoice ? undefined : caption,
    replyTo: replyToId,
    ...(isDocument ? { fileName, fileSize: file.size, mimeType: mime } : {}),
  });
  return publishMessage(conversation, created);
}
