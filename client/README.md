# CampusConnect Client — Part 1: Foundation

> **How the frontend uses P3's hooks (current architecture) → [`P2_INTEGRATION.md`](P2_INTEGRATION.md).** **Part 2 → [`PART2_README.md`](PART2_README.md)** (real chat store; the mock API now lives in `src/lib/mock/`). **Part 3 → [`PART3_README.md`](PART3_README.md)** (profile, groups, voice notes, Chat Memory, deployment check, demo flow).

Owner: **Person 2 (Frontend & UI)**

Part 1 is the base every other screen is built on: the design system, the API layer, authentication, routing and a responsive chat layout. It runs **without the backend** (mock mode), so you can build and demo the UI before P1's server is ready.

---

## 1. Quick start

```bash
cd client
npm install
cp .env.example .env      # VITE_USE_MOCKS=true by default
npm run dev               # http://localhost:5173
```

In mock mode, log in with any seeded account (password `password123`), or press **"Mock mode: fill a demo account"** on the login page:

| Name | Email |
|---|---|
| Aarav Sharma | aarav@students.iitmandi.ac.in |
| Diya Patel | diya@students.iitmandi.ac.in |
| Kabir Rao | kabir@students.iitmandi.ac.in |
| Meera Nair | meera@students.iitmandi.ac.in |

You can also register a new account; it is saved in your browser.

**Switching to the real server:** once P1's server is running, set `VITE_USE_MOCKS=false` in `.env` and restart `npm run dev`. No code changes are needed. An amber **"Mock API"** badge stays visible in the bottom-left corner while mocks are on, so a mock build is never demoed or deployed by mistake.

### Environment variables

| Variable | Example | Meaning |
|---|---|---|
| `VITE_API_URL` | `http://localhost:5000` | Server origin, without `/api` and without a trailing slash |
| `VITE_USE_MOCKS` | `true` / `false` | `true` uses the in-browser mock API. **Must be `false` when deployed.** |

---

## 2. What's inside

```
client/
├── index.html               Fonts (Plus Jakarta Sans), favicon, root div
├── vite.config.js           React + Tailwind v4 plugins
├── vercel.json              SPA rewrite so /chat/123 doesn't 404 on refresh
├── .env.example
└── src/
    ├── main.jsx             Mounts <BrowserRouter> → <AuthProvider> → <App>
    ├── App.jsx              Route table
    ├── index.css            Design tokens (the ONLY place raw colours live)
    │
    ├── lib/
    │   ├── api.js           axios instance, token header, 401 → logout, error messages, authApi/usersApi
    │   ├── mock/            Fake server + socket following the contract (mock mode only, see Part 2)
    │   ├── storage.js       Safe localStorage wrapper for the JWT
    │   ├── validation.js    Client-side form rules (match the server rules)
    │   ├── format.js        Initials, times, "last seen…", date separators
    │   ├── receipts.js      Message tick status: sending / sent / delivered / read / failed
    │   └── conversation.js  Chat title, avatar, "other participant" helpers
    │
    ├── context/
    │   └── AuthContext.jsx  user, status, login, register, logout, updateUser, retry
    │
    ├── components/
    │   ├── ui/              Design-system primitives (see §4)
    │   ├── RouteGuards.jsx  ProtectedRoute, GuestRoute
    │   ├── AuthLayout.jsx   Split-screen layout for Login/Register
    │   ├── MockModeBadge.jsx
    │   ├── sidebar/         Sidebar, ConversationItem
    │   └── chat/            ChatWindow (+ header), MessageBubble (+ ReceiptTicks), Composer
    │
    └── pages/
        ├── Landing.jsx      Marketing page (your pitch opener)
        ├── Login.jsx
        ├── Register.jsx
        ├── Chat.jsx         Sidebar + chat (live data since Part 2)
        └── NotFound.jsx
```

---

## 3. How it works

### 3.1 Layers

```
Pages            Landing · Login · Register · Chat · NotFound
  │
Components       Sidebar, ChatWindow, Composer, AuthLayout …
  │
UI primitives    Button · Input · Avatar · Badge · Modal · Spinner · EmptyState · ErrorState
  │
State            AuthContext   (Part 2 adds ChatStore)
  │
Data access      lib/api.js  ──►  real server   or   lib/mock/ (VITE_USE_MOCKS=true)
```

**Rule:** components never import `axios` directly. All HTTP goes through `lib/api.js`, and socket access (Part 2, owned by P3) goes through `lib/socket.js`.

### 3.2 Routing

| Path | Guard | What happens |
|---|---|---|
| `/` | none | Landing page. Redirects to `/chat` if you're already logged in. |
| `/login`, `/register` | `GuestRoute` | Logged-in users are sent to `/chat` (or back to the page they originally asked for). |
| `/chat` | `ProtectedRoute` | Conversation list. On desktop it also shows a "Pick a conversation" state. |
| `/chat/:conversationId` | `ProtectedRoute` | Open chat. On mobile this **replaces** the sidebar; the back arrow returns to `/chat`. |
| anything else | none | 404 page |

`ProtectedRoute` has four outcomes:
- **checking:** full-screen spinner while a saved token is validated
- **error:** "Can't reach CampusConnect" with a **Try again** button (server down or offline)
- **guest:** redirect to `/login`, remembering where you were going
- **authed:** render the page

Because the open chat lives in the URL, refreshing keeps you inside the same conversation.

### 3.3 Authentication flow

**Register or log in**

```
Form submit
  → validation.js checks fields          (instant errors under each input)
  → AuthContext.login/register
  → authApi.login/register  (lib/api.js)
  → POST /api/auth/login  → { token, user }
  → token saved in localStorage ("cc_token"), user saved in context, status = 'authed'
  → navigate to /chat (or to the page you were redirected from)
```

**App start (page refresh)**

```
Token in localStorage?
   no  → status = 'guest'
   yes → status = 'checking' → GET /api/auth/me
          200          → user restored, 'authed'
          401          → token deleted, 'guest'
          network fail → 'error' (Try again button), the token is kept
```

**Automatic logout on 401.** The axios response interceptor in `api.js` calls a handler that AuthContext registers. Any request that returns 401 (expired or tampered token) clears the session and the guard redirects to `/login`. The exception is `/auth/login` and `/auth/register`: a wrong password is also a 401, and it must show "Invalid email or password", not log you out.

**Every request** gets `Authorization: Bearer <token>` added by the request interceptor.

**Multiple tabs.** AuthContext listens to the browser `storage` event, so logging out in one tab logs out every open tab.

**Logout** calls `POST /auth/logout`, then always deletes the token, even if the server call fails.

### 3.4 Errors shown to users

`getErrorMessage(error)` in `api.js` turns any failure into one readable sentence:

| Situation | Message |
|---|---|
| Server sent `{ error: "…" }` | The server's message |
| No response (offline, server down, CORS) | "Cannot reach the server…" |
| Timeout (15 s) | "The server took too long to respond…" |
| 429 | "Too many attempts…" |

### 3.5 Mock API (`lib/mock/mockApi.js`)

This is a custom axios **adapter**: when mocks are on, axios hands each request to this function instead of the network. It uses the same paths, bodies, responses and `{ error }` shape as the REST contract (PROJECT_INSTRUCTIONS §6), with 350 ms of fake latency so loading states are visible.

Implemented in mock mode: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `GET /users/search`, `GET /users/:id`, `PUT /users/profile`. Anything else returns a clear 404, "Mock API: … is not implemented yet".

Mock users live in `localStorage["cc_mock_users"]`, with passwords in plain text. **Demo only.** The real server uses bcrypt. To reset the mock data, run `localStorage.clear()` in DevTools.

### 3.6 Design system (`src/index.css`)

Tailwind v4 reads the `@theme` block and turns every token into utilities:

| Token | Utility examples | Use |
|---|---|---|
| `--color-brand-50…900` | `bg-brand-600`, `text-brand-700` | Primary actions, own message bubbles |
| `--color-canvas` / `surface` / `surface-muted` | `bg-canvas`, `bg-surface` | Page background, cards, hover states |
| `--color-border` / `border-strong` | `border-border` | Dividers, inputs |
| `--color-ink` / `ink-muted` / `ink-subtle` | `text-ink-muted` | Three levels of text |
| `--color-success` / `danger` / `star` / `read` | `bg-success`, `fill-star`, `text-read` | Online dot, errors, starred, read ticks |
| `--color-tone-1…5` | `bg-tone-3` | Avatar initials backgrounds (picked from the name, so stable per person) |
| `--radius-card`, `--radius-bubble` | `rounded-card`, `rounded-bubble` | Cards, message bubbles |
| `--shadow-card`, `--shadow-pop` | `shadow-card`, `shadow-pop` | Cards, dialogs |
| `--animate-fade-in`, `--animate-slide-up` | `animate-slide-up` | New bubbles, dialogs (disabled for users who prefer reduced motion) |

**To change the look, edit only `index.css`.** Never write hex values in components.

---

## 4. UI primitives (`src/components/ui`)

| Component | Key props | Notes |
|---|---|---|
| `Button` | `variant` (primary, secondary, ghost, danger), `size` (sm, md, lg, icon, icon-sm), `loading`, `fullWidth` | Shows a spinner and disables itself while `loading` |
| `buttonClass()` | same options | Button styling for `<Link>`s, so you never nest a button inside a link |
| `Input` | `label`, `error`, `hint`, `icon`, `trailing` | Wires `aria-invalid` and `aria-describedby` automatically |
| `PasswordInput` | same as Input | Show/hide toggle |
| `Avatar` | `name`, `src`, `size` (xs–xl), `online` | Falls back to initials if the image is missing or fails. `online` true/false shows a dot; leave it undefined for no dot. |
| `Badge` | `tone` (brand, soft, neutral, warning) | Unread counts, labels |
| `Modal` | `open`, `onClose`, `title`, `footer`, `size` | Escape and backdrop close it. Bottom sheet on mobile, centred on desktop. Focus returns to the trigger when it closes. |
| `Spinner`, `FullScreenLoader`, `Skeleton` | | Loading states |
| `EmptyState` | `icon`, `title`, `description`, `action` | Empty states |
| `ErrorState` | `title`, `message`, `onRetry` | Error states with a retry button |
| `Alert` | children | Inline form error (server message) |
| `Logo` | `inverted` | Brand mark |

Every screen uses these for its **loading / empty / error** states, as required by PROJECT_INSTRUCTIONS §9.

---

## 5. The chat skeleton (preview data) — superseded by Part 2

`/chat` already has the final layout and components, but its data comes from `lib/fixtures.js`. The fixtures are shaped exactly like the API responses: populated `participants`, `lastMessage`, `isStarred`, `unreadCount`, and messages with `deliveredTo` / `readBy`. Part 2 can therefore swap in real data without touching the components.

What already works:
- Starred section and All chats list, with unread badges, relative times and online dots
- Chat search, with an empty state when nothing matches
- Open a chat: header shows online / "last seen 42 min ago" / "4 members", with date separators and grouped bubbles
- Ticks: clock (sending) → one tick (sent) → two grey ticks (delivered) → two blue ticks (read), computed by `lib/receipts.js` using the "all other participants" rule, so groups work too
- Composer: auto-growing, Enter to send, Shift+Enter for a new line, 4000-character limit with a counter, mic placeholder
- Sending adds an optimistic bubble (`sending`) that becomes `sent` after 600 ms. Part 2 replaces this with the socket ack.
- A bad chat id shows "Conversation not found"
- Phone: the list and the chat are separate screens. Tablet and desktop: side by side.

Disabled on purpose, with tooltips: New conversation, Star (Part 2), Chat Memory and Mic (Part 3). A **"Preview"** badge next to your name marks the data as fake.

---

## 6. How to check it's working

### Already verified (automated)

| Check | Result |
|---|---|
| Whole app bundles; every import and export resolves | ✅ |
| All 5 pages and both guards render with React, including chat open, group chat, bad id, and guest redirect | ✅ 11/11 |
| Auth and API logic through real axios: register, duplicate email, Bearer header, `/auth/me`, search (excludes self, regex-safe), wrong password, auto-logout on 401, error messages, receipts, formatting | ✅ 24/24 |
| Tailwind v4 compiles; every custom token utility exists (`bg-tone-1`, `rounded-card`, `fill-star`, `bg-ink/40`, …) | ✅ 21/21 |
| No hex colours in components, no `console.log`, every icon-only button has an `aria-label` | ✅ |

`npm install` and `npm run build` could not run in the environment where this was written, because package downloads were blocked. **Run those two commands first on your machine.**

### Your manual checklist (about 10 minutes)

**Build**
- [ ] `npm install && npm run build` finishes with no errors

**Auth (mock mode)**
- [ ] Register a new user → you land in `/chat` with your name in the sidebar
- [ ] Refresh → still logged in
- [ ] Log out → you're on `/login`. Pressing Back does **not** show the chat.
- [ ] Log in with a wrong password → red "Invalid email or password", no crash
- [ ] Submit an empty form → an error under each field
- [ ] Register with an existing email (any case) → "An account with this email already exists"
- [ ] Open `/chat` while logged out → redirected to login. After logging in, you return to `/chat`.

**Session robustness**
- [ ] DevTools → Application → Local Storage → set `cc_token` to `mock.000000000000000000000000` → refresh → you're logged out (the 401 handler worked)
- [ ] Open two tabs, log out in one → the other tab logs out too
- [ ] With `VITE_USE_MOCKS=false` and no server running → refresh while logged in → "Can't reach CampusConnect" with Try again

**Layout** (DevTools device toolbar)
- [ ] **375 px:** list only. Tap a chat → chat only. Back arrow → list. No horizontal scrolling.
- [ ] **768 px and 1280 px:** sidebar and chat side by side
- [ ] Landing page looks right at all three widths
- [ ] Tab through Login with the keyboard → visible focus ring on every control

**Chat skeleton**
- [ ] Diya's chat shows a mix of blue, grey and single ticks
- [ ] Type a message, press Enter → it appears with a clock, then a tick
- [ ] Shift+Enter adds a new line. Paste over 3500 characters → the counter appears. Over 4000 → Send is disabled.
- [ ] Visit `/chat/abc` → "Conversation not found"
- [ ] Visit `/anything` → 404 page

---

## 7. What Part 2 plugs in

| Part 1 piece | Replaced or extended in Part 2 |
|---|---|
| `fixtures.js` in `Chat.jsx` | `ChatStore` (useReducer) filled from `GET /conversations` and `GET /messages/:id` |
| `PREVIEW_ME_ID` | `user._id` from AuthContext |
| Local sidebar filter | Debounced `usersApi.search()` → `POST /conversations` → navigate |
| Fake 600 ms send | P3's `useChatSocket().sendMessage` with ack and `clientId` dedupe |
| Disabled Star button | `POST/DELETE /conversations/:id/star` with an optimistic toggle |
| `logout()` | Also disconnects the socket (P3) |

The UI primitives, AuthContext, `api.js`, guards, layout, `receipts.js` and `format.js` stay as they are.
