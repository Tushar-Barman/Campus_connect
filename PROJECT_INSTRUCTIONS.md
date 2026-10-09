# CampusConnect — Common Project Instructions

Shared rules for all three developers and for any AI assistant working on this repo.
If code and this file disagree, fix one of them in the same commit and tell the team.

---

## 1. What we are building

A real-time campus chat app for the **First Commit** hackathon (KamandPrompt, IIT Mandi, 24 hours).

**Judging weights:** Core functionality 20% · Technical implementation 15% · Feature depth 15% · Live demo 25% · Pitch 25%.
Half the marks come from a demo that works smoothly. **Reliability beats feature count.**

**Mandatory checkpoint (must work before anything else):**
Two users can register/log in, find each other, start a private chat, exchange messages instantly, and still see the messages after a page refresh.

**Build order (never skip ahead while a lower number is broken):**
1. Auth, user search, private chat, real-time text, persistence
2. Online/offline + last seen, typing, delivered/read receipts, starred chats, pinned messages, polished UI
3. Groups, profile pictures, voice notes
4. AI Chat Memory (Gemini)
5. Optional: image/file sharing, reactions, message search, notifications

**Cut order if time runs short:** message search → reactions → file/image sharing → notifications.

---

## 2. Team ownership

| Person | Owns | Folder focus |
|---|---|---|
| **P1 – Backend & Data** | Auth, models, REST API, authorization, star/pin, AI endpoint, validation | `server/src/{models,routes,middleware,utils,config}` |
| **P2 – Frontend & UI** | Design system, all pages and components, responsive layout, empty/loading/error states | `client/src/{pages,components,styles}` |
| **P3 – Real-time & Integration** | Socket.IO server and client, presence, typing, receipts, groups real-time, voice notes, Gemini prompt | `server/src/socket`, `client/src/lib/socket.js`, `client/src/hooks` |

Shared: integration, multi-user testing, deployment, demo prep, bug fixing.
**Anyone may fix a bug anywhere, but changes to the contracts in sections 5–7 need a heads-up in the team chat first.**

---

## 3. Tech stack (fixed — do not swap without team agreement)

- **Client:** React 18 + Vite, Tailwind CSS v4, lucide-react icons, socket.io-client, axios, react-router-dom
- **Server:** Node.js ≥ 18, Express, Socket.IO, Mongoose, bcryptjs, jsonwebtoken, helmet, cors, express-rate-limit
- **Database:** MongoDB Atlas
- **AI:** Gemini API (server-side only)
- **Media:** Cloudinary (server-side upload only)
- **Deploy:** client on Vercel, server on Render (Socket.IO cannot run on Vercel)
- **Module system:** ES modules everywhere (`import`/`export`, `"type": "module"`)

---

## 4. Repository layout

```
campusconnect/
├── PROJECT_INSTRUCTIONS.md      ← this file
├── README.md                    ← setup/run guide (required by the hackathon)
├── server/
│   ├── .env.example             ← committed; .env is NOT
│   └── src/
│       ├── index.js             ← Express + Socket.IO bootstrap
│       ├── config/              ← env.js (validates env vars), db.js
│       ├── models/              ← User, Conversation, Message
│       ├── middleware/          ← auth.js (requireAuth), membership.js
│       ├── routes/              ← auth, users, conversations, messages, ai
│       ├── socket/              ← all Socket.IO handlers
│       └── utils/               ← http.js (HttpError, asyncHandler), auth.js (JWT)
└── client/
    ├── .env.example
    └── src/
        ├── main.jsx, App.jsx
        ├── lib/                 ← api.js (axios), socket.js, format.js
        ├── context/             ← AuthContext
        ├── hooks/
        ├── pages/               ← Login, Register, Chat
        └── components/
```

---

## 5. Data model (source of truth: `server/src/models`)

**User** — `name, email (unique, lowercase), passwordHash (select:false), bio, profilePicture, status ('online'|'offline'), lastSeen, starredConversations[ConversationId], timestamps`

**Conversation** — `type ('private'|'group'), participants[UserId], privateKey, groupName, groupAdmin, groupPicture, lastMessage, lastMessageAt, timestamps`
- `privateKey` = the two user ids sorted and joined with `_`; a unique index prevents duplicate private chats.

**Message** — `conversationId, senderId, messageType ('text'|'voice'|'image'|'file'), text, mediaUrl, mediaType, duration, deliveredTo[{user, at}], readBy[{user, at}], isPinned, pinnedAt, pinnedBy, timestamps`
- Receipts are **arrays**, so the same logic works for private chats and groups.

Key decisions (differ from the original workflow doc on purpose):
- Starring lives on the **User** (`starredConversations`), so it is per-user.
- `deliveredAt`/`readAt` were replaced by `deliveredTo`/`readBy` arrays.

**Additions (Round 2).** Every new field has a default, so documents created before Round 2 stay valid without a migration.

**User (Round 2)**
- `campus`: a campus id from `server/src/config/campuses.js`, default `''`. Public: it's part of `PUBLIC_USER_FIELDS`.
- `blockedUsers[UserId]`: `select:false`, default `[]`. Never sent to clients.
- `settings`: `{ readReceipts (true), theme ('light'|'dark'|'system', 'system'), accent (preset id, 'teal'), density ('comfortable'|'compact'), fontScale ('sm'|'md'|'lg'), bubbleStyle ('rounded'|'soft'|'sharp') }`. `select:false`, and only the owner sees it: it's returned by register, login and `/auth/me` (the latter via `toOwnUser()`), and by the settings route.
- `chatBackgrounds`: a map `{ [conversationId]: background }`, `select:false`, per user.

**Message (Round 2)**
- `messageType` gains `'location'` and `'location_request'`.
- New fields:
  - files: `fileName, fileSize, mimeType`
  - location: `location { lat, lng, accuracy, label, onCampus, campus }`
  - location requests: `requestStatus ('pending'|'accepted'|'declined'|'expired'), respondedWith`
  - replies, edits, deletes: `replyTo (MessageId), mentions[UserId], editedAt, deletedAt` (deleted for everyone), `hiddenFor[UserId]` (deleted for me)
- **One serializer.** Every message that reaches a client goes through `serializeMessageFor(message, viewerId, ctx)` in `server/src/services/messages.js`:
  - **Deleted messages** become a tombstone `{ _id, conversationId, senderId, createdAt, deletedAt, messageType }`.
  - **Hidden messages:** messages hidden for the viewer are dropped, and `hiddenFor` itself is never sent.
  - **Replies:** `replyTo` becomes `{ _id, senderId: { _id, name }, messageType, text (≤ 120 chars), fileName?, deleted }`, or `null` if the original no longer exists.
  - **Location requests:** a pending `location_request` older than 10 minutes reads as `'expired'`.
  - **Receipt privacy** (Round 2 Phases 6 and 9) is applied here.
- The sidebar's `lastMessage` goes through the same serializer, without receipts.

---

## 6. REST API contract

Base URL: `${VITE_API_URL}/api`. All routes except register/login need `Authorization: Bearer <token>`.

**Errors** always look like `{ "error": "Human-readable message" }` with a proper status code (400 validation, 401 not logged in, 404 not found *or not a member*, 413 too large, 429 rate limited, 500 server).

### Auth
| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` | `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| POST | `/auth/logout` | — | `{ ok: true }` (client deletes the token) |
| GET | `/auth/me` | — | `{ user }` |

Password: minimum 8 characters. Email normalised to lowercase.

### Users
| Method | Path | Notes |
|---|---|---|
| GET | `/users/search?q=` | Name or email match, excludes yourself, max 20 → `{ users }` |
| GET | `/users/:id` | Public profile → `{ user }` |
| PUT | `/users/profile` | `{ name?, bio? }` → `{ user }` |
| POST | `/users/profile-picture` | multipart field `picture` (Phase 3) |
| DELETE | `/users/profile-picture` | Phase 3 |

### Conversations
| Method | Path | Notes |
|---|---|---|
| GET | `/conversations` | Your chats, newest first. Each item has populated `participants`, `lastMessage`, plus `isStarred` and `unreadCount` → `{ conversations }` |
| POST | `/conversations` | `{ userId }` → find-or-create private chat → `{ conversation, created }` |
| GET | `/conversations/:id` | → `{ conversation }` |
| POST / DELETE | `/conversations/:id/star` | Star / unstar for the current user only |
| POST | `/conversations/group` | `{ name, memberIds[] }` (Phase 3) |
| PUT | `/conversations/:id` | `{ groupName?, groupPicture? }` admin only (Phase 3) |
| POST | `/conversations/:id/members` | `{ userId }` admin only (Phase 3) |
| DELETE | `/conversations/:id/members/:userId` | admin only, or yourself to leave (Phase 3) |

### Messages
| Method | Path | Notes |
|---|---|---|
| GET | `/messages/:conversationId?before=<ISO date>&limit=30` | Returned **oldest → newest**; `hasMore` flag for pagination → `{ messages, hasMore }` |
| GET | `/messages/:conversationId/pinned` | → `{ messages }` |
| POST | `/messages/:conversationId/pin/:messageId` | Pin |
| DELETE | `/messages/:conversationId/pin/:messageId` | Unpin |
| POST | `/messages/:conversationId/media` | multipart `file` + `duration`; creates the message and broadcasts it (Phase 3) |

### AI
| POST | `/ai/summarize/:conversationId` | → `{ summary, keyDecisions[], actionItems[], importantDates[] }` (Phase 4) |

**Text messages are sent over Socket.IO, not REST.** Media is uploaded over REST, then the server broadcasts the resulting message over Socket.IO.

---

## 7. Socket.IO contract

**Connecting:** `io(VITE_API_URL, { auth: { token } })`. The server verifies the JWT in `io.use()` and sets `socket.userId`.
**Never trust a user id sent by the client** — always use `socket.userId`.

**Rooms:** every socket joins `user:<userId>`. The server delivers events by emitting to each participant's user room, so newly created chats and groups work without anyone "joining" first. (This replaces the `join_conversation` / `leave_conversation` events from the original plan.)

**Acks:** client→server events that change data take a callback: `socket.emit('send_message', payload, (res) => …)` where `res` is `{ ok: true, ... }` or `{ ok: false, error }`.

### Client → Server
| Event | Payload | Ack |
|---|---|---|
| `send_message` | `{ conversationId, text, clientId }` | `{ ok, message }` |
| `typing` | `{ conversationId }` | — |
| `stop_typing` | `{ conversationId }` | — |
| `message_delivered` | `{ messageId }` | — |
| `message_read` | `{ conversationId }` (marks everything in it as read) | — |

### Server → Client
| Event | Payload |
|---|---|
| `new_message` | `{ message }` (sender populated: `_id, name, profilePicture`; includes the sender's `clientId` echo) |
| `conversation_created` | `{ conversation }` (new private chat or group, sent to all members) |
| `typing` / `stop_typing` | `{ conversationId, userId, name }` |
| `user_online` | `{ userId }` |
| `user_offline` | `{ userId, lastSeen }` |
| `message_delivered` | `{ conversationId, messageIds[], userId, at }` |
| `message_read` | `{ conversationId, userId, at }` (all messages up to `at`) |
| `message_pinned` | `{ message }` |
| `message_unpinned` | `{ conversationId, messageId }` |
| `group_member_added` / `group_member_removed` | `{ conversationId, userId }` (Phase 3) |
| `message_updated` | `{ message }` (Round 2). An existing message changed: it was edited, deleted for everyone, or a location request was answered. The payload is serialized **per viewer**, so it's emitted to each participant separately. Replace the message by `_id`, and update the sidebar preview if it's the chat's `lastMessage`. For "delete for me", only the user's own tabs get `{ message: { _id, conversationId, hidden: true } }`: remove it from the list. |

**Client rules:**
- Send optimistically: show the message at once with a temporary `clientId` and status `sending`; replace it when the ack or `new_message` arrives (match on `clientId` or `_id`, never show duplicates).
- Emit `typing` at most once per 2 s while typing; emit `stop_typing` after 2 s idle or on send.
- On receiving `new_message` from someone else, emit `message_delivered`; if that chat is open and the tab is visible, also emit `message_read`.
- A user is online if they have **at least one** connected socket (multiple tabs are normal).

**Receipt display (own messages):** one tick = sent · two grey ticks = delivered to all others · two coloured ticks = read by all others.

---

## 8. Security rules (non-negotiable)

1. Every route and socket handler that touches a conversation calls `loadConversationForUser(conversationId, userId)`. No exceptions.
2. Return **404, not 403**, when a user isn't a member — don't reveal that a conversation exists.
3. Never send `passwordHash`, other users' `starredConversations`, or JWT secrets to the client. Use `PUBLIC_USER_FIELDS` when populating users.
4. Passwords: bcrypt, cost 10–12. Rate-limit `/auth/*`.
5. Validate every input on the server: ObjectIds via `isValidId`, string lengths, message text 1–4000 chars after trimming, escape user input before using it in a regex.
6. Uploads: whitelist MIME types (audio/webm, audio/ogg, audio/mpeg, audio/mp4, image/jpeg, image/png, image/webp), size limits (voice ≤ 5 MB, images ≤ 5 MB), never trust the file extension, upload to Cloudinary from the server only.
7. All secrets live in `server/.env`. `.env` is gitignored; `.env.example` is committed with placeholders. The client never holds an API key (Gemini or Cloudinary).
8. CORS and Socket.IO only accept origins listed in `CLIENT_URL`.

---

## 9. Code conventions

**General**
- ES modules, `async/await`, no callbacks-style code.
- Small files, one responsibility each. Name files by what they export (`User.js`, `MessageBubble.jsx`).
- No commented-out code or leftover `console.log` in commits (server startup logs are fine).

**Server**
- Wrap async route handlers in `asyncHandler`. Throw `new HttpError(status, message)`; the central error middleware formats the response.
- Use `.lean()` for read-only queries that go straight to the client.
- Don't put business logic in socket handlers that REST also needs — put it in a shared function.

**Client**
- Functional components and hooks only.
- All HTTP goes through `lib/api.js` (attaches the token, handles 401 by logging out). All socket access goes through `lib/socket.js`.
- Every screen handles three states: loading, empty, error.
- Tailwind only — no separate CSS files except the design tokens in `index.css`. Use the shared tokens (colors, radius, shadows), not ad-hoc hex values.
- Icons from `lucide-react` only. Every icon-only button has an `aria-label`.
- Must look right at 375 px (phone), 768 px (tablet) and 1280 px+ (desktop). On mobile, the sidebar and chat are separate screens.

**Naming**
- Socket events: `snake_case` (as in section 7). REST paths: `kebab-case`. JS: `camelCase`; components `PascalCase`.

---

## 10. Environment variables

**server/.env**
```
PORT=5000
MONGODB_URI=...
JWT_SECRET=...            # long random string
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173   # comma-separate multiple origins
GEMINI_API_KEY=...        # Phase 4
CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...   # Phase 3
```

**client/.env**
```
VITE_API_URL=http://localhost:5000
```

---

## 11. Git workflow

- Repo stays **private** until submission (required by the rules).
- `main` must always run. Work on short branches: `p1/auth-routes`, `p2/chat-ui`, `p3/receipts`.
- Pull and merge `main` into your branch often; merge back at least every 2 hours.
- Commit messages: `feat: …`, `fix: …`, `refactor: …`, `docs: …`, `chore: …`.
- Before merging: server starts with no errors, client builds (`npm run build`), and the checkpoint flow in section 1 still works with two browsers (one normal, one incognito).

---

## 12. Testing checklist (run after every merge)

- [ ] Register two users (use a normal and an incognito window)
- [ ] User A searches for B and starts a chat; repeating it opens the same chat
- [ ] Messages appear instantly both ways; refreshing keeps them in order
- [ ] A user cannot load a conversation they're not in (try editing the id in a request → 404)
- [ ] Typing indicator shows and clears
- [ ] Closing B's tab shows B offline with a last-seen time on A's side
- [ ] Ticks go sent → delivered → read
- [ ] Star/unstar only changes your own list
- [ ] Works on a phone-width screen

---

## 13. Instructions for AI assistants working on this repo

- Read this file first. Follow the contracts in sections 5–7 exactly; don't rename events, routes or fields.
- Respect the build order in section 1. Don't add Phase 3–5 features while Phase 1–2 is broken.
- Prefer small, complete, working changes over large partial ones. Every change should leave the app runnable.
- Never write secrets into code; reference `process.env` / `import.meta.env` and update `.env.example`.
- Apply the security rules in section 8 to every new route and socket handler.
- When a contract genuinely needs to change, update this file in the same change and say so clearly.
