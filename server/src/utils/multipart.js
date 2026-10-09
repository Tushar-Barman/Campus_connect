import { Readable, Transform } from 'node:stream';
import { HttpError } from './http.js';
import { sniffMimeType } from './fileType.js';

const FIELD_OVERHEAD = 64 * 1024; // room for boundaries and small text fields
const MB = 1024 * 1024;

/**
 * Parses a multipart/form-data request using Node's built-in Web APIs
 * (no multer needed). Stops reading and answers 413 as soon as the body
 * exceeds the limit, so a huge upload can't fill server memory.
 */
async function readFormData(req, maxBytes) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(400, 'Send the file as multipart/form-data');
  }

  const limit = maxBytes + FIELD_OVERHEAD;
  const tooLarge = () => new HttpError(413, `File is too large (max ${Math.round(maxBytes / MB)} MB)`);

  const declared = Number(req.headers['content-length']);
  if (declared && declared > limit) {
    req.resume(); // discard the rest of the body
    throw tooLarge();
  }

  let received = 0;
  let overflow = false;
  const counter = new Transform({
    transform(chunk, _enc, callback) {
      received += chunk.length;
      if (received > limit) {
        overflow = true;
        return callback(tooLarge());
      }
      return callback(null, chunk);
    },
  });

  try {
    const body = Readable.toWeb(req.pipe(counter));
    return await new Response(body, { headers: { 'content-type': contentType } }).formData();
  } catch (err) {
    if (overflow) throw tooLarge();
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'Could not read the upload');
  }
}

/**
 * Reads one uploaded file plus the other form fields, and verifies the file
 * by its content (magic bytes), not by its name or declared type.
 *
 * @returns {{ fields: FormData, file: { buffer: Buffer, mime: string, size: number } | null }}
 */
export async function readUpload(req, { field, allowed, maxBytes, required = true }) {
  const fields = await readFormData(req, maxBytes);
  const entry = fields.get(field);

  if (!entry || typeof entry === 'string') {
    if (required) throw new HttpError(400, `Attach a file in the "${field}" field`);
    return { fields, file: null };
  }
  if (entry.size === 0) throw new HttpError(400, 'The uploaded file is empty');
  if (entry.size > maxBytes) throw new HttpError(413, `File is too large (max ${Math.round(maxBytes / MB)} MB)`);

  const buffer = Buffer.from(await entry.arrayBuffer());
  const mime = sniffMimeType(buffer);
  if (!mime || !allowed.includes(mime)) {
    throw new HttpError(400, `Unsupported file. Allowed: ${allowed.map((t) => t.split('/')[1]).join(', ')}`);
  }
  return { fields, file: { buffer, mime, size: buffer.length } };
}

/** A text field from the form, or undefined. */
export function formText(fields, name) {
  const value = fields.get(name);
  return typeof value === 'string' ? value : undefined;
}
