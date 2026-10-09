# CAUTION AND DIRECTION — for P1 and P2

**From:** P3 (Real-time & Integration) · **Date:** 2026-10-09

P3's code is written against the signatures we agreed, with none of your code to test against yet. This file lists **exactly what my code expects from yours**. If you build something differently, tell me before you merge. Usually the fix is one line in `server/src/socket/deps.js`.

**No contract in PROJECT_INSTRUCTIONS.md §5–7 was changed.** Where the contract was silent I made a choice, and those choices are listed in the [last section](#decisions-where-the-contract-was-silent).

> ⚠️ Nothing below has been run yet. The first time P1's server boots with my files, we run the smoke test together (see the end of this file).

---

## What P3 has already built (please don't duplicate)

| Area | Files |
|---|---|
| Socket server: auth, rooms, messages, presence, typing, receipts | `server/src/socket/*.js` |
| Helpers your routes call to broadcast events | `server/src/socket/notify.js` |
| Voice/image upload: validation + Cloudinary | `server/src/services/media.js` |
| Gemini Chat Memory | `server/src/services/aiMemory.js` |
| Client socket singleton | `client/src/lib/socket.js` |
| All real-time React hooks | `client/src/hooks/*.js` |
| Smoke test ([A] [B] [C] checks) | `server/scripts/smoke-realtime.js` |

---

## P1 — Backend

### 1. Exports my code imports

All of these are imported in **one file**: `server/src/socket/deps.js`.

| Import | Expected location | Must behave like this |
|---|---|---|
| `verifyToken(token)` | `utils/auth.js` | Returns the decoded JWT payload, with the user id in `userId` (preferred), `id` or `sub`. Throws (or returns null) for an invalid or expired token. Sync or async both work. |
| `HttpError` | `utils/http.js` | `new HttpError(status, message)` with `.status` and `.message`. Your central error middleware replies `res.status(err.status).json({ error: err.message })`. |
| `loadConversationForUser(conversationId, userId)` | `middleware/membership.js` | Async. Returns the conversation with `_id`, `participants` (ids or populated) and `lastMessage`. Throws `HttpError(404)` when the conversation doesn't exist, the user isn't a member, **or the id is malformed**. `userId` arrives as a string. |
| `createMessage(fields)` | `services/messages.js` | Async. Saves a message and returns the doc with `_id` and `createdAt`. Text: `{ conversationId, senderId, messageType: 'text', text }`. Media: `{ conversationId, senderId, messageType: 'voice' \| 'image', mediaUrl, mediaType, duration }`. **It must not emit socket events or update `lastMessage`**, because my `publishMessage()` does both. Doing it twice would double every message. |
| `PUBLIC_USER_FIELDS` | named export of `models/User.js` | A Mongoose select string for `.populate('senderId', PUBLIC_USER_FIELDS)`, e.g. `'name profilePicture status lastSeen'`. It must **never** include `passwordHash` or `starredConversations`. |
| `User`, `Conversation`, `Message` | default exports of `models/User.js`, `models/Conversation.js`, `models/Message.js` | Mongoose models. |

If a name or path differs, the server crashes at startup with `does not provide an export named …`. Tell me, and I'll fix `deps.js`. Please don't edit `server/src/socket/` without a heads-up.

### 2. Schema details my queries depend on

- `Message.deliveredTo` and `Message.readBy` are arrays of `{ user: ObjectId (ref User), at: Date }`, default `[]`. **Not** `deliveredAt`/`readAt`.
- `Message` has `timestamps: true` (I sort and filter on `createdAt`), `senderId` (ref User), `conversationId` (ref Conversation), `messageType` enum `text | voice | image | file`, and `mediaUrl`, `mediaType`, `duration` (Number, seconds), `isPinned`, `pinnedAt`, `pinnedBy`.
- `Conversation` has `participants: [ObjectId ref User]`, `lastMessage` (ref Message) and `lastMessageAt: Date`.
- `User` has `name`, `status` (`'online' | 'offline'`, default `'offline'`) and `lastSeen: Date`.
- **Indexes, please.** Receipts and presence query these on every connect: `Message { conversationId: 1, createdAt: -1 }` and `Conversation { participants: 1 }`.

### 3. Bootstrap (`server/src/index.js`)

```js
import http from 'node:http';
import { initSocket } from './socket/index.js';

const httpServer = http.createServer(app);
initSocket(httpServer);
httpServer.listen(PORT, () => console.log(`Server on ${PORT}`)); // NOT app.listen()
```

- Load env vars (dotenv / `config/env.js`) before this runs. Socket CORS reads `CLIENT_URL` (comma-separated).
- `initSocket` marks every user offline on boot, so call it once per process.
- **Run a single server instance.** Online status is tracked in memory, so don't scale to 2+ instances on Render.

### 4. Broadcast from your routes using `server/src/socket/notify.js`

Call these **after** the database write succeeds. "Conversation" here means the saved conversation with `participants` populated using `PUBLIC_USER_FIELDS`, the same shape as a `GET /conversations` item, because clients add it to the sidebar as-is.

| Route | Call |
|---|---|
| `POST /conversations`, only when `created === true` | `notifyConversationCreated(conversation)` |
| `POST /conversations/group` | `notifyConversationCreated(conversation)` |
| `POST /conversations/:id/members` | `notifyMemberAdded(conversationAfterAdd, userId)` |
| `DELETE /conversations/:id/members/:userId` | `notifyMemberRemoved(conversationAfterRemoval, userId)` |
| `POST /messages/:cid/pin/:mid` | `notifyMessagePinned(conversation, message)` (message includes `conversationId`, `isPinned`, `pinnedAt`, `pinnedBy`) |
| `DELETE /messages/:cid/pin/:mid` | `notifyMessageUnpinned(conversation, messageId)` |

**Never emit `new_message` yourself, and never touch `io` directly.** Use these helpers, or `emitToUsers(userIds, event, payload)` from `socket/emit.js` for anything new.

### 5. Media upload route (Phase 3)

```js
import { mediaUpload, createMediaMessage } from '../services/media.js';

router.post('/:conversationId/media', requireAuth, mediaUpload, asyncHandler(async (req, res) => {
  const message = await createMediaMessage({
    conversationId: req.params.conversationId,
    userId: req.user._id,
    file: req.file,
    duration: req.body.duration,
  });
  res.status(201).json({ message });
}));
```

`mediaUpload` (multer, 5 MB, MIME whitelist) and `createMediaMessage` together handle:
- the membership check (404)
- the magic-byte check (a renamed `.exe` gets 400)
- the size limit (413)
- the Cloudinary upload
- `createMessage`
- the `new_message` broadcast

Cloudinary keys missing → 503.

### 6. AI route (Phase 4)

```js
import { summarizeConversation } from '../services/aiMemory.js';

router.post('/summarize/:conversationId', requireAuth, aiLimiter, asyncHandler(async (req, res) => {
  const conversation = await loadConversationForUser(req.params.conversationId, req.user._id);
  res.json(await summarizeConversation(conversation));
}));
```

- Please add `aiLimiter` (express-rate-limit, e.g. 10 requests per minute per user). It protects our Gemini quota.
- `summarizeConversation` throws `HttpError` with a friendly message:
  - 429 when the Gemini quota is hit
  - 502 when Gemini fails
  - 503 when no API key is set
  - 504 on timeout (20 s)
- Results are cached until a new message arrives.

### 7. REST response shapes my client hooks rely on

- `requireAuth` sets **`req.user._id`**. If it sets something else (e.g. `req.userId`), tell me and use that in the snippets above.
- `GET /messages/:cid` returns messages **oldest → newest**. Each has `senderId` **populated with `PUBLIC_USER_FIELDS`** (the same shape as the socket's `new_message`), plus `deliveredTo`, `readBy` and `createdAt`. `before` means `createdAt < before`.
- `GET /conversations` items need `participants` populated **including `status` and `lastSeen`** (online dots start from these), `lastMessage` populated, `isStarred`, and `unreadCount` (messages from others whose `readBy` doesn't include me).
- `GET /messages/:cid/pinned` returns `{ messages }`, newest pin first.

### 8. `server/package.json` and env

- Dependencies: `socket.io`, `multer`, `cloudinary`, `@google/genai`.
- Dev dependency: `socket.io-client` (smoke test).
- `"type": "module"` and Node ≥ 18.
- Add to `.env.example`: `GEMINI_MODEL=gemini-2.5-flash`. It's optional; that model is the default. It lets us switch models without a code change.

---

## P2 — Frontend

### 1. `lib/api.js` (yours)

My hooks do `import api from '../lib/api.js'`. It should be a **default-exported axios instance** with `baseURL: \`${import.meta.env.VITE_API_URL}/api\``. It should also attach `Authorization: Bearer <token>` and log out on 401.

### 2. AuthContext is the only place a socket is created

```js
import { connectSocket, disconnectSocket } from '../lib/socket.js';

useEffect(() => {
  if (!token) return undefined;
  connectSocket(token, { onUnauthorized: logout }); // expired/invalid token → logout
  return () => disconnectSocket();
}, [token]);
```

**Never call `io()` in a component, and never `socket.on` directly.** Use the hooks below. They clean up after themselves, which matters under StrictMode.

### 3. Hooks to use

| Hook (in `client/src/hooks/`) | Returns | Use it for |
|---|---|---|
| `useConversations(currentUserId, openConversationId)` | `{ conversations, loading, error, reload, patchConversation }` | Sidebar. Live updates, unread counts, new chats and groups. After star/unstar, call `patchConversation(id, { isStarred })`. |
| `useMessages(conversationId, currentUser)` | `{ messages, hasMore, loading, loadingOlder, error, sendMessage(text), sendVoiceNote(recording), retryMessage(clientId), discardMessage(clientId), loadOlder(), reload() }` | The open chat. `currentUser` is the logged-in user object. |
| `useReceiptSync(openConversationId, currentUserId)` from `useReceipts.js` | — | **Mount once** on the Chat page. Sends delivered/read receipts. |
| `getReceiptStatus(message, participants)` from `useReceipts.js` | `'sending' \| 'uploading' \| 'failed' \| 'sent' \| 'delivered' \| 'read'` | Ticks on **your own** messages. |
| `useTyping(conversationId)` | `{ typingUsers: [{ userId, name }], notifyTyping, stopTyping }` | Call `notifyTyping()` on every input change and `stopTyping()` right before sending. |
| `usePresence(user)` | `{ online, lastSeen }` | Online dot or "last seen …". `user` comes from `conversation.participants`. |
| `usePinnedMessages(conversationId)` | `{ pinned, loading, error, pin(id), unpin(id), reload }` | Pinned section. |
| `useVoiceRecorder(onRecorded)` | `{ isSupported, isRecording, elapsedMs, maxDurationMs, error, holdProps }` | Mic button: `<button {...holdProps}>`. Pass `sendVoiceNote` as `onRecorded`. |
| `useAudioPlayer(src, knownDuration)` | `{ isPlaying, currentTime, duration, progress, error, toggle, seek }` | Your voice-note player component: `useAudioPlayer(message.mediaUrl, message.duration)`. |
| `useChatMemory(conversationId)` | `{ memory, loading, error, generate }` | Chat Memory panel. Call `generate()` when it opens. |
| `useSocketEvent(event, handler)`, `useSocketReconnect(handler)` | — | Anything else real-time. |

### 4. Rendering rules

- **List key:** `message._id ?? message.clientId`. Drafts have no `_id` yet.
- **Status:** `'sending'` shows a clock. `'uploading'` shows a progress bar from `message.progress` (0–1). `'failed'` shows `message.error` with **Retry** (`retryMessage(clientId)`) and **Discard** buttons.
- **Ticks (own messages only):** sent = one tick, delivered = two grey ticks, read = two coloured ticks. In groups these mean "by everyone else".
- **Voice messages:** `messageType === 'voice'`. Render your player with `message.mediaUrl` and `message.duration`.
- **Mic button:**
  - Add the Tailwind classes `touch-none select-none`. Without `touch-none`, phones scroll the page and cancel the recording.
  - Give it an `aria-label`, e.g. "Hold to record a voice note".
  - While recording, show `elapsedMs` and the hint "Release to send · slide away to cancel".
  - Hide the button when `!isSupported`.
  - The microphone only works on HTTPS or localhost.
- **Typing:** "Asha is typing…", or "2 people are typing…" for groups.
- **Chat Memory:** `memory.summary` is a string. `keyDecisions`, `actionItems` and `importantDates` are **arrays of strings**. Show `error` inside the panel only, because the chat must keep working.
- **404 from `useMessages`** (e.g. removed from a group): show "This conversation is no longer available".

---

## Decisions where the contract was silent

None of these change §5–7. They fill gaps.

- `POST /messages/:cid/media` returns **`201 { message }`**.
- Chat Memory arrays are **arrays of strings**.
- AI and media errors may also use **502** (upstream failed), **503** (not configured) and **504** (timed out). The body is still `{ error }`.
- `group_member_added` goes to existing members. The added member gets `conversation_created` instead, so the group appears in their sidebar.
- `message_read` also fills `deliveredTo`, because reading implies delivery.
- A user shows as offline **3 s** after their last tab closes, so a page refresh doesn't flicker.

---

## How we check it together

1. Once P1's server boots: `cd server && npm i -D socket.io-client && node scripts/smoke-realtime.js`. All [A], [B] and [C] checks should pass. [C] needs the media and AI routes from sections 5 and 6.
2. Run the checkpoint in two browsers (one normal, one incognito), plus the §12 checklist.
3. If startup fails with `does not provide an export named …`, ping P3. It's a `deps.js` path.
