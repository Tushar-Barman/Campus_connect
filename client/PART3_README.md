# CampusConnect Client — Part 3: Advanced Features & Polish

> ## ⚠️ Updated after P3's `CAUTION_AND_DIRECTION.md` (2026-10-09)
> - **Voice notes** use P3's `useVoiceRecorder(onRecorded)` → `<button {...holdProps}>`: **hold to record, release to send, slide away to cancel**. P2's tap mode is gone; a quick tap shows "Hold the button to record a voice note." Playback uses P3's `useAudioPlayer`.
> - **Chat Memory** uses P3's `useChatMemory`. Lists are **arrays of strings** (P3's decision), e.g. "Meera: I'll bring the Arduino kits…". Errors stay inside the panel.
> - **Withdrawn contract proposal:** `POST /conversations/:id/picture`. (`conversation_updated` was later implemented by P1 and is documented in `PROJECT_INSTRUCTIONS.md` §7.) The **group photo is display-only**; rename and members still work, followed by `reload()`.
> - Group headers show "N members" (no online count: P3's `usePresence` is per user).
> - `ChatStore`, `hooks/useChatSocket.js` and P2's `useVoiceRecorder.js` are deleted. See [`P2_INTEGRATION.md`](P2_INTEGRATION.md) for the current architecture, the hook-by-hook map and 8 questions for P3.
> - Tests after the change: Part 3 E2E **56/56**, Part 2 E2E **48/48**, unit **28 + 22 + 7**.


Owner: **Person 2 (Frontend & UI)**. All real-time logic (socket, recorder, player, Chat Memory fetching) is **P3's**; this part is the UI on top of P3's hooks.

Part 3 adds the Phase 3 and Phase 4 features on top of a working Part 2:

| Feature | Phase | Status |
|---|---|---|
| Profile page: name, bio, profile picture upload / replace / remove | 3 | ✅ |
| Groups: create, rename, group photo, add / remove members, leave, admin rules | 3 | ✅ |
| Voice notes: hold to record, tap mode, cancel, playback, upload progress, retry | 3 | ✅ |
| Chat Memory (AI): summary, key decisions, action items, important dates | 4 | ✅ |
| Contact info panel for private chats | polish | ✅ |
| Toasts, drawers, confirm dialogs, focus and keyboard fixes | polish | ✅ |
| Image messages: **render only** (no upload button; image sharing is Phase 5, first in the cut order) | 5 | partial |

---

## 1. Quick start

```bash
cd client
npm install
cp .env.example .env      # VITE_USE_MOCKS=true, VITE_FEATURE_CHAT_MEMORY=true
npm run dev
```

**New in mock mode:** every account (except Diya, Kabir and Meera themselves) automatically joins a seeded **Robotics Club** group. It contains realistic planning messages, a pinned decision and 11 unread messages, so Groups and Chat Memory can be shown immediately.

| Try this | What happens |
|---|---|
| Open **Robotics Club** → ✨ | Chat Memory finds the decisions (North Campus lab, Saturday 4 pm), the action items ("Meera: I'll bring the Arduino kits…", "Kabir: I'll print the posters…") and the dates (14 Oct, Friday, tomorrow) |
| Send a message in the group | "Diya is typing…", Diya replies, then "Meera is typing…", Meera replies |
| Hold the 🎤 for 2 s, release | A voice note uploads with a progress bar, then plays back |
| Click your name (top left) | Profile page |
| 👥 button next to search | Create a group |

The mock Chat Memory is a simple keyword summariser, labelled "offline mock summary". The real one comes from Gemini through P1's endpoint.

### Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000` | Server origin |
| `VITE_USE_MOCKS` | `true` | In-browser fake server. **`false` for any deployed build.** |
| `VITE_FEATURE_CHAT_MEMORY` | `true` | `false` hides the ✨ button (e.g. if the AI endpoint isn't deployed in time) |

---

## 2. What changed since Part 2

```
src/
├── App.jsx                         /profile added; /chat and /profile share one ChatLayout
├── main.jsx                        + <ToastProvider>
├── index.css                       + slide-in and pulse-dot animations
├── lib/
│   ├── media.js                    NEW · upload rules, mime helpers, image resize, durations
│   ├── api.js                      + profile picture, group, media upload and AI endpoints
│   └── mock/                       + groups, pictures, media, summariser, demo group
├── state/chatReducer.js            + CONVERSATION_REMOVE, MESSAGE_UPLOAD_PROGRESS
├── context/ChatStore.jsx           + sendVoiceNote, createGroup, renameGroup, uploadGroupPicture,
│                                     removeGroupPicture, addMember, removeMember, leaveGroup
├── hooks/
│   ├── useVoiceRecorder.js         NEW (P3) · MediaRecorder wrapper
│   └── useChatSocket.js            + group_member_added / _removed, conversation_updated
├── pages/Profile.jsx               NEW
└── components/
    ├── ui/Toast.jsx                NEW · success / error / info toasts
    ├── ui/Drawer.jsx               NEW · right-hand panel (full screen on phones)
    ├── ui/ConfirmDialog.jsx        NEW · "Are you sure?" with async errors
    ├── ui/Modal.jsx, ui/Avatar.jsx FIXED (see §4.6)
    ├── users/UserPicker.jsx        NEW · search people, select or add
    ├── media/PictureUploader.jsx   NEW · avatar + upload / replace / remove (profile and group)
    ├── media/VoicePlayer.jsx       NEW · play / pause, seek, duration
    ├── group/CreateGroupModal.jsx  NEW
    ├── group/GroupInfoPanel.jsx    NEW · members, admin tools, leave
    ├── group/ContactPanel.jsx      NEW · the other person's info in a private chat
    ├── memory/ChatMemoryPanel.jsx  NEW
    ├── chat/Composer.jsx           + voice recording (hold / tap / cancel)
    ├── chat/MessageBubble.jsx      + voice and image bodies, upload progress
    ├── chat/ChatHeader.jsx         header opens info; ✨ Chat Memory; members · online
    ├── chat/ChatWindow.jsx         + info and memory panels
    └── sidebar/Sidebar.jsx         + profile link, 👥 New group, group-aware empty state
```

---

## 3. How each feature works

### 3.1 Profile (`pages/Profile.jsx`, `media/PictureUploader.jsx`)

```
Choose file
  → validateImage()  JPG / PNG / WebP only, ≤ 5 MB, checked BEFORE uploading (instant error)
  → resizeImage()    longest side ≤ 512 px (avatars are shown at ≤ 96 px; saves upload time)
  → POST /users/profile-picture  (multipart "picture"), with a progress % over the avatar
  → { user } → AuthContext.updateUser() → sidebar and profile update at once
Remove → confirm dialog → DELETE /users/profile-picture → initials shown again
```

Name and bio go to `PUT /users/profile`. Save stays disabled until something changes. The name follows the same rules as registration, the bio is limited to 160 characters with a live counter, and email is read-only.

Other people see your new picture the next time their chat list loads. The contract has no "profile updated" socket event, and that is fine for a demo.

### 3.2 Groups

**Create** (👥 in the sidebar): a name (1–50 characters) and at least one member, chosen with the people search and shown as removable chips → `POST /conversations/group` → the chat opens. Every member receives `conversation_created`, so the group appears for them live.

**Group info** (click the chat header, or ⓘ):

| | Everyone | Admin only |
|---|---|---|
| See members, Admin badge, online / last seen | ✅ | |
| Leave group (with confirmation) | ✅ | |
| Rename (inline edit) | | ✅ `PUT /conversations/:id` |
| Group photo upload / remove | | ✅ (see §5, proposed route) |
| Add member (search hides people already in the group) | | ✅ `POST …/members` |
| Remove member (with confirmation) | | ✅ `DELETE …/members/:userId` |

Live updates over the socket:
- `group_member_added` / `group_member_removed` → the client refetches the conversation, because the payloads only carry ids.
- If **you** are removed, the group disappears from your list and a toast says so. If you had it open, you see "Conversation not found".
- After a rename or member change, the frontend calls `reload()` from P3's `useConversations`. Other members see the new name on their next list load (the contract has no update event).

Group chats use what Part 2 already built: sender names on bubbles, "Diya is typing…" / "Diya and Meera are typing…", and receipts that need **every** other member. That's why a group with an offline member stays at ✓.

### 3.3 Voice notes (`Composer.jsx`, `useVoiceRecorder.js`, `VoicePlayer.jsx`)

Ways to record:

| Gesture | Result |
|---|---|
| **Hold** the mic (≥ 0.35 s), **release** | Sends |
| Hold, then **drag away** (> 120 px) | Cancels ("Voice note cancelled") |
| **Escape** while recording | Cancels |
| Shorter than 0.7 s | Not sent: "Hold the mic a little longer…" |
| Reaches 2:00 | Sent automatically |

Sending flow (optimistic, like text):

```
recording → { blob, duration, mimeType }
  → validateAudio()  audio/webm | ogg | mpeg | mp4, ≤ 5 MB
  → bubble appears AT ONCE, playable from the local recording (blob: URL), with an upload bar
  → POST /messages/:id/media  multipart: file, duration, clientId
      → progress → MESSAGE_UPLOAD_PROGRESS
      → { message } → MESSAGE_CONFIRMED: the bubble switches to the server (Cloudinary) URL
      → error → red bubble + "Not sent · Retry"; Retry re-uploads the same recording
  → the server broadcasts new_message to everyone else
```

Recording format: Opus in WebM on Chrome, Firefox and Edge. **Safari automatically falls back to `audio/mp4`**, which is in the server whitelist. The bitrate is 32 kbps, about 240 KB per minute.

The player uses the duration stored on the message, because Chrome reports `Infinity` for MediaRecorder WebM files. It supports click-to-seek and ←/→ keys (±5 s), and only one note plays at a time.

Mic errors are shown in plain words:

| Situation | Message |
|---|---|
| Permission blocked | "Microphone access is blocked. Allow it in your browser's site settings…" |
| No mic | "No microphone was found on this device." |
| Used by another app | "Your microphone is being used by another app." |
| Not https | "Voice notes need a secure (https) connection." |

### 3.4 Chat Memory (`memory/ChatMemoryPanel.jsx`)

```
✨ → drawer opens → POST /ai/summarize/:conversationId (45 s timeout)
   → loading skeleton "Reading the conversation…"
   → Summary · Key decisions · Action items (owner / due) · Important dates (date chip)
```

- **Accepts strings or objects** for every list, so it works whatever shape P3's Gemini prompt returns: `"text"` or `{ text | item | title | description, owner | assignee, date | due | when }`.
- The result is cached per chat until the page reloads: closing and reopening is instant, and **Refresh** regenerates.
- Errors: 404 → "Chat Memory isn't available on this server yet". 429 → "busy, try again in a minute". 400 → the server's own message (e.g. "needs a few more messages"). All show Retry.
- The footer says "AI can make mistakes", or "offline mock summary" in mock mode.

### 3.5 Polish

| What | Where |
|---|---|
| Toasts for every success and failure (saved, added, removed, left, uploaded) | `ui/Toast.jsx`, shown above the composer on phones |
| Right-hand drawers: full screen on phones, 420 px on larger screens, Escape and backdrop close | `ui/Drawer.jsx` |
| Confirmation before every destructive action (remove member, leave, remove photo) | `ui/ConfirmDialog.jsx` |
| Contact info for private chats (name, bio, presence; **email hidden**, §8.3) | `group/ContactPanel.jsx` |
| Avatars retry loading when the picture changes | `ui/Avatar.jsx` |
| Every new icon-only button has an `aria-label`; the voice slider has `aria-valuetext` | all |

### 3.6 Bugs found and fixed in earlier parts

1. **Modal stole focus on every keystroke** (Part 1 `Modal.jsx`). Typing "DSA Study Group" in the New-group dialog saved just **"D"**. The open-effect depended on `onClose`, which changes every render, so it refocused the panel each time. Fixed in Modal and Drawer: the effect runs only when the dialog opens, and it leaves an `autoFocus` input focused.
2. **The mic didn't respond to a plain click.** Screen readers and switch devices send `click` without pointer events. A plain click now starts tap mode.

---

## 4. Deployment check (client)

- [ ] Vercel → Environment Variables: `VITE_API_URL=https://<your-render-app>.onrender.com`, `VITE_USE_MOCKS=false`, `VITE_FEATURE_CHAT_MEMORY=true`
- [ ] Redeploy after changing env vars (Vite bakes them in at build time)
- [ ] `vercel.json` SPA rewrite is in place, so refreshing on `/chat/<id>` or `/profile` must not 404
- [ ] The "Mock API" badge must **not** appear on the deployed site
- [ ] P1's `CLIENT_URL` on Render includes the exact Vercel URL (CORS and Socket.IO)
- [ ] The mic works on the deployed site (needs https; Vercel provides it)
- [ ] Open the deployed site on a phone and send a voice note to a laptop

---

## 5. Contract notes for P1 and P3

Superseded by [`P2_INTEGRATION.md`](P2_INTEGRATION.md) §4–5. The earlier proposals (group-picture upload route, `conversation_updated` event, media `clientId` echo) are **withdrawn** to match P3's "no contract changed".

## 6. How to check it's working

### Already verified (automated)

| Suite | Result |
|---|---|
| Part 3 reducer and media unit tests: voice optimistic → progress → confirmed (with and without `clientId` echo), group removal cleanup, partial `conversation_updated`, file and audio validation | ✅ 16 / 16 |
| Part 2 reducer suite (regression) | ✅ 28 / 28 |
| **Part 3 end to end** in headless Chromium with a **fake microphone** (real MediaRecorder recording, upload and playback) | ✅ 59 / 59 |
| **Part 2 end to end, re-run as a regression** | ✅ 47 / 47 |

The Part 3 E2E covers:
- **Demo group:** 11 unread, sender names, seeded pin.
- **Group real time:** staggered typing and replies; ticks stay at ✓ while Kabir is offline.
- **Chat Memory:** loading state, then the right decisions, owners and dates; Escape closes; cached on reopen.
- **Non-admin view:** no admin tools; Escape in the confirm dialog doesn't close the drawer; leaving works.
- **Group admin:** create-group validation and creation; rename (live in header and sidebar); add and remove members.
- **Group photo:** wrong type and > 5 MB rejected before upload; upload, then remove.
- **Voice notes:** hold → release sends; real duration; ✓✓ read; plays and resets; tap → Discard; drag-away cancel; survives refresh; blocked-mic message.
- **Profile:** save disabled until changed; bio over 160 blocked; photo upload and remove; persists after refresh.
- **Layout:** 375 px drawers fit with no horizontal scroll.
- **Errors:** zero console errors.

**Not run here:** `npm install` / `npm run build` (package downloads blocked). The router and icon packages were small stand-ins in the test build.

### Your manual checklist

**A. Mock mode (10 min)**
- [ ] `npm install && npm run build` passes
- [ ] Robotics Club → ✨ → decisions, owners and dates look right
- [ ] Create a group, rename it, add and remove someone, upload and remove a group photo
- [ ] Hold the mic → release → play it back. Tap the mic → Discard. Hold → drag away → cancelled.
- [ ] Profile: change name, bio and photo → back → the sidebar shows them
- [ ] Phone width: all drawers and dialogs fit

**B. Real server (with P1 and P3)**
- [ ] Three browsers / three accounts: create a group → it appears for the others **without a refresh**
- [ ] Group typing and messages live for all three; ticks turn blue only after **all** have read
- [ ] The admin removes a member → it disappears from their list with a toast
- [ ] Voice note from a **phone** (https) plays on a laptop, and vice versa (Safari ↔ Chrome)
- [ ] Profile photo uploads to Cloudinary (the URL in the DB is https://res.cloudinary.com/…)
- [ ] Chat Memory on a real conversation returns sensible results within a few seconds
- [ ] Turn off Wi-Fi mid-upload → "Not sent · Retry" → back online → Retry works

---

## 7. Suggested demo flow (about 3 minutes, for the 25% demo score)

1. **Landing page** → Sign up (show validation once) → the app opens with Robotics Club unread.
2. **Two browsers side by side:** search the other person → chat → instant messages, typing, ✓ → ✓✓ → blue ✓✓.
3. **Refresh** one browser → everything is still there (persistence).
4. **Star** the chat, **pin** a message.
5. **Voice note:** hold, speak, release → it plays on the other screen.
6. **Group:** create one, add both people, show "X is typing…" in the group.
7. **Chat Memory** on Robotics Club → decisions, action items and dates in seconds. *This is the differentiator; end on it.*
8. If asked about security: 404 on someone else's chat id, file checks before upload, no keys in the client.

---

## 8. Known limitations

- **Mock mode** stores uploaded pictures and voice notes as data URLs in `localStorage` (about 5 MB total). Fine for testing; use `localStorage.clear()` if it fills up. The real server uses Cloudinary.
- Being removed from a group *by another admin* can't happen in mock mode, because the simulated classmates don't manage groups. It is covered by the reducer tests and needs a real-server check.
- Image **sending** has no UI (Phase 5). Image messages from the server already render.
- Other people's changed names and avatars show on their next chat-list load (no profile-update socket event in the contract).
