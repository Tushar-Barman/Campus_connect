import axios from 'axios';
import { tokenStore } from './storage.js';
import { mockAdapter } from './mock/mockApi.js';

export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true';

export const SERVER_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/+$/, '');

export const api = axios.create({
  baseURL: `${SERVER_URL}/api`,
  timeout: 15000,
  ...(USE_MOCKS ? { adapter: mockAdapter } : {}),
});

let unauthorizedHandler = null;

/** AuthContext registers a callback here so any 401 logs the user out. */
export function setUnauthorizedHandler(fn) {
  unauthorizedHandler = fn;
}

api.interceptors.request.use((config) => {
  const token = tokenStore.get();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Round 2: a wrong password on DELETE /users/me (account deletion) must not log out either.
const AUTH_ATTEMPT = /\/auth\/(login|register)$|\/users\/me$/;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    // A wrong password on /auth/login is a 401 too, but that must show an error, not log out.
    if (status === 401 && !AUTH_ATTEMPT.test(url) && unauthorizedHandler) {
      unauthorizedHandler();
    }
    return Promise.reject(error);
  },
);

/** Turns any axios error into one sentence that is safe to show the user. */
export function getErrorMessage(error, fallback = 'Something went wrong. Please try again.') {
  const serverMessage = error?.response?.data?.error;
  if (typeof serverMessage === 'string' && serverMessage.trim()) return serverMessage;
  if (error?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (error && !error.response) return 'Cannot reach the server. Check your connection and try again.';
  if (error?.response?.status === 429) return 'Too many attempts. Please wait a moment and try again.';
  return fallback;
}

// P3's hooks do `import api from '../lib/api.js'` (see CAUTION_AND_DIRECTION.md, P2 §1).
export default api;

const data = (promise) => promise.then((res) => res.data);

const UPLOAD_TIMEOUT_MS = 60000;

function form(fields) {
  const fd = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) fd.append(key, value);
  });
  return fd;
}

function progressHandler(onProgress) {
  if (!onProgress) return undefined;
  return (event) => onProgress(event.total ? Math.min(1, event.loaded / event.total) : 0);
}

export const authApi = {
  register: (body) => data(api.post('/auth/register', body)),
  login: (body) => data(api.post('/auth/login', body)),
  logout: () => data(api.post('/auth/logout')),
  me: () => data(api.get('/auth/me')),
};

export const usersApi = {
  // Round 2: campus = a campus id or 'all'; omitted = the caller's own campus.
  search: (q, config, campus) => data(api.get('/users/search', { params: { q, ...(campus ? { campus } : {}) }, ...config })),
  getById: (id) => data(api.get(`/users/${id}`)),
  updateProfile: (body) => data(api.put('/users/profile', body)),
  uploadPicture: (file, onProgress) =>
    data(
      api.post('/users/profile-picture', form({ picture: file }), {
        timeout: UPLOAD_TIMEOUT_MS,
        onUploadProgress: progressHandler(onProgress),
      }),
    ),
  removePicture: () => data(api.delete('/users/profile-picture')),
  // Round 2: { readReceipts?, theme?, accent?, density?, fontScale?, bubbleStyle? } → { settings }
  updateSettings: (patch) => data(api.put('/users/settings', patch)),
  deleteAccount: (password) => data(api.delete('/users/me', { data: { password } })),
};

export const campusesApi = {
  list: () => data(api.get('/campuses')),
};

export const conversationsApi = {
  list: () => data(api.get('/conversations')),
  get: (id) => data(api.get(`/conversations/${id}`)),
  openPrivate: (userId) => data(api.post('/conversations', { userId })),
  star: (id) => data(api.post(`/conversations/${id}/star`)),
  unstar: (id) => data(api.delete(`/conversations/${id}/star`)),
  createGroup: ({ name, memberIds }) => data(api.post('/conversations/group', { name, memberIds })),
  updateGroup: (id, body) => data(api.put(`/conversations/${id}`, body)),
  addMember: (id, userId) => data(api.post(`/conversations/${id}/members`, { userId })),
  removeMember: (id, userId) => data(api.delete(`/conversations/${id}/members/${userId}`)),
};

export const MESSAGE_PAGE_SIZE = 30;

export const messagesApi = {
  list: (conversationId, { before } = {}) =>
    data(api.get(`/messages/${conversationId}`, { params: { limit: MESSAGE_PAGE_SIZE, ...(before ? { before } : {}) } })),
  pinned: (conversationId) => data(api.get(`/messages/${conversationId}/pinned`)),
  pin: (conversationId, messageId) => data(api.post(`/messages/${conversationId}/pin/${messageId}`)),
  unpin: (conversationId, messageId) => data(api.delete(`/messages/${conversationId}/pin/${messageId}`)),
  uploadMedia: (conversationId, { file, duration, clientId }, onProgress) =>
    data(
      api.post(`/messages/${conversationId}/media`, form({ file, duration, clientId }), {
        timeout: UPLOAD_TIMEOUT_MS,
        onUploadProgress: progressHandler(onProgress),
      }),
    ),
};

export const CHAT_MEMORY_ENABLED = import.meta.env.VITE_FEATURE_CHAT_MEMORY !== 'false';

export const aiApi = {
  summarize: (conversationId) => data(api.post(`/ai/summarize/${conversationId}`, null, { timeout: 45000 })),
};
