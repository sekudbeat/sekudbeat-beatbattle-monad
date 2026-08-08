export default function Home() {
  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem", maxWidth: 640, margin: "0 auto", lineHeight: 1.6 }}>
      <h1>Beat Arena — backend</h1>
      <p>
        This deployment is API-only — it backs the Beat Arena prototype's wallet profiles,
        avatars, and per-difficulty leaderboard. See the README for setup and the frontend
        integration snippet.
      </p>
      <ul>
        <li><code>POST /api/auth/nonce</code> — get a message to sign</li>
        <li><code>POST /api/auth/verify</code> — verify signature, sets session cookie</li>
        <li><code>GET /api/profile/[address]</code> — public profile lookup</li>
        <li><code>GET / POST /api/profile/me</code> — your own profile (session required)</li>
        <li><code>POST /api/avatar</code> — upload avatar image (session required)</li>
        <li><code>POST /api/score</code> — submit a score for a difficulty (session required)</li>
        <li><code>GET /api/leaderboard?difficulty=rookie&amp;limit=50</code> — public leaderboard</li>
      </ul>
    </div>
  );
}
