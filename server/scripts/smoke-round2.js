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

// ── Phase 2: edit and delete ─────────────────────────────────
async function phase2({ A, B, C, sA, sB, privId }) {
  section('Phase 2 · edit and delete');
  const send = async (socket, text) => (await emitAck(socket, 'send_message', { conversationId: privId, text, clientId: `p2-${Math.random()}` })).message;
  // Raw collection update: Mongoose treats createdAt as immutable and would ignore it.
  const backdate = (id, minutes) =>
    Message.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) }, { $set: { createdAt: new Date(Date.now() - minutes * 60 * 1000) } });

  // Edit
  const m = await send(sA.socket, 'tpyo here');
  sB.events.length = 0;
  const edit = await call('PATCH', `/messages/${privId}/${m._id}`, { token: A.token, body: { text: '  typo fixed  ' } });
  check('sender edits within 15 min → 200, trimmed, editedAt set', edit.status === 200 && edit.data?.message?.text === 'typo fixed' && edit.data.message.editedAt, show(edit));
  const upd = await waitFor(sB.events, 'message_updated', (p) => p?.message?._id === m._id);
  check('other user gets message_updated with the new text', upd?.message?.text === 'typo fixed' && upd.message.editedAt, JSON.stringify(upd));
  const notMine = await call('PATCH', `/messages/${privId}/${m._id}`, { token: B.token, body: { text: 'hijack' } });
  check('non-sender edit → 403', notMine.status === 403, show(notMine));
  const outsider = await call('PATCH', `/messages/${privId}/${m._id}`, { token: C.token, body: { text: 'x' } });
  check('non-member edit → 404', outsider.status === 404, show(outsider));
  const empty = await call('PATCH', `/messages/${privId}/${m._id}`, { token: A.token, body: { text: '   ' } });
  const long = await call('PATCH', `/messages/${privId}/${m._id}`, { token: A.token, body: { text: 'x'.repeat(4001) } });
  check('empty / >4000 char edit → 400', empty.status === 400 && long.status === 400, `${empty.status} ${long.status}`);
  await backdate(m._id, 16);
  const late = await call('PATCH', `/messages/${privId}/${m._id}`, { token: A.token, body: { text: 'too late' } });
  check('edit after 15 min → 403', late.status === 403, show(late));

  // Delete for everyone
  const d = await send(sA.socket, 'oops wrong chat');
  await call('POST', `/messages/${privId}/pin/${d._id}`, { token: B.token });
  sB.events.length = 0;
  const forbidden = await call('DELETE', `/messages/${privId}/${d._id}?scope=everyone`, { token: B.token });
  check('non-sender delete for everyone → 403', forbidden.status === 403, show(forbidden));
  const del = await call('DELETE', `/messages/${privId}/${d._id}?scope=everyone`, { token: A.token });
  check('sender deletes for everyone → tombstone', del.status === 200 && del.data?.message?.deletedAt && !('text' in del.data.message), show(del));
  const tomb = await waitFor(sB.events, 'message_updated', (p) => p?.message?._id === d._id);
  check('other user gets a tombstone via message_updated', tomb?.message?.deletedAt && !('text' in tomb.message), JSON.stringify(tomb));
  const unpinned = await waitFor(sB.events, 'message_unpinned', (p) => p?.messageId === d._id);
  check('deleting a pinned message emits message_unpinned', Boolean(unpinned));
  const stored = await Message.findById(d._id).lean();
  check('stored message has no content and is unpinned', stored.text === '' && !stored.isPinned && stored.deletedAt, JSON.stringify(stored));
  const pinnedNow = await call('GET', `/messages/${privId}/pinned`, { token: B.token });
  check('pinned list no longer has it', !pinnedNow.data?.messages?.some((x) => x._id === d._id), show(pinnedNow));
  const again = await call('DELETE', `/messages/${privId}/${d._id}?scope=everyone`, { token: A.token });
  check('deleting twice is harmless', again.status === 200, show(again));
  const editDeleted = await call('PATCH', `/messages/${privId}/${d._id}`, { token: A.token, body: { text: 'revive' } });
  check('a deleted message cannot be edited', editDeleted.status === 400, show(editDeleted));
  const listB = await call('GET', '/conversations', { token: B.token });
  const item = listB.data?.conversations?.find((c) => c._id === privId);
  check('sidebar preview is the tombstone when it was the last message', item?.lastMessage?._id === d._id && item.lastMessage.deletedAt, JSON.stringify(item?.lastMessage));

  const old = await send(sA.socket, 'an hour ago');
  await backdate(old._id, 61);
  const lateDel = await call('DELETE', `/messages/${privId}/${old._id}?scope=everyone`, { token: A.token });
  check('delete for everyone after 1 h → 403', lateDel.status === 403, show(lateDel));
  const badScope = await call('DELETE', `/messages/${privId}/${old._id}?scope=all`, { token: A.token });
  check('unknown scope → 400', badScope.status === 400, show(badScope));

  // Delete for me
  sA.events.length = 0;
  sB.events.length = 0;
  const me = await call('DELETE', `/messages/${privId}/${old._id}?scope=me`, { token: B.token });
  check('anyone in the chat can delete for me', me.status === 200 && me.data?.hidden === true, show(me));
  const own = await waitFor(sB.events, 'message_updated', (p) => p?.message?._id === old._id && p.message.hidden);
  check('…their own tabs get { hidden: true }', Boolean(own));
  await sleep(300);
  check('…and the other user is not told', !sA.events.some((e) => e.event === 'message_updated' && e.payload?.message?._id === old._id));
  const histB = await call('GET', `/messages/${privId}`, { token: B.token });
  const histA = await call('GET', `/messages/${privId}`, { token: A.token });
  check('hidden for B, still visible for A', !histB.data.messages.some((x) => x._id === old._id) && histA.data.messages.some((x) => x._id === old._id));
  const outsiderMe = await call('DELETE', `/messages/${privId}/${old._id}?scope=me`, { token: C.token });
  check('non-member delete for me → 404', outsiderMe.status === 404, show(outsiderMe));
}

// ── Phase 3: replies and mentions ────────────────────────────
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

async function phase3({ A, B, C, sA, sB, privId }) {
  section('Phase 3 · replies and @mentions');
  const sendIn = (socket, conversationId, text, extra = {}) =>
    emitAck(socket, 'send_message', { conversationId, text, clientId: `p3-${Math.random()}`, ...extra });

  const group = await call('POST', '/conversations/group', { token: A.token, body: { name: 'Round2 Mentions', memberIds: [B.id] } });
  const groupId = group.data?.conversation?._id;
  check('group for mention tests created', group.status === 201 && groupId, show(group));

  // Replies
  const original = (await sendIn(sB.socket, privId, 'what time is the lab?')).message;
  const ans = await sendIn(sA.socket, privId, '3 pm', { replyTo: original._id });
  check('reply is accepted and carries a preview', ans.ok && ans.message?.replyTo?._id === original._id && ans.message.replyTo.text === 'what time is the lab?' && ans.message.replyTo.senderId?.name === B.name, JSON.stringify(ans));
  const live = await waitFor(sB.events, 'new_message', (p) => p?.message?._id === ans.message?._id);
  check('new_message for the reply includes the preview', live?.message?.replyTo?._id === original._id);
  const groupMsg = (await sendIn(sA.socket, groupId, 'group only')).message;
  const cross = await sendIn(sA.socket, privId, 'sneaky', { replyTo: groupMsg._id });
  check('reply to a message from another chat → rejected', cross.ok === false && /not in this chat/i.test(cross.error), JSON.stringify(cross));
  const junk = await sendIn(sA.socket, privId, 'junk', { replyTo: 'not-an-id' });
  check('malformed reply id → rejected', junk.ok === false, JSON.stringify(junk));
  await call('DELETE', `/messages/${privId}/${original._id}?scope=me`, { token: A.token });
  const hidden = await sendIn(sA.socket, privId, 'reply to hidden', { replyTo: original._id });
  check('reply to a message you deleted for yourself → rejected', hidden.ok === false, JSON.stringify(hidden));
  const badMedia = await call('POST', `/messages/${privId}/media`, {
    token: A.token,
    form: (() => { const f = new FormData(); f.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png'); f.append('replyTo', String(groupMsg._id)); return f; })(),
  });
  check('media upload with a reply from another chat → 400 (before uploading)', badMedia.status === 400, show(badMedia));

  // Mentions
  const ghost = new mongoose.Types.ObjectId().toString();
  const ment = await sendIn(sA.socket, groupId, '@Bilal can you bring the slides?', { mentions: [B.id, C.id, ghost, 'junk', B.id] });
  check('mentions keep only group members, deduplicated', ment.ok && ment.message?.mentions?.length === 1 && String(ment.message.mentions[0]) === B.id, JSON.stringify(ment.message?.mentions));
  const privMention = await sendIn(sA.socket, privId, 'hey @Bilal', { mentions: [B.id] });
  check('mentions are ignored in private chats', privMention.ok && !(privMention.message?.mentions?.length), JSON.stringify(privMention.message?.mentions));
  const tooMany = await sendIn(sA.socket, groupId, 'spam', { mentions: Array(51).fill(B.id) });
  check('more than 50 mentions → rejected', tooMany.ok === false, JSON.stringify(tooMany));

  const listB = await call('GET', '/conversations', { token: B.token });
  const gB = listB.data?.conversations?.find((c) => c._id === groupId);
  check('mentioned user sees hasUnreadMention', gB?.hasUnreadMention === true, JSON.stringify(gB && { unread: gB.unreadCount, m: gB.hasUnreadMention }));
  const listA = await call('GET', '/conversations', { token: A.token });
  check('sender does not', listA.data?.conversations?.find((c) => c._id === groupId)?.hasUnreadMention === false);
  sB.socket.emit('message_read', { conversationId: groupId });
  await sleep(600);
  const afterRead = await call('GET', '/conversations', { token: B.token });
  check('reading the chat clears hasUnreadMention', afterRead.data?.conversations?.find((c) => c._id === groupId)?.hasUnreadMention === false);
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
    await phase2(ctx);
    await phase3(ctx);
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
