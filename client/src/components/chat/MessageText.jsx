import { idOf } from '../../lib/conversation.js';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Message text with @mentions highlighted. Only names of users the server kept
 * in `message.mentions` are highlighted, so typing "@someone" by hand does nothing.
 * `people` is a Map(userId → name) of the chat's participants.
 */
export default function MessageText({ message, people, myId, mine }) {
  const text = message.text || '';
  const mentioned = (message.mentions ?? [])
    .map((id) => ({ id: idOf(id), name: people?.get(idOf(id)) }))
    .filter((m) => m.name);

  if (!mentioned.length) return <p className="break-words whitespace-pre-wrap">{text}</p>;

  // Longest names first, so "@Asha Rao" wins over "@Asha".
  const byName = new Map(mentioned.map((m) => [m.name.toLowerCase(), m.id]));
  const names = [...byName.keys()].sort((a, b) => b.length - a.length).map(escapeRegex);
  // Not inside a word on either side, so "a@asha.com" is never highlighted.
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])@(${names.join('|')})(?![\\p{L}\\p{N}])`, 'giu');

  const parts = [];
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const isMe = byName.get(match[1].toLowerCase()) === myId;
    const style = isMe
      ? 'rounded bg-star/35 px-0.5 font-semibold'
      : mine
        ? 'font-semibold underline decoration-white/50 underline-offset-2'
        : 'font-semibold text-brand-700';
    parts.push(
      <span key={match.index} className={style} aria-label={isMe ? `${match[0]} (mentions you)` : undefined}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));

  return <p className="break-words whitespace-pre-wrap">{parts}</p>;
}
