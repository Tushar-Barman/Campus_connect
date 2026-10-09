import { useEffect, useState } from 'react';
import { Check, Loader2, Search } from 'lucide-react';
import Input from '../ui/Input.jsx';
import Avatar from '../ui/Avatar.jsx';
import { Skeleton } from '../ui/Feedback.jsx';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { getErrorMessage, usersApi } from '../../lib/api.js';

/** Search box + results for picking people (group creation, adding members). */
export default function UserPicker({ onPick, excludeIds = [], selectedIds = [], busyId, label = 'Add people', autoFocus }) {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query.trim(), 300);
  const [state, setState] = useState({ status: 'idle', users: [], error: '' });

  useEffect(() => {
    if (!debounced) {
      setState({ status: 'idle', users: [], error: '' });
      return undefined;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading' }));
    usersApi
      .search(debounced, { signal: controller.signal })
      .then(({ users }) => setState({ status: 'ready', users, error: '' }))
      .catch((err) => !controller.signal.aborted && setState({ status: 'error', users: [], error: getErrorMessage(err) }));
    return () => controller.abort();
  }, [debounced]);

  const results = state.users.filter((u) => !excludeIds.includes(u._id));

  return (
    <div>
      <Input
        label={label}
        icon={Search}
        placeholder="Search by name or email"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus={autoFocus}
      />
      <div className="mt-2 max-h-56 overflow-y-auto">
        {state.status === 'loading' ? (
          <div className="space-y-2 py-1" aria-label="Searching">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-2/3" />
          </div>
        ) : null}
        {state.status === 'error' ? <p className="py-2 text-sm text-danger" role="alert">{state.error}</p> : null}
        {state.status === 'ready' && results.length === 0 ? (
          <p className="py-2 text-sm text-ink-subtle">No one found for “{debounced}”</p>
        ) : null}
        {state.status === 'ready'
          ? results.map((u) => {
              const selected = selectedIds.includes(u._id);
              return (
                <button
                  key={u._id}
                  type="button"
                  onClick={() => onPick(u)}
                  disabled={Boolean(busyId)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors disabled:opacity-60 ${selected ? 'bg-brand-50' : 'hover:bg-surface-muted'}`}
                >
                  <Avatar name={u.name} src={u.profilePicture} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{u.name}</span>
                    <span className="block truncate text-xs text-ink-subtle">{u.email}</span>
                  </span>
                  {busyId === u._id ? <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" /> : null}
                  {selected ? <Check className="h-4 w-4 text-accent" aria-label="Selected" role="img" /> : null}
                </button>
              );
            })
          : null}
      </div>
    </div>
  );
}
