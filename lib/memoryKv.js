// A minimal stand-in for the subset of the @upstash/redis client this app
// actually uses (get/set/del + sorted sets), for local dev when no real
// Redis credentials are configured — see lib/kv.js.
//
// Backed by a JSON file (.data/dev-kv.json, gitignored) rather than a plain
// in-process Map: Next.js compiles each API route as its own module bundle,
// even within a single `next dev`/`next start` process (and each route is
// its own isolated function in a real serverless deployment), so a bare
// module-level Map would NOT be shared between e.g. /api/auth/nonce and
// /api/auth/verify — the nonce one route just wrote would look missing to
// the other. Reading/writing a shared file sidesteps that. Not concurrency-
// safe, not for production — just enough for one person clicking through
// the app locally.

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "dev-kv.json");

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      store: parsed.store || {},
      expiries: parsed.expiries || {},
      zsets: parsed.zsets || {},
    };
  } catch (e) {
    return { store: {}, expiries: {}, zsets: {} };
  }
}

function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), "utf8");
}

function expireIfDue(data, key) {
  const exp = data.expiries[key];
  if (exp !== undefined && Date.now() >= exp) {
    delete data.store[key];
    delete data.expiries[key];
  }
}

export function createMemoryKv() {
  return {
    async get(key) {
      const data = load();
      expireIfDue(data, key);
      return Object.prototype.hasOwnProperty.call(data.store, key) ? data.store[key] : null;
    },

    async set(key, value, opts) {
      const data = load();
      data.store[key] = value;
      if (opts && typeof opts.ex === "number") {
        data.expiries[key] = Date.now() + opts.ex * 1000;
      } else {
        delete data.expiries[key];
      }
      save(data);
      return "OK";
    },

    async del(key) {
      const data = load();
      const had = Object.prototype.hasOwnProperty.call(data.store, key) || Object.prototype.hasOwnProperty.call(data.zsets, key);
      delete data.store[key];
      delete data.expiries[key];
      delete data.zsets[key];
      save(data);
      return had ? 1 : 0;
    },

    async zadd(key, entry) {
      if (!entry || typeof entry.member === "undefined") return 0;
      const data = load();
      if (!data.zsets[key]) data.zsets[key] = {};
      const isNew = !Object.prototype.hasOwnProperty.call(data.zsets[key], entry.member);
      data.zsets[key][entry.member] = Number(entry.score);
      save(data);
      return isNew ? 1 : 0;
    },

    async zscore(key, member) {
      const data = load();
      const z = data.zsets[key];
      if (!z || !Object.prototype.hasOwnProperty.call(z, member)) return null;
      return z[member];
    },

    async zrange(key, start, stop, opts = {}) {
      const data = load();
      const z = data.zsets[key];
      if (!z) return [];
      const entries = Object.entries(z).sort((a, b) => (opts.rev ? b[1] - a[1] : a[1] - b[1]));
      const end = stop === -1 ? entries.length - 1 : stop;
      const slice = entries.slice(start, end + 1);
      const out = [];
      for (const [member, score] of slice) {
        out.push(member);
        if (opts.withScores) out.push(score);
      }
      return out;
    },
  };
}
