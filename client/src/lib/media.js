// Client-side upload rules, mirroring the server whitelist in PROJECT_INSTRUCTIONS §8.6.
// The server re-checks everything; this just gives instant, friendly feedback.

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 120;
export const MIN_VOICE_SECONDS = 0.7;

/** "audio/webm;codecs=opus" → "audio/webm" */
export function baseMime(type = '') {
  return type.split(';')[0].trim().toLowerCase();
}

const mb = (bytes) => `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;

export function validateImage(file) {
  if (!file) return 'Choose an image';
  if (!IMAGE_TYPES.includes(baseMime(file.type))) return 'Use a JPG, PNG or WebP image';
  if (file.size > MAX_IMAGE_BYTES) return `Image is ${mb(file.size)}. The limit is 5 MB.`;
  return null;
}

export function validateAudio(blob) {
  if (!blob || blob.size === 0) return 'The recording was empty. Please try again.';
  if (!AUDIO_TYPES.includes(baseMime(blob.type))) return 'This browser recorded an unsupported audio format';
  if (blob.size > MAX_AUDIO_BYTES) return 'Voice note is too large (max 5 MB)';
  return null;
}

/** Best recording format this browser supports, in order of preference. */
export function pickAudioMime() {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export function audioExtension(mime) {
  return { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' }[baseMime(mime)] || 'webm';
}

/** 7.4 → "0:07", 75 → "1:15" */
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Shrinks a photo to at most `maxSize` px on its longest side before upload.
 * Profile pictures are shown at ≤ 96 px, so this saves bandwidth on campus Wi-Fi.
 * Falls back to the original file if anything goes wrong.
 */
export async function resizeImage(file, maxSize = 512) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = baseMime(file.type) === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') + (type === 'image/png' ? '.png' : '.jpg');
    return new File([blob], name, { type });
  } catch {
    return file;
  }
}
