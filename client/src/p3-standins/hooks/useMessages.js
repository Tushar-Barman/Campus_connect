// STAND-IN for P3's hooks/useMessages.js
// useMessages(conversationId, currentUser) → { messages, hasMore, loading, loadingOlder, error,
//   sendMessage(text), sendVoiceNote(recording), retryMessage(clientId), discardMessage(clientId), loadOlder(), reload() }
import { useCallback, useEffect } from 'react';
import { dispatch, getState, loadMessages, loadOlderMessages, useStore } from '../store.js';
import { emitWithAck } from '../lib/socket.js';
import { getErrorMessage, messagesApi } from '../../lib/api.js';

const EMPTY = [];
const pendingMedia = new Map(); // clientId -> { conversationId, blob, duration, mimeType, url }
const newClientId = () => `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const EXT = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a' };

async function deliverText(conversationId, clientId, text) {
  const res = await emitWithAck('send_message', { conversationId, text, clientId });
  if (res.ok && res.message) dispatch({ type: 'MESSAGE_CONFIRMED', clientId, message: res.message });
  else dispatch({ type: 'MESSAGE_FAILED', conversationId, clientId, error: res.error || 'Not sent' });
}

async function uploadVoice(clientId) {
  const p = pendingMedia.get(clientId);
  if (!p) return;
  let last = 0;
  try {
    const file = new File([p.blob], `voice-${Date.now()}.${EXT[p.mimeType] || 'webm'}`, { type: p.mimeType });
    const res = await messagesApi.uploadMedia(p.conversationId, { file, duration: Math.round(p.duration * 10) / 10 }, (progress) => {
      if (progress - last < 0.1 && progress < 1) return;
      last = progress;
      dispatch({ type: 'MESSAGE_UPLOAD_PROGRESS', conversationId: p.conversationId, clientId, progress });
    });
    if (res?.message) dispatch({ type: 'MESSAGE_CONFIRMED', clientId, message: res.message });
    pendingMedia.delete(clientId);
    setTimeout(() => URL.revokeObjectURL(p.url), 10000);
  } catch (error) {
    dispatch({ type: 'MESSAGE_FAILED', conversationId: p.conversationId, clientId, error: getErrorMessage(error, 'Upload failed') });
  }
}

export function useMessages(conversationId, currentUser) {
  const entry = useStore((s) => (conversationId ? s.messages[conversationId] : undefined));

  useEffect(() => {
    if (!conversationId) return;
    const e = getState().messages[conversationId];
    if (!e || e.status === 'idle' || e.status === 'error') loadMessages(conversationId);
  }, [conversationId]);

  const sender = useCallback(
    () => ({ _id: currentUser?._id, name: currentUser?.name, profilePicture: currentUser?.profilePicture || '' }),
    [currentUser?._id, currentUser?.name, currentUser?.profilePicture],
  );

  const sendMessage = useCallback(
    (text) => {
      const clientId = newClientId();
      dispatch({
        type: 'MESSAGE_OPTIMISTIC',
        message: { clientId, conversationId, senderId: sender(), messageType: 'text', text, deliveredTo: [], readBy: [], status: 'sending', createdAt: new Date().toISOString() },
      });
      deliverText(conversationId, clientId, text);
    },
    [conversationId, sender],
  );

  const sendVoiceNote = useCallback(
    ({ blob, duration, mimeType }) => {
      const clientId = newClientId();
      const url = URL.createObjectURL(blob);
      pendingMedia.set(clientId, { conversationId, blob, duration, mimeType, url });
      dispatch({
        type: 'MESSAGE_OPTIMISTIC',
        message: {
          clientId, conversationId, senderId: sender(), messageType: 'voice', text: '', mediaUrl: url, mediaType: mimeType,
          duration, deliveredTo: [], readBy: [], status: 'uploading', progress: 0, createdAt: new Date().toISOString(),
        },
      });
      uploadVoice(clientId);
    },
    [conversationId, sender],
  );

  const retryMessage = useCallback(
    (clientId) => {
      const message = getState().messages[conversationId]?.items.find((m) => m.clientId === clientId);
      if (!message) return;
      dispatch({ type: 'MESSAGE_RETRYING', conversationId, clientId });
      if (pendingMedia.has(clientId)) uploadVoice(clientId);
      else deliverText(conversationId, clientId, message.text);
    },
    [conversationId],
  );

  const discardMessage = useCallback(
    (clientId) => {
      const pending = pendingMedia.get(clientId);
      if (pending) URL.revokeObjectURL(pending.url);
      pendingMedia.delete(clientId);
      dispatch({ type: 'MESSAGE_DISCARD', conversationId, clientId });
    },
    [conversationId],
  );

  return {
    messages: entry?.items || EMPTY,
    hasMore: Boolean(entry?.hasMore),
    loading: !entry || entry.status === 'idle' || (entry.status === 'loading' && entry.items.length === 0),
    loadingOlder: Boolean(entry?.loadingOlder),
    error: entry?.status === 'error' ? entry.error : null,
    sendMessage,
    sendVoiceNote,
    retryMessage,
    discardMessage,
    loadOlder: useCallback(() => loadOlderMessages(conversationId), [conversationId]),
    reload: useCallback(() => loadMessages(conversationId), [conversationId]),
  };
}

export default useMessages;
