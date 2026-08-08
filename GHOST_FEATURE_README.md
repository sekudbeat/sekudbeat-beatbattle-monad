# Ghost Challenges — installed against your real stack this time

Earlier I guessed at MongoDB and a generic Vercel-functions layout. Your
actual repo is a **Next.js app using Vercel KV + JWT-cookie sessions**, and
this version is built against that — using your real `lib/auth.js` and
`lib/kv.js` directly, no guessing.

## What's in this zip

A complete, ready-to-upload copy of your repo (`sekudbeat-beatbattle-monad-main/`)
with:

- **`public/game.html`** — your real file, with 6 tiny JS hooks and 2 small
  HTML additions patched in (verified: syntax-checked, and your logo image
  is byte-for-byte untouched — I diffed it to confirm).
- **`public/ghost-features.js`** — new file, all the ghost recording/replay/
  challenge logic.
- **`pages/api/ghost.js`** — new file, the real API route (Vercel KV sorted
  sets, same pattern as your existing `leaderboard.js`/`score.js`).
- **`beat-battle.html`** — your root reference copy, kept in sync with
  `public/game.html` (they were identical before, so I kept them that way).
- **Removed**: `ghost.js`, `score.js`, `pattern.js`, `web3-mint.js`,
  `royalties.js`, `RoyaltyLedger.js`, `mint-callback.js`,
  `ghost-recorder.js`, `ghost-playback.js`, `leaderboard-ghost-ui.js`,
  `README-INTEGRATION.md` — these were my earlier MongoDB-based drafts,
  sitting at the repo root where Next.js never looks for API routes (only
  `pages/api/*.js` counts). They were dead weight, not just wrong — removing
  them so nothing confusing is left lying around.

## How the feature works now

A "ghost" is the sequence of arrangement-toggle taps you made during your
30-second build phase (which layer, which section, on/off, when) — not
per-note hit timing, since this game scores the *final* arrangement, not
real-time accuracy.

- Play a round while signed in → your toggle sequence gets saved via
  `POST /api/ghost`.
- Open the Leaderboard screen → a new "👻 Ghost challenges" list appears
  below the score leaderboard, pulling from `GET /api/ghost?difficulty=...`.
- Tap ⚔ on a ghost → it becomes your opponent instead of the random AI. During
  your next build phase, a purple "👻 Ghost" meter and live action log show
  their recorded moves replaying in real time next to your own hype meter.

Storage-wise, ghosts live in Vercel KV exactly like your leaderboard does:
`ghost:<id>` holds the full recording, `ghosts:<difficulty>` is a sorted set
for fast top-N lookups — same shape as `leaderboard:<difficulty>` in your
existing code.

## Installing it

1. Unzip this.
2. In your repo, replace `public/game.html` and `beat-battle.html` with the
   versions in this zip (or just drag-and-drop the whole folder onto
   GitHub's upload page — it'll ask to overwrite matching paths).
3. Add the two new files: `public/ghost-features.js` and `pages/api/ghost.js`.
4. Delete the 11 stray files listed above, if GitHub didn't already remove
   them for you.
5. Commit. Vercel redeploys automatically — wait ~60 seconds.

No environment variables needed beyond what's already in your `.env.example` —
this reuses your existing `@vercel/kv` connection and `JWT_SECRET`.

## One limitation worth knowing

If a ghost's build used a custom uploaded sample (via the Music Library or
Extract Stems screens) rather than a preset, their exact audio can't be
reconstructed — nothing in this app stores uploaded audio files anywhere
retrievable by another browser session. Challenging that ghost falls back
to the normal random AI instead of erroring out; everything preset-based
(the common case) replays fully.
