import { kv } from "../../lib/kv";
import { requireAuth } from "../../lib/auth";

const VALID_DIFFICULTIES = ["newbie", "rookie", "pro", "legend"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const address = requireAuth(req, res);
  if (!address) return;

  const { difficulty, score } = req.body || {};
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: `difficulty must be one of ${VALID_DIFFICULTIES.join(", ")}` });
  }

  // TODO(anti-cheat): this trusts whatever number the client sends. Fine for
  // a casual prototype, but anyone can call this endpoint directly and post
  // score:100. To harden it: accept the arrangement + pattern data instead of
  // a bare number, and recompute the score here with lib/scoring.js — only
  // trust that recomputed value. See lib/scoring.js for the ported formula.
  const clamped = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));

  const lbKey = `leaderboard:${difficulty}`;
  const current = await kv.zscore(lbKey, address);
  if (current === null || clamped > current) {
    await kv.zadd(lbKey, { score: clamped, member: address });
  }

  res.status(200).json({ ok: true, best: Math.max(current || 0, clamped) });
}
