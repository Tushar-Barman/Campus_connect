/**
 * Part 3 smoke test. Start the server first (`npm run dev`), then: `npm run smoke:part3`
 *
 * Groups: create, rename, add/remove/leave, admin transfer, last-member delete, real-time events.
 * Uploads: file validation always; real Cloudinary uploads when it is configured, else expects 503.
 * Media + AI: P1 wires P3's media.js and aiMemory.js; these checks cover the wiring and access rules,
 * plus a real upload / Gemini summary when keys are configured (else expects 503).
 * Creates throwaway users and deletes everything at the end.
 */
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Conversation } from '../src/models/Conversation.js';
import { Message } from '../src/models/Message.js';
import { seedTextMessage as createTextMessage } from './lib/seed.js';

const BASE = process.env.SMOKE_API_URL || `http://localhost:${env.port}`;
const API = `${BASE}/api`;
const stamp = Date.now();
const PASSWORD = 'password123';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

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
const note = (name, ok) => console.log(`  ${ok ? '✅' : 'ℹ️ '} ${name}${ok ? '' : ' — not received; ask P3 whether this is intended'}`);
const skip = (name, why) => {
  skipped += 1;
  console.log(`  ⏭️  ${name} (${why})`);
};

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
const show = (r) => `${r.status} ${JSON.stringify(r.data)?.slice(0, 220)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileForm = (field, bytes, name, type, extra = {}) => {
  const form = new FormData();
  form.append(field, new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  return form;
};

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
    body: { name, email: `smoke3-${stamp}-${letter}@test.local`, password: PASSWORD },
  });
  if (r.status !== 201) throw new Error(`Could not register ${name}: ${show(r)}`);
  return { token: r.data.token, id: r.data.user._id, name };
}

async function main() {
  console.log(`\nCampusConnect Part 3 smoke test → ${BASE}\n`);
  let health;
  try {
    health = await call('GET', '/health');
  } catch (err) {
    console.log(`  ❌ Server not reachable at ${BASE} (${err.cause?.code || err.message}). Run "npm run dev" first.\n`);
    process.exit(1);
  }
  const uploadsOn = health.data?.features?.uploads === true;
  const aiOn = health.data?.features?.ai === true;
  console.log(`Optional services: uploads ${uploadsOn ? 'ON' : 'OFF'}, AI ${aiOn ? 'ON' : 'OFF'}\n`);

  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });

  const A = await register('Aarav', 'a');
  const B = await register('Bhavna', 'b');
  const C = await register('Chirag', 'c');
  const D = await register('Diya', 'd');
  const [sB, sC, sD] = await Promise.all([listen(B.token), listen(C.token), listen(D.token)]);

  // ── Groups: create ────────────────────────────────────────
  console.log('Groups: create');
  const g = await call('POST', '/conversations/group', {
    token: A.token,
    body: { name: '  Project Team  ', memberIds: [B.id, C.id, B.id, A.id] },
  });
  const gid = g.data?.conversation?._id;
  check('create → 201, type group, name trimmed', g.status === 201 && g.data.conversation.type === 'group' && g.data.conversation.groupName === 'Project Team', show(g));
  check('duplicates and self removed: 3 participants, creator is admin', g.data?.conversation?.participants?.length === 3 && String(g.data.conversation.groupAdmin) === A.id);
  check('members get conversation_created live', Boolean(await waitFor(sB.events, 'conversation_created', (p) => p.conversation?._id === gid)) && Boolean(await waitFor(sC.events, 'conversation_created', (p) => p.conversation?._id === gid)));
  check('non-member gets nothing', !sD.events.some((e) => e.payload?.conversation?._id === gid));
  const bad = await Promise.all([
    call('POST', '/conversations/group', { token: A.token, body: { memberIds: [B.id] } }),
    call('POST', '/conversations/group', { token: A.token, body: { name: 'x', memberIds: B.id } }),
    call('POST', '/conversations/group', { token: A.token, body: { name: 'x', memberIds: [A.id] } }),
    call('POST', '/conversations/group', { token: A.token, body: { name: 'x', memberIds: ['nope'] } }),
    call('POST', '/conversations/group', { token: A.token, body: { name: 'x', memberIds: [String(new mongoose.Types.ObjectId())] } }),
  ]);
  check('no name / not a list / only yourself / bad id / unknown user → 400', bad.every((r) => r.status === 400), bad.map((r) => r.status).join(','));
  const outsiderGet = await call('GET', `/conversations/${gid}`, { token: D.token });
  check('outsider cannot open the group → 404', outsiderGet.status === 404);

  // ── Groups: messaging works like private chats ────────────
  await createTextMessage({ conversationId: gid, senderId: C.id, text: 'Hi team!' });
  const listB = await call('GET', '/conversations', { token: B.token });
  check('group message counts as unread for other members', listB.data?.conversations?.find((c) => c._id === gid)?.unreadCount === 1);

  // ── Groups: edit ──────────────────────────────────────────
  console.log('\nGroups: edit');
  const renameB = await call('PUT', `/conversations/${gid}`, { token: B.token, body: { groupName: 'Hacked' } });
  const renameD = await call('PUT', `/conversations/${gid}`, { token: D.token, body: { groupName: 'Hacked' } });
  check('non-admin member → 403, outsider → 404', renameB.status === 403 && renameD.status === 404, `${renameB.status} ${renameD.status}`);
  const rename = await call('PUT', `/conversations/${gid}`, { token: A.token, body: { groupName: 'Hackathon Squad' } });
  check('admin renames → 200', rename.status === 200 && rename.data?.conversation?.groupName === 'Hackathon Squad', show(rename));
  const upd = await waitFor(sB.events, 'conversation_updated', (p) => p.conversation?.groupName === 'Hackathon Squad');
  check('members get conversation_updated (without per-user fields)', Boolean(upd) && !('isStarred' in upd.conversation) && !('unreadCount' in upd.conversation));
  const emptyPut = await call('PUT', `/conversations/${gid}`, { token: A.token, body: {} });
  const urlPic = await call('PUT', `/conversations/${gid}`, { token: A.token, body: { groupPicture: 'https://evil.example/x.png' } });
  check('empty update → 400; picture as URL string → 400', emptyPut.status === 400 && urlPic.status === 400, `${emptyPut.status} ${urlPic.status}`);
  const priv = await call('POST', '/conversations', { token: A.token, body: { userId: B.id } });
  const privId = priv.data?.conversation?._id;
  const privPut = await call('PUT', `/conversations/${privId}`, { token: A.token, body: { groupName: 'x' } });
  check('editing a private chat → 400', privPut.status === 400, show(privPut));

  // ── Groups: members ───────────────────────────────────────
  console.log('\nGroups: members');
  const add = await call('POST', `/conversations/${gid}/members`, { token: A.token, body: { userId: D.id } });
  check('admin adds Diya → 200 with 4 participants', add.status === 200 && add.data?.conversation?.participants?.length === 4, show(add));
  check('Diya gets conversation_created; members get group_member_added', Boolean(await waitFor(sD.events, 'conversation_created', (p) => p.conversation?._id === gid)) && Boolean(await waitFor(sB.events, 'group_member_added', (p) => p.userId === D.id)));
  const histD = await call('GET', `/messages/${gid}`, { token: D.token });
  const listD = await call('GET', '/conversations', { token: D.token });
  check('newcomer can read history and starts with 0 unread', histD.status === 200 && histD.data.messages.length === 1 && listD.data.conversations.find((c) => c._id === gid)?.unreadCount === 0);
  const addAgain = await call('POST', `/conversations/${gid}/members`, { token: A.token, body: { userId: D.id } });
  const addByB = await call('POST', `/conversations/${gid}/members`, { token: B.token, body: { userId: D.id } });
  const addBad = await call('POST', `/conversations/${gid}/members`, { token: A.token, body: { userId: 'x' } });
  const addGhost = await call('POST', `/conversations/${gid}/members`, { token: A.token, body: { userId: String(new mongoose.Types.ObjectId()) } });
  check('already member → 409, non-admin → 403, bad id → 400, unknown → 404', addAgain.status === 409 && addByB.status === 403 && addBad.status === 400 && addGhost.status === 404, [addAgain, addByB, addBad, addGhost].map((r) => r.status).join(','));

  const rmByB = await call('DELETE', `/conversations/${gid}/members/${C.id}`, { token: B.token });
  check('non-admin removing someone else → 403', rmByB.status === 403);
  await call('POST', `/conversations/${gid}/star`, { token: C.token });
  const rm = await call('DELETE', `/conversations/${gid}/members/${C.id}`, { token: A.token });
  check('admin removes Chirag → 200', rm.status === 200 && rm.data?.deleted === false, show(rm));
  const toldC = await waitFor(sC.events, 'group_member_removed', (p) => p.conversationId === gid && p.userId === C.id);
  note('removed member is told via group_member_removed (depends on P3\'s notifyMemberRemoved)', Boolean(toldC));
  const histC = await call('GET', `/messages/${gid}`, { token: C.token });
  const userC = await User.findById(C.id).select('+starredConversations').lean();
  check('removed member loses access (404) and their star', histC.status === 404 && userC.starredConversations.length === 0);
  const rmAgain = await call('DELETE', `/conversations/${gid}/members/${C.id}`, { token: A.token });
  check('removing a non-member → 404', rmAgain.status === 404);

  const leaveD = await call('DELETE', `/conversations/${gid}/members/${D.id}`, { token: D.token });
  check('member leaves the group themselves → 200', leaveD.status === 200, show(leaveD));
  const leaveA = await call('DELETE', `/conversations/${gid}/members/${A.id}`, { token: A.token });
  check('admin leaves → admin passes to the longest-standing member (Bhavna)', leaveA.status === 200 && leaveA.data?.groupAdmin === B.id, show(leaveA));
  check('remaining members get conversation_updated with new admin', Boolean(await waitFor(sB.events, 'conversation_updated', (p) => String(p.conversation?.groupAdmin) === B.id)));
  const leaveB = await call('DELETE', `/conversations/${gid}/members/${B.id}`, { token: B.token });
  const gone = await Conversation.findById(gid).lean();
  const leftover = await Message.countDocuments({ conversationId: gid });
  check('last member leaves → group and its messages deleted', leaveB.data?.deleted === true && !gone && leftover === 0, show(leaveB));

  // ── Uploads ───────────────────────────────────────────────
  console.log('\nUploads: validation (always runs)');
  const txt = Buffer.from('I am not an image, just text pretending to be one.');
  const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(64)]);
  const big = Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]);
  const v1 = await call('POST', '/users/profile-picture', { token: C.token, form: fileForm('picture', txt, 'me.png', 'image/png') });
  const v2 = await call('POST', '/users/profile-picture', { token: C.token, form: fileForm('picture', ogg, 'me.png', 'image/png') });
  const v3 = await call('POST', '/users/profile-picture', { token: C.token, form: fileForm('picture', big, 'big.png', 'image/png') });
  const v4 = await call('POST', '/users/profile-picture', { token: C.token, form: fileForm('wrongfield', PNG, 'a.png', 'image/png') });
  const v5 = await call('POST', '/users/profile-picture', { token: C.token, body: { picture: 'x' } });
  check('text disguised as .png → 400', v1.status === 400, show(v1));
  check('audio as profile picture → 400', v2.status === 400, show(v2));
  check('6 MB file → 413', v3.status === 413, show(v3));
  check('wrong field name / JSON body → 400', v4.status === 400 && v5.status === 400, `${v4.status} ${v5.status}`);
  const m1 = await call('POST', `/messages/${privId}/media`, { token: D.token, form: fileForm('file', PNG, 'a.png', 'image/png') });
  const m2 = await call('POST', `/messages/${privId}/media`, { token: A.token, form: fileForm('file', txt, 'voice.webm', 'audio/webm') });
  check('outsider sending media → 404 (P3 media.js)', m1.status === 404, show(m1));
  check('text disguised as voice note → 400 (P3 media.js)', m2.status === 400, show(m2));

  if (uploadsOn) {
    console.log('\nUploads: Cloudinary (live)');
    const up1 = await call('POST', '/users/profile-picture', { token: A.token, form: fileForm('picture', PNG, 'a.png', 'image/png') });
    const url1 = up1.data?.user?.profilePicture || '';
    check('upload profile picture → https Cloudinary URL', up1.status === 200 && url1.startsWith('https://res.cloudinary.com/'), show(up1));
    const up2 = await call('POST', '/users/profile-picture', { token: A.token, form: fileForm('picture', PNG, 'b.png', 'image/png') });
    const url2 = up2.data?.user?.profilePicture || '';
    check('replace picture → new URL (no stale cache)', up2.status === 200 && url2 && url2 !== url1, `${url1} → ${url2}`);
    const del = await call('DELETE', '/users/profile-picture', { token: A.token });
    check('remove picture → profilePicture ""', del.status === 200 && del.data?.user?.profilePicture === '', show(del));

    const img = await call('POST', `/messages/${privId}/media`, { token: A.token, form: fileForm('file', PNG, 'a.png', 'image/png') });
    check('image message (P3 media.js) → 201, type image, https mediaUrl', img.status === 201 && img.data?.message?.messageType === 'image' && img.data.message.mediaUrl?.startsWith('https://'), show(img));
    check('recipient gets new_message live', Boolean(await waitFor(sB.events, 'new_message', (p) => p.message?._id === img.data?.message?._id)));

    const g2 = await call('POST', '/conversations/group', { token: A.token, body: { name: 'Pic test', memberIds: [B.id] } });
    const g2id = g2.data?.conversation?._id;
    const gp = await call('PUT', `/conversations/${g2id}`, { token: A.token, form: fileForm('picture', PNG, 'g.png', 'image/png', { groupName: 'Pic test 2' }) });
    check('group picture + rename via multipart → URL set', gp.status === 200 && gp.data?.conversation?.groupPicture?.startsWith('https://') && gp.data.conversation.groupName === 'Pic test 2', show(gp));
    const gpDel = await call('PUT', `/conversations/${g2id}`, { token: A.token, body: { groupPicture: '' } });
    check('remove group picture with { groupPicture: "" }', gpDel.status === 200 && gpDel.data?.conversation?.groupPicture === '', show(gpDel));
  } else {
    console.log('\nUploads: Cloudinary not configured');
    const off = await call('POST', '/users/profile-picture', { token: A.token, form: fileForm('picture', PNG, 'a.png', 'image/png') });
    check('valid upload without Cloudinary → 503 (chat unaffected)', off.status === 503, show(off));
    skip('live upload checks', 'set CLOUDINARY_* in .env to run them');
  }

  // ── AI Chat Memory ────────────────────────────────────────
  console.log('\nAI Chat Memory');
  const aiOutsider = await call('POST', `/ai/summarize/${privId}`, { token: D.token });
  check('outsider → 404', aiOutsider.status === 404, show(aiOutsider));

  const script = [
    [A, 'Hey, we need to finish the hackathon demo. Judging is on Sunday at 10am.'],
    [B, 'Agreed. Let us use the React frontend we already have, no rewrite.'],
    [A, 'Ok decided, React it is. Can you record the demo video by Saturday night?'],
    [B, 'Yes, I will record it. You prepare the slides?'],
    [A, 'I will do the slides tomorrow. Also we must submit the GitHub link before Sunday 9am.'],
  ];
  for (const [who, text] of script) await createTextMessage({ conversationId: privId, senderId: who.id, text });
  const before = await Message.countDocuments({ conversationId: privId });

  if (aiOn) {
    const t0 = Date.now();
    const mem = await call('POST', `/ai/summarize/${privId}`, { token: B.token });
    const d = mem.data || {};
    check(`summary returned → 200 (${Date.now() - t0} ms)`, mem.status === 200 && typeof d.summary === 'string' && d.summary.length > 10, show(mem));
    check('shape: keyDecisions, actionItems, importantDates are arrays of strings (P3 decision)',
      ['keyDecisions', 'actionItems', 'importantDates'].every((k) => Array.isArray(d[k]) && d[k].every((x) => typeof x === 'string')));
    check('found at least one action item and one date in an obvious plan', d.actionItems?.length >= 1 && d.importantDates?.length >= 1, JSON.stringify(d).slice(0, 300));
    check('read-only: no messages added or changed', (await Message.countDocuments({ conversationId: privId })) === before);
    console.log('\n     ── Gemini output (eyeball it) ──');
    console.log(`     Summary: ${d.summary}`);
    d.keyDecisions?.forEach((x) => console.log(`     Decision: ${x}`));
    d.actionItems?.forEach((x) => console.log(`     Action:   ${x}`));
    d.importantDates?.forEach((x) => console.log(`     Date:     ${x}`));
  } else {
    const off = await call('POST', `/ai/summarize/${privId}`, { token: B.token });
    check('without GEMINI_API_KEY → 503 (chat unaffected)', off.status === 503, show(off));
    skip('live Gemini checks', 'set GEMINI_API_KEY in .env to run them');
  }

  // ── Cleanup ───────────────────────────────────────────────
  [sB, sC, sD].forEach((s) => s.socket.close());
  const ids = [A.id, B.id, C.id, D.id];
  const convs = await Conversation.find({ participants: { $in: ids } }).select('_id').lean();
  await Message.deleteMany({ conversationId: { $in: convs.map((c) => c._id) } });
  await Conversation.deleteMany({ _id: { $in: convs.map((c) => c._id) } });
  await User.deleteMany({ _id: { $in: ids } });
  await mongoose.disconnect();

  console.log(`\n${failed === 0 ? '🎉' : '⚠️ '} ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nSmoke test crashed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
