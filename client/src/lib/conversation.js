const idOf = (value) => (value && typeof value === 'object' ? value._id : value);

export function getOtherParticipant(conversation, myId) {
  return (conversation?.participants || []).find((p) => idOf(p) !== myId) || null;
}

export function getConversationTitle(conversation, myId) {
  if (!conversation) return '';
  if (conversation.type === 'group') return conversation.groupName || 'Group';
  return getOtherParticipant(conversation, myId)?.name || 'Unknown user';
}

export function getConversationAvatar(conversation, myId) {
  if (conversation?.type === 'group') {
    return { name: conversation.groupName || 'Group', src: conversation.groupPicture };
  }
  const other = getOtherParticipant(conversation, myId);
  return { name: other?.name || '', src: other?.profilePicture };
}

/**
 * typingUsers comes from P3's useTyping(): [{ userId, name }].
 * "Diya is typing…" for one person, "2 people are typing…" for more (CAUTION_AND_DIRECTION.md, P2 §4).
 * In a private chat's header, `short` gives just "typing…" because the name is already shown.
 */
export function typingLabel(typingUsers = [], { short = false } = {}) {
  if (!typingUsers.length) return '';
  if (typingUsers.length > 1) return `${typingUsers.length} people are typing…`;
  if (short) return 'typing…';
  return `${(typingUsers[0].name || 'Someone').split(' ')[0]} is typing…`;
}

/** 404 from useMessages (e.g. removed from a group), whatever shape the error takes. */
export function isNotFoundError(error) {
  if (!error) return false;
  if (error.status === 404 || error.response?.status === 404) return true;
  return /not found|no longer/i.test(typeof error === 'string' ? error : error.message || '');
}

/** Hooks may report errors as strings or Error-like objects. */
export function errorText(error, fallback = 'Something went wrong.') {
  if (!error) return '';
  if (typeof error === 'string') return error;
  return error.message || fallback;
}

export function previewText(message) {
  if (!message) return '';
  if (message.deletedAt) return 'This message was deleted';
  if (message.messageType === 'voice') return '🎤 Voice note';
  if (message.messageType === 'image') return message.text ? `📷 ${message.text}` : '📷 Photo';
  if (message.messageType === 'file') return `📎 ${message.fileName || 'File'}`;
  if (message.messageType === 'location') return `📍 ${message.location?.label || 'Location'}`;
  if (message.messageType === 'location_request') return '📍 Asked for a location';
  return message.text || '';
}

export { idOf };
