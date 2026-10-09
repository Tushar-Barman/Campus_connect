const OBJECT_ID = /^[a-f\d]{24}$/i;

export const isObjectId = (value) => typeof value === 'string' && OBJECT_ID.test(value);

// Accepts a raw id, an ObjectId or a populated document.
export const idOf = (value) => String(value?._id ?? value);

export const othersIn = (participants, userId) =>
  participants.filter((participant) => idOf(participant) !== String(userId));
