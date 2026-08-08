// @vercel/kv is deprecated (Vercel KV was sunset) — this uses @upstash/redis
// directly instead, which is what Vercel KV was a thin wrapper around anyway.
// The Upstash Marketplace integration has been seen injecting credentials
// under either the legacy KV_REST_API_URL/KV_REST_API_TOKEN names (kept for
// backward compatibility with old Vercel KV code) or the native
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN names — this checks both
// so it keeps working regardless of which one your integration set.
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  throw new Error(
    "No Redis credentials found in the environment. Install a Redis integration " +
    "(e.g. \"Upstash for Redis\") from the Vercel Marketplace and connect it to " +
    "this project, then redeploy."
  );
}

export const kv = new Redis({ url, token });
