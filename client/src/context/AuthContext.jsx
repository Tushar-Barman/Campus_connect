import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, setUnauthorizedHandler } from '../lib/api.js';
import { TOKEN_KEY, tokenStore } from '../lib/storage.js';
import { connectSocket, disconnectSocket } from '@p3/lib/socket.js';

const AuthContext = createContext(null);

// status: 'checking' (validating a saved token) | 'authed' | 'guest' | 'error' (server unreachable)
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (tokenStore.get() ? 'checking' : 'guest'));
  const [token, setToken] = useState(() => tokenStore.get());

  const clearSession = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    setUser(null);
    setStatus('guest');
  }, []);

  const startSession = useCallback(({ token: nextToken, user: nextUser }) => {
    tokenStore.set(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setStatus('authed');
    return nextUser;
  }, []);

  const checkSession = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('guest');
      return;
    }
    setStatus('checking');
    try {
      const { user: me } = await authApi.me();
      setUser(me);
      setStatus('authed');
    } catch (error) {
      if (error.response?.status === 401) clearSession();
      else setStatus('error');
    }
  }, [clearSession]);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Logging out (or in) in one tab updates every other open tab.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key !== TOKEN_KEY) return;
      setToken(event.newValue);
      if (event.newValue) checkSession();
      else clearSession();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [checkSession, clearSession]);

  // The ONLY place the socket is created (CAUTION_AND_DIRECTION.md, P2 §2).
  // It connects once the session is confirmed and disconnects on logout.
  useEffect(() => {
    if (!token || status !== 'authed') return undefined;
    connectSocket(token, { onUnauthorized: clearSession });
    return () => disconnectSocket();
  }, [token, status, clearSession]);

  const login = useCallback(
    async (credentials) => startSession(await authApi.login(credentials)),
    [startSession],
  );

  const register = useCallback(
    async (details) => startSession(await authApi.register(details)),
    [startSession],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* the token is discarded either way */
    }
    clearSession();
  }, [clearSession]);

  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(
    // forgetSession: drop the local session without calling the server (Round 2: the account was just deleted).
    () => ({ user, status, isAuthed: status === 'authed', login, register, logout, forgetSession: clearSession, updateUser, retry: checkSession }),
    [user, status, login, register, logout, clearSession, updateUser, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
