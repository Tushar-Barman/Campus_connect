/**
 * Part 1 smoke test. Start the server first (`npm run dev`), then: `npm run smoke`
 *
 * Checks auth, validation, error format, CORS, security headers, socket auth,
 * the membership guard and the duplicate-private-chat index against your real DB.
 * Creates throwaway users and deletes them at the end.
 */
import mongoose from 'mongoose';
import { io as ioClient } from 'socket.io-client';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Conversation } from '../src/models/Conversation.js';
import { loadConversationForUser } from '../src/middleware/membership.js';

const BASE = process.env.SMOKE_API_URL || `http://localhost:${env.port}`;
const API = `${BASE}/api`;
const stamp = Date.now();
const emails = ['a', 'b', 'c'].map((x) => `smoke-${stamp}-${x}@test.local`);
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

async function call(method, path, { body, token, headers = {}, raw } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, data, headers: res.headers };
}

const show = (r) => `${r.status} ${JSON.stringify(r.data)}`;
const isErrorShape = (r) => r.data && typeof r.data.error === 'string' && Object.keys(r.data).length === 1;

function socketConnects(token) {
  return new Promise((resolve) => {
    const s = ioClient(BASE, { auth: token ? { token } : {}, transports: ['websocket'], reconnection: false, timeout: 5000 });
    s.on('connect', () => { s.close(); resolve({ ok: true }); });
    s.on('connect_error', (err) => { s.close(); resolve({ ok: false, error: err.message }); });
  });
}

async function main() {
  console.log(`\nCampusConnect Part 1 smoke test → ${BASE}\n`);

  // ── Server & DB ───────────────────────────────────────────
  console.log('Server');
  let health;
  try {
    health = await call('GET', '/health');
  } catch (err) {
    console.log(`  ❌ Server not reachable at ${BASE} (${err.cause?.code || err.message}). Run "npm run dev" first.\n`);
    process.exit(1);
  }
  check('GET /health → 200 and DB connected', health.status === 200 && health.data?.db === 'connected', show(health));
  check('helmet security headers present', health.headers.get('x-content-type-options') === 'nosniff');
  check('X-Powered-By hidden', !health.headers.get('x-powered-by'));

  // ── Register ──────────────────────────────────────────────
  console.log('\nRegister');
  const regA = await call('POST', '/auth/register', { body: { name: 'Smoke Alice', email: emails[0].toUpperCase(), password: PASSWORD, campus: 'iit-mandi' } });
  check('register → 201 with token and user', regA.status === 201 && regA.data?.token && regA.data?.user?._id, show(regA));
  check('email stored lowercase', regA.data?.user?.email === emails[0], regA.data?.user?.email);
  check('no passwordHash in response', regA.data?.user && !('passwordHash' in regA.data.user));
  check('no starredConversations in response', regA.data?.user && !('starredConversations' in regA.data.user));
  const regB = await call('POST', '/auth/register', { body: { name: 'Smoke Bob', email: emails[1], password: PASSWORD, campus: 'iit-mandi' } });
  const regC = await call('POST', '/auth/register', { body: { name: 'Smoke Eve', email: emails[2], password: PASSWORD, campus: 'iit-mandi' } });
  check('second and third users register', regB.status === 201 && regC.status === 201, `${show(regB)} | ${show(regC)}`);

  const dup = await call('POST', '/auth/register', { body: { name: 'Dup', email: emails[0], password: PASSWORD, campus: 'iit-mandi' } });
  check('duplicate email → 409', dup.status === 409 && isErrorShape(dup), show(dup));
  const shortPw = await call('POST', '/auth/register', { body: { name: 'X', email: `x-${stamp}@test.local`, password: 'short' } });
  check('password < 8 chars → 400', shortPw.status === 400 && isErrorShape(shortPw), show(shortPw));
  const badEmail = await call('POST', '/auth/register', { body: { name: 'X', email: 'not-an-email', password: PASSWORD, campus: 'iit-mandi' } });
  check('invalid email → 400', badEmail.status === 400 && isErrorShape(badEmail), show(badEmail));
  const noName = await call('POST', '/auth/register', { body: { name: '   ', email: `y-${stamp}@test.local`, password: PASSWORD, campus: 'iit-mandi' } });
  check('blank name → 400', noName.status === 400 && isErrorShape(noName), show(noName));
  const nosqlInj = await call('POST', '/auth/register', { body: { name: 'X', email: { $gt: '' }, password: PASSWORD, campus: 'iit-mandi' } });
  check('object instead of email string → 400', nosqlInj.status === 400, show(nosqlInj));

  // ── Login ─────────────────────────────────────────────────
  console.log('\nLogin');
  const login = await call('POST', '/auth/login', { body: { email: `  ${emails[0].toUpperCase()} `, password: PASSWORD, campus: 'iit-mandi' } });
  check('login (any case, spaces) → 200 with token', login.status === 200 && login.data?.token, show(login));
  const wrongPw = await call('POST', '/auth/login', { body: { email: emails[0], password: 'wrongpassword' } });
  const noUser = await call('POST', '/auth/login', { body: { email: `nobody-${stamp}@test.local`, password: PASSWORD, campus: 'iit-mandi' } });
  check('wrong password → 401', wrongPw.status === 401 && isErrorShape(wrongPw), show(wrongPw));
  check('unknown email → 401 with the same message', noUser.status === 401 && noUser.data?.error === wrongPw.data?.error, show(noUser));
  const injLogin = await call('POST', '/auth/login', { body: { email: { $ne: null }, password: { $ne: null } } });
  check('NoSQL-injection login attempt → 400', injLogin.status === 400, show(injLogin));

  // ── Session ───────────────────────────────────────────────
  console.log('\nSession');
  const tokenA = login.data?.token;
  const me = await call('GET', '/auth/me', { token: tokenA });
  check('GET /me with token → own user', me.status === 200 && me.data?.user?.email === emails[0], show(me));
  check('/me hides passwordHash and starredConversations', me.data?.user && !('passwordHash' in me.data.user) && !('starredConversations' in me.data.user));
  const meNo = await call('GET', '/auth/me');
  check('GET /me without token → 401', meNo.status === 401 && isErrorShape(meNo), show(meNo));
  const meBad = await call('GET', '/auth/me', { token: 'garbage.token.value' });
  check('GET /me with forged token → 401', meBad.status === 401, show(meBad));
  const tampered = tokenA ? `${tokenA.slice(0, -3)}abc` : 'x';
  const meTamper = await call('GET', '/auth/me', { token: tampered });
  check('GET /me with tampered signature → 401', meTamper.status === 401, show(meTamper));
  const logout = await call('POST', '/auth/logout', { token: tokenA });
  check('POST /logout → { ok: true }', logout.status === 200 && logout.data?.ok === true, show(logout));

  // ── Error format & CORS ───────────────────────────────────
  console.log('\nErrors & CORS');
  const badJson = await call('POST', '/auth/login', { raw: '{"email": oops' });
  check('malformed JSON → 400 { error }', badJson.status === 400 && isErrorShape(badJson), show(badJson));
  const unknown = await call('GET', '/does-not-exist');
  check('unknown route → 404 { error }', unknown.status === 404 && isErrorShape(unknown), show(unknown));
  const evil = await call('GET', '/health', { headers: { Origin: 'https://evil.example.com' } });
  check('request from a non-allowed origin → 403', evil.status === 403, show(evil));
  const good = await call('GET', '/health', { headers: { Origin: env.clientUrls[0] } });
  check(`allowed origin (${env.clientUrls[0]}) gets CORS header`, good.headers.get('access-control-allow-origin') === env.clientUrls[0]);

  // ── Socket.IO auth ────────────────────────────────────────
  console.log('\nSocket.IO');
  const sGood = await socketConnects(tokenA);
  check('socket with valid token connects', sGood.ok, sGood.error);
  const sNone = await socketConnects(null);
  check('socket without token is rejected', !sNone.ok);
  const sBad = await socketConnects('garbage');
  check('socket with forged token is rejected', !sBad.ok);

  // ── DB-level guarantees (membership guard + indexes) ─────
  console.log('\nDatabase & membership guard');
  await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10000 });
  await Promise.all([User.init(), Conversation.init()]); // wait for indexes to be built

  const idA = regA.data?.user?._id;
  const idB = regB.data?.user?._id;
  const idC = regC.data?.user?._id;
  let conv;
  try {
    conv = await Conversation.create({ type: 'private', participants: [idA, idB] });
    check('private conversation created with privateKey', conv.privateKey === [idA, idB].sort().join('_'), conv.privateKey);
  } catch (err) {
    check('private conversation created', false, err.message);
  }

  try {
    await Conversation.create({ type: 'private', participants: [idB, idA] });
    check('duplicate private chat (B,A) is blocked by unique index', false, 'second create succeeded');
  } catch (err) {
    check('duplicate private chat (B,A) is blocked by unique index', err.code === 11000, err.message);
  }

  try {
    await Conversation.create({ type: 'private', participants: [idA] });
    check('private chat with 1 participant rejected', false, 'create succeeded');
  } catch (err) {
    check('private chat with 1 participant rejected', err.name === 'ValidationError', err.message);
  }

  if (conv) {
    const forA = await loadConversationForUser(String(conv._id), idA).catch((e) => e);
    check('member (A) can load the conversation', String(forA?._id) === String(conv._id), forA?.message);
    const forC = await loadConversationForUser(String(conv._id), idC).catch((e) => e);
    check('outsider (C) gets 404, not 403', forC?.status === 404, `${forC?.status} ${forC?.message}`);
    const badId = await loadConversationForUser('not-an-id', idA).catch((e) => e);
    check('malformed conversation id → 404', badId?.status === 404, `${badId?.status}`);
    const injId = await loadConversationForUser({ $ne: null }, idA).catch((e) => e);
    check('object as conversation id → 404', injId?.status === 404, `${injId?.status}`);
  }

  const stored = await User.findById(idA).select('+passwordHash').lean();
  check('password stored as bcrypt hash, not plaintext', /^\$2[aby]\$10\$/.test(stored?.passwordHash || ''), stored?.passwordHash?.slice(0, 7));

  // ── Cleanup ───────────────────────────────────────────────
  await Conversation.deleteMany({ participants: { $in: [idA, idB, idC].filter(Boolean) } });
  await User.deleteMany({ email: { $in: emails } });
  await mongoose.disconnect();

  console.log(`\n${failed === 0 ? '🎉' : '⚠️ '} ${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\nSmoke test crashed:', err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
