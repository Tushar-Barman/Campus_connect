import mongoose from 'mongoose';

/**
 * Converts an id string to an ObjectId. Needed in aggregation pipelines and
 * array-element filters, where Mongoose does not cast for you.
 * Only call with ids that already passed isValidId().
 */
export const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

/** True if two ids (string or ObjectId) refer to the same document. */
export const sameId = (a, b) => String(a) === String(b);
