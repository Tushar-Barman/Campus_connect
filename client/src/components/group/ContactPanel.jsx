import { UserRound } from 'lucide-react';
import Drawer from '../ui/Drawer.jsx';
import Avatar from '../ui/Avatar.jsx';
import { usePresence } from '@p3/hooks/usePresence.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNow } from '../../lib/useNow.js';
import { formatLastSeen } from '../../lib/format.js';
import { getOtherParticipant } from '../../lib/conversation.js';

/** Info about the other person in a private chat. Email is not shown, to limit exposure (§8.3). */
export default function ContactPanel({ conversation, open, onClose }) {
  const { user } = useAuth();
  const now = useNow(30000);
  const other = getOtherParticipant(conversation, user?._id);
  const presence = usePresence(other); // P3 hook

  return (
    <Drawer open={open} onClose={onClose} title="Contact info" icon={UserRound}>
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <Avatar name={other?.name} src={other?.profilePicture} size="xl" online={presence.online} />
        <h3 className="mt-4 text-lg font-bold">{other?.name}</h3>
        <p className={`text-sm ${presence.online ? 'text-success' : 'text-ink-subtle'}`}>
          {presence.online ? 'online' : formatLastSeen(presence.lastSeen, now)}
        </p>
        {other?.bio ? <p className="mt-4 max-w-xs rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">{other.bio}</p> : null}
      </div>
    </Drawer>
  );
}
