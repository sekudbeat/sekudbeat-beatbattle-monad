# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Beat Arena" — a browser beat-making battle game (build a track against an AI or a recorded
"ghost" opponent in a timed round, get scored) with a Next.js API-only backend for wallet auth,
profiles, and leaderboards. No build step for the game itself — it's a single static HTML file
with vanilla JS; Next.js exists only to serve `pages/api/*` routes.

## Commands

```bash
npm install
vercel env pull .env.local   # pulls KV/Blob credentials from the linked Vercel project
npm run dev                  # next dev — serves pages/api/* and public/game.html
npm run build                # next build
npm run start                # next start (production)
```

There is no lint script and no test suite configured in this repo.

Local dev needs `.env.local` with `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`), `BLOB_READ_WRITE_TOKEN`, and a
self-generated `JWT_SECRET` (`openssl rand -base64 32`) — see `.env.example`. Without real
Redis credentials, `lib/kv.js` throws at import time, so any `/api/*` route will 500 until env
vars are set.

## Architecture

**Frontend is one file**: `public/game.html` is the entire game — all screens
(`screen-setup`, `screen-build`, `screen-reveal`, `screen-result`, `screen-extract`,
`screen-profile`, `screen-leaderboard`), state, audio (Tone.js), and API calls live in inline
`<script>` tags in that one file, using plain globals (`state`, `api`, `walletAddress`,
`buildPattern`, `buildAdvancedPattern`, `scoreArrangement`, etc.) rather than modules.
`pages/index.js` just redirects `/` to `/game.html`.

`public/ghost-features.js` is a second `<script>` tag loaded *after* game.html's own script
block — it's a classic script sharing the same global scope (no imports/exports), and it
freely reads/calls everything game.html already defined.

`beat-battle.html` at the repo root is kept byte-identical to `public/game.html` as a reference
copy — if you edit one, mirror the change into the other, or the two will drift.

**Backend is Next.js API routes only**, under `pages/api/`:
- `auth/nonce.js` + `auth/verify.js` — lightweight Sign-In-with-Ethereum: wallet signs a
  server-issued nonce (`ethers.verifyMessage`), server sets an httpOnly JWT cookie
  (`lib/auth.js`, cookie name `bb_session`). Not full EIP-4361, just the same idea by hand.
- `profile/me.js`, `profile/[address].js`, `avatar.js` — profile CRUD; avatars upload to
  Vercel Blob at a fixed path `avatars/{address}.jpg` (re-upload overwrites, no orphans).
- `score.js` + `leaderboard.js` — per-difficulty leaderboard using Redis sorted sets
  (`leaderboard:{difficulty}`, `zadd`/`zrange`). Difficulties are always one of
  `newbie|rookie|pro|legend`.
- `ghost.js` — records/replays a player's arrangement-toggle sequence as an async "ghost"
  opponent. Same sorted-set pattern as leaderboard.js (`ghosts:{difficulty}` sorted set,
  `ghost:{id}` for the full event log), same `requireAuth` gate on POST. List (`GET
  ?difficulty=`) intentionally omits event data for a cheap leaderboard fetch; full events are
  fetched only via `GET ?id=` when a player actually taps "Challenge".

**Storage** (`lib/kv.js`): despite the `KV_*` env var names (kept for backward compat with the
sunset Vercel KV product), this talks to Redis directly via `@upstash/redis`. It accepts either
the legacy `KV_REST_API_*` names or native `UPSTASH_REDIS_REST_*` names.

**Auth** (`lib/auth.js`): `requireAuth(req, res)` is the standard guard at the top of any
route needing a signed-in wallet — writes the 401 response itself and returns `null` on
failure, so callers just do `const address = requireAuth(req, res); if (!address) return;`.

**Scoring** (`lib/scoring.js`): a server-side port of the frontend's scoring formula
(`scoreSection`/`scoreArrangement`), **not currently wired into `pages/api/score.js` or
`ghost.js`** — both routes still trust the client-supplied score number (clamped to 0–100, not
recomputed). This is the known anti-cheat gap; if you're asked to harden scoring, the fix is
to send `arrangement`/`pattern` instead of a bare number and recompute with this file
server-side, only trusting that result.

### Dead files at the repo root — don't use, don't extend

`ghost.js`, `score.js`, `pattern.js`, `web3-mint.js`, `royalties.js`, `RoyaltyLedger.js`,
`mint-callback.js`, `ghost-recorder.js`, `ghost-playback.js`, `leaderboard-ghost-ui.js`, and
`README-INTEGRATION.md` are leftovers from an earlier MongoDB-based design draft that predates
the real Next.js/Vercel-KV implementation. They sit at the repo root where Next.js never looks
for routes (only `pages/api/*.js` is live), were never wired to anything, and were meant to be
deleted (see `GHOST_FEATURE_README.md`) but reappeared/survived in this checkout. The real,
live implementations are `pages/api/ghost.js`, `pages/api/score.js`, and `lib/*`. If asked to
work on ghosts/scoring/minting, use those — treat the root-level files as reference-only or
candidates for cleanup, not code to import or build on.

Web3/minting (content-hash mint stub, on-chain `ChartRegistry`, off-chain royalty splitting)
described in `README-INTEGRATION.md` was never implemented against the real stack — there is
no live mint/royalty code path currently in `pages/api/`.
