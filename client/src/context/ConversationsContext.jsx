import { createContext, useContext } from 'react';

// Shares the ONE useConversations() result (P3's hook, called in pages/Chat.jsx) with the
// sidebar, chat window and group panels, so the hook isn't called twice.
const ConversationsContext = createContext(null);

export function ConversationsProvider({ value, children }) {
  return <ConversationsContext.Provider value={value}>{children}</ConversationsContext.Provider>;
}

/** → { conversations, loading, error, reload, patchConversation } */
export function useConversationList() {
  const context = useContext(ConversationsContext);
  if (!context) throw new Error('useConversationList must be used inside <ConversationsProvider>');
  return context;
}
