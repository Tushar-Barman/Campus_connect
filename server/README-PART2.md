# CampusConnect Server: Part 2 (Chat APIs)

Part 2 turns the Part 1 foundation into a working chat backend. It adds:

- **user search and profiles**
- **private conversations** (find-or-create, no duplicates)
- **the chat list**, with last message, unread count and per-user star
- **message history** with pagination
- **`createMessage()`**: the validated save function that P3's `send_message` handler calls
- **pin / unpin**, with real-time events through P3's `notify.js`
- **a smoke test** that proves all of it, including one message sent end to end through P3's socket handler

With Part 2 plus P3's socket layer merged, the **mandatory checkpoint** works: P3's `send_message` → P1's `createMessage` → saved → broadcast.

> Builds on Part 1 (see `README.md`). Contracts follow `PROJECT_INSTRUCTIONS.md` sections 5–8.

---

## 1. Run and verify

```bash
cd server
npm install
npm run dev                # terminal 1
npm run smoke:all          # terminal 2: Part 1 checks, then Part 2 checks
```

Expect `🎉 … 0 failed` for each part. `npm run smoke:part2` runs only the Part 2 checks. It needs P3's `server/src/socket/` merged, because it sends one message through their `send_message` handler.

---

## 2. What's new in this part

```
server/src/
├── app.js                       (changed) mounts /api/users, /api/conversations, /api/messages
├── services/                    NEW: data logic used by routes (and createMessage by P3)
│   ├── conversations.js         findOrCreatePrivate, listConversationsForUser,
│   │                            getConversationDetails, setStarred
│   └── messages.js              createMessage (for P3), getMessages, markRead,
│                                setPinned, getPinnedMessages
├── routes/
│   ├── users.js                 NEW: search, get profile, update profile
│   ├── conversations.js         NEW: list, open/create private chat, details, star/unstar
│   └── messages.js              NEW: history, pinned list, pin, unpin
└── utils/
    └── ids.js                   NEW: toObjectId, sameId
server/scripts/
├── smoke-part2.js               NEW: ~55 checks for everything above
└── lib/seed.js                  test helper: stores messages like P3's publishMessage (no emit)
```

`services/` is a new folder that isn't in `PROJECT_INSTRUCTIONS.md` section 4 yet. Add it there and tell the team. It exists because of the rule *"don't put business logic in socket handlers that REST also needs."*

---

## 3. Architecture: who does what

```
 Sending a message (real time)               Everything else (REST)
 ─────────────────────────────               ──────────────────────
 client  socket.emit('send_message')         client  GET /api/messages/:id …
   │                                           │
   ▼  P3: socket/                              ▼  P1: requireAuth → routes/*.js
 publishMessage()                            services/*.js
   ├─ loadConversationForUser (P1) → 404       ├─ validate input            → 400
   ├─ createMessage (P1)          → 400        ├─ loadConversationForUser   → 404
   │     validate + save, nothing else         ├─ read / write MongoDB
   ├─ update lastMessage                       └─ return data
   └─ emit new_message                               │
                                                     ▼ (only where something changed)
                                               P3: socket/notify.js helpers
                                               notifyConversationCreated, notifyMessagePinned …
```

- **P1 never emits socket events directly and never touches `io`.** After a successful database write, a service or route calls one of P3's `notify.js` helpers.
- **Every P1 service checks membership itself**, so a route cannot forget it.
- Services **return data**. The route picks the HTTP status. Errors are `HttpError`s, which `errorHandler` turns into `{ error }`.

---

## 4. Endpoints

All of these require `Authorization: Bearer <token>`. Errors are always `{ "error": "..." }`.

### 4.1 Users (`routes/users.js`)

| Method & path | Body / query | Returns | Notes |
|---|---|---|---|
| `GET /api/users/search?q=` | `q` (≤ 50 chars) | `{ users }` | Case-insensitive match on name **or** email. Excludes yourself. Max 20, sorted by name. Empty `q` returns `[]`. |
| `GET /api/users/:id` | | `{ user }` | Public fields only. A malformed or unknown id returns 404. |
| `PUT /api/users/profile` | `{ name?, bio? }` | `{ user }` | Only `name` (1–50) and `bio` (0–200) can change. Anything else in the body (email, status…) is ignored. An empty body returns 400. |

**How search stays safe:**
- The query is escaped with `escapeRegex` before it becomes a RegExp, so `.*` matches a literal ".*" instead of everyone, and a crafted pattern can't freeze the DB.
- `?q[$ne]=x` arrives as an object, not a string, so it's treated as empty. That blocks NoSQL injection.
- Results use `PUBLIC_USER_FIELDS`, so no password hash and no stars.

### 4.2 Conversations (`routes/conversations.js` + `services/conversations.js`)

| Method & path | Body | Returns |
|---|---|---|
| `GET /api/conversations` | | `{ conversations }`: newest activity first |
| `POST /api/conversations` | `{ userId }` | `{ conversation, created }`: **201** if new, **200** if it already existed |
| `GET /api/conversations/:id` | | `{ conversation }` |
| `POST /api/conversations/:id/star` | | `{ conversationId, isStarred: true }` |
| `DELETE /api/conversations/:id/star` | | `{ conversationId, isStarred: false }` |

**A conversation object looks like this:**

```jsonc
{
  "_id": "…",
  "type": "private",
  "participants": [ { "_id", "name", "email", "bio", "profilePicture", "status", "lastSeen" }, … ],
  "lastMessage": { "_id", "text", "messageType", "createdAt", "senderId": { "_id", "name", "profilePicture", "status", … }, … } | null,
  "lastMessageAt": "2026-10-09T…",
  "isStarred": false,      // for YOU only
  "unreadCount": 3,        // messages from others you haven't read
  "createdAt", "updatedAt"
}
```

**How find-or-create works (`findOrCreatePrivate`):**
1. Validate `userId`. Not an ObjectId returns 400. Yourself returns 400. An unknown user returns 404.
2. Compute `privateKey = sort(myId, theirId).join('_')`. It's the same key whichever user starts the chat.
3. Look the key up. If found, return it with `created: false`.
4. If not found, create the chat. If two people click "chat" at the same instant, the second insert hits the **unique index** (Mongo error E11000). The service catches that and returns the chat the first click created. **You never get duplicate chats.**
5. On creation, call P3's **`notifyConversationCreated(conversation)`**, which sends `conversation_created` to both users. The other person's sidebar shows the new chat instantly. The payload has the same shape as a `GET /conversations` item.

**How the chat list is built (`listConversationsForUser`)**, in 3 queries no matter how many chats you have:
1. Conversations where you're a participant, sorted by `lastMessageAt` descending, with participants and the last message's sender populated.
2. Your own `starredConversations` (hidden from everyone else) gives each chat's `isStarred`.
3. **One aggregation** counts, per chat, messages where `senderId ≠ you` **and** you're not in `readBy`. That gives `unreadCount`.

**Star is per-user.** It is stored on *your* User document with `$addToSet` (so starring twice stores it once) and removed with `$pull`. Starring never touches the conversation, so it can't change anyone else's list.

### 4.3 Messages (`routes/messages.js` + `services/messages.js`)

| Method & path | Query | Returns |
|---|---|---|
| `GET /api/messages/:conversationId` | `before` (ISO date), `limit` (1–50, default 30) | `{ messages, hasMore }`: **oldest → newest** |
| `GET /api/messages/:conversationId/pinned` | | `{ messages }`: most recently pinned first, max 50 |
| `POST /api/messages/:conversationId/pin/:messageId` | | `{ message }`, then P3's `notifyMessagePinned` (`message_pinned`) |
| `DELETE /api/messages/:conversationId/pin/:messageId` | | `{ message }`, then P3's `notifyMessageUnpinned` (`message_unpinned`) |

Every message has `senderId` populated with **`PUBLIC_USER_FIELDS`**, which is the same shape P3 uses in `new_message`. History and live messages therefore render identically. It never includes `passwordHash` or `starredConversations`.

**How pagination works (`getMessages`):**

```
Stored:  m1 m2 m3 … m34 m35 m36            (m36 = newest)

GET ?limit=30
  query: newest first, take 31   → m36 … m6
  31 > 30 → hasMore = true, drop the extra (m6)
  reverse → [m7 … m36]            ← render top to bottom

GET ?limit=30&before=<m7.createdAt>
  query: createdAt < m7, newest first, take 31 → m6 … m1 (6 rows)
  6 ≤ 30 → hasMore = false
  reverse → [m1 … m6]             ← prepend above the current list
```

The frontend loads the first page when a chat opens. When the user scrolls to the top and `hasMore` is true, it requests the next page with `before = messages[0].createdAt`. The `{ conversationId, createdAt }` index from Part 1 makes this fast at any history size.

**How pinning stays safe (`setPinned`):**
- The update filter is `{ _id: messageId, conversationId }`. A member of chat X can't pin a message from chat Y by putting Y's message id in X's URL; that returns 404.
- Any member can pin or unpin. Unpinning clears `pinnedAt` and `pinnedBy`.
- After the write, the route calls P3's notify helper, so everyone's pinned bar updates live. Non-members receive nothing.

---

## 5. `createMessage()`: the hand-off to P3's socket layer

P3 owns sending (`send_message`), receipts, typing and presence. P1 provides the save step.

```
P3 publishMessage(socket.userId, { conversationId, text, clientId })
  1. loadConversationForUser(...)            ← P1, 404 if not a member
  2. createMessage({ conversationId, senderId, messageType: 'text', text })   ← P1
  3. Conversation.lastMessage / lastMessageAt update
  4. emit new_message (with clientId) + ack
```

**`createMessage(fields)`** (`services/messages.js`):

| | |
|---|---|
| Text | `{ conversationId, senderId, messageType: 'text', text }`: text trimmed, 1–4000 chars |
| Media | `{ conversationId, senderId, messageType: 'voice' \| 'image', mediaUrl, mediaType, duration, text? }`: `mediaUrl` must be `https://`, `duration` is coerced to seconds (0–600, one decimal) |
| Returns | the saved Mongoose document (`_id`, `createdAt`, …) |
| Throws | `HttpError(400)` for invalid ids, unknown type, bad or empty text, non-https media |
| **Does NOT** | check membership, update `lastMessage`, or emit anything. That's by agreement with P3; doing it twice would double every message. |

`markRead(conversationId, userId)` is still here, but it's only used internally when a member is added to a group. Live delivered/read receipts are P3's socket handlers.

**Receipt rule** (contract section 7), using the arrays on each message:
- **Delivered to all others:** every participant except the sender appears in `deliveredTo`.
- **Read by all others:** every participant except the sender appears in `readBy`.

---

## 6. How to verify it works

### Automatic: `npm run smoke:part2`

This creates three throwaway users: **Alice**, **Bob** and **Eve**, the outsider. All three are connected by Socket.IO to P3's server, so real-time events are checked too. Bulk messages are stored with `scripts/lib/seed.js`, which does what P3's `publishMessage` does, minus the emit. One message is sent for real through `send_message`. Everything is deleted at the end.

| Area | What is checked |
|---|---|
| **Users** | Search is case-insensitive, matches name and email, excludes yourself, and leaks nothing. `.*` is literal. Empty and object queries return `[]`. No token returns 401. Profile lookup works; bad or missing id returns 404. Profile update trims the bio and **ignores email/status in the body**. Invalid updates return 400. |
| **Conversations** | A→B creates the chat (201) and **Bob gets `conversation_created` live**. Repeating from either side returns the same chat (200). **Two simultaneous creates produce one chat.** Self, bad id and unknown user are rejected. A member can open it; **Eve gets 404**. |
| **createMessage** | Text is trimmed. The sender is populated with public fields only. Empty, > 4000 chars and non-string text give 400. Unknown type, non-https media URL and bad ids give 400. Returns the saved doc. **Does not touch `lastMessage` and emits nothing.** |
| **End to end (P3)** | Alice sends through **P3's `send_message`**: ack `{ ok: true, message }`. **Bob gets `new_message` exactly once**, with the `clientId` echo. The message is in history, and P3 updated `lastMessage`. **Eve's `send_message` is acked `{ ok: false }`.** |
| **History** | Page 1 is 30 messages with `hasMore: true`, in **oldest → newest** order. Page 2 via `before` has the remaining 6 and `hasMore: false`, with **no overlap and no gaps**. A huge `limit` is capped. Bad `before` or `limit` returns 400. **Eve can't read history (404).** |
| **Chat list** | `lastMessage` is populated with its sender. **Unread: Alice 1, Bob 35.** The list is sorted by latest activity. Eve's list doesn't contain the chat. |
| **markRead** | Marks Bob's 35; repeating gives 0. Eve gets 404. Bob's unread goes to 0 while Alice's stays 1. **No duplicate receipt entries.** Your own messages are never marked read by you. |
| **Star** | Alice stars it and sees `isStarred: true` while **Bob still sees false**. Starring twice stores it once. Unstar works. Eve gets 404. |
| **Pin** | Pin sets `isPinned`, `pinnedAt` and `pinnedBy`. **Bob receives `message_pinned` live; Eve receives nothing.** The pinned list shows the message. Eve gets 404. **Pinning via a different chat's URL returns 404.** Unpin clears the fields, emits `message_unpinned`, and the list is empty again. |

### Manual: curl walkthrough

```bash
API=http://localhost:5000/api
# Register two users (or log in), keep their tokens
A=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' -d '{"name":"Alice","email":"alice@test.com","password":"password123"}' | jq -r .token)
B=$(curl -s -X POST $API/auth/register -H 'Content-Type: application/json' -d '{"name":"Bob","email":"bob@test.com","password":"password123"}'   | jq -r .token)

BID=$(curl -s "$API/users/search?q=bob" -H "Authorization: Bearer $A" | jq -r '.users[0]._id')
CID=$(curl -s -X POST $API/conversations -H "Authorization: Bearer $A" -H 'Content-Type: application/json' -d "{\"userId\":\"$BID\"}" | jq -r .conversation._id)

curl -s $API/conversations -H "Authorization: Bearer $A" | jq '.conversations[0] | {isStarred, unreadCount}'
curl -s "$API/messages/$CID?limit=30" -H "Authorization: Bearer $A" | jq '{count: (.messages|length), hasMore}'
curl -s -X POST $API/conversations/$CID/star -H "Authorization: Bearer $A" | jq
```

### "Part 2 is done" checklist

- [ ] P3's `server/src/socket/` merged, then `npm run smoke:all` shows 0 failed
- [ ] P3's own `npm run smoke:realtime` passes ([A] and [B] checks)
- [ ] **Mandatory checkpoint** (two browsers): register, search, open chat, messages appear instantly both ways, still there after refresh
- [ ] `PROJECT_INSTRUCTIONS.md` section 4 updated with `server/src/services/`

---

## 7. Hand-off notes for P2 (frontend)

- **Sidebar:** `GET /conversations`. For a private chat, the other person is `participants.find(p => p._id !== me._id)`. Show `unreadCount` as a badge, `lastMessage.text` as the preview and `isStarred` for the Starred section.
- **Start a chat:** `POST /conversations { userId }`, then open `response.conversation`. If `created` is true, add it to the sidebar unless the `conversation_created` socket event already did (dedupe by `_id`).
- **Open a chat:** `GET /messages/:id?limit=30` and render as returned. On scroll to top, when `hasMore` is true, request `?before=<messages[0].createdAt>` and **prepend**.
- **Star toggle:** `POST` or `DELETE /conversations/:id/star`. Use the returned `isStarred`.
- **Pin:** `POST` or `DELETE /messages/:cid/pin/:mid`. Update the pinned bar from the socket events `message_pinned` and `message_unpinned`, so the person who clicked and everyone else update the same way.
- **Errors:** show `err.response.data.error`. A 404 on a chat means "not found or no access". Send the user back to the list.

---

## 8. Decisions worth knowing

| Decision | Why |
|---|---|
| `services/` folder | Data logic in one place; routes stay thin. `createMessage` is the single validated way to save a message, whoever calls it. |
| Unread count via one aggregation | Constant 3 queries for the chat list instead of 1 + N. |
| Pagination by `before` date, sorted by `createdAt` then `_id` | Matches the contract. The `_id` tie-break keeps the order stable when two messages share a millisecond. |
| `markRead` also marks delivered | A read message was obviously delivered, so ticks can't show "read" without "delivered". |
| P1 calls P3's `notify.js` instead of emitting | One place owns rooms and event shapes. P1 never touches `io`, as P3 requested. |
| Pin/unpin return `{ message }` | The contract didn't specify a body. Returning the updated message lets the clicking client update immediately. |
| 201 vs 200 on `POST /conversations` | 201 when the chat was created, 200 when it already existed. `created` in the body says the same thing. |

## 9. Next: Part 3

Phase 3 adds routes for groups (`POST /conversations/group`, members, admin), uploads (`POST /users/profile-picture`, `POST /messages/:cid/media`) and the AI endpoint. They plug into the marked spots in `routes/conversations.js`, `routes/messages.js` and `app.js`. The services pattern above is reused, and nothing in Parts 1–2 needs to change.
