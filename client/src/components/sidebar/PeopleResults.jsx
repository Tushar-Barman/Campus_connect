import { useEffect, useState } from 'react';
import { Loader2, UserRoundSearch } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import { Skeleton } from '../ui/Feedback.jsx';
import { getErrorMessage, usersApi } from '../../lib/api.js';
import { usePresence } from '@p3/hooks/usePresence.js';

function PersonRow({ user, onPick, disabled, starting }) {
  const { online } = usePresence(user);
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(user)}
        disabled={disabled}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-muted disabled:opacity-60"
      >
        <Avatar name={user.name} src={user.profilePicture} size="sm" online={online} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{user.name}</span>
          <span className="block truncate text-xs text-ink-subtle">{user.email}</span>
        </span>
        {starting ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-label="Opening chat" /> : null}
      </button>
    </li>
  );
}

/** Searches people on the server (debounced query in, list out) and starts a chat on click. */
export default function PeopleResults({ query, onPick, startingId }) {
  const [state, setState] = useState({ status: 'idle', users: [], error: '' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setState({ status: 'idle', users: [], error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    usersApi
      .search(q, { signal: controller.signal })
      .then(({ users }) => setState({ status: 'ready', users, error: '' }))
      .catch((error) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', users: [], error: getErrorMessage(error) });
      });
    return () => controller.abort();
  }, [query, attempt]);

  if (state.status === 'idle') return null;

  if (state.status === 'loading') {
    return (
      <div className="space-y-2 px-3 py-2" aria-label="Searching people">
        {[0, 1].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="px-3 py-2 text-sm text-danger" role="alert">
        {state.error}{' '}
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="font-semibold underline">
          Retry
        </button>
      </p>
    );
  }

  if (state.users.length === 0) {
    return (
      <p className="flex items-center gap-2 px-3 py-2 text-sm text-ink-subtle">
        <UserRoundSearch className="h-4 w-4" aria-hidden="true" />
        No people found for “{query.trim()}”
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {state.users.map((u) => (
        <PersonRow key={u._id} user={u} onPick={onPick} disabled={Boolean(startingId)} starting={startingId === u._id} />
      ))}
    </ul>
  );
}
