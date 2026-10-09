# CampusConnect

A real-time campus chat app built for the **First Commit** hackathon (KamandPrompt, IIT Mandi).
Students sign up, find each other, and chat one-to-one or in groups. Messages, typing, presence
and read receipts update live. Voice notes are supported, and an AI **Chat Memory** turns a
conversation into a summary, decisions, action items and dates.

**Full setup, testing and deployment steps: [`DEPLOY_GUIDE.md`](DEPLOY_GUIDE.md).**

## Features

- **Accounts:** register, log in, log out, persistent sessions (JWT), bcrypt-hashed passwords
- **One-to-one chat:** user search, one chat per pair, real-time delivery, persistent paginated history
- **Live status:** online/offline with last seen, typing indicator, sent / delivered / read ticks
- **Organisation:** per-user starred chats, pinned messages, unread counts
- **Groups:** create, rename, add/remove members, admin hand-over when the admin leaves
- **Profiles:** name, bio, profile picture upload / replace / remove
- **Voice notes:** hold-to-record, upload with validation, in-chat player
- **AI Chat Memory (Gemini):** summary, key decisions, action items, important dates
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

Tests (server running): `cd server && npm run smoke:all && npm run smoke:realtime`.

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

> **Cloudinary and PDFs.** Free Cloudinary accounts block delivery of PDF and ZIP files by default. Uploads still succeed, but opening the file returns 401. To allow it, go to **Cloudinary console → Settings → Security** and turn on **"Allow delivery of PDF and ZIP files"**. Until then, the chat shows a short explanation when someone opens a PDF. Word, Excel, PowerPoint and .txt files aren't affected.

## Repository layout

```
server/   Express + Socket.IO API (src/routes, src/socket, src/services, src/models, scripts/ tests)
client/   React app (src/pages, src/components, src/hooks = real-time layer, src/lib)
docs/     Team integration notes
```

## Team

- **P1 — Backend & Data:** auth, models, REST API, authorization, uploads, AI endpoint
- **P2 — Frontend & UI:** design system, pages, components, responsive layout
- **P3 — Real-time & Integration:** Socket.IO server and client hooks, presence, receipts, voice notes, Gemini prompt
