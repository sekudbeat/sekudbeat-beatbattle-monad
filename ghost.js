// api/ghost.js
// POST /api/ghost        -> store a ghost recording for a completed run
// GET  /api/ghost?trackId=&difficulty=&limit=&best=1  -> list ghosts to challenge
// GET  /api/ghost?id=<ghostId>                        -> fetch one ghost's full event log

const connectDB = require('../lib/db'); // your existing Mongo connection helper
const Ghost = require('../models/Ghost');
const Pattern = require('../models/Pattern');
const RoyaltyEvent = require('../models/RoyaltyLedger');

const MAX_EVENTS = 20000; // ~ hard cap so a payload can't balloon; a 4-min run at
                           // 60 events/sec is still well under this.

module.exports = async function handler(req, res) {
  await connectDB();

  if (req.method === 'GET') {
    return handleGet(req, res);
  }
  if (req.method === 'POST') {
    return handlePost(req, res);
  }
  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
  try {
    const { id, trackId, difficulty, limit, best } = req.query;

    if (id) {
      const ghost = await Ghost.findById(id).lean();
      if (!ghost) return res.status(404).json({ error: 'Ghost not found' });
      return res.status(200).json({ ghost });
    }

    if (!trackId) {
      return res.status(400).json({ error: 'trackId or id is required' });
    }

    const query = { trackId };
    if (difficulty) query.difficulty = difficulty;

    const cursor = Ghost.find(query, {
      // don't ship full event arrays in list view — that's the whole point
      // of keeping it lightweight; the client fetches the full ghost by id
      // only after the user picks "Challenge".
      events: 0,
    }).sort({ score: -1 });

    const results = best
      ? await cursor.limit(1).lean()
      : await cursor.limit(Math.min(parseInt(limit, 10) || 20, 50)).lean();

    return res.status(200).json({ ghosts: results });
  } catch (err) {
    console.error('[api/ghost] GET failed', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePost(req, res) {
  try {
    const { wallet, trackId, difficulty, score, combo, accuracy, bpm, durationMs, events } =
      req.body || {};

    if (!wallet || !trackId || !difficulty || score == null || !bpm || !durationMs || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Missing required ghost fields' });
    }
    if (events.length === 0) {
      return res.status(400).json({ error: 'Empty event log' });
    }
    if (events.length > MAX_EVENTS) {
      return res.status(413).json({ error: `Event log exceeds ${MAX_EVENTS} events` });
    }

    // basic shape check on a sample of events rather than every one, to keep this cheap
    const sample = events.slice(0, 25);
    const valid = sample.every(
      (e) => typeof e.t === 'number' && typeof e.lane === 'string' && typeof e.action === 'string'
    );
    if (!valid) {
      return res.status(400).json({ error: 'Malformed event entries' });
    }

    const ghost = await Ghost.create({
      wallet: String(wallet).toLowerCase(),
      trackId,
      difficulty,
      score,
      combo: combo || 0,
      accuracy: accuracy || 0,
      bpm,
      durationMs,
      events,
      eventCount: events.length,
    });

    // Accrue a royalty credit to the pattern's creator for this play, if the
    // track is a registered/minted pattern (not the built-in default charts).
    const pattern = await Pattern.findOne({ contentHash: trackId }).lean();
    if (pattern && pattern.creatorWallet !== String(wallet).toLowerCase()) {
      await Pattern.updateOne({ contentHash: trackId }, { $inc: { playCount: 1 } });
      await RoyaltyEvent.create({
        patternHash: trackId,
        creatorWallet: pattern.creatorWallet,
        playerWallet: wallet.toLowerCase(),
        eventType: 'play',
      });
    }

    return res.status(201).json({ ghostId: ghost._id, message: 'Ghost stored' });
  } catch (err) {
    console.error('[api/ghost] POST failed', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
