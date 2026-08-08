import { kv } from "../../../lib/kv";
import { requireAuth } from "../../../lib/auth";

export default async function handler(req, res) {
  const address = requireAuth(req, res);
  if (!address) return;

  const key = `profile:${address}`;

  if (req.method === "GET") {
    const profile = await kv.get(key);
    return res.status(200).json(profile ? JSON.parse(profile) : { address, name: "", avatarUrl: null });
  }

  if (req.method === "POST") {
    const { name } = req.body || {};
    const existing = JSON.parse((await kv.get(key)) || "{}");
    const updated = { ...existing, address, name: String(name || "").slice(0, 24) };
    await kv.set(key, JSON.stringify(updated));
    return res.status(200).json(updated);
  }

  res.status(405).end();
}
