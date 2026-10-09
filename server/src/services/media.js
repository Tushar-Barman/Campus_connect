import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { loadConversationForUser, createMessage, HttpError } from '../socket/deps.js';
import { publishMessage } from '../socket/notify.js';
import { isObjectId } from '../socket/validate.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MIN_VOICE_SECONDS = 1;
const MAX_VOICE_SECONDS = 125; // recorder stops at 120 s; allow for timer drift

const ascii = (text) => [...text].map((char) => char.charCodeAt(0));
const startsWith = (buffer, bytes, offset = 0) => bytes.every((byte, i) => buffer[offset + i] === byte);

// The declared MIME type must be whitelisted AND the file's first bytes must match it,
// so a renamed executable is rejected even if the browser labels it as audio.
const FORMATS = {
  'audio/webm': { kind: 'voice', matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]) },
  'audio/ogg': { kind: 'voice', matches: (b) => startsWith(b, ascii('OggS')) },
  'audio/mpeg': { kind: 'voice', matches: (b) => startsWith(b, ascii('ID3')) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  'audio/mp4': { kind: 'voice', matches: (b) => startsWith(b, ascii('ftyp'), 4) },
  'image/jpeg': { kind: 'image', matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  'image/png': { kind: 'image', matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  'image/webp': { kind: 'image', matches: (b) => startsWith(b, ascii('RIFF')) && startsWith(b, ascii('WEBP'), 8) },
};

// "audio/webm;codecs=opus" → "audio/webm"
const baseMime = (mime = '') => mime.split(';')[0].trim().toLowerCase();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
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
          ? new HttpError(413, 'File is too large (max 5 MB)')
          : new HttpError(400, 'Invalid upload'),
      );
    }
    next(err);
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

// Everything after multer: membership, content check, upload, save, broadcast.
// Returns the message as clients receive it over new_message.
export async function createMediaMessage({ conversationId, userId, file, duration }) {
  if (!isObjectId(conversationId)) throw new HttpError(404, 'Conversation not found');
  const conversation = await loadConversationForUser(conversationId, String(userId));

  if (!file) throw new HttpError(400, 'No file uploaded');
  const mime = baseMime(file.mimetype);
  const format = FORMATS[mime];
  if (!format || !format.matches(file.buffer)) {
    throw new HttpError(400, 'File content does not match its type');
  }
  const isVoice = format.kind === 'voice';
  const seconds = isVoice ? parseDuration(duration) : undefined;

  let stored;
  try {
    // Cloudinary treats audio as a "video" resource.
    stored = await uploadBuffer(file.buffer, {
      resource_type: isVoice ? 'video' : 'image',
      folder: `campusconnect/${format.kind}`,
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
  });
  return publishMessage(conversation, created);
}
