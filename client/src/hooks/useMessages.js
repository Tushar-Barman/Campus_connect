import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api.js';
import { getSocket } from '../lib/socket.js';
import { useSocketEvent, useSocketReconnect } from './useSocketEvent.js';
import {
  applyDelivered,
  applyRead,
  confirmed,
  isDraft,
  mergeLatest,
  patchDraft,
  resolveDraft,
  sameMessage,
  upsert,
} from './messageState.js';

const PAGE_SIZE = 30;
const SEND_TIMEOUT_MS = 10_000;
const MAX_TEXT_LENGTH = 4000;

// crypto.randomUUID only exists on HTTPS/localhost; fall back for LAN testing.
const newClientId = () =>
  crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const errorText = (err, fallback) => err.response?.data?.error ?? fallback;

function voiceFileName(type) {
  if (type.includes('mp4')) return 'voice-note.m4a';
  if (type.includes('ogg')) return 'voice-note.ogg';
  return 'voice-note.webm';
}

// Messages of one conversation: history, paging, optimistic text and voice
// sends, and live updates (new messages, receipts, pins).
// Message `status`: 'sending' | 'uploading' (with `progress` 0–1) | 'failed' (with `error`) | 'sent'.
export function useMessages(conversationId, currentUser) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);

  const cidRef = useRef(conversationId);
  const latestRequestRef = useRef(0);
  // clientId -> { blob, duration, previewUrl } for voice notes not yet saved
  const voiceDraftsRef = useRef(new Map());

  useEffect(() => {
    cidRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    const drafts = voiceDraftsRef.current;
    return () => {
      drafts.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
      drafts.clear();
    };
  }, []);

  // Applies an update only if the user is still looking at that conversation.
  const updateFor = useCallback((cid, fn) => {
    setMessages((list) => (String(cidRef.current) === String(cid) ? fn(list) : list));
  }, []);

  const forgetVoiceDraft = useCallback((clientId) => {
    const draft = voiceDraftsRef.current.get(clientId);
    if (!draft) return;
    URL.revokeObjectURL(draft.previewUrl);
    voiceDraftsRef.current.delete(clientId);
  }, []);

  const loadLatest = useCallback(async () => {
    if (!conversationId) return;
    const requestId = ++latestRequestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/messages/${conversationId}`, { params: { limit: PAGE_SIZE } });
      if (requestId !== latestRequestRef.current) return;
      updateFor(conversationId, (current) => mergeLatest(data.messages, current));
      setHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (requestId !== latestRequestRef.current) return;
      setError(errorText(err, 'Could not load messages'));
    } finally {
      if (requestId === latestRequestRef.current) setLoading(false);
    }
  }, [conversationId, updateFor]);

  useEffect(() => {
    setMessages([]);
    setHasMore(false);
    setError(null);
    loadLatest();
  }, [loadLatest]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => m._id);
    if (!conversationId || !oldest || !hasMore || loadingOlder) return;
    const cid = conversationId;
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/messages/${cid}`, {
        params: { before: oldest.createdAt, limit: PAGE_SIZE },
      });
      updateFor(cid, (list) => [
        ...data.messages.filter((m) => !list.some((x) => sameMessage(x, m))).map(confirmed),
        ...list,
      ]);
      if (String(cidRef.current) === String(cid)) setHasMore(Boolean(data.hasMore));
    } catch (err) {
      if (String(cidRef.current) === String(cid)) setError(errorText(err, 'Could not load older messages'));
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, messages, hasMore, loadingOlder, updateFor]);

  const markFailed = useCallback(
    (cid, clientId, reason) => updateFor(cid, (list) => patchDraft(list, clientId, { status: 'failed', error: reason })),
    [updateFor],
  );

  const emitText = useCallback(
    (cid, draft) => {
      const socket = getSocket();
      if (!socket) return markFailed(cid, draft.clientId, 'Not connected');

      socket
        .timeout(SEND_TIMEOUT_MS)
        .emit('send_message', { conversationId: cid, text: draft.text, clientId: draft.clientId }, (err, res) => {
          if (err) return markFailed(cid, draft.clientId, 'No response from server');
          if (!res?.ok) return markFailed(cid, draft.clientId, res?.error ?? 'Could not send message');
          updateFor(cid, (list) => resolveDraft(list, draft.clientId, confirmed(res.message)));
        });
    },
    [markFailed, updateFor],
  );

  const uploadVoice = useCallback(
    async (cid, clientId) => {
      const draft = voiceDraftsRef.current.get(clientId);
      if (!draft) return;
      const form = new FormData();
      form.append('duration', String(draft.duration));
      form.append('file', draft.blob, voiceFileName(draft.blob.type));
      try {
        const { data } = await api.post(`/messages/${cid}/media`, form, {
          // Explicit, so an instance-wide JSON default can't turn the form into JSON.
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) updateFor(cid, (list) => patchDraft(list, clientId, { progress: e.loaded / e.total }));
          },
        });
        updateFor(cid, (list) => resolveDraft(list, clientId, confirmed(data.message)));
        forgetVoiceDraft(clientId);
      } catch (err) {
        markFailed(cid, clientId, errorText(err, 'Upload failed'));
      }
    },
    [forgetVoiceDraft, markFailed, updateFor],
  );

  const sendMessage = useCallback(
    (text) => {
      const body = typeof text === 'string' ? text.trim() : '';
      if (!conversationId || !body || body.length > MAX_TEXT_LENGTH) return false;

      const draft = {
        clientId: newClientId(),
        conversationId,
        senderId: currentUser,
        messageType: 'text',
        text: body,
        createdAt: new Date().toISOString(),
        status: 'sending',
      };
      setMessages((list) => [...list, draft]);
      emitText(conversationId, draft);
      return true;
    },
    [conversationId, currentUser, emitText],
  );

  // Takes the recording from useVoiceRecorder: { blob, duration }.
  const sendVoiceNote = useCallback(
    ({ blob, duration } = {}) => {
      if (!conversationId || !blob) return false;
      const clientId = newClientId();
      const previewUrl = URL.createObjectURL(blob);
      voiceDraftsRef.current.set(clientId, { blob, duration, previewUrl });

      setMessages((list) => [
        ...list,
        {
          clientId,
          conversationId,
          senderId: currentUser,
          messageType: 'voice',
          mediaUrl: previewUrl,
          mediaType: blob.type,
          duration,
          createdAt: new Date().toISOString(),
          status: 'uploading',
          progress: 0,
        },
      ]);
      uploadVoice(conversationId, clientId);
      return true;
    },
    [conversationId, currentUser, uploadVoice],
  );

  const retryMessage = useCallback(
    (clientId) => {
      const draft = messages.find((m) => isDraft(m, clientId) && m.status === 'failed');
      if (!draft) return;
      const isVoice = draft.messageType === 'voice';
      updateFor(conversationId, (list) =>
        patchDraft(list, clientId, { status: isVoice ? 'uploading' : 'sending', error: undefined, progress: 0 }),
      );
      if (isVoice) uploadVoice(conversationId, clientId);
      else emitText(conversationId, draft);
    },
    [conversationId, messages, emitText, uploadVoice, updateFor],
  );

  const discardMessage = useCallback(
    (clientId) => {
      forgetVoiceDraft(clientId);
      setMessages((list) => list.filter((m) => !isDraft(m, clientId)));
    },
    [forgetVoiceDraft],
  );

  const isOpen = (cid) => String(cid) === String(cidRef.current);

  useSocketEvent('new_message', ({ message } = {}) => {
    if (message && isOpen(message.conversationId)) {
      updateFor(message.conversationId, (list) => upsert(list, confirmed(message)));
    }
  });

  // Round 2: edits, deletes for everyone, answered location requests.
  // `hidden: true` means this user deleted it "for me" in another tab.
  useSocketEvent('message_updated', ({ message } = {}) => {
    if (!message?._id || !isOpen(message.conversationId)) return;
    const id = String(message._id);
    updateFor(message.conversationId, (list) =>
      message.hidden
        ? list.filter((m) => String(m._id) !== id)
        : list.map((m) => (String(m._id) === id ? confirmed({ ...message, clientId: m.clientId }) : m)),
    );
  });

  useSocketEvent('message_delivered', (payload) => {
    if (payload && isOpen(payload.conversationId)) {
      updateFor(payload.conversationId, (list) => applyDelivered(list, payload));
    }
  });

  useSocketEvent('message_read', (payload) => {
    if (payload && isOpen(payload.conversationId)) {
      updateFor(payload.conversationId, (list) => applyRead(list, payload));
    }
  });

  useSocketEvent('message_pinned', ({ message } = {}) => {
    if (!message || !isOpen(message.conversationId)) return;
    const { isPinned, pinnedAt, pinnedBy } = message;
    updateFor(message.conversationId, (list) =>
      list.map((m) => (sameMessage(m, message) ? { ...m, isPinned, pinnedAt, pinnedBy } : m)),
    );
  });

  useSocketEvent('message_unpinned', ({ conversationId: cid, messageId } = {}) => {
    if (!isOpen(cid)) return;
    updateFor(cid, (list) =>
      list.map((m) => (String(m._id) === String(messageId) ? { ...m, isPinned: false, pinnedAt: null, pinnedBy: null } : m)),
    );
  });

  useSocketReconnect(loadLatest);

  return {
    messages,
    hasMore,
    loading,
    loadingOlder,
    error,
    sendMessage,
    sendVoiceNote,
    retryMessage,
    discardMessage,
    loadOlder,
    reload: loadLatest,
  };
}
