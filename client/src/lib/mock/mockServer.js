// In-browser fake of P1's server + P3's socket server (mock mode only).
// Data lives in localStorage; real-time events go through an in-memory event bus.
// Seeded classmates act as simulated users: online ones receive, read, type and reply.
// Demo only: passwords are stored in plain text.

const USERS_KEY = 'cc_mock_users';
const DB_KEY = 'cc_mock_db';
export const SEED_PASSWORD = 'password123';

const SEED_USERS = [
  { name: 'Aarav Sharma', email: 'aarav@students.iitmandi.ac.in', bio: 'B.Tech CSE · Robotics Club', online: false },
  { name: 'Diya Patel', email: 'diya@students.iitmandi.ac.in', bio: 'KamandPrompt core team', online: true },
  { name: 'Kabir Rao', email: 'kabir@students.iitmandi.ac.in', bio: 'Hostel council · Music club', online: false },
  { name: 'Meera Nair', email: 'meera@students.iitmandi.ac.in', bio: 'M.Sc Physics', online: true },
];
export const SEED_EMAILS = SEED_USERS.map((u) => u.email);
const SEED_ONLINE = new Set(SEED_USERS.filter((u) => u.online).map((u) => u.email));

const REPLIES = [
  'Sounds good! 👍',
  'Sure, see you at the lab.',
  "I'll check and get back to you.",
  'Haha true 😄',
  'Can we meet near the library at 5?',
  'Done, shared it on the group.',
  'Okay, noted!',
];

class MockError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function makeId() {
  const hex = '0123456789abcdef';
  let id = '';
  for (let i = 0; i < 24; i += 1) id += hex[Math.floor(Math.random() * 16)];
  return id;
}

const nowIso = () => new Date().toISOString();

// ---------- storage ----------

const memory = {};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* fall back to memory */
  }
  return memory[key] ?? null;
}

function write(key, value) {
  memory[key] = value;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* memory only */
  }
}

function seedUsers() {
  const now = nowIso();
  return SEED_USERS.map(({ online: _online, ...u }) => ({
    _id: makeId(),
    ...u,
    password: SEED_PASSWORD,
    profilePicture: '',
    starredConversations: [],
    lastSeen: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
  }));
}

export function getUsers() {
  const stored = read(USERS_KEY);
  if (Array.isArray(stored)) return stored;
  const seeded = seedUsers();
  write(USERS_KEY, seeded);
  return seeded;
}

export function saveUsers(users) {
  write(USERS_KEY, users);
}

function getDb() {
  const stored = read(DB_KEY);
  if (stored && Array.isArray(stored.conversations) && Array.isArray(stored.messages)) return stored;
  return { conversations: [], messages: [] };
}

function saveDb(db) {
  write(DB_KEY, db);
}

// ---------- presence & event bus ----------

const liveSockets = {}; // userId -> number of connected mock sockets
const presence = {}; // userId -> { status, lastSeen }
const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitTo(userId, event, payload) {
  listeners.forEach((fn) => fn(userId, event, payload));
}

function statusOf(user) {
  if (presence[user._id]) return presence[user._id];
  return { status: SEED_ONLINE.has(user.email) ? 'online' : 'offline', lastSeen: user.lastSeen };
}

function isLive(userId) {
  return (liveSockets[userId] || 0) > 0;
}

/** A seeded user nobody is logged in as: the mock plays them. */
function isSimulated(user) {
  return SEED_EMAILS.includes(user.email) && !isLive(user._id);
}

export function publicUser(user) {
  const { password: _p, starredConversations: _s, ...rest } = user;
  return { ...rest, ...statusOf(user) };
}

function popUser(user) {
  if (!user) return { _id: 'deleted', name: 'Deleted user', profilePicture: '', status: 'offline' };
  const { status, lastSeen } = statusOf(user);
  return { _id: user._id, name: user.name, profilePicture: user.profilePicture || '', status, lastSeen };
}

function contactsOf(userId, db) {
  const ids = new Set();
  db.conversations.forEach((c) => {
    if (c.participants.includes(userId)) c.participants.forEach((p) => p !== userId && ids.add(p));
  });
  return [...ids];
}

export function socketConnected(userId) {
  liveSockets[userId] = (liveSockets[userId] || 0) + 1;
  if (liveSockets[userId] === 1) {
    presence[userId] = { status: 'online', lastSeen: nowIso() };
    contactsOf(userId, getDb()).forEach((id) => emitTo(id, 'user_online', { userId }));
  }
}

export function socketDisconnected(userId) {
  liveSockets[userId] = Math.max(0, (liveSockets[userId] || 0) - 1);
  if (liveSockets[userId] === 0) {
    const lastSeen = nowIso();
    presence[userId] = { status: 'offline', lastSeen };
    saveUsers(getUsers().map((u) => (u._id === userId ? { ...u, lastSeen } : u)));
    contactsOf(userId, getDb()).forEach((id) => emitTo(id, 'user_offline', { userId, lastSeen }));
  }
}

// ---------- helpers ----------

function findUser(id) {
  return getUsers().find((u) => u._id === id) || null;
}

export function userFromToken(token = '') {
  const clean = String(token).replace(/^Bearer\s+/i, '');
  if (!clean.startsWith('mock.')) return null;
  return findUser(clean.slice(5));
}

function popMessage(message, users) {
  const sender = users.find((u) => u._id === message.senderId);
  return { ...message, senderId: popUser(sender) };
}

function memberConversation(db, meId, conversationId) {
  const conv = db.conversations.find((c) => c._id === conversationId);
  if (!conv || !conv.participants.includes(meId)) throw new MockError(404, 'Conversation not found');
  return conv;
}

function populateConversation(conv, meId, db) {
  const users = getUsers();
  const me = users.find((u) => u._id === meId);
  const last = conv.lastMessage ? db.messages.find((m) => m._id === conv.lastMessage) : null;
  const unreadCount = db.messages.filter(
    (m) => m.conversationId === conv._id && m.senderId !== meId && !m.readBy.some((r) => r.user === meId),
  ).length;
  return {
    ...conv,
    participants: conv.participants.map((id) => popUser(users.find((u) => u._id === id))),
    lastMessage: last ? popMessage(last, users) : null,
    isStarred: (me?.starredConversations || []).includes(conv._id),
    unreadCount,
  };
}

// ---------- REST-side operations ----------

export function listConversations(meId) {
  const db = getDb();
  return db.conversations
    .filter((c) => c.participants.includes(meId))
    .sort((a, b) => new Date(b.lastMessageAt || b.createdAt) - new Date(a.lastMessageAt || a.createdAt))
    .map((c) => populateConversation(c, meId, db));
}

export function getConversation(meId, conversationId) {
  const db = getDb();
  return populateConversation(memberConversation(db, meId, conversationId), meId, db);
}

export function findOrCreatePrivate(meId, otherId) {
  if (!otherId || otherId === meId) throw new MockError(400, 'Choose another user to chat with');
  if (!findUser(otherId)) throw new MockError(404, 'User not found');
  const db = getDb();
  const privateKey = [meId, otherId].sort().join('_');
  const existing = db.conversations.find((c) => c.privateKey === privateKey);
  if (existing) return { conversation: populateConversation(existing, meId, db), created: false };

  const now = nowIso();
  const conv = {
    _id: makeId(),
    type: 'private',
    participants: [meId, otherId],
    privateKey,
    groupName: '',
    groupAdmin: null,
    groupPicture: '',
    lastMessage: null,
    lastMessageAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.conversations.push(conv);
  saveDb(db);
  conv.participants.forEach((p) => emitTo(p, 'conversation_created', { conversation: populateConversation(conv, p, db) }));
  return { conversation: populateConversation(conv, meId, db), created: true };
}

export function setStar(meId, conversationId, value) {
  memberConversation(getDb(), meId, conversationId);
  saveUsers(
    getUsers().map((u) => {
      if (u._id !== meId) return u;
      const set = new Set(u.starredConversations || []);
      if (value) set.add(conversationId);
      else set.delete(conversationId);
      return { ...u, starredConversations: [...set] };
    }),
  );
  return { ok: true, isStarred: value };
}

export function listMessages(meId, conversationId, { before, limit = 30 } = {}) {
  const db = getDb();
  memberConversation(db, meId, conversationId);
  const users = getUsers();
  let msgs = db.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (before) msgs = msgs.filter((m) => new Date(m.createdAt) < new Date(before));
  const size = Math.min(Math.max(Number(limit) || 30, 1), 100);
  const hasMore = msgs.length > size;
  return { messages: msgs.slice(-size).map((m) => popMessage(m, users)), hasMore };
}

export function listPinned(meId, conversationId) {
  const db = getDb();
  memberConversation(db, meId, conversationId);
  const users = getUsers();
  return {
    messages: db.messages
      .filter((m) => m.conversationId === conversationId && m.isPinned)
      .sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt))
      .map((m) => popMessage(m, users)),
  };
}

export function setPin(meId, conversationId, messageId, pinned) {
  const db = getDb();
  const conv = memberConversation(db, meId, conversationId);
  const msg = db.messages.find((m) => m._id === messageId && m.conversationId === conversationId);
  if (!msg) throw new MockError(404, 'Message not found');
  msg.isPinned = pinned;
  msg.pinnedAt = pinned ? nowIso() : null;
  msg.pinnedBy = pinned ? meId : null;
  saveDb(db);
  const populated = popMessage(msg, getUsers());
  conv.participants.forEach((p) =>
    pinned
      ? emitTo(p, 'message_pinned', { message: populated })
      : emitTo(p, 'message_unpinned', { conversationId, messageId }),
  );
  return { message: populated };
}

// ---------- socket-side operations ----------

export function createMessage(meId, conversationId, text, clientId) {
  const clean = String(text ?? '').trim();
  if (!clean) throw new MockError(400, 'Message cannot be empty');
  if (clean.length > 4000) throw new MockError(400, 'Message is too long (max 4000 characters)');
  const db = getDb();
  const conv = memberConversation(db, meId, conversationId);
  const now = nowIso();
  const msg = {
    _id: makeId(),
    conversationId,
    senderId: meId,
    messageType: 'text',
    text: clean,
    mediaUrl: '',
    mediaType: '',
    duration: 0,
    deliveredTo: [],
    readBy: [],
    isPinned: false,
    pinnedAt: null,
    pinnedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  db.messages.push(msg);
  conv.lastMessage = msg._id;
  conv.lastMessageAt = now;
  conv.updatedAt = now;
  saveDb(db);

  const populated = { ...popMessage(msg, getUsers()), ...(clientId ? { clientId } : {}) };
  conv.participants.forEach((p) => emitTo(p, 'new_message', { message: populated }));
  simulateRecipients(conv, meId, msg);
  return populated;
}

export function markDelivered(userId, messageIds) {
  const db = getDb();
  const at = nowIso();
  const bySender = {};
  db.messages.forEach((m) => {
    if (!messageIds.includes(m._id) || m.senderId === userId) return;
    const conv = db.conversations.find((c) => c._id === m.conversationId);
    if (!conv?.participants.includes(userId)) return;
    if (m.deliveredTo.some((r) => r.user === userId)) return;
    m.deliveredTo.push({ user: userId, at });
    const key = `${m.senderId}|${m.conversationId}`;
    (bySender[key] ||= []).push(m._id);
  });
  saveDb(db);
  Object.entries(bySender).forEach(([key, ids]) => {
    const [senderId, conversationId] = key.split('|');
    emitTo(senderId, 'message_delivered', { conversationId, messageIds: ids, userId, at });
  });
}

export function markRead(userId, conversationId) {
  const db = getDb();
  const conv = memberConversation(db, userId, conversationId);
  const at = nowIso();
  let changed = false;
  db.messages.forEach((m) => {
    if (m.conversationId !== conversationId || m.senderId === userId) return;
    if (!m.deliveredTo.some((r) => r.user === userId)) m.deliveredTo.push({ user: userId, at });
    if (!m.readBy.some((r) => r.user === userId)) {
      m.readBy.push({ user: userId, at });
      changed = true;
    }
  });
  if (!changed) return;
  saveDb(db);
  conv.participants.forEach((p) => emitTo(p, 'message_read', { conversationId, userId, at }));
}

export function relayTyping(userId, conversationId, isTyping) {
  const conv = memberConversation(getDb(), userId, conversationId);
  const user = findUser(userId);
  conv.participants
    .filter((p) => p !== userId)
    .forEach((p) => emitTo(p, isTyping ? 'typing' : 'stop_typing', { conversationId, userId, name: user?.name || '' }));
}

// ---------- simulated classmates ----------

const botTimers = {};
let replyIndex = 0;

function simulateRecipients(conv, senderId, msg) {
  const sender = findUser(senderId);
  if (!sender || isSimulated(sender)) return; // bots never answer bots
  conv.participants
    .filter((id) => id !== senderId)
    .map(findUser)
    .filter((u) => u && isSimulated(u) && statusOf(u).status === 'online')
    .forEach((bot, index) => {
      const key = `${conv._id}|${bot._id}`;
      const stagger = index * 2500; // in groups, classmates answer one after another
      (botTimers[key] || []).forEach(clearTimeout);
      botTimers[key] = [
        setTimeout(() => markDelivered(bot._id, [msg._id]), 600),
        setTimeout(() => markRead(bot._id, conv._id), 1600 + stagger / 4),
        setTimeout(() => stillMember(conv._id, bot._id) && relayTyping(bot._id, conv._id, true), 2200 + stagger),
        setTimeout(() => {
          if (!stillMember(conv._id, bot._id)) return;
          relayTyping(bot._id, conv._id, false);
          createMessage(bot._id, conv._id, REPLIES[replyIndex++ % REPLIES.length]);
        }, 4200 + stagger),
      ];
    });
}

function stillMember(conversationId, userId) {
  return Boolean(getDb().conversations.find((c) => c._id === conversationId && c.participants.includes(userId)));
}

// ---------- Part 3: profile pictures ----------

export function setProfilePicture(meId, url) {
  let updated = null;
  saveUsers(
    getUsers().map((u) => {
      if (u._id !== meId) return u;
      updated = { ...u, profilePicture: url, updatedAt: nowIso() };
      return updated;
    }),
  );
  return { user: publicUser(updated) };
}

// ---------- Part 3: groups ----------

function groupFor(db, meId, conversationId) {
  const conv = memberConversation(db, meId, conversationId);
  if (conv.type !== 'group') throw new MockError(400, 'This is not a group');
  return conv;
}

function requireAdmin(conv, meId) {
  if (conv.groupAdmin !== meId) throw new MockError(403, 'Only the group admin can do that');
}

function cleanGroupName(name) {
  const value = String(name ?? '').trim();
  if (value.length < 1 || value.length > 50) throw new MockError(400, 'Group name must be 1–50 characters');
  return value;
}

export function createGroup(meId, name, memberIds = []) {
  const groupName = cleanGroupName(name);
  const users = getUsers();
  const members = [...new Set((Array.isArray(memberIds) ? memberIds : []).filter((id) => id !== meId))];
  if (members.length === 0) throw new MockError(400, 'Add at least one member');
  if (members.some((id) => !users.find((u) => u._id === id))) throw new MockError(400, 'One of the members does not exist');
  const db = getDb();
  const now = nowIso();
  const conv = {
    _id: makeId(),
    type: 'group',
    participants: [meId, ...members],
    privateKey: null,
    groupName,
    groupAdmin: meId,
    groupPicture: '',
    lastMessage: null,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
  db.conversations.push(conv);
  saveDb(db);
  conv.participants.forEach((id) => emitTo(id, 'conversation_created', { conversation: populateConversation(conv, id, db) }));
  return { conversation: populateConversation(conv, meId, db) };
}

export function updateGroup(meId, conversationId, { groupName, groupPicture } = {}) {
  const db = getDb();
  const conv = groupFor(db, meId, conversationId);
  requireAdmin(conv, meId);
  if (groupName !== undefined) conv.groupName = cleanGroupName(groupName);
  if (groupPicture !== undefined) conv.groupPicture = String(groupPicture || '');
  conv.updatedAt = nowIso();
  saveDb(db);
  return { conversation: populateConversation(conv, meId, db) };
}

export function addMember(meId, conversationId, userId) {
  const db = getDb();
  const conv = groupFor(db, meId, conversationId);
  requireAdmin(conv, meId);
  if (!findUser(userId)) throw new MockError(404, 'User not found');
  if (conv.participants.includes(userId)) throw new MockError(400, 'Already a member');
  conv.participants.push(userId);
  conv.updatedAt = nowIso();
  saveDb(db);
  conv.participants.filter((p) => p !== userId).forEach((p) => emitTo(p, 'group_member_added', { conversationId, userId }));
  emitTo(userId, 'conversation_created', { conversation: populateConversation(conv, userId, db) });
  return { conversation: populateConversation(conv, meId, db) };
}

export function removeMember(meId, conversationId, userId) {
  const db = getDb();
  const conv = groupFor(db, meId, conversationId);
  if (userId !== meId) requireAdmin(conv, meId);
  if (!conv.participants.includes(userId)) throw new MockError(404, 'Not a member');
  const everyone = [...conv.participants];
  conv.participants = conv.participants.filter((p) => p !== userId);
  if (conv.groupAdmin === userId) conv.groupAdmin = conv.participants[0] || null; // admin left: hand over
  conv.updatedAt = nowIso();
  saveDb(db);
  everyone.forEach((p) => emitTo(p, 'group_member_removed', { conversationId, userId }));
  return userId === meId ? { ok: true } : { conversation: populateConversation(conv, meId, db) };
}

// ---------- Part 3: media messages ----------

export function createMediaMessage(meId, conversationId, { url, mime, duration }) {
  const type = String(mime || '').split(';')[0];
  const messageType = type.startsWith('image/') ? 'image' : 'voice';
  const db = getDb();
  const conv = memberConversation(db, meId, conversationId);
  const now = nowIso();
  const msg = {
    _id: makeId(),
    conversationId,
    senderId: meId,
    messageType,
    text: '',
    mediaUrl: url,
    mediaType: type,
    duration: Math.round((Number(duration) || 0) * 10) / 10,
    deliveredTo: [],
    readBy: [],
    isPinned: false,
    pinnedAt: null,
    pinnedBy: null,
    createdAt: now,
    updatedAt: now,
  };
  db.messages.push(msg);
  conv.lastMessage = msg._id;
  conv.lastMessageAt = now;
  saveDb(db);
  const populated = popMessage(msg, getUsers());
  conv.participants.forEach((p) => emitTo(p, 'new_message', { message: populated }));
  simulateRecipients(conv, meId, msg);
  return { message: populated };
}

// ---------- Part 3: Chat Memory (offline stand-in for Gemini) ----------

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE_RE = new RegExp(
  `\\b(today|tomorrow|tonight|this (?:weekend|week)|next (?:week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:mon|tues|wednes|thurs|fri|satur|sun)day|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})|(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?)\\b(?:[^.!?\\n]{0,20}?\\b\\d{1,2}(?::\\d{2})?\\s?(?:am|pm))?`,
  'i',
);
const DECISION_RE = /\b(decided|let'?s|final(?:ised|ized)?|agreed|we will|we'll|confirmed|moved to|is fixed|done deal)\b/i;
const ACTION_RE = /\b(i'?ll|i will|please|can you|could you|need to|todo|to-do|bring|send|share|book|submit|remember to)\b/i;
const STOP = new Set('about after again also because before being could their there these thing think those where which while would should doesnt really maybe still other'.split(' '));

const firstName = (name = '') => name.split(' ')[0] || 'Someone';
const clip = (text, n = 140) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

export function summarize(meId, conversationId) {
  const db = getDb();
  const conv = memberConversation(db, meId, conversationId);
  const users = getUsers();
  const nameOf = (id) => users.find((u) => u._id === id)?.name || 'Someone';
  const msgs = db.messages
    .filter((m) => m.conversationId === conversationId && m.messageType === 'text' && m.text)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-80);
  if (msgs.length < 3) throw new MockError(400, 'Chat Memory needs a few more messages to summarise.');

  const people = [...new Set(msgs.map((m) => firstName(nameOf(m.senderId))))];
  const counts = {};
  msgs.forEach((m) =>
    m.text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 4 && !STOP.has(w))
      .forEach((w) => {
        counts[w] = (counts[w] || 0) + 1;
      }),
  );
  const topics = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);

  const keyDecisions = msgs.filter((m) => DECISION_RE.test(m.text)).slice(-5).map((m) => `${firstName(nameOf(m.senderId))}: ${clip(m.text)}`);
  const actionItems = msgs
    .filter((m) => ACTION_RE.test(m.text))
    .slice(-6)
    .map((m) => `${firstName(nameOf(m.senderId))}: ${clip(m.text)}`);
  const importantDates = msgs
    .map((m) => ({ m, match: m.text.match(DATE_RE) }))
    .filter((x) => x.match)
    .slice(-5)
    .map(({ m, match }) => `${match[0]}: ${clip(m.text)}`);

  const where = conv.type === 'group' ? `the ${conv.groupName} group` : 'this chat';
  const summary =
    `${msgs.length} recent messages in ${where} from ${people.join(', ')}.` +
    (topics.length ? ` The conversation mostly covers ${topics.join(', ')}.` : '') +
    (keyDecisions.length ? ` ${keyDecisions.length} decision${keyDecisions.length > 1 ? 's were' : ' was'} made.` : '');

  return { summary, keyDecisions, actionItems, importantDates, source: 'mock' };
}

// ---------- demo data: a ready-made group so Groups and Chat Memory can be shown at once ----------

const DEMO_SCRIPT = [
  ['diya', 'Hey team! Robotics workshop planning thread 🤖', 26 * 60],
  ['kabir', 'Do we have a venue yet?', 25 * 60],
  ['diya', "Let's do it in the North Campus lab, it has the big benches.", 24 * 60],
  ['meera', 'Agreed, North Campus lab works for me.', 24 * 60 - 5],
  ['kabir', 'What day were we thinking?', 20 * 60],
  ['diya', 'Final decision: Saturday at 4 pm. I booked the lab already.', 19 * 60],
  ['meera', "I'll bring the Arduino kits and the spare sensors.", 18 * 60],
  ['kabir', 'Can you share the registration form link on the group?', 6 * 60],
  ['diya', 'Done, shared it. Registrations close on 14 Oct.', 5 * 60],
  ['meera', 'Please remember to submit the budget sheet to the club secretary by Friday.', 3 * 60],
  ['kabir', "I'll print the posters tomorrow morning.", 90],
];

export function ensureDemoGroup(userId) {
  const db = getDb();
  if (db.conversations.some((c) => c.demo && c.participants.includes(userId))) return;
  const users = getUsers();
  const byName = (key) => users.find((u) => u.email.startsWith(key));
  const diya = byName('diya');
  const kabir = byName('kabir');
  const meera = byName('meera');
  if (!diya || !kabir || !meera || [diya._id, kabir._id, meera._id].includes(userId)) return;
  const now = Date.now();
  const conv = {
    _id: makeId(),
    demo: true,
    type: 'group',
    participants: [diya._id, kabir._id, meera._id, userId],
    privateKey: null,
    groupName: 'Robotics Club',
    groupAdmin: diya._id,
    groupPicture: '',
    lastMessage: null,
    lastMessageAt: null,
    createdAt: new Date(now - 27 * 3600000).toISOString(),
    updatedAt: new Date(now - 27 * 3600000).toISOString(),
  };
  const ids = { diya: diya._id, kabir: kabir._id, meera: meera._id };
  DEMO_SCRIPT.forEach(([who, text, minutesAgo]) => {
    const at = new Date(now - minutesAgo * 60000).toISOString();
    const msg = {
      _id: makeId(),
      conversationId: conv._id,
      senderId: ids[who],
      messageType: 'text',
      text,
      mediaUrl: '',
      mediaType: '',
      duration: 0,
      deliveredTo: [],
      readBy: [],
      isPinned: text.startsWith('Final decision'),
      pinnedAt: text.startsWith('Final decision') ? at : null,
      pinnedBy: text.startsWith('Final decision') ? diya._id : null,
      createdAt: at,
      updatedAt: at,
    };
    db.messages.push(msg);
    conv.lastMessage = msg._id;
    conv.lastMessageAt = at;
  });
  db.conversations.push(conv);
  saveDb(db);
}

export { MockError };
