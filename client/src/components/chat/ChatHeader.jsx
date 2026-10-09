import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Info, Sparkles, Star } from 'lucide-react';
import { usePresence } from '@p3/hooks/usePresence.js';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import { useNow } from '../../lib/useNow.js';
import { CHAT_MEMORY_ENABLED } from '../../lib/api.js';
import { formatLastSeen } from '../../lib/format.js';
import {
  getConversationAvatar,
  getConversationTitle,
  getOtherParticipant,
  typingLabel,
} from '../../lib/conversation.js';

export default function ChatHeader({ conversation, myId, typingUsers, onToggleStar, onOpenInfo, onOpenMemory }) {
  const now = useNow(30000);
  const [starError, setStarError] = useState(false);
  const isGroup = conversation.type === 'group';
  const avatar = getConversationAvatar(conversation, myId);
  const other = isGroup ? null : getOtherParticipant(conversation, myId);
  const presence = usePresence(other); // P3 hook; `other` is null in groups
  const otherPresence = other ? presence : null;

  const typingText = typingLabel(typingUsers, { short: !isGroup });
  let subtitle;
  let subtitleClass = 'text-ink-subtle';
  if (typingText) {
    subtitle = typingText;
    subtitleClass = 'text-brand-600 font-medium';
  } else if (isGroup) {
    subtitle = `${conversation.participants.length} members`;
  } else if (otherPresence?.online) {
    subtitle = 'online';
    subtitleClass = 'text-success font-medium';
  } else {
    subtitle = formatLastSeen(otherPresence?.lastSeen, now);
  }

  const toggleStar = async () => {
    setStarError(false);
    try {
      await onToggleStar();
    } catch {
      setStarError(true);
      setTimeout(() => setStarError(false), 2500);
    }
  };

  const starred = Boolean(conversation.isStarred);
  const title = getConversationTitle(conversation, myId);

  return (
    <header className="flex items-center gap-1 border-b border-border bg-surface px-2 py-2.5 sm:gap-2 sm:px-4">
      <Link
        to="/chat"
        aria-label="Back to conversations"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted md:hidden"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={onOpenInfo}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-0.5 text-left hover:bg-surface-muted"
        aria-label={isGroup ? `Group info for ${title}` : `Contact info for ${title}`}
      >
        <Avatar name={avatar.name} src={avatar.src} size="sm" online={otherPresence ? otherPresence.online : undefined} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{title}</span>
          <span className={`block truncate text-xs ${subtitleClass}`} aria-live="polite">
            {starError ? <span className="text-danger">Couldn't update star. Try again.</span> : subtitle}
          </span>
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleStar}
        aria-label={starred ? 'Unstar chat' : 'Star chat'}
        aria-pressed={starred}
        title={starred ? 'Unstar chat' : 'Star chat'}
      >
        <Star className={`h-4.5 w-4.5 transition-colors ${starred ? 'fill-star text-star' : ''}`} aria-hidden="true" />
      </Button>
      {CHAT_MEMORY_ENABLED ? (
        <Button variant="ghost" size="icon" onClick={onOpenMemory} aria-label="Chat Memory" title="Chat Memory: AI summary">
          <Sparkles className="h-4.5 w-4.5 text-brand-600" aria-hidden="true" />
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" onClick={onOpenInfo} aria-label={isGroup ? 'Group info' : 'Contact info'} className="hidden sm:inline-flex">
        <Info className="h-4.5 w-4.5" aria-hidden="true" />
      </Button>
    </header>
  );
}
