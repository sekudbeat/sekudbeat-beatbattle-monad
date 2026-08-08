import { kv } from "../../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { address } = req.query;
  const profile = await kv.get(`profile:${String(address).toLowerCase()}`);
  if (!profile) return res.status(404).json({ error: "No profile for this address" });
  res.status(200).json(JSON.parse(profile));
}
