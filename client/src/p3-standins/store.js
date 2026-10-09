// STAND-IN for P3's real-time layer. One module-level store shared by all stand-in hooks.

import { useSyncExternalStore } from 'react';
import { chatReducer, initialChatState } from './chatReducer.js';
import { conversationsApi, getErrorMessage, messagesApi } from '../lib/api.js';

let state = initialChatState;
const subscribers = new Set();

export const session = { myId: null, owner: null };

export const getState = () => state;

export function dispatch(action) {
  state = chatReducer(state, action);
  subscribers.forEach((fn) => fn());
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/** Selector must return a slice that only changes when the store changes (no new arrays). */
export function useStore(selector) {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export function resetStore() {
  dispatch({ type: 'RESET' });
}

/** Data in the store belongs to one user. A different user → start from empty. */
export function ensureOwner(userId) {
  if (!userId || session.owner === userId) return;
  if (session.owner) resetStore();
  session.owner = userId;
}

const toError = (error) => ({ message: getErrorMessage(error), status: error?.response?.status });

export const tabVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

// ---------- loaders shared by hooks and socket wiring ----------

export async function loadConversations() {
  dispatch({ type: 'CONVERSATIONS_LOADING' });
  try {
    const { conversations } = await conversationsApi.list();
    dispatch({ type: 'CONVERSATIONS_LOADED', conversations });
  } catch (error) {
    dispatch({ type: 'CONVERSATIONS_FAILED', error: getErrorMessage(error) });
  }
}

export async function fetchConversation(conversationId) {
  try {
    const { conversation } = await conversationsApi.get(conversationId);
    dispatch({ type: 'CONVERSATION_UPSERT', conversation });
    return conversation;
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 400) {
      dispatch({ type: 'CONVERSATION_REMOVE', conversationId });
      return null;
    }
    throw error;
  }
}

export async function loadMessages(conversationId) {
  dispatch({ type: 'MESSAGES_LOADING', conversationId });
  try {
    const { messages, hasMore } = await messagesApi.list(conversationId);
    dispatch({ type: 'MESSAGES_LOADED', conversationId, messages, hasMore });
  } catch (error) {
    dispatch({ type: 'MESSAGES_FAILED', conversationId, error: toError(error) });
  }
}

export async function loadOlderMessages(conversationId) {
  const entry = state.messages[conversationId];
  if (!entry || entry.loadingOlder || !entry.hasMore) return;
  const oldest = entry.items.find((m) => m._id);
  if (!oldest) return;
  dispatch({ type: 'MESSAGES_LOADING', conversationId, older: true });
  try {
    const { messages, hasMore } = await messagesApi.list(conversationId, { before: oldest.createdAt });
    dispatch({ type: 'MESSAGES_LOADED', conversationId, messages, hasMore, older: true });
  } catch (error) {
    dispatch({ type: 'MESSAGES_FAILED', conversationId, error: toError(error), older: true });
  }
}

export async function loadPinned(conversationId) {
  try {
    const { messages } = await messagesApi.pinned(conversationId);
    dispatch({ type: 'PINNED_LOADED', conversationId, messages });
  } catch {
    dispatch({ type: 'PINNED_LOADED', conversationId, messages: [] });
  }
}
