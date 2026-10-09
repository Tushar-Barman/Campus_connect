import { useCallback, useEffect, useState } from 'react';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import { Skeleton } from '../ui/Feedback.jsx';
import { useToast } from '../ui/Toast.jsx';
import { getErrorMessage, usersApi } from '../../lib/api.js';

/** Round 2: people you blocked, with Unblock. Lives in the Privacy settings. */
export default function BlockedUsersList() {
  const toast = useToast();
  const [state, setState] = useState({ status: 'loading', users: [], error: '' });
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    try {
      const { users } = await usersApi.blocked();
      setState({ status: 'ready', users, error: '' });
    } catch (err) {
      setState({ status: 'error', users: [], error: getErrorMessage(err, 'Could not load blocked people.') });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unblock = async (person) => {
    setBusyId(person._id);
    try {
      await usersApi.unblock(person._id);
      setState((s) => ({ ...s, users: s.users.filter((u) => u._id !== person._id) }));
      toast.success(`${person.name.split(' ')[0]} unblocked`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not unblock.'));
    } finally {
      setBusyId(null);
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="space-y-2" aria-label="Loading blocked people">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p className="text-sm text-danger" role="alert">
        {state.error}{' '}
        <button type="button" onClick={load} className="font-semibold underline">
          Retry
        </button>
      </p>
    );
  }

  if (!state.users.length) return <p className="text-sm text-ink-subtle">You haven't blocked anyone.</p>;

  return (
    <ul className="divide-y divide-border">
      {state.users.map((person) => (
        <li key={person._id} className="flex items-center gap-3 py-2">
          <Avatar name={person.name} src={person.profilePicture} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
          <Button variant="secondary" size="sm" loading={busyId === person._id} onClick={() => unblock(person)}>
            Unblock
          </Button>
        </li>
      ))}
    </ul>
  );
}
