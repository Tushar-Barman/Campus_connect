export function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Short label for the sidebar: "14:05", "Yesterday", "Mon", "12 Oct". */
export function formatListTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (isSameDay(date, now)) return formatTime(date);
  const yesterday = new Date(now.getTime() - DAY);
  if (isSameDay(date, yesterday)) return 'Yesterday';
  if (now - date < 6 * DAY) return date.toLocaleDateString([], { weekday: 'short' });
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** "last seen just now", "last seen 5 min ago", "last seen today at 14:05" … */
export function formatLastSeen(value, now = new Date()) {
  if (!value) return 'offline';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'offline';
  const diff = now - date;
  if (diff < MINUTE) return 'last seen just now';
  if (diff < HOUR) return `last seen ${Math.floor(diff / MINUTE)} min ago`;
  if (isSameDay(date, now)) return `last seen today at ${formatTime(date)}`;
  const yesterday = new Date(now.getTime() - DAY);
  if (isSameDay(date, yesterday)) return `last seen yesterday at ${formatTime(date)}`;
  return `last seen ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

/** Label for a date separator inside a chat: "Today", "Yesterday", "12 October 2026". */
export function formatDayLabel(value, now = new Date()) {
  const date = new Date(value);
  if (isSameDay(date, now)) return 'Today';
  if (isSameDay(date, new Date(now.getTime() - DAY))) return 'Yesterday';
  return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}

export { isSameDay };
