# Round 2: what changed (for the team)

The full contracts are in [`PROJECT_INSTRUCTIONS.md`](../PROJECT_INSTRUCTIONS.md) §5–8, with every Round 2 addition marked **(Round 2)**, and the manual checks are in §12. This page is the map.

## Server

| Area | Where | Notes |
|---|---|---|
| One serializer | `services/messages.js` → `serializeMessageFor(message, viewerId, ctx)` | Every message that reaches a client goes through it: tombstones, the reply preview, location-request expiry, receipt privacy and blocks. |
| Edit / delete | `services/messages.js`, `routes/messages.js` | `PATCH /messages/:cid/:mid`, `DELETE …?scope=everyone\|me`, plus the `message_updated` event |
| Replies / mentions | `services/messages.js` (`resolveReplyTo`, `cleanMentions`), `socket/messages.js` | `send_message` takes `replyTo` and `mentions` |
| Campuses | `config/campuses.js`, `routes/campuses.js` | All 23 IITs, with sources cited in the file |
| Files | `services/media.js` | GIF, PDF, docx/xlsx/pptx and txt, checked by content, MIME type and extension |
| Receipt privacy + blocks | `services/blocks.js` (`loadPrivacy`, `assertCanMessage`), `socket/receipts.js`, `socket/typing.js`, `socket/presence.js` | Loaded once per request or event |
| Location | `services/location.js`, `utils/geo.js` | Share, request, decline; the first answer wins; 10-minute expiry computed on read |
| Account deletion | `services/accounts.js` | Every step can be safely re-run |
| Wallpapers | `services/conversations.js` (`setBackground`) | Per user, per chat |

**New Server → Client events:** `message_updated`, `conversation_removed`, `block_changed`, `conversation_background`. The older `conversation_updated` is unchanged and is now documented in §7.

## Client

| Area | Where |
|---|---|
| Theme tokens, dark mode, accents | `src/index.css` (the only place raw colours live), `src/lib/appearance.js`, the inline script in `index.html` |
| Settings page | `src/pages/Settings.jsx`, `src/lib/useSettings.js` |
| Message actions | `components/chat/MessageBubble.jsx` (menu, long-press, swipe, quote, tombstone), `Composer.jsx` (edit and reply bars, mentions, 📎, 😊) |
| New pieces | `components/media/*` (attach sheet, file card, lightbox), `components/location/*`, `components/campus/*`, `components/account/*`, `components/chat/{MessageInfoPanel,WallpaperPicker,EmojiButton}.jsx` |
| Hooks | New `useMessages` methods (`editMessage`, `deleteMessage`, `sendFile`, `sendLocation`, `requestLocation`, `declineLocationRequest`) are called with optional chaining, so mock mode (P2 stand-ins) still builds and just hides those actions. |

The one new dependency is `emoji-picker-react`, loaded lazily on first use.

## Tests

- `cd server && npm run smoke:round2`: 158 checks, one section per phase.
- The older suites still pass, with two known exceptions that have nothing to do with Round 2:
  - `smoke-part2`'s "PUT /profile ignores email/status" was already failing before Round 2. It expects `offline` while the same script keeps that user's socket open.
  - `smoke-part3`'s "replace picture → new URL" occasionally fails when both uploads land in the same second, because Cloudinary's version number counts seconds. Re-running passes.
