# CampusConnect Server: Part 1 (Foundation & Auth)

This is the backend foundation that every other part of CampusConnect builds on. It contains:

- the server bootstrap (Express + P3's Socket.IO server on one port)
- configuration and the MongoDB connection
- all three data models
- registration, login, logout and session
- authentication and authorization middleware
- a consistent error format
- a self-test script that proves all of the above works

> Owner: **P1 (Backend & Data)**. Contracts follow `PROJECT_INSTRUCTIONS.md` sections 5–8 exactly.
>
> **Works together with P3's code.** `server/src/socket/`, `services/media.js` and `services/aiMemory.js` are P3's and are **not** in P1's deliverable. What P3's code imports from P1 is listed in section 6 and in **`INTEGRATION-P3.md`**.

---

## 1. Quick start

```bash
cd server
npm install
cp .env.example .env        # then fill in MONGODB_URI and JWT_SECRET
npm run dev                 # starts on http://localhost:5000, restarts on file changes
```

In a second terminal:

```bash
npm run smoke               # runs ~40 checks against the running server + your DB
```

You should see `🎉 N passed, 0 failed`. If anything fails, the line shows the actual status and response.

### MongoDB Atlas setup (5 minutes)

1. Create a free M0 cluster at cloud.mongodb.com.
2. **Database Access** → add a user with a password.
3. **Network Access** → add `0.0.0.0/0` (needed for Render; fine for a hackathon).
4. **Connect → Drivers** → copy the URI into `MONGODB_URI`. Put `campusconnect` as the database name before the `?`.

To generate a JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 2. What's in this folder

```
server/
├── .env.example            Template for secrets (committed). Real .env is gitignored.
├── package.json            ES modules; scripts: dev, start, smoke
├── scripts/
│   └── smoke.js            End-to-end self-test for Part 1
└── src/
    ├── index.js            Entry point: DB connect → HTTP server → initSocket (P3) → listen
    ├── app.js              Express app: security middleware, routes, error handling
    ├── config/
    │   ├── env.js          Loads .env, fails fast if required vars are missing
    │   └── db.js           connectDB / disconnectDB / isDbConnected
    ├── models/
    │   ├── User.js         User schema + PUBLIC_USER_FIELDS + toPublicUser()
    │   ├── Conversation.js Conversation schema + makePrivateKey() + duplicate-chat index
    │   └── Message.js      Message schema with receipt arrays and pin fields
    ├── middleware/
    │   ├── auth.js         requireAuth: Bearer token → req.userId and req.user._id
    │   ├── membership.js   loadConversationForUser() + requireMembership()
    │   ├── rateLimit.js    authLimiter for register/login
    │   └── error.js        notFound + central errorHandler → { error }
    ├── routes/
    │   └── auth.js         POST register, POST login, POST logout, GET me
    ├── socket/             P3's folder (not shipped by P1): initSocket, notify.js, emit.js, deps.js
    └── utils/
        ├── http.js         HttpError, asyncHandler
        ├── auth.js         signToken, verifyToken (returns the payload with userId)
        └── validate.js     isValidId, escapeRegex, requireString/Email/Password
```

---

## 3. How a request flows

```
Client request
   │
   ▼
helmet           security headers (nosniff, no X-Powered-By, etc.)
   │
   ▼
cors             only origins listed in CLIENT_URL; others get 403
   │
   ▼
express.json     parses body, max 100 KB; bad JSON → 400
   │
   ▼
route            e.g. POST /api/auth/login
   │  ├─ authLimiter        (register/login only) too many tries → 429
   │  ├─ requireAuth        (protected routes) token → req.userId / req.user._id, else 401
   │  ├─ validate input     requireEmail/requirePassword/... else 400
   │  └─ model / service    reads or writes MongoDB
   │
   ▼
response         JSON on success

On any thrown error:
errorHandler  → HttpError(status, msg) becomes { error: msg } with that status
              → Mongoose validation → 400, duplicate key → 409
              → anything unexpected → logged, generic 500
```

Every route is wrapped in `asyncHandler`, so a thrown `HttpError` (or a rejected promise) always reaches `errorHandler`. **Clients only ever see `{ "error": "..." }`.** Stack traces and internals never leak.

---

## 4. How each piece works

### 4.1 Configuration (`config/env.js`)

- Loads `.env` with dotenv.
- If `MONGODB_URI` or `JWT_SECRET` is missing, the server prints which one and exits **before** starting. You find out in one second, not as a confusing crash later.
- `JWT_SECRET` shorter than 32 characters is a warning in development and a hard failure in production.
- `CLIENT_URL` can hold several origins separated by commas (for example `http://localhost:5173,https://campusconnect.vercel.app`). Trailing slashes are stripped.
- Everything else imports the frozen `env` object, never `process.env` directly.

### 4.2 Data models (`models/`)

Defined completely now, including Phase 3 fields, so nobody has to migrate data mid-hackathon.

**User**

| Field | Notes |
|---|---|
| `name` | 1–50 chars, trimmed |
| `email` | unique index, stored lowercase |
| `passwordHash` | bcrypt hash, `select: false`, so it is **never returned unless explicitly asked for** |
| `bio`, `profilePicture` | default `''` |
| `status`, `lastSeen` | presence; updated by P3's socket code |
| `starredConversations` | per-user favourites, `select: false`, and stripped in `toJSON` |

`PUBLIC_USER_FIELDS` is the one list of safe fields. Always use it with `.select()` and `.populate()` (security rule 3).

**Conversation**

- `type` is `private` or `group`. `participants` must have at least 2 users.
- For private chats, a hook sets `privateKey = sortedIdA + "_" + sortedIdB` before saving. A **unique partial index** on `privateKey` means two private chats between the same pair cannot exist, even if two requests arrive at the same millisecond. A private chat with anything other than exactly 2 participants is rejected.
- Groups have no `privateKey`, so the index ignores them.
- The index `{ participants, lastMessageAt: -1 }` makes "my chats, newest first" fast.

**Message**

- `deliveredTo` and `readBy` are **arrays of `{ user, at }`**, so receipts work the same way for 2 people or 20.
- Text messages must have text (≤ 4000 chars). Media messages must have a `mediaUrl`.
- The index `{ conversationId, createdAt: -1 }` powers history and pagination. `{ conversationId, isPinned }` powers the pinned list.

### 4.3 Authentication (`routes/auth.js`, `utils/auth.js`)

| Endpoint | What happens |
|---|---|
| `POST /api/auth/register` | Validates name, email and password (8–72 chars). Rejects an existing email with 409. Hashes with bcrypt (cost 10), saves, returns `201 { token, user }`. A simultaneous duplicate is also caught (409, via the unique index). |
| `POST /api/auth/login` | Looks up the lowercased email and compares with bcrypt. Wrong password and unknown email return the **same 401 message**. Both cases also take the **same time** (compared against a dummy hash), so attackers can't discover which emails are registered. |
| `POST /api/auth/logout` | Returns `{ ok: true }`. JWTs are stateless, so the client deletes its token. "Offline" status comes from the socket disconnect (P3). |
| `GET /api/auth/me` | Returns the current user with public fields only. The frontend calls this on page load to restore the session. |

**Tokens:** a JWT signed with HS256 and `JWT_SECRET`, holding the user id in both `userId` and `sub`, valid for `JWT_EXPIRES_IN` (7 days by default). `verifyToken(token)` pins the algorithm, checks the id is a real ObjectId, and **returns the decoded payload with `payload.userId`**. That's what P3's socket auth reads. It throws for invalid or expired tokens.

**Brute-force protection:** register and login are limited per IP to `AUTH_RATE_LIMIT` requests per 15 minutes (default 20 in production, 100 in development). Over the limit returns `429 { error }`. `trust proxy` is set, so this works correctly behind Render's proxy.

**Input type safety:** every field is type-checked as a string before use. A payload like `{ "email": { "$ne": null } }` (a NoSQL injection attempt) is rejected with 400 and never reaches MongoDB.

### 4.4 `requireAuth` (`middleware/auth.js`)

1. Reads the `Authorization: Bearer <token>` header. If it's missing, the request gets **401**.
2. Verifies the signature and expiry. If either check fails, the request gets **401** "Session expired".
3. Checks that the user still exists, so a deleted account's token stops working.
4. Sets `req.userId` and `req.user = { _id }` (the same id; P3's route snippets use `req.user._id`). **Routes must use these and never a user id from the body.**

### 4.5 `loadConversationForUser` (`middleware/membership.js`)

This is the single authorization gate for conversations (security rules 1 and 2).

```js
const conversation = await loadConversationForUser(conversationId, userId);
```

- It queries `{ _id: conversationId, participants: userId }`, so it finds the chat **only if you are in it**.
- A malformed id, a chat that doesn't exist and a chat you're not in **all** throw `HttpError(404, 'Conversation not found')`. An attacker can't tell whether a chat exists.
- `requireMembership('conversationId')` is the route-middleware form. It puts the result on `req.conversation`.
- Pass `{ lean: true }` for read-only use.

### 4.6 How the server starts (`index.js`) and where Socket.IO comes from

```
config/env.js loads .env  →  connectDB()  →  http.createServer(app)  →  initSocket(httpServer)  →  listen
```

- **The real-time layer is P3's** (`server/src/socket/`). P1 only calls `initSocket(httpServer)` once and listens on the HTTP server (not `app.listen`), so REST and WebSocket share one port.
- The DB connects **before** `initSocket`, because P3 marks every user offline on boot.
- Socket auth is P3's code calling P1's `verifyToken`. It reads `payload.userId`.
- **Run a single server instance** on Render: online status is kept in memory.

### 4.7 Errors (`middleware/error.js`, `utils/http.js`)

| Situation | Status |
|---|---|
| Validation failure, bad JSON | 400 |
| Not logged in, bad or expired token | 401 |
| Origin not in `CLIENT_URL` | 403 |
| Unknown route, or conversation not found / not a member | 404 |
| Duplicate (e.g. email) | 409 |
| Body > 100 KB | 413 |
| Too many auth attempts | 429 |
| Unexpected | 500 (logged on the server; generic message to client) |

---

## 5. How to verify it works

### Automatic: `npm run smoke`

With the server running, this script creates three throwaway users, checks everything below, then deletes them.

| Area | What is checked |
|---|---|
| Server | `/api/health` is up with DB connected; helmet headers present; `X-Powered-By` hidden |
| Register | 201 + token; email lowercased; no `passwordHash` or `starredConversations` leaked; duplicate → 409; short password, bad email, blank name, object-as-email → 400 |
| Login | works with any case and extra spaces; wrong password and unknown email → identical 401; NoSQL-injection body → 400 |
| Session | `/me` returns own user; no token, forged token, tampered signature → 401; logout → `{ ok: true }` |
| Errors & CORS | malformed JSON → 400 `{ error }`; unknown route → 404 `{ error }`; foreign origin → 403; allowed origin gets the CORS header |
| Socket.IO | valid token connects; no token and forged token are rejected |
| Database | private chat gets the right `privateKey`; a duplicate (B, A) chat is blocked by the unique index; a 1-person private chat is rejected; a member can load the chat; an outsider, a malformed id and an object id all get **404** |
| Passwords | stored as a bcrypt `$2…$10$` hash, never plaintext |

The rate limit is deliberately **not** tested automatically, because that would lock your IP out of logging in for 15 minutes. To check it by hand, set `AUTH_RATE_LIMIT=3`, restart, and send 4 bad logins. The 4th returns 429.

To run against a deployed server:

```bash
SMOKE_API_URL=https://your-api.onrender.com npm run smoke
```

### Manual: curl

```bash
API=http://localhost:5000/api
curl -s -X POST $API/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Alice","email":"alice@test.com","password":"password123"}'
# → {"token":"eyJ...","user":{"_id":"...","name":"Alice","email":"alice@test.com",...}}

TOKEN=<paste token>
curl -s $API/auth/me -H "Authorization: Bearer $TOKEN"     # → {"user":{...}}
curl -s $API/auth/me                                       # → {"error":"Not logged in"} (401)
```

### "Part 1 is done" checklist

- [ ] `npm run dev` prints `MongoDB connected` and `CampusConnect API on http://localhost:5000`
- [ ] `npm run smoke` → 0 failed
- [ ] Removing `JWT_SECRET` from `.env` makes the server refuse to start with a clear message
- [ ] `git status` does not show `.env`

---

## 6. Hand-off notes for teammates

**P2 (frontend)**

- Register and login both return `{ token, user }`. Store the token (localStorage) and send it as `Authorization: Bearer <token>`.
- On app load, call `GET /api/auth/me`. A 401 means the user should be sent to the login page.
- Display `response.data.error` from any failed request. It is always a human-readable string.

**P3 (real-time)**: everything your `socket/deps.js` imports from Part 1 exists with the agreed behaviour:

| Import | From | Behaviour |
|---|---|---|
| `verifyToken(token)` | `utils/auth.js` | Returns the decoded payload with `userId` (string). Throws if invalid or expired. |
| `HttpError` | `utils/http.js` | `.status`, `.message`. Central middleware replies `{ error }`. |
| `loadConversationForUser(id, userId)` | `middleware/membership.js` | Returns the conversation (`_id`, `participants`, `lastMessage`). `HttpError(404)` for not found, not a member, or malformed id. |
| `PUBLIC_USER_FIELDS` | `models/User.js` (named) | `'_id name email bio profilePicture status lastSeen'`. Never `passwordHash` or `starredConversations`. |
| `User`, `Conversation`, `Message` | `models/*.js` (**default** and named) | Mongoose models |

`createMessage` comes in Part 2 (see `README-PART2.md`). Full list: `INTEGRATION-P3.md`.

---

## 7. Decisions worth knowing

| Decision | Why |
|---|---|
| `starredConversations` is `select: false` | Rule 3 says it must never leak to other users. It is only loaded when building your own chat list (Part 2). |
| `app.js` separate from `index.js` | Keeps the Express setup readable and independent of startup and shutdown. |
| Models exported both as default and named | P3's `deps.js` uses default imports; P1's own code uses named ones. Both point to the same model. |
| Token carries `userId` and `sub` | P3 reads `userId`; `sub` is the JWT standard. Older tokens with only `sub` still work. |
| Password max 72 characters | bcrypt silently ignores bytes beyond 72, so longer passwords would give false security. |
| `dotenv` dependency | Loads `.env` on every Node version ≥ 18. It isn't on the fixed stack list; mentioned to the team. |
| `/api/health` | Lets Render health checks and the smoke test confirm the server and DB are up. |

## 8. Next: Part 2

Part 2 (chat APIs) is documented in **`README-PART2.md`** and Part 3 (uploads, groups, AI Chat Memory) in **`README-PART3.md`**. Run every test suite with `npm run smoke:all`.
