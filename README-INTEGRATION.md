# Web3 Ghost Leaderboard / Pattern Catalog / Mint Integration

This package adds three things to the existing prototype without touching your
core gameplay loop:

1. Ghost data capture + async "Challenge Ghost" playback
2. A shared pattern/sample catalog with content-hash IDs
3. Wallet-signed mint stubs + an off-chain royalty ledger

## What I need from you to finish the wiring

I built this against the screen IDs and stack you described
(`screen-leaderboard`, `screen-extract`, Tone.js, vanilla JS/Node/Mongo on
Vercel), but I don't have your actual `beatbattle.html` / existing
`api/score.js` / DB connection helper. Two things will make the merge exact
instead of approximate:

- Paste your current `beatbattle.html` (or the relevant `<script>` block) so
  I can point `GhostRecorder.log(...)` calls at your *actual* pad/chord/bass
  hit handlers instead of the placeholder names used above.
- Paste your existing `/api/score.js` and Mongo connection helper (`lib/db.js`
  or similar) so I can merge rather than guess at your `Score` schema shape.

## Repo layout to drop these into

```
sekudbeat-beatbattle-monad/
├── api/
│   ├── score.js            # merge with existing — adds ghostId field
│   ├── ghost.js             # new
│   ├── pattern.js           # new
│   ├── mint-callback.js     # new
│   └── royalties.js         # new
├── models/
│   ├── Ghost.js             # new
│   ├── Pattern.js           # new
│   └── RoyaltyLedger.js     # new
├── public/
│   └── js/
│       ├── ghost-recorder.js       # new
│       ├── ghost-playback.js       # new
│       ├── leaderboard-ghost-ui.js # new
│       └── web3-mint.js            # new
└── lib/
    └── db.js               # assumed existing — reused as-is by new routes
```

## Environment variables (add to Vercel project settings + `.env.local`)

```
MONAD_RPC_URL=https://<your-monad-rpc-endpoint>
CHART_REGISTRY_ADDRESS=0x...        # deployed once your ChartRegistry contract is written
MONAD_CHAIN_ID_HEX=0x...
```

## Contract you still need to write/deploy

Nothing here deploys a contract — `web3-mint.js` and `mint-callback.js` are
stubs against a `ChartRegistry` interface:

```solidity
function register(bytes32 contentHash, string calldata uri) external returns (uint256 tokenId);
event Minted(address indexed creator, bytes32 indexed contentHash, uint256 tokenId);
```

A basic ERC-721-per-chart implementation (OpenZeppelin `ERC721` + a
`mapping(bytes32 => uint256)` for contentHash → tokenId, emitting `Minted`)
satisfies this ABI. Royalty *splitting* is intentionally kept off-chain in
`RoyaltyLedger` — settle in batches via a periodic job or on-withdraw, not
per-play, or gas will dominate your unit economics on high-frequency plays.

## Frontend wiring checklist

- [ ] Add `<script type="module" src="/js/ghost-recorder.js">` etc., or bundle
      via your existing build step if you have one.
- [ ] In your gameplay hit handlers, add one `recorder.log(lane, action, data)`
      call per interaction (drum hit, chord press, bass note, arrangement
      mute/solo/section-shift).
- [ ] At game-over, call `recorder.finish({...})` then
      `submitRunWithGhost(payload)` in place of your current score-only POST.
- [ ] Add the `#ghost-challenge-list` / `#ghost-challenge-start` markup to
      `screen-leaderboard` and call `initLeaderboardGhostUI(trackId, difficulty)`.
- [ ] Add an "opponent lane" render target in your battle/reveal screen that
      listens for the `ghost:event` CustomEvent dispatched by
      `leaderboard-ghost-ui.js`.

## Pushing to GitHub

```bash
git checkout -b feature/web3-ghost-leaderboard
# copy the files above into place
git add api/ghost.js api/pattern.js api/mint-callback.js api/royalties.js \
        models/Ghost.js models/Pattern.js models/RoyaltyLedger.js \
        public/js/ghost-recorder.js public/js/ghost-playback.js \
        public/js/leaderboard-ghost-ui.js public/js/web3-mint.js
git add api/score.js  # after merging in the ghostId field manually
git commit -m "feat: async ghost leaderboards, pattern catalog, mint/royalty hooks"
git push origin feature/web3-ghost-leaderboard
```

Open a PR against `main` rather than pushing directly — the mint/royalty
paths touch money-adjacent logic (`api/mint-callback.js`,
`api/royalties.js`), and `mint-callback.js` in particular re-verifies
transactions against the RPC before trusting a client's claim of a
successful mint, which is worth a second pair of eyes before it's live.
