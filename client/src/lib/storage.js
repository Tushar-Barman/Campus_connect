// localStorage can throw (private mode, blocked storage); never let that crash the app.

export const TOKEN_KEY = 'cc_token';

export const tokenStore = {
  get() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable: the session lasts until the tab closes */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* nothing to clear */
    }
  },
};
