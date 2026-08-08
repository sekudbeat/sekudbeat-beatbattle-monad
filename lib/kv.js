// @vercel/kv is deprecated (Vercel KV was sunset) — this uses @upstash/redis
// directly instead, which is what Vercel KV was a thin wrapper around anyway.
// The Upstash Marketplace integration has been seen injecting credentials
// under either the legacy KV_REST_API_URL/KV_REST_API_TOKEN names (kept for
// backward compatibility with old Vercel KV code) or the native
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN names — this checks both
// so it keeps working regardless of which one your integration set.
import { Redis } from "@upstash/redis";
import { createMemoryKv } from "./memoryKv";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function createKv() {
  if (url && token) return new Redis({ url, token });

  // No real Redis credentials in the environment. In production this is a
  // hard config error — fail loudly rather than silently running the app
  // against a store that resets on every deploy. Outside production
  // (npm run dev, local testing) fall back to a local JSON-file-backed store
  // (see lib/memoryKv.js) so the app is runnable without first standing up
  // an Upstash database. It's for local testing only — single process,
  // no concurrency safety, never a substitute for real Redis in a shared
  // or deployed environment.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "No Redis credentials found in the environment. Install a Redis integration " +
      "(e.g. \"Upstash for Redis\") from the Vercel Marketplace and connect it to " +
      "this project, then redeploy."
    );
  }

  console.warn(
    "[lib/kv] No KV_REST_API_URL/TOKEN (or UPSTASH_REDIS_REST_*) found — " +
    "using a local file-backed dev store (.data/dev-kv.json). Fine for clicking " +
    "around locally; set real credentials in .env.local (see .env.example) for anything else."
  );
  return createMemoryKv();
}

export const kv = createKv();
