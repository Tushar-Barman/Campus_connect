# P2 → P3 / P1: how the frontend uses your code

**From:** P2 (Frontend & UI) · **Reply to:** `CAUTION_AND_DIRECTION.md` (P3, 2026-10-09)

The frontend now follows P3's directions. P2's earlier duplicate socket layer, chat store and recorder are **deleted**, and every component uses P3's hooks exactly as listed in P2 §3. Nothing of P2's sits in P3's paths any more (`client/src/lib/socket.js`, `client/src/hooks/`), so merging is conflict-free.

---

## 1. What changed on P2's side

| P3 asked | Done |
|---|---|
| `lib/api.js` default-exports the axios instance (token header, 401 → logout) | ✅ `export default api` (named helpers like `authApi` remain) |
| AuthContext is the only place a socket is created | ✅ `connectSocket(token, { onUnauthorized })` in an effect on `[token, status]`, `disconnectSocket()` on logout |
| Never `io()` or `socket.on` in components | ✅ An automated check finds no `socket.io-client` import in P2 code; live events go through `useSocketEvent` |
| Use the hooks in P2 §3 | ✅ All 11 hooks plus `getReceiptStatus` (map below) |
| Key = `message._id ?? message.clientId` | ✅ `MessageList.jsx` |
| `'sending'` clock · `'uploading'` progress bar from `message.progress` · `'failed'` shows `message.error` with **Retry** and **Discard** | ✅ `MessageBubble.jsx` |
| Ticks from `getReceiptStatus(message, participants)` | ✅ |
| Mic: `{...holdProps}`, `touch-none select-none`, `aria-label`, `elapsedMs`, "Release to send · slide away to cancel", hidden when `!isSupported` | ✅ `Composer.jsx` |
| Typing: "Asha is typing…" / "2 people are typing…"; `notifyTyping()` on input, `stopTyping()` before send | ✅ |
| Chat Memory: string arrays; errors shown only inside the panel; `generate()` on open | ✅ (objects are accepted too, just in case) |
| 404 from `useMessages` → "This conversation is no longer available" | ✅ `ChatWindow.jsx` |
| Star → REST, then `patchConversation(id, { isStarred })` | ✅ Optimistic, rolled back on error |

**Withdrawn** (P3: "no contract changed"): P2's proposed `POST /conversations/:id/picture` and `conversation_updated` event. The group photo is now **display-only**; the admin can still rename and manage members. After a rename or a member change, P2 calls `reload()` from `useConversations`.

---

## 2. Where each P3 export is used

| P3 export | Used in |
|---|---|
| `connectSocket`, `disconnectSocket` | `context/AuthContext.jsx` |
| `useConversations(myId, openId)` | `pages/Chat.jsx` (called **once**, then shared via `context/ConversationsContext.jsx`) |
| `useReceiptSync(openId, myId)` | `pages/Chat.jsx` (mounted once) |
| `useMessages(id, user)` | `chat/ChatWindow.jsx` → `MessageList`, `Composer` |
| `getReceiptStatus` | `chat/MessageList.jsx` |
| `useTyping(id)` | `ChatWindow` (header, list, composer); also `sidebar/ConversationItem` (display only) |
| `usePresence(user)` | `ChatHeader`, `ConversationItem`, `PeopleResults`, `GroupInfoPanel` (one per member row), `ContactPanel` |
| `usePinnedMessages(id)` | `ChatWindow` → `PinnedBar`, bubble pin state |
| `useVoiceRecorder(onRecorded)` | `chat/Composer.jsx`, with `onRecorded = useMessages().sendVoiceNote` |
| `useAudioPlayer(src, duration)` | `media/VoicePlayer.jsx` |
| `useChatMemory(id)` | `memory/ChatMemoryPanel.jsx` |
| `useSocketEvent` | `chat/ConnectionBanner.jsx` (`connect` / `disconnect` / `connect_error`), `pages/Chat.jsx` (`group_member_removed` → toast) |

All imports are **named** (`import { useMessages } from …`). If P3's files only have default exports, add named exports or tell P2.

---

## 3. How the build picks P3's code (no config needed)

Components import `@p3/lib/socket.js` and `@p3/hooks/<name>.js`. `vite.config.js` resolves `@p3` like this:

| Situation | `@p3` points to |
|---|---|
| P3's `src/lib/socket.js` **and** `src/hooks/useMessages.js` exist, and `VITE_USE_MOCKS` isn't `true` | `src/` → **P3's real files** |
| Mock mode, `VITE_P3_STANDINS=true`, or P3's files missing | `src/p3-standins/` (P2's stand-ins with the same signatures) |

The dev server logs which one is active: `[campusconnect] real-time layer: …`. Deployed builds (mocks off) always use P3's files.

The stand-ins exist so P2 could build and test the UI before P3's code arrived. **If they disagree with P3's real hooks, P3's version wins** and P2 fixes the component.

---

## 4. Please confirm (P2 had to assume these)

| # | Question | P2 assumed |
|---|---|---|
| 1 | `useAudioPlayer().seek(x)`: is `x` a **0–1 fraction** or **seconds**? | **0–1 fraction** (same scale as `progress`). One line to change in `VoicePlayer.jsx` if it's seconds. |
| 2 | Shape of `error` from `useMessages` / `useConversations` / `useChatMemory` | String **or** `{ message, status }`. P2 handles both, and treats a 404 as either `status === 404` or a message containing "not found". |
| 3 | Does `useSocketEvent` work for socket.io's own `connect` / `disconnect` / `connect_error`? | Yes. It's used for the "Reconnecting…" banner. If not, the banner just never shows; nothing breaks. |
| 4 | Do `reload` and `patchConversation` keep the same identity between renders? | Not assumed: P2 calls `reload` through a ref, so a new function each render can't cause a request loop. |
| 5 | Does `useConversations` add a chat P2 just created (`POST /conversations`, `/conversations/group`) without a reload? | Not assumed: P2 calls `reload()` after creating if the chat isn't in the list yet. |
| 6 | Can several components call `useTyping(sameId)` at once (header + list + composer, plus a display-only instance per sidebar row)? | Yes. Only the composer calls `notifyTyping` / `stopTyping`. |
| 7 | Keyboard support for `holdProps` (hold Space/Enter)? | The stand-in supports it. **Suggestion for P3:** add it, so the mic is usable without a mouse. |
| 8 | Does `useMessages().sendVoiceNote(recording)` accept exactly what `useVoiceRecorder(onRecorded)` passes? | Yes. P2 passes `sendVoiceNote` straight through as `onRecorded` and never inspects the recording. |

---

## 5. For P1 (from the frontend)

- The client sends `send_message` with `{ conversationId, text, clientId }` and expects `new_message` to echo `clientId` (contract §7).
- The media upload sends multipart `file` + `duration` only (no `clientId`), matching P3's route snippet.
- Profile pictures: `POST /users/profile-picture` (multipart `picture`) and `DELETE` should return `{ user }`. The frontend updates the logged-in user from that response.
- Group routes: the frontend calls `reload()` afterwards, so any success body works.
- Errors: the frontend shows `{ error }` text as-is, so keep messages user-friendly (P3's 429 / 502 / 503 / 504 texts are shown inside the Chat Memory panel).
