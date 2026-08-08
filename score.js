// api/score.js
// Existing score submission endpoint, extended to accept an optional
// ghostId produced by a prior POST /api/ghost call in the same submission
// flow (see public/js/ghost-recorder.js for the client-side sequencing).

const connectDB = require('../lib/db');
const Score = require('../models/Score'); // your existing model — extend it with the fields below if not present

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await connectDB();

  try {
    const { wallet, trackId, difficulty, score, ghostId } = req.body || {};

    if (!wallet || !trackId || !difficulty || score == null) {
      return res.status(400).json({ error: 'Missing required score fields' });
    }

    const doc = await Score.create({
      wallet: String(wallet).toLowerCase(),
      trackId,
      difficulty,
      score,
      ghostId: ghostId || null, // reference into the Ghost collection, not embedded
      createdAt: new Date(),
    });

    return res.status(201).json({ scoreId: doc._id });
  } catch (err) {
    console.error('[api/score] POST failed', err);
    return res.status(500).json({ error: 'Internal error' });
  }
};

/*
  Add to your existing Score schema:

  ghostId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ghost', default: null }

  Keeping Score and Ghost as separate collections (rather than embedding the
  event log in Score) is deliberate: leaderboard reads happen far more often
  than ghost playback fetches, and you don't want every leaderboard query
  paging in kilobytes of event-array data it doesn't need.
*/
