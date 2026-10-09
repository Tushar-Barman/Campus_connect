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

// ── Phase 4: campuses ────────────────────────────────────────
async function phase4({ A, B }) {
  section('Phase 4 · campus at sign-up and campus search');
  const list = await call('GET', '/campuses');
  const mandi = list.data?.campuses?.find((c) => c.id === 'iit-mandi');
  check('GET /campuses is public and lists IIT Mandi', list.status === 200 && mandi?.shortName === 'IIT Mandi' && list.data.campuses.length >= 3, show(list));
  check('campus list includes centre and radius (for the on-campus hint)', mandi?.center?.lat > 31 && mandi.radiusMeters > 0, JSON.stringify(mandi));

  const base = { name: 'No Campus', password: PASSWORD };
  const noCampus = await call('POST', '/auth/register', { body: { ...base, email: `smoke-r2-${stamp}-nc@test.local` } });
  const badCampus = await call('POST', '/auth/register', { body: { ...base, email: `smoke-r2-${stamp}-bc@test.local`, campus: 'hogwarts' } });
  const objCampus = await call('POST', '/auth/register', { body: { ...base, email: `smoke-r2-${stamp}-oc@test.local`, campus: { $ne: '' } } });
  check('register without campus → 400', noCampus.status === 400, show(noCampus));
  check('register with unknown / object campus → 400', badCampus.status === 400 && objCampus.status === 400, `${badCampus.status} ${objCampus.status}`);
  check('register stores the campus', A.user.campus === 'iit-mandi', JSON.stringify(A.user));

  const D = await register('Dev Round2', 'd', { campus: 'iit-delhi' });
  const q = `q=Round2`;
  const own = await call('GET', `/users/search?${q}`, { token: A.token });
  const all = await call('GET', `/users/search?${q}&campus=all`, { token: A.token });
  const delhi = await call('GET', `/users/search?${q}&campus=iit-delhi`, { token: A.token });
  const bogus = await call('GET', `/users/search?${q}&campus=hogwarts`, { token: A.token });
  const ids = (r) => (r.data?.users || []).map((u) => u._id);
  check('search defaults to your own campus', ids(own).includes(B.id) && !ids(own).includes(D.id), JSON.stringify(ids(own)));
  check('campus=all searches every campus', ids(all).includes(B.id) && ids(all).includes(D.id), JSON.stringify(ids(all)));
  check('campus=<id> searches that campus only', ids(delhi).includes(D.id) && !ids(delhi).includes(B.id), JSON.stringify(ids(delhi)));
  check('unknown campus filter → 400', bogus.status === 400, show(bogus));
  check('results carry the campus', (all.data?.users || []).find((u) => u._id === D.id)?.campus === 'iit-delhi');

  const cross = await call('POST', '/conversations', { token: A.token, body: { userId: D.id } });
  check('cross-campus chats still work', cross.status === 201 || cross.status === 200, show(cross));

  const badProfile = await call('PUT', '/users/profile', { token: D.token, body: { campus: 'nowhere' } });
  check('PUT /profile rejects an unknown campus', badProfile.status === 400, show(badProfile));
  const moved = await call('PUT', '/users/profile', { token: D.token, body: { campus: 'iit-mandi' } });
  check('PUT /profile changes the campus', moved.status === 200 && moved.data?.user?.campus === 'iit-mandi', show(moved));
  const nowOwn = await call('GET', `/users/search?${q}`, { token: A.token });
  check('…and they now show up in own-campus search', ids(nowOwn).includes(D.id));
  return { D };
}

// ── Phase 5: files and documents ─────────────────────────────
async function phase5({ A, B, sB, privId }) {
  section('Phase 5 · file and document sharing');
  const upload = (bytes, name, type, extra = {}) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    return call('POST', `/messages/${privId}/media`, { token: A.token, form });
  };
  const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....[Content_Types].xml....word/document.xml....', 'latin1')]);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n', 'latin1');
  const exe = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(200, 0x90)]);
  const plainZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('....photo.jpg....', 'latin1')]);
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // Rejected before any upload (no Cloudinary needed).
  const renamedExe = await upload(exe, 'notes.pdf', 'application/pdf');
  check('renamed .exe declared as PDF → 400', renamedExe.status === 400, show(renamedExe));
  const exeType = await upload(exe, 'setup.exe', 'application/x-msdownload');
  check('.exe → 400', exeType.status === 400, show(exeType));
  const zipAsDocx = await upload(plainZip, 'report.docx', DOCX);
  check('arbitrary zip renamed to .docx → 400', zipAsDocx.status === 400, show(zipAsDocx));
  const zip = await upload(plainZip, 'stuff.zip', 'application/zip');
  check('.zip → 400', zip.status === 400, show(zip));
  const svg = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml');
  const html = await upload(Buffer.from('<html><script>alert(1)</script></html>'), 'x.html', 'text/html');
  check('.svg and .html → 400', svg.status === 400 && html.status === 400, `${svg.status} ${html.status}`);
  const binTxt = await upload(Buffer.from([0x68, 0x69, 0x00, 0x01]), 'notes.txt', 'text/plain');
  const badUtf8 = await upload(Buffer.from([0x68, 0xff, 0xfe, 0x69]), 'notes.txt', 'text/plain');
  check('.txt with NUL bytes or invalid UTF-8 → 400', binTxt.status === 400 && badUtf8.status === 400, `${binTxt.status} ${badUtf8.status}`);
  const wrongExt = await upload(pdf, 'notes.txt', 'application/pdf');
  check('PDF with a non-.pdf name → 400', wrongExt.status === 400, show(wrongExt));
  const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const bigImage = await upload(Buffer.concat([PNG_HEAD, Buffer.alloc(5 * 1024 * 1024 + 10)]), 'big.png', 'image/png');
  check('image over 5 MB → 413', bigImage.status === 413, show(bigImage));
  const hugeDoc = await upload(Buffer.concat([pdf, Buffer.alloc(10 * 1024 * 1024 + 10)]), 'huge.pdf', 'application/pdf');
  check('document over 10 MB → 413', hugeDoc.status === 413, show(hugeDoc));

  const health = await call('GET', '/health');
  if (!health.data?.features?.uploads) {
    skip('real document uploads', 'Cloudinary is not configured');
    return;
  }

  // Accepted (uploads to Cloudinary, then cleaned up with delete-for-everyone).
  const created = [];
  const malformed = await upload(pdf, 'bad\u0007name.pdf', 'application/pdf');
  check('malformed multipart (control character in the name) → 400, not 500', malformed.status === 400, show(malformed));
  const okPdf = await upload(pdf, '../Lab Report: Week 3?.pdf', 'application/pdf', { caption: 'final version' });
  created.push(okPdf.data?.message?._id);
  check('PDF accepted as a file message', okPdf.status === 201 && okPdf.data?.message?.messageType === 'file', show(okPdf));
  check('…with a sanitised name, size, MIME type and caption',
    okPdf.data?.message?.fileName === 'Lab Report Week 3.pdf' && okPdf.data.message.fileSize === pdf.length &&
      okPdf.data.message.mimeType === 'application/pdf' && okPdf.data.message.text === 'final version',
    JSON.stringify(okPdf.data?.message));
  check('…stored as a Cloudinary raw file', /\/raw\/upload\/.+\.pdf$/.test(okPdf.data?.message?.mediaUrl || ''), okPdf.data?.message?.mediaUrl);
  const live = await waitFor(sB.events, 'new_message', (p) => p?.message?._id === okPdf.data?.message?._id);
  check('…and reaches the other user live', live?.message?.fileName === 'Lab Report Week 3.pdf');
  const okDocx = await upload(docx, 'essay.docx', DOCX);
  created.push(okDocx.data?.message?._id);
  check('.docx (zip with [Content_Types].xml + word/) accepted', okDocx.status === 201 && okDocx.data?.message?.fileName === 'essay.docx', show(okDocx));
  const okTxt = await upload(Buffer.from('notes ✓ नमस्ते\n', 'utf8'), 'notes.txt', 'text/plain');
  created.push(okTxt.data?.message?._id);
  check('UTF-8 .txt accepted', okTxt.status === 201 && okTxt.data?.message?.mimeType === 'text/plain', show(okTxt));
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  const okGif = await upload(gif, 'wave.gif', 'image/gif', { caption: 'hi!' });
  created.push(okGif.data?.message?._id);
  check('GIF accepted as an image with a caption', okGif.status === 201 && okGif.data?.message?.messageType === 'image' && okGif.data.message.text === 'hi!', show(okGif));

  for (const id of created.filter(Boolean)) await call('DELETE', `/messages/${privId}/${id}?scope=everyone`, { token: A.token });
  void B;
}

// ── Phase 6: read receipts privacy ───────────────────────────
async function phase6({ A, B, C, sA, sB, sC }) {
  section('Phase 6 · settings route and read receipts off');
  const badKey = await call('PUT', '/users/settings', { token: C.token, body: { isAdmin: true } });
  const badValue = await call('PUT', '/users/settings', { token: C.token, body: { theme: 'neon' } });
  const badType = await call('PUT', '/users/settings', { token: C.token, body: { readReceipts: 'no' } });
  check('unknown setting / bad value / wrong type → 400', badKey.status === 400 && badValue.status === 400 && badType.status === 400, `${badKey.status} ${badValue.status} ${badType.status}`);
  const off = await call('PUT', '/users/settings', { token: C.token, body: { readReceipts: false, accent: 'violet' } });
  check('PUT /users/settings saves and returns all settings', off.status === 200 && off.data?.settings?.readReceipts === false && off.data.settings.accent === 'violet' && off.data.settings.theme === 'system', show(off));
  const me = await call('GET', '/auth/me', { token: C.token });
  check('/auth/me reflects the new settings', me.data?.user?.settings?.readReceipts === false);

  const group = await call('POST', '/conversations/group', { token: A.token, body: { name: 'Receipts test', memberIds: [B.id, C.id] } });
  const gid = group.data?.conversation?._id;
  const sent = (await emitAck(sA.socket, 'send_message', { conversationId: gid, text: 'who read this?', clientId: `p6-${stamp}` })).message;
  await sleep(300);
  sA.events.length = 0;

  sB.socket.emit('message_read', { conversationId: gid });
  const fromB = await waitFor(sA.events, 'message_read', (p) => p?.userId === B.id && p.conversationId === gid);
  check('reader with receipts on → sender gets message_read', Boolean(fromB));
  sC.socket.emit('message_read', { conversationId: gid });
  await sleep(700);
  check('reader with receipts off → no message_read is sent', !sA.events.some((e) => e.event === 'message_read' && e.payload?.userId === C.id));
  const stored = await Message.findById(sent._id).lean();
  check("…but C's read is still stored (unread counts)", stored.readBy.some((r) => String(r.user) === C.id));
  const listC = await call('GET', '/conversations', { token: C.token });
  check('…so C has 0 unread in that group', listC.data?.conversations?.find((c) => c._id === gid)?.unreadCount === 0);
  const histA = await call('GET', `/messages/${gid}`, { token: A.token });
  const seen = histA.data?.messages?.find((m) => m._id === sent._id);
  check("sender's history shows B's read but hides C's", seen?.readBy?.some((r) => String(r.user) === B.id) && !seen.readBy.some((r) => String(r.user) === C.id), JSON.stringify(seen?.readBy));
  check('…while delivery to C stays visible', seen?.deliveredTo?.some((r) => String(r.user) === C.id), JSON.stringify(seen?.deliveredTo));

  // Reciprocity: C (receipts off) can't see other people's reads either.
  const fromC = (await emitAck(sC.socket, 'send_message', { conversationId: gid, text: 'my own message', clientId: `p6c-${stamp}` })).message;
  await sleep(300);
  sC.events.length = 0;
  sA.socket.emit('message_read', { conversationId: gid });
  await sleep(700);
  check('user with receipts off receives no message_read', !sC.events.some((e) => e.event === 'message_read'));
  const histC = await call('GET', `/messages/${gid}`, { token: C.token });
  const own = histC.data?.messages?.find((m) => m._id === fromC._id);
  check('…and sees no readBy on their own messages (max "delivered")', own && own.readBy.length === 0 && own.deliveredTo.length > 0, JSON.stringify(own && { r: own.readBy, d: own.deliveredTo }));

  const editC = await call('PATCH', `/messages/${gid}/${fromC._id}`, { token: C.token, body: { text: 'my own message (edited)' } });
  check('message_updated / edit responses apply the same rule', editC.status === 200 && editC.data?.message?.readBy?.length === 0, JSON.stringify(editC.data?.message?.readBy));
  await call('PUT', '/users/settings', { token: C.token, body: { readReceipts: true } });
}

// ── Phase 7: location sharing ────────────────────────────────
async function phase7({ A, B, C, sA, sB, privId }) {
  section('Phase 7 · location sharing');
  const ON_CAMPUS = { lat: 31.7749, lng: 76.9862, accuracy: 12 }; // inside IIT Mandi
  const MANDI_TOWN = { lat: 31.7084, lng: 76.9316, accuracy: 30 }; // ~8.6 km away
  const share = (token, cid, body) => call('POST', `/messages/${cid}/location`, { token, body });

  const bad = await Promise.all([
    share(A.token, privId, { ...ON_CAMPUS, lat: 91 }),
    share(A.token, privId, { ...ON_CAMPUS, lng: '76.9' }),
    share(A.token, privId, { ...ON_CAMPUS, accuracy: 6000 }),
    share(A.token, privId, { ...ON_CAMPUS, label: 'x'.repeat(61) }),
  ]);
  check('out-of-range lat / string lng / accuracy > 5000 / label > 60 → 400', bad.every((r) => r.status === 400), bad.map((r) => r.status).join(' '));
  const outsider = await share(C.token, privId, ON_CAMPUS);
  check('non-member → 404', outsider.status === 404, show(outsider));

  const here = await share(A.token, privId, { ...ON_CAMPUS, label: '  Library, 2nd floor ' });
  check('on-campus point → onCampus true with the campus id', here.status === 201 && here.data?.message?.location?.onCampus === true && here.data.message.location.campus === 'iit-mandi' && here.data.message.location.label === 'Library, 2nd floor', show(here));
  const away = await share(A.token, privId, { ...MANDI_TOWN, onCampus: true, campus: 'iit-mandi' });
  check("off-campus point → onCampus false (the client's claim is ignored)", away.status === 201 && away.data?.message?.location?.onCampus === false, show(away));
  const live = await waitFor(sB.events, 'new_message', (p) => p?.message?._id === here.data?.message?._id);
  check('location reaches the other user live', live?.message?.messageType === 'location');

  // Request → decline
  const req1 = await call('POST', `/messages/${privId}/location-request`, { token: A.token });
  check('location request created as pending', req1.status === 201 && req1.data?.message?.messageType === 'location_request' && req1.data.message.requestStatus === 'pending', show(req1));
  const r1 = req1.data?.message?._id;
  const own = await share(A.token, privId, { ...ON_CAMPUS, respondsTo: r1 });
  check('requester cannot answer their own request → 403', own.status === 403, show(own));
  sA.events.length = 0;
  const dec = await call('POST', `/messages/${privId}/location-request/${r1}/decline`, { token: B.token });
  check('recipient declines → declined', dec.status === 200 && dec.data?.requestStatus === 'declined', show(dec));
  const decEvent = await waitFor(sA.events, 'message_updated', (p) => p?.message?._id === r1);
  check('requester gets message_updated (declined)', decEvent?.message?.requestStatus === 'declined', JSON.stringify(decEvent));
  const late = await share(B.token, privId, { ...ON_CAMPUS, respondsTo: r1 });
  check('answering a declined request → 409', late.status === 409, show(late));

  // Request → share
  const r2 = (await call('POST', `/messages/${privId}/location-request`, { token: A.token })).data?.message?._id;
  sA.events.length = 0;
  const answer = await share(B.token, privId, { ...ON_CAMPUS, respondsTo: r2 });
  check('recipient shares in reply → location message replying to the request', answer.status === 201 && answer.data?.message?.replyTo?._id === r2, show(answer));
  const accEvent = await waitFor(sA.events, 'message_updated', (p) => p?.message?._id === r2);
  check('request becomes accepted with respondedWith', accEvent?.message?.requestStatus === 'accepted' && String(accEvent.message.respondedWith) === answer.data?.message?._id, JSON.stringify(accEvent));

  // Groups: any member except the requester; the first answer wins.
  const group = await call('POST', '/conversations/group', { token: A.token, body: { name: 'Find me', memberIds: [B.id, C.id] } });
  const gid = group.data?.conversation?._id;
  const r3 = (await call('POST', `/messages/${gid}/location-request`, { token: A.token })).data?.message?._id;
  const race = await Promise.all([share(B.token, gid, { ...ON_CAMPUS, respondsTo: r3 }), share(C.token, gid, { ...MANDI_TOWN, respondsTo: r3 })]);
  const codes = race.map((r) => r.status).sort();
  check('two members answer at once → exactly one wins (201 + 409)', codes[0] === 201 && codes[1] === 409, codes.join(' '));

  // Expiry is computed on read. (B asks here: A's 10-per-minute budget is nearly used up.)
  const r4 = (await call('POST', `/messages/${gid}/location-request`, { token: B.token })).data?.message?._id;
  await Message.collection.updateOne({ _id: new mongoose.Types.ObjectId(r4) }, { $set: { createdAt: new Date(Date.now() - 11 * 60 * 1000) } });
  const expired = await share(C.token, gid, { ...ON_CAMPUS, respondsTo: r4 });
  check('answering after 10 minutes → 409 expired', expired.status === 409 && /expired/i.test(expired.data?.error), show(expired));
  const hist = await call('GET', `/messages/${gid}`, { token: C.token });
  check('…and it reads as expired', hist.data?.messages?.find((m) => m._id === r4)?.requestStatus === 'expired');

  // Rate limit: 10 per user per minute (A has used most of it above).
  let limited = false;
  for (let i = 0; i < 12 && !limited; i += 1) limited = (await share(A.token, privId, ON_CAMPUS)).status === 429;
  check('location rate limit → 429', limited);
}

// ── Phase 8: account deletion ────────────────────────────────
async function phase8({ B, C, sB }) {
  section('Phase 8 · delete account');
  const X = await register('Xena Leaving', 'x');
  const sX = await listen(X.token);
  const priv = (await call('POST', '/conversations', { token: X.token, body: { userId: B.id } })).data?.conversation?._id;
  const group = (await call('POST', '/conversations/group', { token: X.token, body: { name: 'X admin group', memberIds: [B.id, C.id] } })).data?.conversation?._id;
  await emitAck(sX.socket, 'send_message', { conversationId: priv, text: 'private hello', clientId: `p8a-${stamp}` });
  const gm = (await emitAck(sX.socket, 'send_message', { conversationId: group, text: 'group hello from X', clientId: `p8b-${stamp}` })).message;
  await call('POST', `/conversations/${priv}/star`, { token: B.token });
  await User.updateOne({ _id: B.id }, { $addToSet: { blockedUsers: new mongoose.Types.ObjectId(X.id) } });

  const noPw = await call('DELETE', '/users/me', { token: X.token, body: {} });
  check('no password → 400', noPw.status === 400, show(noPw));
  const wrong = await call('DELETE', '/users/me', { token: X.token, body: { password: 'not-my-password' } });
  check('wrong password → 401', wrong.status === 401, show(wrong));
  const stillThere = await call('GET', '/auth/me', { token: X.token });
  check('…and the account and session are untouched', stillThere.status === 200);

  sB.events.length = 0;
  const del = await call('DELETE', '/users/me', { token: X.token, body: { password: PASSWORD } });
  check('correct password → account deleted', del.status === 200 && del.data?.deleted === true && del.data.groupsLeft === 1 && del.data.chatsDeleted === 1, show(del));
  check('User document is gone', !(await User.exists({ _id: X.id })));
  const after = await call('GET', '/auth/me', { token: X.token });
  check('their token no longer works (401)', after.status === 401, show(after));
  await sleep(500);
  check('their sockets were disconnected', sX.socket.connected === false);

  check('private chat and its messages are deleted', !(await Conversation.exists({ _id: priv })) && !(await Message.exists({ conversationId: priv })));
  const removed = await waitFor(sB.events, 'conversation_removed', (p) => p?.conversationId === priv);
  check('the other person gets conversation_removed', Boolean(removed));
  const listB = await call('GET', '/conversations', { token: B.token });
  check("it's gone from their chat list", !listB.data?.conversations?.some((c) => c._id === priv));

  const g = await Conversation.findById(group).lean();
  check('group survives without them, admin handed over', g && g.participants.length === 2 && !g.participants.some((p) => String(p) === X.id) && String(g.groupAdmin) === B.id, JSON.stringify(g && { p: g.participants, admin: g.groupAdmin }));
  const tomb = await Message.findById(gm._id).lean();
  check('their group messages became tombstones', tomb?.deletedAt && tomb.text === '', JSON.stringify(tomb));
  const left = await waitFor(sB.events, 'group_member_removed', (p) => p?.conversationId === group && p.userId === X.id);
  check('group members get group_member_removed', Boolean(left));
  const histB = await call('GET', `/messages/${group}`, { token: B.token });
  check('group history still loads for the others', histB.status === 200 && histB.data.messages.some((m) => m._id === gm._id && m.deletedAt));

  const bDoc = await User.findById(B.id).select('+blockedUsers +starredConversations').lean();
  check("removed from others' blockedUsers and stars", !bDoc.blockedUsers.some((id) => String(id) === X.id) && !bDoc.starredConversations.some((id) => String(id) === priv));
  const again = await call('DELETE', '/users/me', { token: X.token, body: { password: PASSWORD } });
  check('repeating the request after deletion → 401 (nothing left to do)', again.status === 401, show(again));
  sX.socket.close();
}

// ── Phase 9: blocking ────────────────────────────────────────
async function phase9({ B, sB }) {
  section('Phase 9 · block users');
  const P = await register('Priya Blocker', 'p');
  const Q = await register('Quinn Blocked', 'q');
  const [sP, sQ] = await Promise.all([listen(P.token), listen(Q.token)]);
  const priv = (await call('POST', '/conversations', { token: P.token, body: { userId: Q.id } })).data?.conversation?._id;
  const group = (await call('POST', '/conversations/group', { token: P.token, body: { name: 'Shared group', memberIds: [Q.id, B.id] } })).data?.conversation?._id;
  const sendIn = (s, cid, text) => emitAck(s.socket, 'send_message', { conversationId: cid, text, clientId: `p9-${Math.random()}` });
  await sendIn(sQ, priv, 'hi before the block');

  const self = await call('POST', `/users/${P.id}/block`, { token: P.token });
  const ghost = await call('POST', `/users/${new mongoose.Types.ObjectId()}/block`, { token: P.token });
  const junk = await call('POST', '/users/not-an-id/block', { token: P.token });
  check("can't block yourself (400); unknown / bad id → 404", self.status === 400 && ghost.status === 404 && junk.status === 404, `${self.status} ${ghost.status} ${junk.status}`);

  sP.events.length = 0;
  sQ.events.length = 0;
  const blk = await call('POST', `/users/${Q.id}/block`, { token: P.token });
  check('P blocks Q', blk.status === 200 && blk.data?.blocked === true, show(blk));
  const ownTabs = await waitFor(sP.events, 'block_changed', (p) => p?.userId === Q.id && p.blocked === true);
  check("P's own tabs get block_changed; Q is not told", Boolean(ownTabs) && !sQ.events.some((e) => e.event === 'block_changed'));
  const list = await call('GET', '/users/blocked', { token: P.token });
  check('GET /users/blocked lists Q (public fields only)', list.data?.users?.length === 1 && list.data.users[0]._id === Q.id && !('blockedUsers' in list.data.users[0]), show(list));

  // Sending, both directions, every path.
  const qSend = await sendIn(sQ, priv, 'can you see this?');
  const pSend = await sendIn(sP, priv, 'nope');
  check("text in the private chat fails both ways with \"You can't send messages in this chat\"", qSend.ok === false && pSend.ok === false && /can't send messages in this chat/i.test(qSend.error), JSON.stringify([qSend, pSend]));
  const form = new FormData();
  form.append('file', new Blob([PNG], { type: 'image/png' }), 'a.png');
  const media = await call('POST', `/messages/${priv}/media`, { token: Q.token, form });
  const loc = await call('POST', `/messages/${priv}/location`, { token: Q.token, body: { lat: 31.77, lng: 76.98, accuracy: 10 } });
  const ask = await call('POST', `/messages/${priv}/location-request`, { token: Q.token });
  check('media, location and location requests are blocked too (403)', media.status === 403 && loc.status === 403 && ask.status === 403, `${media.status} ${loc.status} ${ask.status}`);
  const groupOk = await sendIn(sQ, group, 'groups still work');
  check('groups are not affected', groupOk.ok === true, JSON.stringify(groupOk));

  // New chats and discovery.
  const pOpen = await call('POST', '/conversations', { token: P.token, body: { userId: Q.id } });
  const qOpen = await call('POST', '/conversations', { token: Q.token, body: { userId: P.id } });
  check('POST /conversations: blocker gets 403 with the reason', pOpen.status === 403 && /blocked/i.test(pOpen.data?.error), show(pOpen));
  check('…blocked person gets a generic 403 that does not reveal the block', qOpen.status === 403 && !/block/i.test(qOpen.data?.error), show(qOpen));
  const pSearch = await call('GET', `/users/search?q=Quinn&campus=all`, { token: P.token });
  const qSearch = await call('GET', `/users/search?q=Priya&campus=all`, { token: Q.token });
  check('they are hidden from each other in search', !pSearch.data?.users?.some((u) => u._id === Q.id) && !qSearch.data?.users?.some((u) => u._id === P.id));

  // What each side sees.
  const pList = (await call('GET', '/conversations', { token: P.token })).data?.conversations ?? [];
  const qList = (await call('GET', '/conversations', { token: Q.token })).data?.conversations ?? [];
  const pItem = pList.find((c) => c._id === priv);
  const qItem = qList.find((c) => c._id === priv);
  check('blocker sees blockedByMe: true', pItem?.blockedByMe === true);
  check('blocked person sees blockedByMe: false and no blockedMe field', qItem?.blockedByMe === false && !('blockedMe' in qItem));
  const pInQ = qItem?.participants?.find((p) => p._id === P.id);
  check('no status / last seen across the block', pInQ?.status === 'offline' && pInQ.lastSeen === null, JSON.stringify(pInQ));
  const profile = await call('GET', `/users/${P.id}`, { token: Q.token });
  check('…also on GET /users/:id', profile.data?.user?.lastSeen === null && profile.data.user.status === 'offline', show(profile));

  // Typing and presence.
  sP.events.length = 0;
  sB.events.length = 0;
  sQ.socket.emit('typing', { conversationId: group });
  await sleep(600);
  check('typing in a shared group reaches others but not across the block', sB.events.some((e) => e.event === 'typing' && e.payload?.userId === Q.id) && !sP.events.some((e) => e.event === 'typing'));
  sQ.socket.close();
  await sleep(3600);
  check('online/offline is not sent across the block', sB.events.some((e) => e.event === 'user_offline' && e.payload?.userId === Q.id) && !sP.events.some((e) => e.event === 'user_offline' && e.payload?.userId === Q.id));
  const sQ2 = await listen(Q.token);

  // Receipts in the shared group.
  const gm = (await sendIn(sP, group, 'who saw this?')).message;
  await sleep(300);
  sP.events.length = 0;
  sQ2.socket.emit('message_read', { conversationId: group });
  sB.socket.emit('message_read', { conversationId: group });
  await sleep(800);
  check('no read receipt across the block, normal ones still arrive', sP.events.some((e) => e.event === 'message_read' && e.payload?.userId === B.id) && !sP.events.some((e) => e.event === 'message_read' && e.payload?.userId === Q.id));
  const hist = await call('GET', `/messages/${group}`, { token: P.token });
  const seen = hist.data?.messages?.find((m) => m._id === gm._id);
  check("history hides Q's delivered/read entries from P", seen && !seen.readBy.some((r) => String(r.user) === Q.id) && !seen.deliveredTo.some((r) => String(r.user) === Q.id) && seen.readBy.some((r) => String(r.user) === B.id), JSON.stringify(seen && { r: seen.readBy, d: seen.deliveredTo }));

  // Unblock restores everything.
  const unb = await call('DELETE', `/users/${Q.id}/block`, { token: P.token });
  const after = await sendIn(sQ2, priv, 'back again');
  const pSearch2 = await call('GET', `/users/search?q=Quinn&campus=all`, { token: P.token });
  check('unblock → messaging and search work again', unb.status === 200 && after.ok === true && pSearch2.data?.users?.some((u) => u._id === Q.id), JSON.stringify(after));
  [sP, sQ2].forEach((s) => s.socket.close());
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
    Object.assign(ctx, await phase4(ctx));
    await phase5(ctx);
    await phase6(ctx);
    await phase7(ctx);
    await phase8(ctx);
    await phase9(ctx);
  } finally {
    [sA, sB, sC].forEach((s) => s.socket.close());
    // Every user this run created, including ones made inside a phase.
    const ids = (await User.find({ email: new RegExp(`^smoke-r2-${stamp}-`) }).select('_id').lean()).map((u) => u._id);
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
