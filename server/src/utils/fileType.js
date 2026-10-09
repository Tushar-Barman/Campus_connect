/**
 * Detects a file's real type from its first bytes ("magic numbers").
 * The browser-supplied Content-Type and file extension are NEVER trusted (security rule 6):
 * a renamed .exe still starts with "MZ" and is rejected here.
 *
 * Only the whitelisted formats are recognised; anything else returns null.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ascii = (buf, start, end) => buf.subarray(start, end).toString('latin1');

export function sniffMimeType(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;

  // Images
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(PNG_SIGNATURE)) return 'image/png';
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') return 'image/webp';

  // Audio
  if (ascii(buf, 0, 4) === 'OggS') return 'audio/ogg'; // Firefox MediaRecorder
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    // EBML (Matroska family). Chrome's MediaRecorder writes DocType "webm" in the header.
    return ascii(buf, 0, 64).includes('webm') ? 'audio/webm' : null;
  }
  if (ascii(buf, 4, 8) === 'ftyp') return 'audio/mp4'; // Safari's MediaRecorder (.m4a/.mp4)
  if (ascii(buf, 0, 3) === 'ID3') return 'audio/mpeg';
  if (buf[0] === 0xff && (buf[1] & 0xe6) === 0xe2) return 'audio/mpeg'; // MPEG audio frame sync, layer III

  return null;
}
