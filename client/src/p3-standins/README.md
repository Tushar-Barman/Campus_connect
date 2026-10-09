# p3-standins — temporary, P2-written

These files copy the **signatures** of P3's real-time layer, as listed in `CAUTION_AND_DIRECTION.md` (P2 §3). That lets the UI run:

- in **mock mode** (`VITE_USE_MOCKS=true`), and
- before P3's `src/lib/socket.js` and `src/hooks/*` are merged.

Components never import from this folder directly. They import `@p3/lib/socket.js` and `@p3/hooks/<name>.js`, and `vite.config.js` points `@p3` to:

| Condition | `@p3` resolves to |
|---|---|
| `VITE_USE_MOCKS=true`, or `VITE_P3_STANDINS=true`, or P3's files are missing | `src/p3-standins` (this folder) |
| Otherwise | `src` → **P3's real files** |

The startup log says which one is active: `[campusconnect] real-time layer: …`.

**Don't edit P3's real hooks to match this folder.** If the two disagree, P3's version wins, and P2 fixes the component.
