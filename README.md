# CampusConnect

A real-time campus chat app built for the **First Commit** hackathon (KamandPrompt, IIT Mandi).
Students sign up, find each other, and chat one-to-one or in groups. Messages, typing, presence
and read receipts update live. Voice notes are supported, and an AI **Chat Memory** turns a
conversation into a summary, decisions, action items and dates.

## Live demo

**👉 [campus-connect-one-orcin.vercel.app](https://campus-connect-one-orcin.vercel.app)**

**🎬 Demo video: [watch on Google Drive](https://drive.google.com/file/d/1FTPNtIC8FtHIQ2w8bZcsP0A503Txcwtr/view?usp=sharing)**

| Part | Hosted on | URL |
|---|---|---|
| Web app (React) | Vercel | https://campus-connect-one-orcin.vercel.app |
| API + real-time server | Render | https://campus-connect-b3xy.onrender.com ([health check](https://campus-connect-b3xy.onrender.com/api/health)) |

> The server runs on Render's free plan and sleeps when idle. The **first request can take
> 30–50 seconds** while it wakes up; after that, everything is instant.

### Try it in two minutes

1. Open the app in a **normal window** and in an **incognito window**, and register two accounts
   (pick a campus, e.g. IIT Mandi).
2. In one window, search for the other person and start a chat. Messages, typing and the
   sent → delivered → read ticks update live in both windows.
3. Things to try:
   - **Message actions:** hover a message (or long-press on a phone) and use ⋮ to reply, edit or delete. Double-click a message to reply.
   - **📎 menu:** send a photo or document, share your location, or ask the other person for theirs.
   - **Voice and emoji:** hold the mic for a voice note, and use 😊 for emoji.
   - **Groups:** create one, then @mention someone.
   - **Chat Memory:** ✨ in the chat header summarises the conversation with AI.
   - **Settings (⚙):** switch to dark mode, change the accent colour, or turn off read receipts. ⋮ in a chat header sets a wallpaper or blocks someone.

**Full setup, testing and deployment steps: [`DEPLOY_GUIDE.md`](DEPLOY_GUIDE.md).**

## What makes CampusConnect different

General chat apps are built for everyone. CampusConnect is built for one place: a campus. That changes what the app is good at.

- **Campus is part of who you are, so you can find people you've never met.**
  - WhatsApp and Telegram need someone's phone number before you can talk.
  - On CampusConnect, every account belongs to a campus (all 23 IITs), chosen at sign-up.
  - Search starts with your own campus, so you can find a classmate, lab partner or club member by name, with no number swapping.
  - One tap on "All campuses" widens the search for inter-IIT teams and fests.
- **Location sharing made for meeting up on campus.**
  - Ask someone where they are and they decide whether to answer. Requests expire after 10 minutes.
  - When sharing, you confirm your position on a map first, can label it ("Library, 2nd floor"), and see how accurate it is.
  - The **server** checks whether the point is inside your campus and marks it **"On campus ✓"**. The sender's device can't fake that badge.
  - One tap gives the other person walking directions.
- **AI Chat Memory turns long group chats into something you can act on.**
  - Project and club groups bury the important parts under hundreds of messages.
  - ✨ Chat Memory (Google Gemini) reads the conversation and returns a summary, key decisions, action items with owners, and important dates and deadlines.
  - Relative dates such as "tomorrow" are resolved to real dates.
  - The AI runs only on the server, never sees the API key in the browser, and only summarises chats you're a member of.
- **Privacy that suits a student community.**
  - Sign-up needs an email, not a phone number.
  - You can switch off read receipts. As on WhatsApp, you then also stop seeing other people's.
  - In groups, Message info shows exactly who has read and received each message.
  - You can block people and permanently delete your account.
  - Location is never shared automatically.
- **Nothing to install.**
  - It runs in any browser on a phone, tablet or laptop, with live typing, presence and sent/delivered/read ticks.
  - It works well on shared lab PCs and on phones with little storage.
- **Safer file sharing.**
  - Every photo, document and voice note is checked by its actual content on the server, not by its file name. A renamed `.exe` is rejected.
  - Only a short list of safe formats is accepted.
- **Made to feel like home.**
  - A Himalayan visual identity inspired by IIT Mandi's Kamand valley.
  - Light, dark and system themes, 6 accent colours, density, text size and bubble shape settings, and a different wallpaper for each chat.

## Features

- **Accounts:** register, log in, log out, persistent sessions (JWT), bcrypt-hashed passwords
- **One-to-one chat:** user search, one chat per pair, real-time delivery, persistent paginated history
- **Live status:** online/offline with last seen, typing indicator, sent / delivered / read ticks
- **Organisation:** per-user starred chats, pinned messages, unread counts
- **Groups:** create, rename, add/remove members, admin hand-over when the admin leaves
- **Profiles:** name, bio, profile picture upload / replace / remove
- **Voice notes:** hold-to-record, upload with validation, in-chat player
- **AI Chat Memory (Gemini):** summary, key decisions, action items, important dates
- **Edit and delete (Round 2):** edit your text messages within 15 min; delete for everyone within 1 h, or for yourself any time
- **Replies and @mentions (Round 2):** quote-reply (menu, double-click or swipe), jump to the original; @mention group members with autocomplete and an @ badge
- **Campuses (Round 2):** pick your campus (all 23 IITs) at sign-up; people search defaults to your campus, with an "All campuses" option
- **Photos and documents (Round 2):** JPG/PNG/WebP/GIF, plus PDF, Word, Excel, PowerPoint and .txt, checked by content on the server; paste, drag-and-drop, captions, a lightbox and file cards
- **Location sharing (Round 2):** share your location or ask for someone's, confirm on a map first, see whether it's on campus, get directions. Never shared automatically.
- **Privacy (Round 2):** turn read receipts off (WhatsApp-style), see who read a group message (Message info), block people, delete your account
- **Customisation (Round 2):** light/dark/system theme, 6 accent colours, density, text size, bubble shape, per-chat wallpapers, emoji picker, and a Himalayan visual identity
- **Security:** membership check on every conversation access (404 for outsiders), rate limiting,
  magic-byte file validation, origin-restricted CORS and sockets, secrets only on the server

## Architecture

```
 React + Vite (Vercel)  ──HTTPS/REST──▶  Express API  ─┐
        │                                              ├─ one Node process (Render) ──▶ MongoDB Atlas
        └──────────WebSocket (Socket.IO)──▶ Socket.IO ─┘          │
                                                                  ├──▶ Cloudinary (media, server-side upload)
                                                                  └──▶ Gemini API (Chat Memory)
```

- **REST** handles auth, users, conversations, history, pins, stars, uploads and AI.
- **Socket.IO** handles sending text, `new_message`, typing, presence and receipts. Each socket joins
  a `user:<id>` room, and the server emits to every participant's room.
- Text is sent over the socket with an acknowledgement; the client shows it at once and
  de-duplicates on the ack or the broadcast.

| Layer | Tech |
|---|---|
| Client | React 18, Vite, Tailwind CSS v4, lucide-react, axios, socket.io-client |
| Server | Node.js, Express, Socket.IO, Mongoose, bcryptjs, jsonwebtoken, helmet, express-rate-limit, multer |
| Data / services | MongoDB Atlas, Cloudinary, Google Gemini |

## Quick start (local)

```bash
# server
cd server && npm install && cp .env.example .env   # fill MONGODB_URI and JWT_SECRET
npm run dev                                         # http://localhost:5000

# client (second terminal)
cd client && npm install && cp .env.example .env    # VITE_API_URL=http://localhost:5000, VITE_USE_MOCKS=false
npm run dev                                         # http://localhost:5173
```

Tests (server running): `cd server && npm run smoke:all && npm run smoke:realtime && npm run smoke:round2`.
API and socket contracts, security rules and the manual test checklist: [`PROJECT_INSTRUCTIONS.md`](PROJECT_INSTRUCTIONS.md).

## Environment variables

| File | Variable | Required | Purpose |
|---|---|---|---|
| `server/.env` | `MONGODB_URI` | ✅ | Atlas connection string |
| | `JWT_SECRET` | ✅ | ≥ 32 random characters |
| | `CLIENT_URL` | ✅ | Allowed frontend origin(s), comma-separated |
| | `JWT_EXPIRES_IN`, `PORT`, `NODE_ENV` | | defaults `7d`, `5000`, `development` |
| | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | optional | pictures, voice notes, photos and documents |
| | `GEMINI_API_KEY`, `GEMINI_MODEL` | optional | AI Chat Memory |
| `client/.env` | `VITE_API_URL` | ✅ | server URL, no `/api` |
| | `VITE_USE_MOCKS` | | must be `false` outside UI-only development |
| | `VITE_FEATURE_CHAT_MEMORY` | | `false` hides the Chat Memory button |

Round 2 adds **no new environment variables**. The campus list lives in `server/src/config/campuses.js`.

> **Cloudinary and PDFs.** Free Cloudinary accounts block delivery of PDF and ZIP files by default. Uploads still succeed, but opening the file returns 401. To allow it, go to **Cloudinary console → Settings → Security** and turn on **"Allow delivery of PDF and ZIP files"**. Until then, the chat shows a short explanation when someone opens a PDF. Word, Excel, PowerPoint and .txt files aren't affected.

## Repository layout

```
server/   Express + Socket.IO API (src/routes, src/socket, src/services, src/models, scripts/ tests)
client/   React app (src/pages, src/components, src/hooks = real-time layer, src/lib)
docs/     Team integration notes
PROJECT_INSTRUCTIONS.md  Contracts (§5–8), conventions and the testing checklist (§12)
```

## Team

- **P1 — Backend & Data:** auth, models, REST API, authorization, uploads, AI endpoint
- **P2 — Frontend & UI:** design system, pages, components, responsive layout
- **P3 — Real-time & Integration:** Socket.IO server and client hooks, presence, receipts, voice notes, Gemini prompt
