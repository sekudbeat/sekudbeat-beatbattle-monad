// pages/api/ghost.js
// GET  /api/ghost?difficulty=&limit=   -> lightweight list of ghosts for a tier (no event data — for the leaderboard's "Challenge" list)
// GET  /api/ghost?id=<ghostId>         -> one ghost's full event log + arrangement (fetched only when someone taps "Challenge")
// POST /api/ghost                      -> save a ghost recording for the signed-in wallet
//
// Mirrors pages/api/score.js and pages/api/leaderboard.js: same kv
// sorted-set pattern, same requireAuth() session check, and — like
// score.js — the score is recomputed server-side from the submitted
// mode/picks/advanced/finalArrangement rather than trusted from the client.

import { kv } from "../../lib/kv";
import { requireAuth } from "../../lib/auth";
import { reconstructPattern, isValidArrangement, isValidSampleAssign } from "../../lib/pattern";
import { scoreArrangement } from "../../lib/scoring";
import crypto from "crypto";

const VALID_DIFFICULTIES = ["newbie", "rookie", "pro", "legend"];
const MAX_EVENTS = 2000; // a 30s build phase can't generate more than a few hundred toggles

export default async function handler(req, res) {
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "POST") return handlePost(req, res);
  res.setHeader("Allow", "GET, POST");
  return res.status(405).end();
}

async function handleGet(req, res) {
  const { id, difficulty, limit } = req.query;

  if (id) {
    const raw = await kv.get(`ghost:${id}`);
    if (!raw) return res.status(404).json({ error: "Ghost not found" });
    return res.status(200).json({ ghost: JSON.parse(raw) });
  }

  const diff = String(difficulty || "");
  if (!VALID_DIFFICULTIES.includes(diff)) {
    return res.status(400).json({ error: `difficulty must be one of ${VALID_DIFFICULTIES.join(", ")}` });
  }
  const n = Math.min(20, parseInt(limit, 10) || 10);

  // ghosts:<difficulty> is a sorted set (id -> score), same pattern as
  // leaderboard:<difficulty> in pages/api/leaderboard.js
  const raw = await kv.zrange(`ghosts:${diff}`, 0, n - 1, { rev: true, withScores: true });
  const ids = [];
  for (let i = 0; i < raw.length; i += 2) ids.push(raw[i]);

  const ghostStrs = await Promise.all(ids.map((gid) => kv.get(`ghost:${gid}`)));
  const parsed = ids
    .map((gid, i) => (ghostStrs[i] ? { id: gid, ...JSON.parse(ghostStrs[i]) } : null))
    .filter(Boolean);

  const profiles = await Promise.all(parsed.map((g) => kv.get(`profile:${g.address}`)));
  const ghosts = parsed.map((g, i) => {
    const p = profiles[i] ? JSON.parse(profiles[i]) : null;
    return {
      _id: g.id,
      address: g.address,
      score: g.score,
      difficulty: g.difficulty,
      name: p && p.name ? p.name : "",
      avatarUrl: p && p.avatarUrl ? p.avatarUrl : null,
      // events/pattern data intentionally omitted from the list view — the
      // frontend fetches those separately via ?id=... only once someone
      // actually taps "Challenge", keeping this list call cheap.
    };
  });

  res.status(200).json({ difficulty: diff, ghosts });
}

async function handlePost(req, res) {
  const address = requireAuth(req, res);
  if (!address) return;

  const { difficulty, mode, picks, advanced, finalArrangement, sampleAssign, events, durationMs } = req.body || {};

  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: `difficulty must be one of ${VALID_DIFFICULTIES.join(", ")}` });
  }
  if (!Array.isArray(events)) {
    return res.status(400).json({ error: "events is required" });
  }
  if (events.length > MAX_EVENTS) {
    return res.status(413).json({ error: `Event log too large (max ${MAX_EVENTS})` });
  }

  // Same anti-cheat approach as pages/api/score.js: recompute the score
  // server-side from the submitted pattern-building inputs instead of
  // trusting whatever number the client attaches, since this score also
  // seeds the async "Challenge Ghost" leaderboard.
  const pattern = reconstructPattern({ mode, picks, advanced });
  if (!pattern) {
    return res.status(400).json({ error: "Invalid or missing mode/picks/advanced — could not reconstruct pattern" });
  }
  if (!isValidArrangement(finalArrangement)) {
    return res.status(400).json({ error: "Invalid or missing finalArrangement" });
  }
  if (!isValidSampleAssign(sampleAssign)) {
    return res.status(400).json({ error: "Invalid sampleAssign" });
  }

  const score = scoreArrangement(pattern, finalArrangement, sampleAssign || {});
  const id = crypto.randomUUID();

  const ghost = {
    address,
    difficulty,
    score,
    mode: mode === "advanced" ? "advanced" : "beginner",
    picks: picks || null,
    advanced: advanced || null,
    finalArrangement,
    events,
    durationMs: durationMs || 30000,
    createdAt: Date.now(),
  };

  await kv.set(`ghost:${id}`, JSON.stringify(ghost));
  await kv.zadd(`ghosts:${difficulty}`, { score, member: id });

  res.status(201).json({ ok: true, ghostId: id, score });
}
