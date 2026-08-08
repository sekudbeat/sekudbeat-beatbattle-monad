import { kv } from "../../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { address } = req.body || {};
  if (!address || typeof address !== "string") {
    return res.status(400).json({ error: "address is required" });
  }

  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  await kv.set(`nonce:${address.toLowerCase()}`, nonce, { ex: 300 }); // 5 minute window

  const message =
    `Sign in to Beat Arena\n\n` +
    `This only proves you own this wallet — it doesn't cost gas or send a transaction.\n\n` +
    `Address: ${address}\nNonce: ${nonce}`;

  res.status(200).json({ message });
}
