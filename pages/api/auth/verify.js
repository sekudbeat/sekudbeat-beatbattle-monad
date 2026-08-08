import { verifyMessage } from "ethers";
import { kv } from "../../../lib/kv";
import { createSessionCookie } from "../../../lib/auth";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { address, signature } = req.body || {};
  if (!address || !signature) {
    return res.status(400).json({ error: "address and signature are required" });
  }

  const lower = address.toLowerCase();
  const nonceKey = `nonce:${lower}`;
  const nonce = await kv.get(nonceKey);
  if (!nonce) {
    return res.status(400).json({ error: "Nonce expired or never requested. Call /api/auth/nonce first." });
  }

  const message =
    `Sign in to Beat Arena\n\n` +
    `This only proves you own this wallet — it doesn't cost gas or send a transaction.\n\n` +
    `Address: ${address}\nNonce: ${nonce}`;

  let recovered;
  try {
    recovered = verifyMessage(message, signature);
  } catch (e) {
    return res.status(400).json({ error: "Invalid signature" });
  }
  if (recovered.toLowerCase() !== lower) {
    return res.status(401).json({ error: "Signature does not match the claimed address" });
  }

  await kv.del(nonceKey); // one-time use

  const profileKey = `profile:${lower}`;
  const existing = await kv.get(profileKey);
  if (!existing) {
    await kv.set(profileKey, JSON.stringify({ address: lower, name: "", avatarUrl: null }));
  }

  res.setHeader("Set-Cookie", createSessionCookie(lower));
  res.status(200).json({ ok: true, address: lower });
}
