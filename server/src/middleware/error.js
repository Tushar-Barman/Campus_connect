import { HttpError } from '../utils/http.js';

/** Any route nobody handled. */
export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/**
 * Central error formatter. Every error response is `{ error: "..." }`.
 * Must be registered last, with all 4 arguments.
 */
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // Bad JSON body / body too large (from express.json)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }
  // Mongoose schema validation
  if (err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({ error: first?.message || 'Invalid data' });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }
  // Unique index violation
  if (err.code === 11000) {
    return res.status(409).json({ error: 'That already exists' });
  }

  console.error('[error]', err);
  return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}
