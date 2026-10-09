/**
 * Throw this anywhere in a route, service or middleware.
 * The central error middleware turns it into `{ error: message }` with `status`.
 * Socket handlers can catch it and ack `{ ok: false, error: err.message }`.
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

/** Wraps an async Express handler so rejected promises reach the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
