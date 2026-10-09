# P1 ↔ P3 integration: response to `CAUTION_AND_DIRECTION.md`

P1 checked Parts 1–3 against every point in P3's caution file. This page lists what P1 changed, what was already compatible, and the open questions for P3.

**Merge rule:** P1's deliverable does **not** contain `server/src/socket/`, `services/media.js` or `services/aiMemory.js`. Those are P3's.

> ⚠️ **Earlier P1 zips (Parts 1–3) contained `server/src/socket/index.js` and `socket/emit.js`.** If you unzipped one of them over the repo after P3's files were there, restore P3's versions first:
> `git checkout -- server/src/socket/`

---

## Status of every point in the caution file

### §1 Exports P3's `deps.js` imports

| Import | Before | Now |
|---|---|---|
| `verifyToken(token)` | returned the id **string**; socket auth would have rejected everyone | ✅ returns the decoded payload with **`userId`** (also `sub`). Throws on invalid or expired tokens. Old `sub`-only tokens still work. |
| `HttpError` | ✅ compatible | unchanged |
| `loadConversationForUser(id, userId)` | ✅ compatible (404 for not found, not a member, or malformed id; string userId OK) | unchanged |
| `createMessage(fields)` | ❌ **missing**: startup would crash with "does not provide an export named createMessage" | ✅ added in `services/messages.js`. Validates and saves only. **No membership check, no `lastMessage` update, no emit.** |
| `PUBLIC_USER_FIELDS` | ✅ named export, no secrets | unchanged: `'_id name email bio profilePicture status lastSeen'` |
| `User`, `Conversation`, `Message` | ❌ **named exports only**: startup crash | ✅ default exports added (named kept) |

### §2 Schema
✅ The schema already matched: receipt arrays `{ user, at }`, timestamps, all fields and enums.

**Indexes:** `Message { conversationId: 1, createdAt: -1 }` ✅. For `Conversation { participants: 1 }`, P1 has `{ participants: 1, lastMessageAt: -1 }`. Its leading field is `participants`, so MongoDB uses it for every `participants` query; a separate single-field index would be redundant.

### §3 Bootstrap
✅ `index.js` now does: env → `connectDB()` → `http.createServer(app)` → **`initSocket(httpServer)`** once → `httpServer.listen`. The DB connects before `initSocket`, because P3 marks users offline on boot. P1's own `io` setup and `app.set('io')` were removed. Single instance only (noted in the README).

### §4 Broadcasting from routes
✅ P1 no longer touches `io`. All emits go through P3's helpers, after the DB write:

| Route | Calls |
|---|---|
| `POST /conversations` (created) | `notifyConversationCreated({ ...conversation, isStarred: false, unreadCount: 0 })` |
| `POST /conversations/group` | `notifyConversationCreated(conversation)` |
| `POST /conversations/:id/members` | `notifyMemberAdded(conversationFromNewcomersView, userId)` |
| `DELETE /conversations/:id/members/:userId` | `notifyMemberRemoved(conversationAfterRemoval, userId)` |
| `POST /messages/:cid/pin/:mid` | `notifyMessagePinned(conversation, message)` |
| `DELETE /messages/:cid/pin/:mid` | `notifyMessageUnpinned(conversation, messageId)` |
| `PUT /conversations/:id` (group rename/picture), admin change on leave | `emitToUsers(memberIds, 'conversation_updated', { conversation })` (**new event**, see Q3) |

Conversations passed to the helpers have `participants` populated with `PUBLIC_USER_FIELDS`, the same shape as a `GET /conversations` item.

### §5 Media route
✅ It's P3's `mediaUpload` + `createMediaMessage`, as in the snippet. P1's own media implementation was removed. P1 added only `uploadLimiter` (30 per 10 min per user). `requireAuth` runs at router level, so it isn't repeated.

### §6 AI route
✅ P3's `summarizeConversation(conversation)`, after P1's `loadConversationForUser`. P1's own Gemini code was removed. `aiLimiter` is **10 per minute per user**.

### §7 REST shapes
| Expectation | Status |
|---|---|
| `requireAuth` sets `req.user._id` | ✅ now sets **both** `req.user._id` and `req.userId` |
| History oldest → newest, `senderId` populated with `PUBLIC_USER_FIELDS`, `before` means `createdAt < before` | ✅ the sender populate was changed from `_id name profilePicture` to `PUBLIC_USER_FIELDS` so it matches `new_message` |
| Conversation items: participants with `status`/`lastSeen`, `lastMessage` populated, `isStarred`, `unreadCount` | ✅ |
| `GET /messages/:cid/pinned` → `{ messages }`, newest pin first | ✅ |

### §8 package.json and env
✅ Added `multer`, `cloudinary`, `@google/genai`. `socket.io-client` is already a devDependency. Added `npm run smoke:realtime`. `engines` is `>=18.17`. ⚠️ See Q4 about `GEMINI_MODEL`.

---

## Open questions for P3

1. **Who receives `group_member_removed`?** P1's smoke test checks whether the *removed* user is told, but reports it as info, not a failure. If they aren't told, their sidebar keeps a dead chat until refresh. The caution file's "404 → no longer available" message handles it once they open it.
2. **Last member leaves, so the group is deleted.** P1 calls `notifyMemberRemoved({ ...group, participants: [] }, userId)`. Please make sure the helper still notifies `userId` when `participants` is empty.
3. **New event `conversation_updated { conversation }`** (group renamed, picture changed, admin changed). It isn't covered by `notify.js`, so P1 sends it with your `emitToUsers`. `useConversations` needs to merge it (keep your own `isStarred`/`unreadCount`), or renames won't show live.
4. **Gemini default model.** Google's model page currently says `gemini-2.5-flash` is only served to accounts that already used 2.5 models, and recommends 3.x (e.g. `gemini-3.5-flash-lite`) for new projects. A fresh API key may get **404** with your default. `.env.example` now sets `GEMINI_MODEL=gemini-3.5-flash-lite`. Consider changing the in-code default too.
5. **`PUBLIC_USER_FIELDS` includes `email` and `bio`.** You suggested a smaller set. Email is kept because user search matches on it. Tell P1 if you'd rather not have it in every message's `senderId`.

---

## How P1 verified this before P3's code was available

Stand-ins for P3's files were built to the exact signatures in the caution file (`deps.js` importing the exact names, plus `notify.js`, `emit.js`, `index.js`, `media.js`, `aiMemory.js`). Against those:

- every `deps.js` import resolves
- the default exports are the real models
- `verifyToken` behaves as specified
- `createMessage` validates, returns the saved doc and **emits nothing**
- all 24 routes are mounted
- the rate limits are as agreed

After merging, the real end-to-end check is `npm run smoke:all` (P1) plus `npm run smoke:realtime` (P3). P1's Part 2 test also sends a real `send_message` through P3's handler and checks:

- the ack
- a single `new_message` with the `clientId` echo
- persistence
- the `lastMessage` update
- the outsider rejection
