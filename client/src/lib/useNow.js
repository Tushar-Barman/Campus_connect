import { useEffect, useState } from 'react';

/** Re-renders every `intervalMs` so labels like "last seen 3 min ago" stay current. */
export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
