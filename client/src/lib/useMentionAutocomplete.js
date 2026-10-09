import { useCallback, useMemo, useState } from 'react';

const MAX_SUGGESTIONS = 6;
// "@" at the start or after whitespace, then up to 30 non-space characters, ending at the caret.
const TRIGGER = /(^|\s)@([^\s@]{0,30})$/u;

/**
 * @mention autocomplete for the Composer (groups only: pass members = [] otherwise).
 * members: [{ _id, name, profilePicture }] without the current user.
 * Inserts "@Full Name " and remembers who was picked; mentionIdsIn(text) returns
 * the ids whose "@Name" is still in the final text.
 */
export function useMentionAutocomplete({ members, text, setText, inputRef }) {
  const [query, setQuery] = useState(null); // { start, value } while the popover is open
  const [active, setActive] = useState(0);
  const [picked, setPicked] = useState([]); // [{ id, name }]

  const suggestions = useMemo(() => {
    if (!query || !members.length) return [];
    const q = query.value.toLowerCase();
    const starts = members.filter((m) => m.name?.toLowerCase().startsWith(q));
    const contains = members.filter((m) => !m.name?.toLowerCase().startsWith(q) && m.name?.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, MAX_SUGGESTIONS);
  }, [members, query]);

  const open = suggestions.length > 0;

  // Call from onChange (and on caret moves) with the new value and caret position.
  const track = useCallback(
    (value, caret) => {
      if (!members.length) return;
      const match = value.slice(0, caret).match(TRIGGER);
      if (match) {
        setQuery({ start: caret - match[2].length - 1, value: match[2] });
        setActive(0);
      } else {
        setQuery(null);
      }
    },
    [members.length],
  );

  const select = useCallback(
    (member) => {
      if (!query) return;
      const end = query.start + 1 + query.value.length;
      const insert = `@${member.name} `;
      const next = text.slice(0, query.start) + insert + text.slice(end);
      setText(next);
      setPicked((list) => (list.some((p) => p.id === member._id) ? list : [...list, { id: member._id, name: member.name }]));
      setQuery(null);
      const caret = query.start + insert.length;
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(caret, caret);
      });
    },
    [query, text, setText, inputRef],
  );

  // Returns true when the key was used by the popover (the Composer must then ignore it).
  const onKeyDown = useCallback(
    (event) => {
      if (!open) return false;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActive((i) => (i + step + suggestions.length) % suggestions.length);
        return true;
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        event.preventDefault();
        select(suggestions[active] ?? suggestions[0]);
        return true;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setQuery(null);
        return true;
      }
      return false;
    },
    [open, suggestions, active, select],
  );

  const mentionIdsIn = useCallback(
    (finalText) => picked.filter((p) => finalText.includes(`@${p.name}`)).map((p) => p.id),
    [picked],
  );

  const reset = useCallback(() => {
    setPicked([]);
    setQuery(null);
  }, []);

  return { open, suggestions, active, setActive, track, select, onKeyDown, close: () => setQuery(null), mentionIdsIn, reset };
}
