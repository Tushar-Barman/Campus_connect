# CampusConnect Server: Part 3 (Pictures, Groups, Media & AI wiring)

Part 3 adds the Phase 3–4 backend. Following P3's `CAUTION_AND_DIRECTION.md`, the work is split like this:

| Feature | Built by | What P1 provides |
|---|---|---|
| **Profile pictures** | P1 | Endpoints, file verification, Cloudinary storage |
| **Group pictures** | P1 | Same pipeline, inside `PUT /conversations/:id` |
| **Groups** (create, rename, members, leave, admin hand-over) | P1 | Endpoints and rules. Live events go through P3's `notify.js`. |
| **Voice notes and image messages** | **P3** (`services/media.js`) | The route, auth and upload rate limit |
| **AI Chat Memory** | **P3** (`services/aiMemory.js`) | The route, the membership check and the AI rate limit |

> Builds on Parts 1–2 (`README.md`, `README-PART2.md`). How P1 and P3's code fit together is in `INTEGRATION-P3.md`.

---

## 1. Run and verify

```bash
cd server
npm install                 # now includes P3's deps: multer, cloudinary, @google/genai
# .env (both optional):
#   CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
#   GEMINI_API_KEY and GEMINI_MODEL=gemini-3.5-flash-lite
npm run dev                 # terminal 1
npm run smoke:all           # terminal 2: Parts 1–3 (P1)
npm run smoke:realtime      # P3's own checks
```

`GET /api/health` reports what's enabled: `{ ok, db, features: { uploads, ai } }`. Without Cloudinary, uploads answer **503**. Without a Gemini key, Chat Memory answers **503**. Everything else keeps working either way.

**Keep `GEMINI_MODEL` set.** P3's code defaults to `gemini-2.5-flash`. Google's model page currently says 2.5 models are only served to accounts that already used them, and recommends the 3.x family for new projects. A fresh API key may therefore get 404 on the default. `.env.example` now sets `gemini-3.5-flash-lite`.

---

## 2. What's in this part

```
server/src/
├── config/env.js              (changed) cloudinary config, aiEnabled; auth limit 50 in production
├── middleware/rateLimit.js    (changed) + uploadLimiter (30 / 10 min), aiLimiter (10 / min), both per user
├── utils/
│   ├── fileType.js            NEW: identifies images/audio by magic bytes (whitelist)
│   └── multipart.js           NEW: readUpload(): parse, stop at 5 MB while streaming, verify type
├── services/
│   ├── storage.js             NEW: Cloudinary upload/delete (signed REST) for profile + group pictures
│   └── groups.js              NEW: createGroup, updateGroup, addMember, removeMember
└── routes/
    ├── users.js               (changed) + POST/DELETE /profile-picture
    ├── conversations.js       (changed) + group routes
    ├── messages.js            (changed) + POST /:conversationId/media → P3's media.js
    └── ai.js                  NEW: POST /summarize/:conversationId → P3's aiMemory.js
server/scripts/smoke-part3.js  NEW
```

**Not in P1's deliverable** (P3's, imported as agreed): `socket/notify.js`, `socket/emit.js`, `services/media.js`, `services/aiMemory.js`.

---

## 3. Profile and group pictures (P1)

### 3.1 Endpoints

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/users/profile-picture` | multipart `picture` (jpeg/png/webp, ≤ 5 MB) | `{ user }` |
| `DELETE /api/users/profile-picture` | | `{ user }` with `profilePicture: ""` |
| `PUT /api/conversations/:id` (admin) | multipart `groupName?` + `picture`, **or** JSON `{ groupName?, groupPicture: "" }` | `{ conversation }` |

### 3.2 How an upload is processed

```
requireAuth → uploadLimiter (30 / 10 min per user)
   → (group picture) admin check first, so outsiders can't make us read anything
   → readUpload()
        ├─ Content-Length > 5 MB?  → 413 immediately
        ├─ byte counter while streaming → 413 the moment it passes 5 MB
        │    (also stops chunked uploads that never send a length)
        ├─ parse multipart (Node's built-in Response.formData)
        └─ sniffMimeType(first bytes) → 400 unless jpeg / png / webp
   → uploadBuffer() → Cloudinary (signed; secret never leaves the server)  503 if not configured
   → save URL → respond
```

**Magic bytes, not names.** The browser's `Content-Type` and the file name are chosen by the client, so they're ignored (security rule 6). `utils/fileType.js` reads the first bytes:

| Starts with | Detected as |
|---|---|
| `FF D8 FF` | image/jpeg |
| `89 50 4E 47 …` | image/png |
| `RIFF … WEBP` | image/webp |
| `1A 45 DF A3` + "webm" / `OggS` / `…ftyp` / `ID3` or MPEG sync | audio types (recognised but not accepted for pictures) |

HTML, SVG (which can carry scripts), PDF, executables, or a text file renamed `.png` all get 400.

**Upload and replace are the same call.** Each picture is stored under a fixed id: `campusconnect/avatars/user_<id>` or `campusconnect/groups/group_<id>`. A new upload overwrites the old file instead of leaving orphans, and the returned URL has a new version number, so browsers never show a stale cached picture. Cloudinary resizes on upload: avatars to 512×512, face-centred.

**Two Cloudinary clients, for now.** P1's pictures use `services/storage.js` (signed REST). P3's media uses the Cloudinary SDK. Both read the same three env vars and work independently. They can be merged after the hackathon.

---

## 4. Voice notes and images (P3's `media.js`, wired by P1)

`POST /api/messages/:conversationId/media`, multipart `file` + `duration` → **201** `{ message }`

```js
router.post('/:conversationId/media', uploadLimiter, mediaUpload, asyncHandler(async (req, res) => {
  const message = await createMediaMessage({
    conversationId: req.params.conversationId,
    userId: req.user._id,               // requireAuth sets this
    file: req.file,
    duration: req.body?.duration,
  });
  res.status(201).json({ message });
}));
```

P3's code does the membership check (404), magic-byte check (400), size limit (413), Cloudinary upload (503 without keys), `createMessage` (P1) and the `new_message` broadcast. P1 added only the per-user upload rate limit. `requireAuth` already runs for the whole router, so it isn't repeated.

---

## 5. Groups (P1)

### 5.1 Endpoints

| Method & path | Who | Body | Returns |
|---|---|---|---|
| `POST /api/conversations/group` | anyone | `{ name, memberIds[] }` | **201** `{ conversation }` |
| `PUT /api/conversations/:id` | admin | see 3.1 | `{ conversation }` |
| `POST /api/conversations/:id/members` | admin | `{ userId }` | `{ conversation }` |
| `DELETE /api/conversations/:id/members/:userId` | admin, or **yourself** to leave | | `{ conversationId, userId, deleted, groupAdmin }` |

Everything from Part 2 already works for groups: chat list, history, unread counts, star, pin, Chat Memory, and P3's sending and receipts. All of it is built on `participants` and membership checks.

### 5.2 Rules and how they're enforced

| Rule | How |
|---|---|
| Creator becomes admin | `groupAdmin = creator` |
| At least 1 other member, at most 50 in total | Validated after removing duplicate ids and your own id |
| All members must exist | `countDocuments` must match the list, else 400 |
| Only admin edits or adds; anyone can leave | `loadGroupAsAdmin()` gives 403 for members who aren't admin. Non-members still get **404**. |
| No double-add (two tabs, same moment) | Conditional update `{ participants: { $ne: userId } }`. Already a member gives 409. |
| Picture only by upload | A URL string in `groupPicture` gives 400. `""` removes the picture. |
| Admin leaves → still has an admin | `participants` keeps join order, so the longest-standing member becomes admin |
| Last member leaves | Group, its messages and its picture are deleted |
| Removed member loses access | They're out of `participants`, so every route returns 404. Their star on it is removed. |
| Newcomer doesn't start with "200 unread" | On add, existing messages are marked read for them, which also keeps senders' "read by all" ticks |

### 5.3 Real-time events (all through P3's helpers)

| Action | P1 calls | Result (P3's helpers) |
|---|---|---|
| Create group | `notifyConversationCreated(conversation)` | members get `conversation_created` |
| Add member | `notifyMemberAdded(conversation, userId)` | existing members get `group_member_added`; the newcomer gets `conversation_created` (P1 builds that conversation from the newcomer's view: 0 unread, not starred) |
| Remove / leave | `notifyMemberRemoved(conversationAfterRemoval, userId)` | `group_member_removed`. Who receives it is P3's choice; see the open question in `INTEGRATION-P3.md`. |
| Rename / picture / admin change | `emitToUsers(memberIds, 'conversation_updated', { conversation })` | **new event** (not covered by `notify.js`). Shared fields only; clients keep their own `isStarred`/`unreadCount`. |

---

## 6. AI Chat Memory (P3's `aiMemory.js`, wired by P1)

`POST /api/ai/summarize/:conversationId` → `{ summary, keyDecisions[], actionItems[], importantDates[] }`, with **arrays of strings** (P3's decision).

```js
router.post('/summarize/:conversationId', aiLimiter, asyncHandler(async (req, res) => {
  const conversation = await loadConversationForUser(req.params.conversationId, req.user._id); // 404 for outsiders
  res.json(await summarizeConversation(conversation));
}));
```

| Status | When |
|---|---|
| 404 | not a member (P1's check, before any AI work) |
| 429 | over P1's `aiLimiter` (**10 per minute per user**, as P3 asked), or Gemini's quota (P3) |
| 502 / 503 / 504 | Gemini failed / no key / timed out (P3, always with a friendly `error`) |

Results are cached by P3 until a new message arrives.

---

## 7. Verification

### 7.1 Tested in the build environment

| Area | Result |
|---|---|
| **File detection** | jpeg, png, webp, webm, ogg, m4a, mp3 detected; mkv, exe, html, svg, pdf rejected |
| **Multipart (real HTTP server)** | valid file intact; disguised text gives 400; wrong type for the endpoint gives 400; missing or empty file gives 400; 6 MB gives 413; **7 MB chunked upload with no length stopped at 413 while streaming**; JSON instead of multipart gives 400 |
| **Cloudinary signing** | matches **Cloudinary's documented example** exactly |
| **P3 compatibility** (stand-ins built to the caution file's exact signatures) | **P3's `deps.js` resolves every import.** Default model exports are the real models. `PUBLIC_USER_FIELDS` has status/lastSeen and no secrets. `verifyToken` returns `{ userId }`, accepts old `sub`-only tokens, and throws on bad tokens. `createMessage` saves text and voice correctly, rejects 6 kinds of bad input with 400, and **emits nothing**. Media, AI, pin and group routes are mounted (24 in total). `aiLimiter` is 10/min per user. |

### 7.2 `npm run smoke:part3` (your machine; needs P3's files merged)

The test uses **Aarav, Bhavna, Chirag** and **Diya** (the outsider who later joins).

| Area | What is checked |
|---|---|
| **Create** | 201, name trimmed, duplicates and self removed, creator is admin. Members get `conversation_created`, Diya doesn't. Bad input gives 400. Outsider gets 404. Group messages count as unread. |
| **Edit** | non-admin gives 403, outsider 404. Rename sends `conversation_updated` without per-user fields. Empty update or URL-as-picture gives 400. Editing a private chat gives 400. |
| **Members** | add sends `conversation_created` to Diya and `group_member_added` to others. **Newcomer has history and 0 unread.** Re-add 409, non-admin 403, bad id 400, unknown 404. Remove means **no access (404) and star gone**. Removed-user notification is reported as info, not failure. Leave works. **Admin leaves, so Bhavna becomes admin.** **Last member leaves, so the group and its messages are deleted.** |
| **Pictures** | disguised text 400, audio as avatar 400, 6 MB 413, wrong field or JSON 400. With Cloudinary: upload gives a URL, **replace gives a new URL**, remove sets `""`, group picture via multipart, then removal. Without it: 503. |
| **Media (P3)** | outsider 404, disguised voice note 400. With Cloudinary: image message 201 and **recipient gets `new_message`**. |
| **AI (P3)** | outsider 404. With a key: 200, arrays of strings, at least 1 action item and 1 date from an obvious plan, no messages changed, output printed so you can check it. Without a key: 503. |

### 7.3 Checklist

- [ ] P3's files merged; `npm run smoke:all` and `npm run smoke:realtime` both pass
- [ ] Voice note recorded in one browser plays in the other
- [ ] Group of 3: chat, rename (others see it live), remove someone (their chat goes away)
- [ ] Chat Memory on a real conversation gives a sensible summary
- [ ] Remove `GEMINI_API_KEY` and restart: chat still fully works

---

## 8. Contract additions (for `PROJECT_INSTRUCTIONS.md`)

Nothing existing was renamed or removed.

- **Section 3:** server dependencies now include `multer`, `cloudinary`, `@google/genai` (P3) and `dotenv`. P1's picture uploads use Node's built-in multipart parsing; this was verified on Node 22, so **Node 20+ is recommended** (Render uses 22).
- **Section 4:** `server/src/services/` (P1: conversations, messages, groups, storage; P3: media, aiMemory). `server/scripts/` holds the smoke tests.
- **Section 6:**
  - `GET /health` → `{ ok, db, features: { uploads, ai } }`
  - `POST /conversations/group` → **201** `{ conversation }`
  - `PUT /conversations/:id`: JSON `{ groupName?, groupPicture: "" }` (remove only), **or** multipart `groupName?` + `picture`
  - `POST /conversations/:id/members` → `{ conversation }`
  - `DELETE /conversations/:id/members/:userId` → `{ conversationId, userId, deleted, groupAdmin }`
  - `POST/DELETE /users/profile-picture` → `{ user }`
  - Errors may also be **409** (already exists), **502/503/504** (upstream service)
- **Section 7 (server → client):** **`conversation_updated` `{ conversation }`**: group renamed, picture changed or admin changed. Shared fields only.
- **Section 10:** `GEMINI_MODEL=gemini-3.5-flash-lite`. Production default `AUTH_RATE_LIMIT` is 50 (campus Wi-Fi shares one IP).

---

## 9. Decisions worth knowing

| Decision | Why |
|---|---|
| Media and AI use P3's implementations | P3 had already built them; two versions would drift. P1 removed its own. |
| P1 keeps its own picture pipeline | P3's `mediaUpload` is for message files. Profile and group pictures have different fields, types and storage ids. |
| Membership and admin checks **before** reading an upload | Outsiders can't make the server buffer or store anything |
| Size enforced while streaming | A 1 GB upload is cut off at about 5 MB, not after it's in memory |
| Fixed public ids for pictures | Replace overwrites, so there are no orphaned files |
| Per-user limits for uploads and AI, per-IP only for login | A whole campus shares one IP |
| Newcomers start with history marked read | No "200 unread" badge, and senders' ticks don't regress |
