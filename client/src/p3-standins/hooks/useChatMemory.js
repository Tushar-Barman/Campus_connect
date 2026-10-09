// STAND-IN for P3's hooks/useChatMemory.js — useChatMemory(conversationId) → { memory, loading, error, generate }
import { useCallback, useState } from 'react';
import { aiApi, getErrorMessage } from '../../lib/api.js';

const cache = new Map();

export function useChatMemory(conversationId) {
  const [memory, setMemory] = useState(() => cache.get(conversationId) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await aiApi.summarize(conversationId);
      cache.set(conversationId, result);
      setMemory(result);
    } catch (err) {
      setError(getErrorMessage(err, 'Chat Memory could not summarise this chat.'));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  return { memory, loading, error, generate };
}

export default useChatMemory;
