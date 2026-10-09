# CampusConnect — Run, Test and Deploy Guide

This guide takes the merged code (P1 server + P3 real-time layer + P2 frontend) from a fresh
clone to a live app: **client on Vercel, server on Render, data in MongoDB Atlas**.

Follow the steps in order. Steps marked *(optional)* can be skipped; the app still works,
and only that feature turns off (uploads → 503, Chat Memory → 503).

---

## 0. What you need

| Thing | Why | Free? |
|---|---|---|
| Node.js **20 or 22** (≥ 18.17 works) | run server and client locally | ✅ |
| GitHub account + this repo | Render and Vercel deploy from it | ✅ |
| MongoDB Atlas account | database | ✅ M0 cluster |
| Render account | hosts the Express + Socket.IO server | ✅ free web service |
| Vercel account | hosts the React client | ✅ Hobby |
| Cloudinary account *(optional)* | profile pictures, group pictures, voice notes | ✅ |
| Google AI Studio API key *(optional)* | AI Chat Memory (Gemini) | ✅ free tier |

Check Node: `node -v` → must print v18.17 or newer.

---

## 1. Put the repo into its final shape

The GitHub repo currently holds several versions side by side (`campusconnect-client-part1…v4`,
a server zip, and partial `client/` and `server/` folders). Render and Vercel need **one**
`server/` and **one** `client/` folder.

1. Unzip `campusconnect-final.zip` (sent with this guide). It contains:

   ```
   campusconnect/
   ├── README.md            ← hackathon README (architecture, features, setup)
   ├── DEPLOY_GUIDE.md      ← this file
   ├── docs/                ← team integration notes (P1, P2, P3)
   ├── server/              ← P1's server + P3's socket/, services/media.js, services/aiMemory.js
   └── client/              ← P2's v4 client + P3's src/lib/socket.js and src/hooks/
   ```

2. Replace the repo contents with it (from your local clone of `Campus_Chatbot`):

   ```bash
   cd Campus_Chatbot
   git rm -r --quiet campusconnect-client-part1 campusconnect-client-part2 \
     campusconnect-client-part3 campusconnect-client-v4 campusconnect-server-p1-final.zip \
     client server CAUTION_AND_DIRECTION.md INTEGRATION-P3.md
   # copy everything from the unzipped campusconnect/ folder into Campus_Chatbot/
   cp -r ../campusconnect/. .
   git add -A
   git commit -m "chore: merge P1, P2 and P3 into final server/ and client/"
   git push
   ```

3. Confirm on GitHub that the top level shows `server/`, `client/`, `docs/`, `README.md`,
   `DEPLOY_GUIDE.md` and **no `.env` files**.

> Keep the repo **private** until the hackathon ends (rule in the problem statement).
> Render and Vercel can both deploy from private repos once you connect GitHub.

---

## 2. Create the database (MongoDB Atlas)

1. Go to <https://cloud.mongodb.com> → **Create** → choose the free **M0** cluster
   (region: Mumbai `ap-south-1`, or the one closest to your Render region).
2. **Database Access** → **Add New Database User** → username + a password
   without special characters (`@ : / ?` break the URI). Role: *Read and write to any database*.
3. **Network Access** → **Add IP Address** → **Allow access from anywhere** (`0.0.0.0/0`).
   Render's free tier has no fixed IP, so this is required.
4. **Database → Connect → Drivers** → copy the connection string. Insert the database name
   `campusconnect` before the `?`:

   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/campusconnect?retryWrites=true&w=majority
   ```

   This is your `MONGODB_URI`.

---

## 3. Get the optional keys

### 3a. Cloudinary *(optional: pictures and voice notes)*
1. Sign up at <https://cloudinary.com>.
2. **Settings → API Keys** → copy **Cloud name**, **API key**, **API secret**.

### 3b. Gemini *(optional: AI Chat Memory)*
1. Open <https://aistudio.google.com/apikey> → **Create API key**.
2. Use model `gemini-3.5-flash-lite` (already the default in the code). Google only serves
   the older 2.5 models to accounts that used them before, so new keys need a 3.x model.

### 3c. JWT secret *(required)*
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the output. It must be **at least 32 characters**, or the server refuses to start in production.

---

## 4. Run everything locally

### 4a. Server

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env`:

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...your Atlas URI.../campusconnect-dev?retryWrites=true&w=majority
JWT_SECRET=...the 96-character string from step 3c...
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173

# optional
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
```

Locally, use the database name **`campusconnect-dev`** (same cluster, separate data), and keep
`campusconnect` for Render. Test users and smoke-test leftovers then never show up in the live app.

Start it:

```bash
npm run dev
```

You should see:

```
[db] MongoDB connected: ...
[server] CampusConnect API on http://localhost:5000 (development)
[server] Allowed client origins: http://localhost:5173
```

Check <http://localhost:5000/api/health> → `{"ok":true,"db":"connected","features":{...}}`.

### 4b. Run the automated tests (server must be running)

Open a **second terminal**:

```bash
cd server
npm run smoke:all        # P1: auth, security, conversations, messages, groups, uploads
npm run smoke:realtime   # P3: socket auth, live messages, typing, presence, receipts, media/AI guards
```

Every line should be ✅. Both suites create throwaway users. P1's tests delete theirs;
P3's leave users named **Smoke A / Smoke B / Smoke C** behind, which is why local runs use the
`campusconnect-dev` database.
Upload and Gemini checks are reported as *skipped / expects 503* when those keys aren't set.
That is fine.

### 4c. Client

```bash
cd client
npm install
cp .env.example .env
```

`client/.env`:

```env
VITE_API_URL=http://localhost:5000
VITE_USE_MOCKS=false
VITE_FEATURE_CHAT_MEMORY=true
```

```bash
npm run dev
```

The terminal must print `[campusconnect] real-time layer: P3's hooks (src/hooks)`.
If it says *P2 stand-ins*, `VITE_USE_MOCKS` is still `true`.

Open <http://localhost:5173>.

### 4d. The two-user checkpoint (do this after every merge)

Use a **normal window** and an **incognito window**:

- [ ] Register user A in one window and user B in the other.
- [ ] A searches B, opens the chat; doing it again opens the **same** chat.
- [ ] Messages appear instantly both ways; after a **refresh** they're still there, in order.
- [ ] Typing indicator shows on the other side and disappears.
- [ ] Ticks go ✓ → ✓✓ grey → ✓✓ coloured when B opens the chat.
- [ ] Close B's window: A sees B **offline** with a "last seen" time after ~3 s.
- [ ] Star a chat in A: it does **not** become starred for B.
- [ ] Pin a message: it appears in the pinned bar for both.
- [ ] Create a group with A, B and a third user; rename it; remove a member.
- [ ] *(Cloudinary)* Profile picture upload, replace, remove. Hold the mic to send a voice note; play it.
- [ ] *(Gemini)* Open **Chat Memory** in a chat with a few messages.
- [ ] Shrink the browser to phone width: sidebar and chat become separate screens.

---

## 5. Deploy the server on Render

1. <https://dashboard.render.com> → **New → Web Service** → connect GitHub → pick `Campus_Chatbot`.
2. Settings:

   | Field | Value |
   |---|---|
   | Name | `campusconnect-api` (your URL becomes `https://campusconnect-api.onrender.com`) |
   | Region | Singapore (closest to India) |
   | Branch | `main` |
   | **Root Directory** | `server` |
   | Runtime | Node |
   | Build Command | `npm install` |
   | Start Command | `npm start` |
   | Instance type | Free |

3. **Environment variables** (Advanced → Add Environment Variable):

   | Key | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `MONGODB_URI` | your Atlas URI |
   | `JWT_SECRET` | your 96-character secret |
   | `JWT_EXPIRES_IN` | `7d` |
   | `CLIENT_URL` | `http://localhost:5173` for now (you'll add the Vercel URL in step 7) |
   | `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | *(optional)* |
   | `GEMINI_API_KEY` | *(optional)* |
   | `GEMINI_MODEL` | `gemini-3.5-flash-lite` |

   Don't set `PORT`; Render provides it and the server reads it.

4. **Advanced → Health Check Path**: `/api/health`.
5. Click **Create Web Service**. Wait for the log line `[server] CampusConnect API on …`.
6. Open `https://<your-service>.onrender.com/api/health` → `"db":"connected"`.

> **Keep it at ONE instance.** Online/offline status lives in server memory; two instances
> would disagree about who is online.

---

## 6. Deploy the client on Vercel

1. <https://vercel.com/new> → import `Campus_Chatbot`.
2. Settings:

   | Field | Value |
   |---|---|
   | **Root Directory** | `client` |
   | Framework Preset | Vite (auto-detected) |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

3. **Environment Variables**:

   | Key | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-service>.onrender.com` (no `/api`, no trailing `/`) |
   | `VITE_USE_MOCKS` | `false` |
   | `VITE_FEATURE_CHAT_MEMORY` | `true` (or `false` if you skipped Gemini) |

4. **Deploy**. Your site is `https://<project>.vercel.app`.
   `client/vercel.json` already sends every path to `index.html`, so refreshing `/chat/...` works.

> `VITE_*` values are baked in **at build time**. After changing one in Vercel, go to
> **Deployments → ⋯ → Redeploy**, or the old value stays.

---

## 7. Connect them (CORS)

The server only accepts the origins in `CLIENT_URL`, for both REST and Socket.IO.

1. Render → your service → **Environment** → edit `CLIENT_URL`:

   ```
   https://<project>.vercel.app,http://localhost:5173
   ```

   Comma-separated, **exact** origins, no paths. Keeping localhost lets you run the local
   client against the live server.
2. **Save Changes**. Render redeploys automatically (~1 minute).

---

## 8. Verify the live app

1. Open `https://<project>.vercel.app` → register two users (normal + incognito window, or two phones).
2. Run the §4d checkpoint again on the live URLs.
3. *(Optional)* Run the real-time tests against production from your laptop:

   ```bash
   cd server
   API_URL=https://<your-service>.onrender.com npm run smoke:realtime
   ```

   This leaves **Smoke A/B/C** users in the live database, and they show up in user search
   during the demo. Delete them afterwards in Atlas → **Browse Collections → users**
   (filter `{ "email": { "$regex": "^smoke\\." } }`), or skip this step if the suite already
   passed locally. P1's `smoke:all` connects to the database directly,
   so run it locally with your `.env`.
4. Voice notes need the microphone, which browsers only allow on **HTTPS**. Vercel is HTTPS,
   so test the mic on the live site or on `localhost`, not on a LAN IP.

---

## 9. Demo-day checklist

- **Wake the server 5 minutes before you present.** Render's free tier sleeps after
  15 minutes without traffic and takes about a minute to wake. Open `/api/health`, then the app.
- Log in your demo accounts in advance: a normal window, an incognito window, and a phone.
- Have a chat with a few real messages ready, so Chat Memory has something to summarise.
- Allow microphone permission once before the demo.
- Free Render gives 750 instance hours a month. One service running all month fits.
- If Atlas, Cloudinary or Gemini has a hiccup, chat keeps working: those features show their
  own error, and Chat Memory errors only appear inside its panel.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Server exits: `Missing required environment variable(s)` | `.env` / Render env missing `MONGODB_URI` or `JWT_SECRET` | Set them |
| Server exits: `JWT_SECRET should be at least 32 characters` | Short secret with `NODE_ENV=production` | Use the step 3c generator |
| `[db] Could not connect to MongoDB` | Wrong password, special characters in password, or IP not allowed | Atlas → Network Access `0.0.0.0/0`; re-copy the URI; URL-encode the password |
| Login page says *Cannot reach the server* | Wrong `VITE_API_URL`, or Render asleep | Check `/api/health`; fix the var, **redeploy Vercel** |
| Browser console: CORS error / `Origin not allowed` | Vercel URL not in `CLIENT_URL` | Add the exact origin (step 7) |
| Banner *Can't connect to live chat* | Socket blocked by CORS, or server down | Same as above; check Render logs |
| You get logged out right after login | Token rejected by the socket (`unauthorized`) | Server restarted with a different `JWT_SECRET`; log in again |
| Everything looks fine but nothing reaches the other user | `VITE_USE_MOCKS=true` (mock mode badge shows) | Set `false`, rebuild/redeploy |
| Upload / voice note says *not configured* (503) | Cloudinary vars missing | Add all three, redeploy Render |
| Chat Memory: *not configured* (503) | `GEMINI_API_KEY` missing | Add it |
| Chat Memory: *unavailable* (502) | Model id not available to your key | Set `GEMINI_MODEL=gemini-3.5-flash-lite` (or another current model from AI Studio) |
| Chat Memory: *busy* (429) | Gemini free-tier quota | Wait a minute |
| Mic button missing | Browser has no MediaRecorder, or the page isn't HTTPS/localhost | Use Chrome/Edge/Firefox/Safari on HTTPS |
| Refreshing `/chat/...` on Vercel gives 404 | `vercel.json` not in `client/` | Make sure it was committed |
| Someone shows "online" forever after a server crash | Presence is in memory; it resets on boot | Expected; the next restart marks everyone offline |

---

## 11. Submission checklist (from the problem statement)

- [ ] Repo contains complete source + `README.md` (setup, architecture, real-time tech, features, env vars).
- [ ] No secrets in the repo: `git log -p | grep -i -E "mongodb\+srv|api_secret|AIza"` returns nothing.
- [ ] Repo made **public** at submission time.
- [ ] Live link (Vercel) included.
- [ ] PPT on Google Drive with **public link access**.
- [ ] Demo video on YouTube, **public**.

---

## Appendix: what was checked and changed during integration (2026-10-09)

**Checked:** every `import`/`export` between P1, P2 and P3 files resolves (both servers' and the
client's full module graphs were bundled with esbuild, including P3's real hooks, not the stand-ins);
all server files pass `node --check`; P3's `deps.js` imports match P1's exports; REST and socket
payload shapes match between P1's routes, P3's hooks and P2's components; P3's message dedupe and
receipt logic was unit-tested. The full app was **not** run end-to-end in the review environment
(no npm registry access there), so step 4b/4d is the first live run. Do it before deploying.

**Fixed:**

| File | Problem | Change |
|---|---|---|
| `client/src/components/media/VoicePlayer.jsx` | P3's `useAudioPlayer().seek()` takes **seconds**; P2 passed a 0–1 fraction, so clicking the bar jumped to ~0 s | Pass seconds (P2's stand-in updated to match) |
| `client/src/hooks/useConversations.js` | P1 emits `conversation_updated` (group rename/picture/admin change); nobody listened, so other members didn't see renames until refresh | Handle it, keeping each user's own `isStarred` / `unreadCount` |
| `server/src/socket/index.js` | REST CORS strips a trailing `/` from `CLIENT_URL`, socket CORS didn't: a trailing slash broke live chat only | Same normalisation for sockets |
| `server/src/services/aiMemory.js` | Default model `gemini-2.5-flash` isn't served to new API keys | Default `gemini-3.5-flash-lite` (still overridable with `GEMINI_MODEL`) |
| `client/.env.example`, `server/.env.example` | `VITE_USE_MOCKS=true` by default: copying the example ran the UI against fake data | Default `false`; comments updated |

No contract in `PROJECT_INSTRUCTIONS.md` §5–7 was changed. `conversation_updated { conversation }`
is an addition P1 introduced (see `docs/INTEGRATION-P3.md`, Q3); add it to §7 of the instructions.
