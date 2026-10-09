// STAND-IN for P3's hooks/usePresence.js — usePresence(user) → { online, lastSeen }
import { useStore } from '../store.js';

export function usePresence(user) {
  const id = user && typeof user === 'object' ? user._id : user;
  const live = useStore((s) => (id ? s.presence[id] : undefined));
  if (live) return live;
  return { online: user?.status === 'online', lastSeen: user?.lastSeen ?? null };
}

export default usePresence;
