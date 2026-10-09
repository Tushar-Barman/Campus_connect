import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessagesSquare, SearchX } from 'lucide-react';
import { useConversations } from '@p3/hooks/useConversations.js';
import { useReceiptSync } from '@p3/hooks/useReceipts.js';
import { useSocketEvent } from '@p3/hooks/useSocketEvent.js';
import Sidebar from '../components/sidebar/Sidebar.jsx';
import ChatWindow from '../components/chat/ChatWindow.jsx';
import ConnectionBanner from '../components/chat/ConnectionBanner.jsx';
import CampusPrompt from '../components/campus/CampusPrompt.jsx';
import { EmptyState, ErrorState, Spinner } from '../components/ui/Feedback.jsx';
import { buttonClass } from '../components/ui/Button.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ConversationsProvider } from '../context/ConversationsContext.jsx';
import { conversationsApi, getErrorMessage } from '../lib/api.js';

const BASE_TITLE = 'CampusConnect';

export default function Chat() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const myId = user?._id;

  // P3's hooks (CAUTION_AND_DIRECTION.md, P2 §3)
  const list = useConversations(myId, conversationId);
  useReceiptSync(conversationId, myId); // mounted once, here

  const fromList = conversationId ? list.conversations.find((c) => c._id === conversationId) : null;

  // A chat opened from a link may not be in the list yet: fetch it, or show "not found".
  const [lookup, setLookup] = useState({ status: 'ok', conversation: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  const listReady = !list.loading || list.conversations.length > 0;
  const inList = Boolean(fromList);
  const reloadRef = useRef(list.reload); // P3's reload may change identity every render
  reloadRef.current = list.reload;

  useEffect(() => {
    if (!conversationId || inList || !listReady) {
      setLookup({ status: 'ok', conversation: null, error: '' });
      return undefined;
    }
    let cancelled = false;
    setLookup({ status: 'checking', conversation: null, error: '' });
    conversationsApi
      .get(conversationId)
      .then(({ conversation }) => {
        if (cancelled) return;
        setLookup({ status: 'ok', conversation, error: '' });
        reloadRef.current?.(); // bring it into the sidebar too
      })
      .catch((error) => {
        if (cancelled) return;
        const status = error.response?.status;
        setLookup(
          status === 404 || status === 400
            ? { status: 'missing', conversation: null, error: '' }
            : { status: 'error', conversation: null, error: getErrorMessage(error) },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, inList, listReady, attempt]);

  const conversation = fromList || lookup.conversation;

  // Tell the user when an admin removes them from a group.
  const namesRef = useRef({});
  namesRef.current = Object.fromEntries(list.conversations.map((c) => [c._id, c.groupName]));
  useSocketEvent('group_member_removed', ({ conversationId: cid, userId } = {}) => {
    if (userId !== myId) return;
    const name = namesRef.current[cid];
    toast.info(name ? `You were removed from ${name}` : 'You were removed from a group');
  });

  // Unread total in the browser tab title.
  const unreadTotal = list.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0);
  useEffect(() => {
    document.title = unreadTotal ? `(${unreadTotal}) ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [unreadTotal]);

  const showChatOnMobile = Boolean(conversationId);

  let main;
  if (conversation) {
    main = <ChatWindow key={conversation._id} conversation={conversation} />;
  } else if (conversationId && (lookup.status === 'checking' || !listReady)) {
    main = (
      <div className="flex h-full items-center justify-center bg-canvas">
        <Spinner className="h-6 w-6" label="Opening chat" />
      </div>
    );
  } else if (conversationId && lookup.status === 'error') {
    main = <ErrorState title="Couldn't open this chat" message={lookup.error} onRetry={() => setAttempt((n) => n + 1)} className="h-full bg-canvas" />;
  } else if (conversationId) {
    main = (
      <EmptyState
        icon={SearchX}
        title="Conversation not found"
        description="It may have been deleted, or you're not a member."
        action={
          <button type="button" onClick={() => navigate('/chat')} className={buttonClass({ variant: 'secondary' })}>
            Back to chats
          </button>
        }
        className="h-full bg-canvas"
      />
    );
  } else {
    main = (
      <div className="flex h-full flex-col bg-canvas">
        <ConnectionBanner />
        <EmptyState
          icon={MessagesSquare}
          title="Pick a conversation"
          description="Choose a chat on the left, or search for a classmate to start a new one."
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <ConversationsProvider value={list}>
      <div className="flex h-dvh overflow-hidden bg-surface">
        <aside
          className={`${showChatOnMobile ? 'hidden' : 'flex'} w-full flex-col border-r border-border bg-surface md:flex md:w-80 lg:w-96`}
        >
          <Sidebar />
        </aside>
        <main className={`${showChatOnMobile ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>{main}</main>
      </div>
      <CampusPrompt />
    </ConversationsProvider>
  );
}
