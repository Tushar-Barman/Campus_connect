/**
 * Round 2 smoke test. Start the server first (`npm run dev`), then: `npm run smoke:round2`
 *
 * One section per Round 2 phase. Creates throwaway users and deletes everything at the end.
 */
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { io as ioClient } from 'socket.io-client';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import { seedTextMessage } from './lib/seed.js';

const BASE = process.env.SMOKE_API_URL || `http://localhost:${env.port}`;
const API = `${BASE}/api`;
const stamp = Date.now();
const PASSWORD = 'password123';
const SETTINGS_KEYS = ['readReceipts', 'theme', 'accent', 'density', 'fontScale', 'bubbleStyle'];

let passed = 0;
let failed = 0;
let skipped = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}${detail ? `  →  ${detail}` : ''}`);
  }
}
const skip = (name, why) => {
  skipped += 1;
  console.log(`  ⏭️  ${name} (${why})`);
};
const section = (title) => console.log(`\n${title}`);

async function call(method, path, { body, token, form } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
}
const show = (r) => `${r.status} ${JSON.stringify(r.data)?.slice(0, 240)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listen(token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
    const events = [];
    socket.onAny((event, payload) => events.push({ event, payload }));
    socket.on('connect', () => resolve({ socket, events }));
    socket.on('connect_error', reject);
  });
}
async function waitFor(events, name, predicate = () => true, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const hit = events.find((e) => e.event === name && predicate(e.payload));
    if (hit) return hit.payload;
    await sleep(50);
  }
  return null;
}
const emitAck = (socket, event, payload) =>
  new Promise((resolve) => socket.timeout(5000).emit(event, payload, (err, res) => resolve(err ? { ok: false, error: 'timeout' } : res)));

async function register(name, letter, extra = {}) {
  const r = await call('POST', '/auth/register', {
    body: { name, email: `smoke-r2-${stamp}-${letter}@test.local`, password: PASSWORD, campus: 'iit-mandi', ...extra },
  });
  if (r.status !== 201) throw new Error(`Could not register ${name}: ${show(r)}`);
  return { token: r.data.token, id: r.data.user._id, name, user: r.data.user };
}

const leaksPrivate = (u) =>
  !u || 'settings' in u || 'blockedUsers' in u || 'chatBackgrounds' in u || 'passwordHash' in u || 'starredConversations' in u;

// ── Phase 1: data model and contracts ────────────────────────
async function phase1({ A, B, sA, sB, privId }) {
  section('Phase 1 · data model, settings privacy, serializer');

  // Settings: only the owner sees them.
  check('register returns own settings with defaults', SETTINGS_KEYS.every((k) => k in (A.user.settings || {})) && A.user.settings.readReceipts === true && A.user.settings.theme === 'system', JSON.stringify(A.user));
  check('register returns campus field', 'campus' in A.user, JSON.stringify(A.user));
  const me = await call('GET', '/auth/me', { token: A.token });
  check('/auth/me includes settings', me.status === 200 && me.data?.user?.settings?.accent === 'teal', show(me));
  check('/auth/me hides blockedUsers / chatBackgrounds / passwordHash', !('blockedUsers' in me.data.user) && !('chatBackgrounds' in me.data.user) && !('passwordHash' in me.data.user), show(me));
  const login = await call('POST', '/auth/login', { body: { email: `smoke-r2-${stamp}-a@test.local`, password: PASSWORD } });
  check('login includes settings', login.status === 200 && login.data?.user?.settings?.density === 'comfortable', show(login));
  const search = await call('GET', `/users/search?q=smoke-r2-${stamp}-b&campus=all`, { token: A.token });
  const found = search.data?.users?.[0];
  check('search result has campus but no private fields', search.status === 200 && found && 'campus' in found && !leaksPrivate(found), show(search));
  const getB = await call('GET', `/users/${B.id}`, { token: A.token });
  check('GET /users/:id has no private fields', getB.status === 200 && !leaksPrivate(getB.data?.user), show(getB));

  // A pre-Round-2 account (no campus, settings, blockedUsers) still works.
  const legacyEmail = `smoke-r2-${stamp}-legacy@test.local`;
  await User.collection.insertOne({
    name: 'Legacy User', email: legacyEmail, passwordHash: await bcrypt.hash(PASSWORD, 10),
    bio: '', profilePicture: '', status: 'offline', lastSeen: new Date(), starredConversations: [],
    createdAt: new Date(), updatedAt: new Date(),
  });
  const legacy = await call('POST', '/auth/login', { body: { email: legacyEmail, password: PASSWORD } });
  check('legacy account logs in with default settings and empty campus', legacy.status === 200 && legacy.data?.user?.settings?.readReceipts === true && legacy.data?.user?.campus === '', show(legacy));
  const legacyDoc = await User.findOne({ email: legacyEmail });
  check('legacy account document validates', (await legacyDoc.validate().then(() => true, () => false)) === true);
  await User.deleteOne({ email: legacyEmail });

  // Messages: tombstone, hidden-for-me, reply preview, expiry on read.
  const { message: m1 } = await seedTextMessage({ conversationId: privId, senderId: A.id, text: 'secret first' });
  const { message: m2 } = await seedTextMessage({ conversationId: privId, senderId: A.id, text: 'hidden for B' });
  const { message: m3 } = await seedTextMessage({ conversationId: privId, senderId: B.id, text: 'replying' });
  await Message.updateOne({ _id: m1._id }, { $set: { deletedAt: new Date(), text: '' } });
  await Message.updateOne({ _id: m2._id }, { $addToSet: { hiddenFor: new mongoose.Types.ObjectId(B.id) } });
  await Message.updateOne({ _id: m3._id }, { $set: { replyTo: m2._id } });
  const oldReq = await Message.create({
    conversationId: privId, senderId: A.id, messageType: 'location_request', requestStatus: 'pending',
    createdAt: new Date(Date.now() - 11 * 60 * 1000),
  });
  check('a message deleted for everyone still validates', (await Message.findById(m1._id).then((d) => d.validate()).then(() => true, () => false)) === true);

  const histB = await call('GET', `/messages/${privId}`, { token: B.token });
  const histA = await call('GET', `/messages/${privId}`, { token: A.token });
  const byId = (r, id) => r.data?.messages?.find((m) => m._id === String(id));
  const tomb = byId(histB, m1._id);
  check('deleted message comes back as a tombstone', tomb && tomb.deletedAt && !('text' in tomb) && !('mediaUrl' in tomb) && !('readBy' in tomb) && tomb.messageType === 'text', JSON.stringify(tomb));
  check('"deleted for me" message is left out for that user', histB.status === 200 && !byId(histB, m2._id), show(histB));
  check('…but still shown to the other user', Boolean(byId(histA, m2._id)));
  check('hiddenFor is never sent to clients', !(histA.data?.messages || []).some((m) => 'hiddenFor' in m));
  const reply = byId(histA, m3._id);
  check('reply carries a small preview of the original', reply?.replyTo?._id === String(m2._id) && reply.replyTo.text === 'hidden for B' && reply.replyTo.senderId?.name === A.name && reply.replyTo.deleted === false, JSON.stringify(reply?.replyTo));
  check('reply preview leaks no email/receipts', reply && !('email' in (reply.replyTo.senderId || {})) && !('readBy' in reply.replyTo));
  check('old pending location request reads as expired', byId(histA, oldReq._id)?.requestStatus === 'expired', JSON.stringify(byId(histA, oldReq._id)));

  // Sidebar preview goes through the serializer too.
  await Conversation.updateOne({ _id: privId }, { lastMessage: m1._id });
  const list = await call('GET', '/conversations', { token: B.token });
  const item = list.data?.conversations?.find((c) => c._id === privId);
  check('sidebar lastMessage is a tombstone when deleted', item?.lastMessage?.deletedAt && !('text' in item.lastMessage), JSON.stringify(item?.lastMessage));

  // Live send still works and carries the new shape.
  const ack = await emitAck(sA.socket, 'send_message', { conversationId: privId, text: 'live after round 2', clientId: `r2-${stamp}` });
  check('send_message ack ok, echoes clientId, no hiddenFor', ack?.ok && ack.message?.clientId === `r2-${stamp}` && !('hiddenFor' in ack.message), JSON.stringify(ack));
  const live = await waitFor(sB.events, 'new_message', (p) => p?.message?.text === 'live after round 2');
  check('new_message reaches the other user', Boolean(live));
}

async function main() {
  console.log(`\nCampusConnect Round 2 smoke test → ${BASE}`);
  try {
    await call('GET', '/health');
  } catch (err) {
    console.log(`  ❌ Server not reachable at ${BASE} (${err.cause?.code || err.message}). Run "npm run dev" first.\n`);
    process.exit(1);
  }
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });

  const A = await register('Asha Round2', 'a');
  const B = await register('Bilal Round2', 'b');
  const C = await register('Chen Round2', 'c');
  const [sA, sB, sC] = await Promise.all([listen(A.token), listen(B.token), listen(C.token)]);
  const opened = await call('POST', '/conversations', { token: A.token, body: { userId: B.id } });
  const privId = opened.data?.conversation?._id;
  if (!privId) throw new Error(`Could not open a private chat: ${show(opened)}`);
  const ctx = { A, B, C, sA, sB, sC, privId };

  try {
    await phase1(ctx);
  } finally {
    [sA, sB, sC].forEach((s) => s.socket.close());
    const ids = [A.id, B.id, C.id];
    const convs = await Conversation.find({ participants: { $in: ids } }).select('_id').lean();
    await Message.deleteMany({ conversationId: { $in: convs.map((c) => c._id) } });
    await Conversation.deleteMany({ _id: { $in: convs.map((c) => c._id) } });
    await User.deleteMany({ _id: { $in: ids } });
    await mongoose.disconnect();
  }

  console.log(`\n${failed === 0 ? '🎉' : '⚠️ '} ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nSmoke test crashed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
