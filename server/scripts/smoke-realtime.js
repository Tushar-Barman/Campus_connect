// CampusConnect — real-time smoke test (Person 3)
//
// Put this file at:  server/scripts/smoke-realtime.js
// One-time setup:     cd server && npm i -D socket.io-client
// Run (server must be running):
//   node scripts/smoke-realtime.js
//   API_URL=https://your-app.onrender.com node scripts/smoke-realtime.js
//
// Checks tagged [A] must pass after Part A, [B] after Part B, [C] after Part C.
// Each check is independent, so a missing Part B feature fails only its own check.

import { io } from 'socket.io-client';

const BASE = process.env.API_URL || 'http://localhost:5000';
const TIMEOUT = 6000;
let passed = 0;
let failed = 0;

const uid = (user) => String(user?._id ?? user?.id);

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function register(label) {
  const email = `smoke.${label}.${Date.now()}@test.local`;
  const { status, data } = await api('/auth/register', {
    method: 'POST',
    body: { name: `Smoke ${label.toUpperCase()}`, email, password: 'password123', campus: 'iit-mandi' },
  });
  if (!data.token) throw new Error(`register ${label} failed (${status}): ${data.error}`);
  return data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

function waitFor(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for "${event}"`));
    }, TIMEOUT);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.timeout(TIMEOUT).emit(event, payload, (err, res) =>
      resolve(err ? { ok: false, error: 'no ack (timeout)' } : res),
    );
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}\n        → ${err.message}`);
  }
}

console.log(`\nCampusConnect real-time smoke test → ${BASE}\n`);

const a = await register('a');
const b = await register('b');
const c = await register('c');
let sa, sb, sc, conversationId, sentMessage;

// ---------- Part A: connection, messaging, persistence, security ----------

await check('[A] socket with an invalid token is rejected', async () => {
  await connect('not-a-real-token').then(
    (s) => { s.close(); throw new Error('server accepted a bad token'); },
    () => {},
  );
});

await check('[A] three users connect with valid tokens', async () => {
  [sa, sb, sc] = await Promise.all([connect(a.token), connect(b.token), connect(c.token)]);
});

await check('[A] A starts a chat with B; repeating it returns the same chat', async () => {
  const r1 = await api('/conversations', { method: 'POST', token: a.token, body: { userId: uid(b.user) } });
  const r2 = await api('/conversations', { method: 'POST', token: a.token, body: { userId: uid(b.user) } });
  assert(r1.data.conversation?._id, `no conversation returned (${r1.status}: ${r1.data.error})`);
  assert(r1.data.conversation._id === r2.data.conversation?._id, 'second call created a duplicate chat');
  conversationId = r1.data.conversation._id;
});

await check('[A] A sends → ack ok, B gets new_message, A gets clientId echo', async () => {
  const clientId = `smoke-${Date.now()}`;
  const atB = waitFor(sb, 'new_message', (p) => p.message?.clientId === clientId || p.message?.text === 'hello from A');
  const echoAtA = waitFor(sa, 'new_message', (p) => p.message?.clientId === clientId);
  const ack = await emitAck(sa, 'send_message', { conversationId, text: 'hello from A', clientId });
  assert(ack?.ok, `ack not ok: ${ack?.error}`);
  const { message } = await atB;
  await echoAtA;
  assert(String(message.senderId?._id ?? message.senderId) === uid(a.user), 'message has the wrong sender');
  assert(!JSON.stringify(message).includes('passwordHash'), 'sender data leaks passwordHash');
  sentMessage = ack.message;
});

await check('[A] message persists (history after a "refresh")', async () => {
  const { status, data } = await api(`/messages/${conversationId}`, { token: b.token });
  assert(status === 200, `history returned ${status}`);
  assert(data.messages?.some((m) => m._id === sentMessage?._id), 'sent message not found in history');
});

await check('[A] blank and over-4000-char messages are rejected', async () => {
  const blank = await emitAck(sa, 'send_message', { conversationId, text: '   ', clientId: 'bad-1' });
  const huge = await emitAck(sa, 'send_message', { conversationId, text: 'x'.repeat(4001), clientId: 'bad-2' });
  assert(!blank.ok, 'blank message was accepted');
  assert(!huge.ok, '4001-char message was accepted');
});

await check('[A] outsider C cannot send into or read A↔B chat', async () => {
  const ack = await emitAck(sc, 'send_message', { conversationId, text: 'intruder', clientId: 'bad-3' });
  const { status } = await api(`/messages/${conversationId}`, { token: c.token });
  assert(!ack.ok, 'C was able to send into a chat it is not in');
  assert(status === 404, `expected 404 for C, got ${status}`);
});

// ---------- Part B: typing, receipts, presence ----------

await check('[B] typing and stop_typing reach B', async () => {
  const typing = waitFor(sb, 'typing', (p) => p.conversationId === conversationId && p.userId === uid(a.user));
  sa.emit('typing', { conversationId });
  await typing;
  const stopped = waitFor(sb, 'stop_typing', (p) => p.conversationId === conversationId);
  sa.emit('stop_typing', { conversationId });
  await stopped;
});

await check('[B] outsider C typing into A↔B chat is ignored', async () => {
  const leaked = waitFor(sa, 'typing', (p) => p.userId === uid(c.user)).then(() => true, () => false);
  sc.emit('typing', { conversationId });
  assert(!(await leaked), 'C’s typing event reached A');
});

await check('[B] delivered receipt reaches A', async () => {
  const delivered = waitFor(sa, 'message_delivered', (p) => p.messageIds?.includes(sentMessage?._id));
  sb.emit('message_delivered', { messageId: sentMessage?._id });
  await delivered;
});

await check('[B] read receipt reaches A', async () => {
  const read = waitFor(sa, 'message_read', (p) => p.conversationId === conversationId && p.userId === uid(b.user));
  sb.emit('message_read', { conversationId });
  await read;
});

await check('[B] B disconnecting → A gets user_offline with lastSeen', async () => {
  const offline = waitFor(sa, 'user_offline', (p) => p.userId === uid(b.user) && p.lastSeen);
  sb.close();
  await offline;
});

await check('[B] B reconnecting → A gets user_online', async () => {
  const online = waitFor(sa, 'user_online', (p) => p.userId === uid(b.user));
  sb = await connect(b.token);
  await online;
});

// ---------- Part C: upload safety and AI access (no Cloudinary/Gemini call needed) ----------

async function uploadMedia(token, bytes, type) {
  const form = new FormData();
  form.append('duration', '3');
  form.append('file', new Blob([bytes], { type }), 'voice-note.webm');
  const res = await fetch(`${BASE}/api/messages/${conversationId}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.status;
}

await check('[C] a renamed .exe sent as audio/webm is rejected with 400', async () => {
  const exe = new Uint8Array(1024);
  exe.set([0x4d, 0x5a]); // "MZ" — Windows executable header
  const status = await uploadMedia(a.token, exe, 'audio/webm');
  assert(status === 400, `expected 400, got ${status}`);
});

await check('[C] a 6 MB upload is rejected with 413', async () => {
  const big = new Uint8Array(6 * 1024 * 1024);
  big.set([0x1a, 0x45, 0xdf, 0xa3]); // valid WebM header, just too large
  const status = await uploadMedia(a.token, big, 'audio/webm');
  assert(status === 413, `expected 413, got ${status}`);
});

await check('[C] outsider C cannot summarize A↔B chat (404)', async () => {
  const { status } = await api(`/ai/summarize/${conversationId}`, { method: 'POST', token: c.token });
  assert(status === 404, `expected 404, got ${status}`);
});

[sa, sb, sc].forEach((s) => s?.close());
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
