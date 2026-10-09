// axios adapter that answers REST calls from mockServer (PROJECT_INSTRUCTIONS §6).

import { AxiosError } from 'axios';
import * as server from './mockServer.js';

const LATENCY_MS = 300;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function respond(config, status, body) {
  const response = { data: body, status, statusText: String(status), headers: {}, config, request: {} };
  if (status >= 400) {
    const code = status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST;
    throw new AxiosError(body.error, code, config, {}, response);
  }
  return response;
}

const isFormData = (value) => typeof FormData !== 'undefined' && value instanceof FormData;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new server.MockError(400, 'Could not read the file'));
    reader.readAsDataURL(file);
  });
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Mirrors the server's upload checks (§8.6), then stores the file as a data URL. */
async function readUpload(config, field, allowed) {
  if (!isFormData(config.data)) throw new server.MockError(400, 'Expected a multipart upload');
  const file = config.data.get(field);
  if (!file || typeof file === 'string') throw new server.MockError(400, `Missing file field "${field}"`);
  const type = String(file.type || '').split(';')[0];
  if (!allowed.includes(type)) throw new server.MockError(400, 'This file type is not allowed');
  if (file.size > MAX_BYTES) throw new server.MockError(413, 'File is too large (max 5 MB)');
  if (config.onUploadProgress) {
    for (const loaded of [0.35, 0.7, 1]) {
      await new Promise((r) => setTimeout(r, 120));
      config.onUploadProgress({ loaded: loaded * file.size, total: file.size, progress: loaded });
    }
  }
  return { url: await fileToDataUrl(file), mime: type, form: config.data };
}

function parseBody(config) {
  if (!config.data || isFormData(config.data)) return {};
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data);
    } catch {
      return {};
    }
  }
  return config.data;
}

function readAuthHeader(config) {
  const headers = config.headers || {};
  const value = typeof headers.get === 'function' ? headers.get('Authorization') : headers.Authorization;
  return typeof value === 'string' ? value : '';
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function register(config) {
  const { name = '', email = '', password = '' } = parseBody(config);
  const users = server.getUsers();
  const cleanName = String(name).trim();
  const cleanEmail = String(email).trim().toLowerCase();
  if (cleanName.length < 2 || cleanName.length > 50) return respond(config, 400, { error: 'Name must be 2–50 characters' });
  if (!EMAIL_RE.test(cleanEmail)) return respond(config, 400, { error: 'Enter a valid email address' });
  if (String(password).length < 8) return respond(config, 400, { error: 'Password must be at least 8 characters' });
  if (users.some((u) => u.email === cleanEmail)) {
    return respond(config, 400, { error: 'An account with this email already exists' });
  }
  const now = new Date().toISOString();
  const user = {
    _id: server.makeId(),
    name: cleanName,
    email: cleanEmail,
    password: String(password),
    bio: '',
    profilePicture: '',
    starredConversations: [],
    lastSeen: now,
    createdAt: now,
    updatedAt: now,
  };
  server.saveUsers([...users, user]);
  server.ensureDemoGroup(user._id);
  return respond(config, 201, { token: `mock.${user._id}`, user: server.publicUser(user) });
}

function login(config) {
  const { email = '', password = '' } = parseBody(config);
  const user = server.getUsers().find((u) => u.email === String(email).trim().toLowerCase());
  if (!user || user.password !== password) return respond(config, 401, { error: 'Invalid email or password' });
  server.ensureDemoGroup(user._id);
  return respond(config, 200, { token: `mock.${user._id}`, user: server.publicUser(user) });
}

async function route(config, method, path, me) {
  const body = parseBody(config);
  let m;

  // ----- Part 3 -----
  if (method === 'post' && path === '/users/profile-picture') {
    const { url } = await readUpload(config, 'picture', IMAGE_TYPES);
    return server.setProfilePicture(me._id, url);
  }
  if (method === 'delete' && path === '/users/profile-picture') return server.setProfilePicture(me._id, '');
  if (method === 'post' && path === '/conversations/group') return server.createGroup(me._id, body.name, body.memberIds);
  if (method === 'put' && (m = path.match(/^\/conversations\/([a-f0-9]{24})$/))) {
    return server.updateGroup(me._id, m[1], { groupName: body.groupName, groupPicture: body.groupPicture });
  }
  if (method === 'post' && (m = path.match(/^\/conversations\/([a-f0-9]{24})\/members$/))) {
    return server.addMember(me._id, m[1], body.userId);
  }
  if (method === 'delete' && (m = path.match(/^\/conversations\/([a-f0-9]{24})\/members\/([a-f0-9]{24})$/))) {
    return server.removeMember(me._id, m[1], m[2]);
  }
  if (method === 'post' && (m = path.match(/^\/messages\/([a-f0-9]{24})\/media$/))) {
    const { url, mime, form } = await readUpload(config, 'file', [...AUDIO_TYPES, ...IMAGE_TYPES]);
    return server.createMediaMessage(me._id, m[1], { url, mime, duration: form.get('duration') });
  }
  if (method === 'post' && (m = path.match(/^\/ai\/summarize\/([a-f0-9]{24})$/))) {
    await new Promise((r) => setTimeout(r, 1200));
    return server.summarize(me._id, m[1]);
  }

  if (method === 'post' && path === '/auth/logout') return { ok: true };
  if (method === 'get' && path === '/auth/me') return { user: server.publicUser(me) };

  if (method === 'get' && path === '/users/search') {
    const q = String(config.params?.q || '').trim();
    if (!q) return { users: [] };
    const re = new RegExp(escapeRegex(q), 'i');
    return {
      users: server
        .getUsers()
        .filter((u) => u._id !== me._id && (re.test(u.name) || re.test(u.email)))
        .slice(0, 20)
        .map(server.publicUser),
    };
  }
  if (method === 'put' && path === '/users/profile') {
    const updated = {
      ...me,
      ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
      ...(typeof body.bio === 'string' ? { bio: body.bio.trim().slice(0, 160) } : {}),
      updatedAt: new Date().toISOString(),
    };
    server.saveUsers(server.getUsers().map((u) => (u._id === me._id ? updated : u)));
    return { user: server.publicUser(updated) };
  }
  if (method === 'get' && (m = path.match(/^\/users\/([a-f0-9]{24})$/))) {
    const user = server.getUsers().find((u) => u._id === m[1]);
    if (!user) throw new server.MockError(404, 'User not found');
    return { user: server.publicUser(user) };
  }

  if (method === 'get' && path === '/conversations') return { conversations: server.listConversations(me._id) };
  if (method === 'post' && path === '/conversations') return server.findOrCreatePrivate(me._id, body.userId);
  if (method === 'get' && (m = path.match(/^\/conversations\/([a-f0-9]{24})$/))) {
    return { conversation: server.getConversation(me._id, m[1]) };
  }
  if ((m = path.match(/^\/conversations\/([a-f0-9]{24})\/star$/))) {
    if (method === 'post') return server.setStar(me._id, m[1], true);
    if (method === 'delete') return server.setStar(me._id, m[1], false);
  }

  if (method === 'get' && (m = path.match(/^\/messages\/([a-f0-9]{24})\/pinned$/))) {
    return server.listPinned(me._id, m[1]);
  }
  if ((m = path.match(/^\/messages\/([a-f0-9]{24})\/pin\/([a-f0-9]{24})$/))) {
    if (method === 'post') return server.setPin(me._id, m[1], m[2], true);
    if (method === 'delete') return server.setPin(me._id, m[1], m[2], false);
  }
  if (method === 'get' && (m = path.match(/^\/messages\/([a-f0-9]{24})$/))) {
    return server.listMessages(me._id, m[1], { before: config.params?.before, limit: config.params?.limit });
  }

  throw new server.MockError(404, `Mock API: ${method.toUpperCase()} ${path} is not implemented yet`);
}

export async function mockAdapter(config) {
  await new Promise((resolve) => setTimeout(resolve, LATENCY_MS));
  const method = (config.method || 'get').toLowerCase();
  const path = (config.url || '').split('?')[0].replace(/\/+$/, '');

  if (method === 'post' && path === '/auth/register') return register(config);
  if (method === 'post' && path === '/auth/login') return login(config);

  const me = server.userFromToken(readAuthHeader(config));
  if (!me) return respond(config, 401, { error: 'Please log in to continue' });

  try {
    return respond(config, 200, await route(config, method, path, me));
  } catch (error) {
    if (error instanceof AxiosError) throw error;
    return respond(config, error.status || 500, { error: error.message || 'Mock server error' });
  }
}

export const MOCK_SEED_PASSWORD = server.SEED_PASSWORD;
export const MOCK_SEED_EMAILS = server.SEED_EMAILS;
