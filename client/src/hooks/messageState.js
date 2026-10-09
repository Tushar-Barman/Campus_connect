// Pure helpers for message lists. No React, no I/O.

// Accepts a raw id, an ObjectId string or a populated document.
export const idOf = (value) => String(value?._id ?? value);

const time = (message) => new Date(message.createdAt).getTime();

export const sameMessage = (a, b) =>
  (a._id && b._id && String(a._id) === String(b._id)) ||
  (a.clientId && b.clientId && a.clientId === b.clientId);

export const confirmed = (message) => ({ ...message, status: 'sent', error: undefined, progress: undefined });

export const isDraft = (message, clientId) => !message._id && message.clientId === clientId;

export function upsert(list, incoming) {
  const index = list.findIndex((m) => sameMessage(m, incoming));
  if (index === -1) return [...list, incoming];
  const next = list.slice();
  next[index] = incoming;
  return next;
}

export function patchDraft(list, clientId, patch) {
  return list.map((m) => (isDraft(m, clientId) ? { ...m, ...patch } : m));
}

// Swaps a draft for the saved message. If new_message already added the saved
// copy, the draft is dropped instead so it never shows twice.
export function resolveDraft(list, clientId, message) {
  const copyIndex = list.findIndex((m) => m._id && String(m._id) === String(message._id));
  if (copyIndex !== -1) {
    return list.filter((m) => !isDraft(m, clientId)).map((m) => (sameMessage(m, message) ? message : m));
  }
  const draftIndex = list.findIndex((m) => isDraft(m, clientId));
  if (draftIndex === -1) return [...list, message];
  const next = list.slice();
  next[draftIndex] = message;
  return next;
}

// Server page plus anything local it doesn't cover yet: unsent drafts and
// messages that arrived over the socket after the request was made.
export function mergeLatest(serverMessages, current) {
  const fresh = serverMessages.map(confirmed);
  const newest = fresh.length ? time(fresh[fresh.length - 1]) : -Infinity;
  const extra = current.filter(
    (m) => !fresh.some((s) => sameMessage(s, m)) && (!m._id || time(m) > newest),
  );
  return [...fresh, ...extra];
}

const hasReceipt = (receipts, userId) => (receipts ?? []).some((r) => idOf(r.user) === String(userId));

export function applyDelivered(list, { messageIds = [], userId, at }) {
  const ids = new Set(messageIds.map(String));
  return list.map((m) =>
    m._id && ids.has(String(m._id)) && !hasReceipt(m.deliveredTo, userId)
      ? { ...m, deliveredTo: [...(m.deliveredTo ?? []), { user: userId, at }] }
      : m,
  );
}

// message_read covers every message from others up to `at`.
export function applyRead(list, { userId, at }) {
  const until = new Date(at).getTime();
  return list.map((m) => {
    if (!m._id || idOf(m.senderId) === String(userId) || time(m) > until) return m;
    if (hasReceipt(m.readBy, userId)) return m;
    return {
      ...m,
      deliveredTo: hasReceipt(m.deliveredTo, userId) ? m.deliveredTo : [...(m.deliveredTo ?? []), { user: userId, at }],
      readBy: [...(m.readBy ?? []), { user: userId, at }],
    };
  });
}

// For your own messages: 'sending' | 'uploading' | 'failed' | 'sent' | 'delivered' | 'read'.
// Works for private chats and groups: "delivered"/"read" mean by ALL other participants.
export function getReceiptStatus(message, participants = []) {
  if (message.status === 'failed') return 'failed';
  if (!message._id) return message.status ?? 'sending';
  const sender = idOf(message.senderId);
  const others = participants.map(idOf).filter((id) => id !== sender);
  if (!others.length) return 'sent';
  if (others.every((id) => hasReceipt(message.readBy, id))) return 'read';
  if (others.every((id) => hasReceipt(message.deliveredTo, id) || hasReceipt(message.readBy, id))) return 'delivered';
  return 'sent';
}
