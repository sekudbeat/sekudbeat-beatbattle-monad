# Beat Arena — backend

API-only Next.js app for the Beat Arena prototype: wallet-based profiles (MetaMask sign-in,
no gas, no transactions), avatar uploads, and a real per-difficulty leaderboard shared across
every player who hits this deployment.

## Architecture

```
Browser (beat-battle.html)
   |
   |  1. POST /api/auth/nonce        -> { message }
   |  2. window.ethereum.personal_sign(message)
   |  3. POST /api/auth/verify       -> sets httpOnly session cookie
   |
   |  4. POST /api/profile/me        (name)
   |  5. POST /api/avatar            (base64 image -> Vercel Blob URL)
   |  6. POST /api/score             (difficulty, score -> Redis sorted set)
   |
   |  7. GET  /api/leaderboard       (public, no auth needed)
   v
Vercel serverless functions
   |
   +-- Vercel KV (Redis)   -- profile:{address} hashes, leaderboard:{difficulty} sorted sets
   +-- Vercel Blob         -- avatar images
```

Why this stack:
- **Vercel KV** (Redis-compatible) gives you sorted sets (`zadd`/`zrange`), which is exactly
  what a "top N scores" leaderboard needs — no scanning every profile to rank them.
- **Vercel Blob** stores avatar images as real files with public URLs, instead of stuffing
  base64 strings into the database.
- **Sign-In with Ethereum (lightweight)**: the wallet signs a one-time nonce to prove it owns
  the address, and the server issues a normal httpOnly session cookie from there. No library
  dependency beyond `ethers` for signature verification — this is NOT full EIP-4361 SIWE, just
  the same idea implemented directly.

## 1. Deploy

```bash
# from this folder
git init
git add .
git commit -m "Beat Arena backend"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/beat-arena-backend.git
git push -u origin main
```

Then in the Vercel dashboard:
1. **Import the GitHub repo** as a new project (framework auto-detects as Next.js).
2. **Storage tab -> Create -> KV** — attach a KV store to this project. Vercel injects
   `KV_REST_API_URL` / `KV_REST_API_TOKEN` / etc. automatically, no copy-pasting needed.
3. **Storage tab -> Create -> Blob** — attach a Blob store the same way. Injects
   `BLOB_READ_WRITE_TOKEN` automatically.
4. **Settings -> Environment Variables -> add `JWT_SECRET`** — generate one with
   `openssl rand -base64 32` (or any long random string). This one you must set yourself.
5. Redeploy (or it'll pick these up on the next deploy automatically).

That's it — `GET /api/leaderboard?difficulty=rookie` should return `{"difficulty":"rookie","entries":[]}`
once it's live.

## 2. Local dev

```bash
npm install
vercel env pull .env.local   # pulls the KV/Blob vars from your linked Vercel project
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env.local
npm run dev
```

## 3. Wire up the frontend (beat-battle.html)

Right now `beat-battle.html` tries `window.storage` (Claude's environment), then falls back to
`localStorage`, then to in-memory. To point it at this real backend instead, replace the wallet
connect / score / leaderboard functions with the following. `credentials: "include"` is required
on every call so the session cookie actually gets sent.

```js
const API_BASE = "https://YOUR-DEPLOYMENT.vercel.app"; // or "" if same-origin

async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not detected. Install it from metamask.io, then try again.");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts[0];

  const nonceRes = await fetch(`${API_BASE}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const { message } = await nonceRes.json();

  const signature = await window.ethereum.request({
    method: "personal_sign",
    params: [message, address],
  });

  const verifyRes = await fetch(`${API_BASE}/api/auth/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, signature }),
  });
  if (!verifyRes.ok) { alert("Sign-in failed."); return; }

  walletAddress = address.toLowerCase();
  myProfile = await fetch(`${API_BASE}/api/profile/me`, { credentials: "include" }).then(r => r.json());
  renderProfile();
}

async function recordScore(difficultyKey, score) {
  if (!walletAddress) return;
  await fetch(`${API_BASE}/api/score`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ difficulty: difficultyKey, score }),
  });
}

async function listAllProfilesForDifficulty(difficultyKey) {
  const res = await fetch(`${API_BASE}/api/leaderboard?difficulty=${difficultyKey}&limit=50`);
  const { entries } = await res.json();
  // entries: [{ address, score, name, avatarUrl }, ...] already sorted, highest first
  return entries;
}

// avatar upload — reuse the existing fileToResizedDataUrl() helper already in beat-battle.html
async function uploadAvatar(dataUrl) {
  const res = await fetch(`${API_BASE}/api/avatar`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  });
  return res.json(); // updated profile, including the new avatarUrl
}
```

`renderLeaderboard()` in the frontend can then just call `listAllProfilesForDifficulty()` instead
of `listAllProfiles()` + client-side sorting — the server already returns it sorted.

## Anti-cheat (not implemented yet — read before you rely on this leaderboard for anything real)

`POST /api/score` currently trusts whatever number the client sends. That means anyone with
devtools open can call it directly with `{"difficulty":"legend","score":100}` and top the board
without playing a single round. Fine for a casual prototype; not fine if this ever matters.

The real fix: have the client send the actual arrangement + pattern data it just played (the
same shapes `buildPattern`/`buildAdvancedPattern`/`state.arrangement` already produce in the
frontend) instead of a bare number, and recompute the score **on the server** using the identical
formula — `lib/scoring.js` already has that formula ported and ready, it's just not wired into
`/api/score` yet. Only trust the server-recomputed number, never the client's.

## Notes / things worth knowing before you lean on this

- Every profile/score write is keyed by wallet address, not any real identity — anyone can
  connect a fresh MetaMask account and get a brand new blank profile at will.
- No rate limiting on any route yet. Add it (Vercel has an Edge Config / KV-based rate limit
  pattern, or a service like Upstash Ratelimit) before this is public-facing at any real scale.
- Avatar uploads overwrite `avatars/{address}.jpg` in place, so re-uploading replaces the old one
  rather than accumulating orphaned files.
