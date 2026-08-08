import { put } from "@vercel/blob";
import fs from "fs";
import path from "path";
import { kv } from "../../lib/kv";
import { requireAuth } from "../../lib/auth";

// Client is expected to have already resized the image down to something
// small (e.g. 96x96 JPEG) before base64-encoding it — see the frontend's
// fileToResizedDataUrl helper. This keeps request bodies small and keeps
// Blob storage costs negligible.
export const config = { api: { bodyParser: { sizeLimit: "2mb" } } };

// Same fallback story as lib/kv.js: without BLOB_READ_WRITE_TOKEN this is a
// hard error in production, but for local dev/testing it writes straight
// into public/uploads so Next's static file server can serve it back —
// no Vercel Blob account needed just to click through the app locally.
async function saveAvatar(address, buffer) {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`avatars/${address}.jpg`, buffer, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: false, // overwrite the same file on re-upload
    });
    return blob.url;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not set. Attach a Vercel Blob store to this project " +
      "(Storage tab -> Create -> Blob) and redeploy."
    );
  }

  console.warn(
    "[pages/api/avatar] No BLOB_READ_WRITE_TOKEN — saving avatar to public/uploads " +
    "for local dev instead of Vercel Blob."
  );
  const dir = path.join(process.cwd(), "public", "uploads", "avatars");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${address}.jpg`), buffer);
  return `/uploads/avatars/${address}.jpg?v=${Date.now()}`; // cache-bust re-uploads
}

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

  const avatarUrl = await saveAvatar(address, buffer);

  const key = `profile:${address}`;
  const existing = JSON.parse((await kv.get(key)) || "{}");
  const updated = { ...existing, address, avatarUrl };
  await kv.set(key, JSON.stringify(updated));

  res.status(200).json(updated);
}
