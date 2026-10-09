/**
 * Part 2 smoke test. Start the server first (`npm run dev`), then: `npm run smoke:part2`
 *
 * Covers user search/profile, private conversations, chat list (isStarred,
 * unreadCount, lastMessage), message history + pagination, receipts services,
 * star/unstar, pin/unpin, membership (404) on every route, and the real-time
 * events Part 2 emits (conversation_created, message_pinned, message_unpinned).
 *
 * Bulk messages are stored with a test helper that mirrors P3's publishMessage()
 * (lib/seed.js); one message is also sent for real through P3's `send_message`
 * socket handler, which proves the createMessage() hand-off end to end. Creates throwaway users and deletes everything at the end.
 */
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import { createMessage, markRead } from '../src/services/messages.js';
import { seedTextMessage } from './lib/seed.js';

const BASE = process.env.SMOKE_API_URL || `http://localhost:${env.port}`;
const API = `${BASE}/api`;
const stamp = Date.now();
const tag = `zq${stamp}`; // unique, searchable token in names
const PASSWORD = 'password123';

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${name}`);
  } else {
    failed += 1;
    console.log(`  ❌ ${name}${detail ? `  →  ${detail}` : ''}`);
  }
}

async function call(method, path, { body, token } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
}
const show = (r) => `${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const leaks = (u) => u && ('passwordHash' in u || 'starredConversations' in u);

/** Connects a socket and records every event it receives. */
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

async function register(name, letter) {
  const r = await call('POST', '/auth/register', {
    body: { name, email: `smoke2-${stamp}-${letter}@test.local`, password: PASSWORD },
  });
  if (r.status !== 201) throw new Error(`Could not register ${name}: ${show(r)}`);
  return { token: r.data.token, id: r.data.user._id };
}

async function main() {
  console.log(`\nCampusConnect Part 2 smoke test → ${BASE}\n`);
  try {
    await call('GET', '/health');
  } catch (err) {
    console.log(`  ❌ Server not reachable at ${BASE} (${err.cause?.code || err.message}). Run "npm run dev" first.\n`);
    process.exit(1);
  }

  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.init(), Conversation.init(), Message.init()]);

  const A = await register(`Alice ${tag}`, 'a');
  const B = await register(`Bob ${tag}`, 'b');
  const C = await register(`Eve ${tag}`, 'c');
  const sockA = await listen(A.token);
  const sockB = await listen(B.token);
  const sockC = await listen(C.token);

  // ── Users ─────────────────────────────────────────────────
  console.log('Users');
  const search = await call('GET', `/users/search?q=${tag.toUpperCase()}`, { token: A.token });
  const names = (search.data?.users || []).map((u) => u.name).sort();
  check('search is case-insensitive and finds Bob + Eve', names.length === 2 && names[0].startsWith('Bob') && names[1].startsWith('Eve'), show(search));
  check('search excludes yourself', !names.some((n) => n.startsWith('Alice')));
  check('search results leak no private fields', (search.data?.users || []).every((u) => !leaks(u)));
  const byEmail = await call('GET', `/users/search?q=smoke2-${stamp}-b`, { token: A.token });
  check('search matches email too', byEmail.data?.users?.length === 1 && byEmail.data.users[0]._id === B.id, show(byEmail));
  const regexInj = await call('GET', `/users/search?q=${encodeURIComponent('.*')}`, { token: A.token });
  check('regex characters are escaped (".*" is literal)', regexInj.status === 200 && regexInj.data.users.every((u) => `${u.name}${u.email}`.includes('.*')), show(regexInj));
  const empty = await call('GET', '/users/search?q=', { token: A.token });
  check('empty search → []', empty.status === 200 && empty.data?.users?.length === 0, show(empty));
  const objQ = await call('GET', '/users/search?q[$ne]=x', { token: A.token });
  check('object query (?q[$ne]=) → [] not an injection', objQ.status === 200 && objQ.data?.users?.length === 0, show(objQ));
  const noAuth = await call('GET', `/users/search?q=${tag}`);
  check('search without token → 401', noAuth.status === 401);

  const getB = await call('GET', `/users/${B.id}`, { token: A.token });
  check('GET /users/:id → public profile', getB.status === 200 && getB.data?.user?._id === B.id && !leaks(getB.data.user), show(getB));
  const getBad = await call('GET', '/users/not-an-id', { token: A.token });
  const getNone = await call('GET', `/users/${new mongoose.Types.ObjectId()}`, { token: A.token });
  check('GET /users/<bad id> and <missing id> → 404', getBad.status === 404 && getNone.status === 404, `${getBad.status} ${getNone.status}`);

  const prof = await call('PUT', '/users/profile', { token: A.token, body: { bio: '  CSE 2nd year  ', email: 'hacker@x.com', status: 'online' } });
  check('PUT /profile updates bio (trimmed)', prof.status === 200 && prof.data?.user?.bio === 'CSE 2nd year', show(prof));
  check('PUT /profile ignores email/status in body', prof.data?.user?.email === `smoke2-${stamp}-a@test.local` && prof.data?.user?.status === 'offline', show(prof));
  const profEmpty = await call('PUT', '/users/profile', { token: A.token, body: {} });
  const profBlank = await call('PUT', '/users/profile', { token: A.token, body: { name: '   ' } });
  const profLong = await call('PUT', '/users/profile', { token: A.token, body: { bio: 'x'.repeat(201) } });
  check('PUT /profile rejects empty body, blank name, bio > 200 → 400', [profEmpty, profBlank, profLong].every((r) => r.status === 400), [profEmpty, profBlank, profLong].map((r) => r.status).join(','));

  // ── Conversations ─────────────────────────────────────────
  console.log('\nConversations');
  const open1 = await call('POST', '/conversations', { token: A.token, body: { userId: B.id } });
  const convId = open1.data?.conversation?._id;
  check('A opens chat with B → 201, created: true', open1.status === 201 && open1.data?.created === true && convId, show(open1));
  check('participants populated without private fields', open1.data?.conversation?.participants?.length === 2 && open1.data.conversation.participants.every((p) => p.name && !leaks(p)));
  const created = await waitFor(sockB.events, 'conversation_created', (p) => p.conversation?._id === convId);
  check('B receives conversation_created in real time', Boolean(created));
  const open2 = await call('POST', '/conversations', { token: A.token, body: { userId: B.id } });
  const open3 = await call('POST', '/conversations', { token: B.token, body: { userId: A.id } });
  check('opening again (either side) → same chat, 200, created: false', open2.status === 200 && open2.data?.created === false && open2.data.conversation._id === convId && open3.data?.conversation?._id === convId, `${show(open2)} | ${show(open3)}`);
  const [r1, r2] = await Promise.all([
    call('POST', '/conversations', { token: B.token, body: { userId: C.id } }),
    call('POST', '/conversations', { token: C.token, body: { userId: B.id } }),
  ]);
  check('two simultaneous creates (B↔C) → one chat', r1.data?.conversation?._id && r1.data.conversation._id === r2.data?.conversation?._id, `${show(r1)} | ${show(r2)}`);
  const selfChat = await call('POST', '/conversations', { token: A.token, body: { userId: A.id } });
  const badUser = await call('POST', '/conversations', { token: A.token, body: { userId: 'nope' } });
  const ghost = await call('POST', '/conversations', { token: A.token, body: { userId: String(new mongoose.Types.ObjectId()) } });
  check('chat with yourself → 400, bad id → 400, unknown user → 404', selfChat.status === 400 && badUser.status === 400 && ghost.status === 404, `${selfChat.status} ${badUser.status} ${ghost.status}`);

  const getConvA = await call('GET', `/conversations/${convId}`, { token: A.token });
  const getConvC = await call('GET', `/conversations/${convId}`, { token: C.token });
  const getConvBad = await call('GET', '/conversations/xyz', { token: A.token });
  check('member gets GET /conversations/:id → 200', getConvA.status === 200 && getConvA.data?.conversation?._id === convId, show(getConvA));
  check('outsider (Eve) → 404; malformed id → 404', getConvC.status === 404 && getConvBad.status === 404, `${getConvC.status} ${getConvBad.status}`);

  // ── createMessage (the function P3's socket handler imports) ─
  console.log('\nMessages');
  const sent = [];
  for (let i = 0; i < 35; i += 1) {
    const { message } = await seedTextMessage({ conversationId: convId, senderId: A.id, text: `  msg ${i}  ` });
    sent.push(message);
  }
  check('createMessage stores trimmed text; sender populated with public fields only', sent[0].text === 'msg 0' && sent[0].senderId?.name?.startsWith('Alice') && sent[0].senderId.status && !('passwordHash' in sent[0].senderId) && !('starredConversations' in sent[0].senderId), JSON.stringify(sent[0].senderId));
  const { message: fromB } = await seedTextMessage({ conversationId: convId, senderId: B.id, text: 'hi Alice' });

  const errOf = (p) => p.then(() => null).catch((e) => e);
  const base = { conversationId: convId, senderId: A.id, messageType: 'text' };
  const eEmpty = await errOf(createMessage({ ...base, text: '   ' }));
  const eLong = await errOf(createMessage({ ...base, text: 'x'.repeat(4001) }));
  const eObj = await errOf(createMessage({ ...base, text: { $gt: '' } }));
  const eType = await errOf(createMessage({ ...base, messageType: 'video', text: 'x' }));
  const eMedia = await errOf(createMessage({ ...base, messageType: 'voice', mediaUrl: 'javascript:alert(1)' }));
  const eIds = await errOf(createMessage({ conversationId: 'nope', senderId: A.id, text: 'x' }));
  check('createMessage: empty / >4000 / non-string text → 400', eEmpty?.status === 400 && eLong?.status === 400 && eObj?.status === 400);
  check('createMessage: unknown type / non-https media / bad ids → 400', eType?.status === 400 && eMedia?.status === 400 && eIds?.status === 400);
  const beforeLast = (await Conversation.findById(convId).lean()).lastMessage;
  const raw = await createMessage({ ...base, text: 'raw insert' });
  const afterLast = (await Conversation.findById(convId).lean()).lastMessage;
  check('createMessage returns the saved doc (_id, createdAt)', raw?._id && raw.createdAt instanceof Date);
  check('createMessage does NOT touch lastMessage (P3 does, avoids doubling)', String(beforeLast) === String(afterLast));
  check('createMessage emits nothing (no new_message from P1)', !sockB.events.some((e) => e.event === 'new_message'));
  await Message.deleteOne({ _id: raw._id }); // keep the 36-message layout below

  const page1 = await call('GET', `/messages/${convId}?limit=30`, { token: A.token });
  const msgs1 = page1.data?.messages || [];
  check('history page 1: 30 messages, hasMore: true', page1.status === 200 && msgs1.length === 30 && page1.data.hasMore === true, show(page1));
  const ascending = msgs1.every((m, i) => i === 0 || new Date(m.createdAt) >= new Date(msgs1[i - 1].createdAt));
  check('returned oldest → newest, newest last', ascending && msgs1.at(-1)?.text === 'hi Alice');
  const page2 = await call('GET', `/messages/${convId}?limit=30&before=${encodeURIComponent(msgs1[0].createdAt)}`, { token: A.token });
  const msgs2 = page2.data?.messages || [];
  const allIds = new Set([...msgs1, ...msgs2].map((m) => m._id));
  check('page 2 (before=oldest): remaining 6, hasMore: false, no overlap', msgs2.length === 6 && page2.data.hasMore === false && allIds.size === 36 && msgs2[0].text === 'msg 0', show(page2));
  const big = await call('GET', `/messages/${convId}?limit=1000`, { token: A.token });
  check('huge limit is accepted (capped at 50) and returns everything', big.status === 200 && big.data?.messages?.length === 36 && big.data.hasMore === false, show(big));
  const badBefore = await call('GET', `/messages/${convId}?before=yesterday-ish`, { token: A.token });
  const badLimit = await call('GET', `/messages/${convId}?limit=-3`, { token: A.token });
  check('invalid before / limit → 400', badBefore.status === 400 && badLimit.status === 400, `${badBefore.status} ${badLimit.status}`);
  const histC = await call('GET', `/messages/${convId}`, { token: C.token });
  check('outsider cannot read history → 404', histC.status === 404, show(histC));

  // ── Chat list, unread, receipts ───────────────────────────
  console.log('\nChat list & receipts');
  let listA = await call('GET', '/conversations', { token: A.token });
  let listB = await call('GET', '/conversations', { token: B.token });
  const itemA = listA.data?.conversations?.find((c) => c._id === convId);
  let itemB = listB.data?.conversations?.find((c) => c._id === convId);
  check('list item has populated lastMessage with sender', itemA?.lastMessage?.text === 'hi Alice' && itemA.lastMessage.senderId?.name?.startsWith('Bob'), JSON.stringify(itemA?.lastMessage)?.slice(0, 150));
  check('unreadCount: A has 1 (from Bob), B has 35 (from Alice)', itemA?.unreadCount === 1 && itemB?.unreadCount === 35, `A=${itemA?.unreadCount} B=${itemB?.unreadCount}`);
  check("Bob's list is sorted by latest activity (A↔B first)", listB.data?.conversations?.[0]?._id === convId, listB.data?.conversations?.map((c) => c.lastMessage?.text || '(empty)').join(' | '));
  const listC = await call('GET', '/conversations', { token: C.token });
  check("Eve's list does not contain the A↔B chat", !listC.data?.conversations?.some((c) => c._id === convId));

  const read = await markRead(convId, B.id);
  check('markRead marks the 35 messages from Alice', read === 35, `${read}`);
  check('markRead again with nothing new → 0', (await markRead(convId, B.id)) === 0);
  const readEve = await errOf(markRead(convId, C.id));
  check('outsider markRead → 404', readEve?.status === 404);
  listB = await call('GET', '/conversations', { token: B.token });
  itemB = listB.data?.conversations?.find((c) => c._id === convId);
  listA = await call('GET', '/conversations', { token: A.token });
  check("after B reads: B's unread 0, A's unread still 1", itemB?.unreadCount === 0 && listA.data?.conversations?.find((c) => c._id === convId)?.unreadCount === 1);
  const stored = await Message.findById(sent[0]._id).lean();
  check('read message has exactly one readBy and one deliveredTo entry for B', stored.readBy.length === 1 && String(stored.readBy[0].user) === B.id && stored.deliveredTo.length === 1);
  const own = await Message.findById(fromB._id).lean();
  check("B's own message not marked read by B", own.readBy.length === 0);

  // ── End to end through P3's socket handler ────────────────
  console.log("\nEnd to end: P3's send_message → P1's createMessage");
  let ack;
  try {
    ack = await sockA.socket.timeout(5000).emitWithAck('send_message', { conversationId: convId, text: ' via socket ', clientId: 'tmp-1' });
  } catch (err) {
    ack = { ok: false, error: err.message };
  }
  check('send_message → ack { ok: true, message }', ack?.ok === true && ack.message?._id && ack.message.text === 'via socket', JSON.stringify(ack));
  const live = await waitFor(sockB.events, 'new_message', (p) => p.message?.text === 'via socket');
  check('Bob receives new_message once, with clientId echo and populated sender', Boolean(live) && live.message.clientId === 'tmp-1' && live.message.senderId?.name?.startsWith('Alice') && sockB.events.filter((e) => e.event === 'new_message').length === 1);
  const histAfter = await call('GET', `/messages/${convId}?limit=1`, { token: B.token });
  check('it is persisted and appears last in history', histAfter.data?.messages?.[0]?.text === 'via socket', show(histAfter));
  const convAfter = await call('GET', `/conversations/${convId}`, { token: B.token });
  check("P3 updated lastMessage (chat list preview)", convAfter.data?.conversation?.lastMessage?.text === 'via socket', show(convAfter));
  let eveAck;
  try {
    eveAck = await sockC.socket.timeout(5000).emitWithAck('send_message', { conversationId: convId, text: 'let me in', clientId: 'x' });
  } catch (err) {
    eveAck = { ok: false, error: err.message };
  }
  check('outsider send_message → ack { ok: false }', eveAck?.ok === false, JSON.stringify(eveAck));

  // ── Star ──────────────────────────────────────────────────
  console.log('\nStar');
  const star = await call('POST', `/conversations/${convId}/star`, { token: A.token });
  await call('POST', `/conversations/${convId}/star`, { token: A.token }); // twice: no duplicates
  listA = await call('GET', '/conversations', { token: A.token });
  listB = await call('GET', '/conversations', { token: B.token });
  check('star → isStarred true for A', star.status === 200 && listA.data.conversations.find((c) => c._id === convId)?.isStarred === true, show(star));
  check("…but still false for B (per-user)", listB.data.conversations.find((c) => c._id === convId)?.isStarred === false);
  const userA = await User.findById(A.id).select('+starredConversations').lean();
  check('starring twice stores it once', userA.starredConversations.length === 1);
  const unstar = await call('DELETE', `/conversations/${convId}/star`, { token: A.token });
  listA = await call('GET', '/conversations', { token: A.token });
  check('unstar → isStarred false', unstar.status === 200 && listA.data.conversations.find((c) => c._id === convId)?.isStarred === false);
  const starC = await call('POST', `/conversations/${convId}/star`, { token: C.token });
  check('outsider starring → 404', starC.status === 404, show(starC));

  // ── Pin ───────────────────────────────────────────────────
  console.log('\nPin');
  const target = sent[5]._id;
  const pin = await call('POST', `/messages/${convId}/pin/${target}`, { token: A.token });
  check('pin → message with isPinned, pinnedAt, pinnedBy', pin.status === 200 && pin.data?.message?.isPinned === true && pin.data.message.pinnedAt && pin.data.message.pinnedBy?.name?.startsWith('Alice'), show(pin));
  const pinnedEvt = await waitFor(sockB.events, 'message_pinned', (p) => p.message?._id === String(target));
  check('B receives message_pinned in real time', Boolean(pinnedEvt));
  check('Eve receives nothing for a chat she is not in', !sockC.events.some((e) => e.event === 'message_pinned'));
  const pinnedListB = await call('GET', `/messages/${convId}/pinned`, { token: B.token });
  check('B sees it in GET /pinned', pinnedListB.data?.messages?.length === 1 && pinnedListB.data.messages[0]._id === String(target), show(pinnedListB));
  const pinC = await call('POST', `/messages/${convId}/pin/${target}`, { token: C.token });
  const pinnedC = await call('GET', `/messages/${convId}/pinned`, { token: C.token });
  check('outsider pin / view pinned → 404', pinC.status === 404 && pinnedC.status === 404, `${pinC.status} ${pinnedC.status}`);
  const otherConv = r1.data.conversation._id; // B↔C chat
  const crossPin = await call('POST', `/messages/${otherConv}/pin/${target}`, { token: B.token });
  check('pinning a message through a different chat → 404', crossPin.status === 404, show(crossPin));
  const badPin = await call('POST', `/messages/${convId}/pin/nope`, { token: A.token });
  check('pin with malformed message id → 404', badPin.status === 404);
  const unpin = await call('DELETE', `/messages/${convId}/pin/${target}`, { token: B.token });
  const unpinEvt = await waitFor(sockB.events, 'message_unpinned', (p) => p.messageId === String(target) && p.conversationId === convId);
  const pinnedAfter = await call('GET', `/messages/${convId}/pinned`, { token: A.token });
  check('unpin → isPinned false, pinnedBy cleared', unpin.status === 200 && unpin.data?.message?.isPinned === false && !unpin.data.message.pinnedBy, show(unpin));
  check('message_unpinned event received, pinned list empty', Boolean(unpinEvt) && pinnedAfter.data?.messages?.length === 0);

  // ── Cleanup ───────────────────────────────────────────────
  sockA.socket.close();
  sockB.socket.close();
  sockC.socket.close();
  const ids = [A.id, B.id, C.id];
  const convs = await Conversation.find({ participants: { $in: ids } }).select('_id').lean();
  await Message.deleteMany({ conversationId: { $in: convs.map((c) => c._id) } });
  await Conversation.deleteMany({ _id: { $in: convs.map((c) => c._id) } });
  await User.deleteMany({ _id: { $in: ids } });
  await mongoose.disconnect();

  console.log(`\n${failed === 0 ? '🎉' : '⚠️ '} ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nSmoke test crashed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
