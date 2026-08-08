import { put } from "@vercel/blob";
import { kv } from "../../lib/kv";
import { requireAuth } from "../../lib/auth";

// Client is expected to have already resized the image down to something
// small (e.g. 96x96 JPEG) before base64-encoding it — see the frontend's
// fileToResizedDataUrl helper. This keeps request bodies small and keeps
// Blob storage costs negligible.
export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const address = requireAuth(req, res);
  if (!address) return;

  const { dataUrl } = req.body || {};
  if (!dataUrl || !dataUrl.startsWith("data:image/")) {
    return res.status(400).json({ error: "dataUrl (base64 image) is required" });
  }

  const base64 = dataUrl.split(",")[1];
  const buffer = Buffer.from(base64, "base64");

  const blob = await put(`avatars/${address}.jpg`, buffer, {
    access: "public",
    contentType: "image/jpeg",
    addRandomSuffix: false, // overwrite the same file on re-upload
  });

  const key = `profile:${address}`;
  const existing = JSON.parse((await kv.get(key)) || "{}");
  const updated = { ...existing, address, avatarUrl: blob.url };
  await kv.set(key, JSON.stringify(updated));

  res.status(200).json(updated);
}
