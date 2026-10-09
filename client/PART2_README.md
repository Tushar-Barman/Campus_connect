# CampusConnect Client — Part 2: Core Chat & Phase 2 Features

> ## ⚠️ Updated after P3's `CAUTION_AND_DIRECTION.md` (2026-10-09)
> The real-time layer described in §2–§3 below (`context/ChatStore.jsx`, `state/chatReducer.js`, `hooks/useChatSocket.js`, `lib/socket.js`, `lib/receipts.js`) **was P2 duplicating P3's work and has been removed**. Components now use **P3's hooks** (`useConversations`, `useMessages`, `useTyping`, `usePresence`, `usePinnedMessages`, `useReceiptSync` / `getReceiptStatus`, `useSocketEvent`), imported as `@p3/...`.
> - **Current architecture and hook map:** [`P2_INTEGRATION.md`](P2_INTEGRATION.md)
> - The *behaviour* in §4 (optimistic send, receipts, typing, unread, star, pin, pagination, states) is unchanged and still tested (48/48 E2E). It is now implemented by P3's hooks, or by P2's same-signature stand-ins in `src/p3-standins/` in mock mode.
> - Failed messages now show the error text with **Retry** and **Discard** (P3 rule). `useNow` and `useDebouncedValue` moved to `src/lib/`.


Owner: **Person 2 (Frontend & UI)**. The socket layer and real-time hooks belong to **P3** (see the banner below and `P2_INTEGRATION.md`).

Part 1 gave us the shell: design system, auth and layout. Part 2 makes it a real chat app:
- the **mandatory checkpoint** (find someone, chat in real time, still there after refresh)
- everything in **Phase 2**: online/last seen, typing, delivered/read receipts, starred chats, pinned messages, unread counts
- polished loading, empty and error states throughout

---

## 1. Quick start

```bash
cd client
npm install
cp .env.example .env     # VITE_USE_MOCKS=true
npm run dev
```

### Mock mode: simulated classmates

With `VITE_USE_MOCKS=true` there is a fake server **and** a fake socket inside the browser. The seeded classmates behave like real people:

| Classmate | Status | What happens when you message them |
|---|---|---|
| Diya Patel | 🟢 online | delivered (0.6 s) → read (1.6 s) → "typing…" (2.2 s) → reply (4.2 s) |
| Meera Nair | 🟢 online | same as Diya |
| Kabir Rao | ⚪ offline | stays at one tick (sent), header shows "last seen …" |
| Aarav Sharma | ⚪ offline | same as Kabir |

Every seeded password is `password123`. You can also register your own account.

Mock-mode test helpers (DevTools console):

| Command | Effect |
|---|---|
| `ccMock.dropConnection(4000)` | Simulates losing the connection for 4 s: banner, failed sends, auto-reconnect |
| `localStorage.clear()` then refresh | Wipes all mock users, chats and messages |

**Real two-person testing** (two separate accounts in two browsers) needs the real server: set `VITE_USE_MOCKS=false`. In mock mode, each browser profile has its own private fake server.

---

## 2. What changed since Part 1

```
src/
├── App.jsx                     /chat routes now share one ChatLayout (one store, one socket)
├── state/
│   └── chatReducer.js          NEW · pure reducer: every REST result and socket event → state
├── context/
│   └── ChatStore.jsx           NEW · ChatProvider, ChatLayout, useChat(): state + actions
├── hooks/
│   ├── useChatSocket.js        NEW (P3) · connects the socket, maps server events → actions
│   ├── useTypingEmitter.js     NEW · typing throttle (2 s) + idle stop (2 s)
│   ├── useDebouncedValue.js    NEW · 300 ms debounce for people search
│   └── useNow.js               NEW · re-renders "last seen 5 min ago" every 30 s
├── lib/
│   ├── api.js                  + conversationsApi, messagesApi, SERVER_URL
│   ├── socket.js               NEW (P3) · connectSocket, emit, emitWithAck, disconnectSocket
│   ├── conversation.js         + getPresence, typingLabel, previewText
│   └── mock/                   MOVED + EXTENDED
│       ├── mockServer.js       fake data, presence, event bus, simulated classmates
│       ├── mockApi.js          axios adapter for every REST route in §6
│       └── mockSocket.js       socket.io-like object for every event in §7
├── components/
│   ├── sidebar/
│   │   ├── Sidebar.jsx         real list, Starred section, search chats + people
│   │   ├── PeopleResults.jsx   NEW · server user search → start chat
│   │   └── ConversationItem.jsx  live presence dot, "typing…", unread badge
│   └── chat/
│       ├── ChatWindow.jsx      wires the pieces below to the store
│       ├── ChatHeader.jsx      NEW · presence/typing subtitle, star toggle
│       ├── MessageList.jsx     NEW · pagination, smart scrolling, "N new messages" pill
│       ├── MessageBubble.jsx   + options menu (pin/unpin, copy), failed + retry
│       ├── PinnedBar.jsx       NEW · latest pinned, expandable list, jump to message
│       ├── TypingIndicator.jsx NEW
│       ├── ConnectionBanner.jsx NEW · "Reconnecting…" / "Can't connect"
│       └── Composer.jsx        + emits typing / stop_typing
└── pages/Chat.jsx              orchestration: open chat from URL, not-found, tab title
```

Removed: `lib/fixtures.js` (preview data) and `lib/mockApi.js` (now `lib/mock/mockApi.js`).

---

## 3. Architecture

### 3.1 Data flow

```
            ┌───────────────────────── ChatProvider (one per login) ─────────────────────────┐
            │                                                                                 │
 REST  ───► │  actions.loadConversations / loadMessages / loadOlder / toggleStar / setPinned  │
 (api.js)   │                │                                                                │
            │                ▼                                                                │
            │          dispatch(action) ──► chatReducer (pure) ──► state ──► components       │
            │                ▲                                                                │
 Socket ──► │  useChatSocket: new_message, message_read, typing, user_online … ─┘             │
 (P3)       │                                                                                 │
            │  components ──► actions.sendMessage / startTyping / markRead ──► emit(...)     │
            └─────────────────────────────────────────────────────────────────────────────────┘
```

**One rule:** REST responses and socket events never touch components directly. Both become reducer actions, so the UI has exactly one source of truth and every case can be unit-tested.

### 3.2 Store shape (`state/chatReducer.js`)

```js
{
  conversations: { status, error, byId: { [id]: conversation }, order: [ids newest first] },
  messages:  { [conversationId]: { items, hasMore, status, error, loadingOlder, olderError } },
  pinned:    { [conversationId]: { items, status } },
  presence:  { [userId]: { online, lastSeen } },
  typing:    { [conversationId]: { [userId]: name } },
  activeId:  conversationId | null
}
```

### 3.3 Actions available to components (`useChat().actions`)

| Action | Does |
|---|---|
| `openConversation(id)` | Sets active, loads history + pinned (once), marks read |
| `loadOlder(id)` | Next page: `GET /messages/:id?before=<oldest>&limit=30` |
| `sendMessage(id, text)` | Optimistic bubble → `send_message` with ack |
| `retryMessage(id, clientId)` | Re-sends a failed message with the **same** clientId |
| `startTyping(id)` / `stopTyping(id)` | `typing` / `stop_typing` |
| `markRead(id)` | `message_read` (only when the tab is visible) + clear badge |
| `startConversation(userId)` | `POST /conversations` (find-or-create) |
| `toggleStar(id)` | Optimistic, rolls back on failure |
| `setPinned(message, bool)` | `POST`/`DELETE /messages/:cid/pin/:mid` |

### 3.4 Socket events → reducer actions (`hooks/useChatSocket.js`)

| Server → client event | Action | Extra client behaviour |
|---|---|---|
| `connect` | — | First time: mark the open chat read. **Re**connect: refetch the chat list and the open chat (events may have been missed). |
| `disconnect` / `connect_error` | — | Shows the `ConnectionBanner` |
| `new_message` | `MESSAGE_RECEIVED` | From someone else → emit `message_delivered`. If that chat is open and the tab is visible → emit `message_read`. Unknown chat → `GET /conversations/:id`. |
| `conversation_created` | `CONVERSATION_UPSERT` | New chat appears in the sidebar without a refresh |
| `typing` / `stop_typing` | `TYPING_START` / `TYPING_STOP` | Auto-clears after 6 s if `stop_typing` is lost |
| `user_online` / `user_offline` | `PRESENCE` | |
| `message_delivered` | `RECEIPT_DELIVERED` | |
| `message_read` | `RECEIPT_READ` | If the reader is **me** (another tab) → clear my badge |
| `message_pinned` / `message_unpinned` | `MESSAGE_PINNED` / `MESSAGE_UNPINNED` | |

---

## 4. How the main features work

### Sending a message (optimistic, never duplicated)

```
Enter
 → MESSAGE_OPTIMISTIC   bubble appears instantly, status 'sending' (clock), temp clientId
 → emitWithAck('send_message', { conversationId, text, clientId }), 10 s timeout
      ├─ server echoes new_message (with clientId)  → MESSAGE_RECEIVED  ┐ both match the same bubble
      └─ ack { ok: true, message }                  → MESSAGE_CONFIRMED ┘ by clientId or _id
 → if offline, timed out or { ok: false } → MESSAGE_FAILED → red bubble + "Not sent · Retry"
```

`upsertMessage()` merges by `_id` **or** `clientId`, in either arrival order. Even if the server forgets to echo `clientId`, the ack and the echo still collapse into one bubble (unit-tested).

`emitWithAck` fails **immediately** when offline instead of letting socket.io queue the message. That way the user sees a clear "Retry" and a message is never sent twice behind their back.

### Receipts (`lib/receipts.js`)

| Tick | Meaning | Rule |
|---|---|---|
| 🕒 | sending | no `_id` yet |
| ✓ | sent | saved on the server |
| ✓✓ grey | delivered | **every** other participant is in `deliveredTo` |
| ✓✓ blue | read | **every** other participant is in `readBy` |
| ⚠ | failed | ack failed |

`message_read` carries an `at` time, and every message up to that time is marked read. Because the rule is "every other participant", groups in Part 3 work with no changes.

### Typing (`useTypingEmitter`)

`typing` is sent at most once every 2 s while keys are pressed. `stop_typing` is sent after 2 s idle, on send, on blur, and when leaving the chat. The receiver also auto-expires the indicator after 6 s in case `stop_typing` is lost. The header shows "typing…" (or "Diya is typing…" in groups), the sidebar item shows it in teal, and three dots appear under the last message.

### Presence and last seen

Presence starts from the participants' `status` / `lastSeen` in `GET /conversations` and is then kept live by `user_online` / `user_offline`. The header label refreshes every 30 s, so "last seen 1 min ago" becomes "2 min ago" without a reload.

### Unread counts

The server's `unreadCount` arrives with the chat list. A new message from someone else goes +1, **unless** you're looking at that chat and the tab is visible, in which case the client sends `message_read` instead. Opening a chat or returning to the tab marks it read. The browser tab title shows the total, e.g. "(3) CampusConnect".

### Starred chats

The toggle is optimistic: the star turns yellow immediately and the chat moves to the **Starred** section. If the server refuses, it rolls back and the header briefly shows "Couldn't update star". Stars are per user (`starredConversations` on the User), which the E2E test checks across two accounts.

### Pinned messages

Use the ⋮ menu on a message → **Pin message**. The PinnedBar under the header shows the latest pin, a count, and an expandable list with unpin buttons. Clicking a pin scrolls to that message and highlights it. If the message isn't loaded yet, you're told to scroll up. Pins arrive live through `message_pinned` / `message_unpinned`.

### History, pagination and scrolling (`MessageList.jsx`)

- Opening a chat loads the newest 30 messages and starts at the bottom.
- Scrolling near the top loads the next 30 (`before=<oldest createdAt>`). The scroll position is kept, so the view doesn't jump.
- A new message auto-scrolls **only** if it's yours or you're already near the bottom. Otherwise a "**N new messages ↓**" pill appears.
- "Start of conversation" shows when there's nothing older. A failed page shows "Couldn't load older messages · Retry".

### Starting a chat

Type in the search box. Your existing **Chats** filter instantly, and **People** are searched on the server after 300 ms of typing (older requests are cancelled). Picking a person calls `POST /conversations`, which finds or creates the chat, so picking the same person twice opens the same chat.

### Opening a chat by URL

`/chat/:id` works on refresh and from shared links. If the chat isn't in your list, `GET /conversations/:id` is tried. A 404 (not found, or not a member) shows "Conversation not found", so it never leaks whether a chat exists.

### Every screen's states

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Chat list | 5 skeleton rows | "No conversations yet" + Find someone | ErrorState + Try again |
| People search | 2 skeleton rows | "No people found for …" | inline message + Retry |
| Messages | skeleton bubbles | "Say hello 👋" | ErrorState + Try again |
| Older messages | spinner at top | "Start of conversation" | "Couldn't load older · Retry" |
| Open chat by URL | spinner | "Conversation not found" | ErrorState + Try again |
| Live connection | — | — | Reconnecting / Can't connect banner |

---

## 5. Contract notes for P1 and P3

Part 2 follows PROJECT_INSTRUCTIONS §6–7 exactly. These details matter. Please confirm them in the team chat:

1. **`new_message` must echo the sender's `clientId`** and be sent to **all** participants, including the sender. That's how other tabs of the same user stay in sync. The client also survives a missing echo.
2. **`POST /messages/:cid/pin/:mid` should return `{ message }`** (the updated, populated message). The client falls back gracefully if it doesn't, but then `pinnedAt` and `pinnedBy` are guessed.
3. **`message_read` should also be emitted to the reader's own user room**, so a user's other tabs clear their unread badge. Optional; nothing breaks without it.
4. **`GET /conversations` participants need `status` and `lastSeen`** (via `PUBLIC_USER_FIELDS`). That's the starting point for presence.
5. **Suggestion for P1:** ignore a `send_message` whose `clientId` was already saved for that sender. That makes "Retry after a timeout" 100 % duplicate-proof.

**P3:** `lib/socket.js` and `hooks/useChatSocket.js` are yours. Change the internals freely, but keep:
- the exports: `connectSocket`, `disconnectSocket`, `emit`, `emitWithAck`
- the hook's return value: `'connecting' | 'connected' | 'reconnecting' | 'error'`
- the action names dispatched in §3.4

---

## 6. How to check it's working

### Already verified (automated)

**Reducer unit tests: 28 / 28 ✅**

Chat ordering, presence seeding, optimistic → echo → ack (both orders, with and without `clientId` echo), fail → retry, unread rules, receipts (only my messages, only up to `at`, never unsent ones), typing cleared by a message, presence `lastSeen`, star, pin/unpin (no duplicates), and an older page merged without duplicates.

**End-to-end in a real headless Chromium: 47 / 47 ✅**

The whole app ran in mock mode. Only the router and icon packages were small stand-ins, because package downloads are blocked where this was built.

| Area | Checks |
|---|---|
| Checkpoint | register → empty state → search "diya" → chat opens at `/chat/:id` → message appears instantly → reply arrives live → refresh keeps the chat, messages in order, ticks, star and pin |
| Receipts | Sending/Sent → Delivered → Read for an online user; stays Sent for an offline user |
| Typing | indicator appears, then clears when the reply lands |
| Duplicates | exactly one copy of each sent message; same person twice → same chat; paging → 70/70 unique |
| Unread | badge "1" and tab title "(1) CampusConnect" while in another chat, both cleared on open |
| Connection | `dropConnection` → banner → send → "Not sent · Retry" → banner clears → Retry sends one copy |
| Pagination | first page = 30 newest, starts at bottom, scroll up loads all 70, "Start of conversation" |
| Security | unknown id → not found; a second user can't see or open the first user's chat |
| Layout | 375 px: list or chat, back arrow works, no horizontal scroll; 768 px: side by side |
| Errors | zero console errors for the whole run |

Also verified: Tailwind compiles every class used, there are no hex colours in components and no `console.log`, every icon-only button has an `aria-label`, and nothing outside `lib/` imports axios or socket.io directly.

**Not run here:** `npm install` and `npm run build` (downloads blocked). Run them first.

### Your manual checklist

**A. Mock mode (5 min)**
- [ ] `npm install && npm run build` passes
- [ ] Register → search "diya" → send → ✓ → ✓✓ → blue ✓✓ → "typing…" → reply
- [ ] Message Kabir → stays at one tick; header says "last seen …"
- [ ] Star Diya → moves to Starred. Pin a message → PinnedBar. Refresh → all still there.
- [ ] While in Kabir's chat, wait for a Diya reply → badge and "(1)" in the tab title
- [ ] Console: `ccMock.dropConnection(4000)` → banner. Send → Retry. Banner gone → Retry works.
- [ ] Phone width: list and chat are separate screens; back arrow works

**B. Real server (the real checkpoint, with P1 and P3)**
- [ ] `VITE_USE_MOCKS=false`, server running, two browsers (normal + incognito), two accounts
- [ ] A finds B → chat → messages instant both ways → both refresh → still there, in order
- [ ] A types → B sees typing; it clears within about 2 s of stopping
- [ ] B closes the tab → A sees "last seen just now"; B reopens → "online"
- [ ] Ticks: B's tab closed → ✓; B open elsewhere → ✓✓ grey; B opens the chat → ✓✓ blue
- [ ] A stars the chat → B's list is unchanged
- [ ] B pins a message → A's PinnedBar updates without a refresh
- [ ] Stop the server → banner on both; restart → both reconnect and catch up
- [ ] Edit a conversation id in the URL to someone else's chat → "Conversation not found"

---

## 7. What Part 3 plugs in

| Feature | Where it goes |
|---|---|
| Groups | `CreateGroupModal` → `POST /conversations/group`. Sender names in bubbles, "Diya is typing…" and receipts already handle groups. |
| Voice notes | Composer's mic slot (placeholder already there) + `VoicePlayer` bubble. `previewText` already says "🎤 Voice note". |
| Profile pictures | `Avatar` already shows `src` with an initials fallback; `AuthContext.updateUser()` exists |
| Chat Memory | The ✨ button in `ChatHeader` (currently disabled) opens the memory panel |
