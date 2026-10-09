import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, LogOut, MessageSquarePlus, MessagesSquare, Search, Users, X } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Logo from '../ui/Logo.jsx';
import { Alert, EmptyState, ErrorState, Skeleton } from '../ui/Feedback.jsx';
import ConversationItem from './ConversationItem.jsx';
import PeopleResults from './PeopleResults.jsx';
import CreateGroupModal from '../group/CreateGroupModal.jsx';
import { useConversationList } from '../../context/ConversationsContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useDebouncedValue } from '../../lib/useDebouncedValue.js';
import { errorText, getConversationTitle } from '../../lib/conversation.js';
import { conversationsApi, getErrorMessage } from '../../lib/api.js';

function Section({ label, children }) {
  return (
    <section className="mb-2">
      <h2 className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wider text-ink-subtle uppercase">{label}</h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 px-3 py-2" aria-label="Loading conversations">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const list = useConversationList();
  const myId = user?._id;
  const navigate = useNavigate();
  const searchRef = useRef(null);

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const [startingId, setStartingId] = useState(null);
  const [startError, setStartError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const { conversations, loading, error } = list;

  const q = query.trim().toLowerCase();
  const matching = q ? conversations.filter((c) => getConversationTitle(c, myId).toLowerCase().includes(q)) : conversations;
  const starred = matching.filter((c) => c.isStarred);
  const rest = matching.filter((c) => !c.isStarred);

  const clearSearch = () => {
    setQuery('');
    setStartError('');
  };

  const pickPerson = async (person) => {
    setStartingId(person._id);
    setStartError('');
    try {
      const { conversation } = await conversationsApi.openPrivate(person._id);
      if (!conversations.some((c) => c._id === conversation._id)) list.reload();
      clearSearch();
      navigate(`/chat/${conversation._id}`);
    } catch (err) {
      setStartError(getErrorMessage(err, 'Could not open the chat.'));
    } finally {
      setStartingId(null);
    }
  };

  const onLogout = async () => {
    setLoggingOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  const renderItems = (list) =>
    list.map((c) => (
      <ConversationItem
        key={c._id}
        conversation={c}
        myId={myId}
        onSelect={q ? clearSearch : undefined}
      />
    ));

  let body;
  if (loading && conversations.length === 0) {
    body = <ListSkeleton />;
  } else if (error && conversations.length === 0) {
    body = <ErrorState title="Couldn't load your chats" message={errorText(error)} onRetry={list.reload} />;
  } else if (q) {
    body = (
      <>
        {matching.length ? <Section label="Chats">{renderItems(matching)}</Section> : null}
        <Section label="People">
          {startError ? <Alert className="mx-3 mb-2">{startError}</Alert> : null}
          <PeopleResults query={debouncedQuery} onPick={pickPerson} startingId={startingId} />
        </Section>
      </>
    );
  } else if (conversations.length === 0) {
    body = (
      <EmptyState
        icon={MessagesSquare}
        title="No conversations yet"
        description="Search for a classmate by name or email, or create a group for your club."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => searchRef.current?.focus()}>
              <Search className="h-4 w-4" aria-hidden="true" />
              Find someone
            </Button>
            <Button variant="secondary" onClick={() => setCreatingGroup(true)}>
              <Users className="h-4 w-4" aria-hidden="true" />
              New group
            </Button>
          </div>
        }
      />
    );
  } else {
    body = (
      <>
        {starred.length ? <Section label="Starred">{renderItems(starred)}</Section> : null}
        {rest.length ? <Section label={starred.length ? 'All chats' : 'Chats'}>{renderItems(rest)}</Section> : null}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <Logo />
        <Button variant="ghost" size="icon" onClick={onLogout} loading={loggingOut} aria-label="Log out" title="Log out">
          {loggingOut ? null : <LogOut className="h-4.5 w-4.5" aria-hidden="true" />}
        </Button>
      </header>

      <Link
        to="/profile"
        aria-label="Your profile"
        className="mx-2 mt-2 flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-muted"
      >
        <Avatar name={user?.name} src={user?.profilePicture} size="sm" online />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{user?.name}</p>
          <p className="truncate text-xs text-ink-subtle">{user?.email}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
      </Link>

      <div className="flex items-center gap-2 px-4 pt-2 pb-2">
        <Input
          ref={searchRef}
          icon={Search}
          placeholder="Search chats or people"
          aria-label="Search chats or people"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && clearSearch()}
          className="flex-1"
          trailing={
            query ? (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-muted hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null
          }
        />
        <Button
          variant="secondary"
          size="icon"
          aria-label="New conversation"
          title="New conversation"
          onClick={() => searchRef.current?.focus()}
        >
          <MessageSquarePlus className="h-4.5 w-4.5" aria-hidden="true" />
        </Button>
        <Button variant="secondary" size="icon" aria-label="New group" title="New group" onClick={() => setCreatingGroup(true)}>
          <Users className="h-4.5 w-4.5" aria-hidden="true" />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4" aria-label="Conversations">
        {body}
      </nav>
      <CreateGroupModal open={creatingGroup} onClose={() => setCreatingGroup(false)} />
    </div>
  );
}
