import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../lib/api.js';

// Server waits up to 20 s for Gemini; leave headroom for the network.
const REQUEST_TIMEOUT_MS = 30_000;

// AI Chat Memory for one conversation. Call generate() when the user opens the
// panel. `memory` is { summary, keyDecisions[], actionItems[], importantDates[] }
// (all strings). `error` is a user-friendly message; the chat keeps working either way.
export function useChatMemory(conversationId) {
  const [memory, setMemory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(0);

  useEffect(() => {
    requestRef.current += 1;
    setMemory(null);
    setError(null);
    setLoading(false);
  }, [conversationId]);

  const generate = useCallback(async () => {
    if (!conversationId) return;
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post(`/ai/summarize/${conversationId}`, null, { timeout: REQUEST_TIMEOUT_MS });
      if (requestId === requestRef.current) setMemory(data);
    } catch (err) {
      if (requestId === requestRef.current) {
        setError(err.response?.data?.error ?? 'Chat Memory is unavailable right now. Please try again later.');
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [conversationId]);

  return { memory, loading, error, generate };
}
