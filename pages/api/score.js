import { kv } from "../../lib/kv";
import { requireAuth } from "../../lib/auth";
import { reconstructPattern, isValidArrangement, isValidSampleAssign } from "../../lib/pattern";
import { scoreArrangement } from "../../lib/scoring";

const VALID_DIFFICULTIES = ["newbie", "rookie", "pro", "legend"];

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const address = requireAuth(req, res);
  if (!address) return;

  const { difficulty, mode, picks, advanced, arrangement, sampleAssign } = req.body || {};
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: `difficulty must be one of ${VALID_DIFFICULTIES.join(", ")}` });
  }

  // Anti-cheat: the client no longer gets to just say "score: 100". It sends
  // the same { mode, picks/advanced, arrangement, sampleAssign } shape the
  // frontend already builds internally, and we recompute the score here
  // with the identical formula (lib/scoring.js, ported from game.html) —
  // only that recomputed number is ever trusted or stored.
  const pattern = reconstructPattern({ mode, picks, advanced });
  if (!pattern) {
    return res.status(400).json({ error: "Invalid or missing mode/picks/advanced — could not reconstruct pattern" });
  }
  if (!isValidArrangement(arrangement)) {
    return res.status(400).json({ error: "Invalid or missing arrangement" });
  }
  if (!isValidSampleAssign(sampleAssign)) {
    return res.status(400).json({ error: "Invalid sampleAssign" });
  }

  const score = scoreArrangement(pattern, arrangement, sampleAssign || {});

  const lbKey = `leaderboard:${difficulty}`;
  const current = await kv.zscore(lbKey, address);
  if (current === null || score > current) {
    await kv.zadd(lbKey, { score, member: address });
  }

  res.status(200).json({ ok: true, score, best: Math.max(current || 0, score) });
}
