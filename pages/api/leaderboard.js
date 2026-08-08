import { kv } from "../../lib/kv";

const VALID_DIFFICULTIES = ["newbie", "rookie", "pro", "legend"];

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const difficulty = String(req.query.difficulty || "rookie");
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: `difficulty must be one of ${VALID_DIFFICULTIES.join(", ")}` });
  }
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);

  const lbKey = `leaderboard:${difficulty}`;
  // zrange with rev+withScores returns a flat [member, score, member, score, ...] array
  const raw = await kv.zrange(lbKey, 0, limit - 1, { rev: true, withScores: true });

  const entries = [];
  for (let i = 0; i < raw.length; i += 2) {
    entries.push({ address: raw[i], score: Number(raw[i + 1]) });
  }

  const profiles = await Promise.all(entries.map((e) => kv.get(`profile:${e.address}`)));
  const merged = entries.map((e, i) => {
    const p = profiles[i] ? JSON.parse(profiles[i]) : null;
    return {
      address: e.address,
      score: e.score,
      name: p && p.name ? p.name : "",
      avatarUrl: p && p.avatarUrl ? p.avatarUrl : null,
    };
  });

  res.status(200).json({ difficulty, entries: merged });
}
