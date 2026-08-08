// api/pattern.js
// POST /api/pattern            -> register an uploaded stem set / authored chart into the catalog
// GET  /api/pattern?hash=      -> fetch one pattern by content hash
// GET  /api/pattern?creator=   -> list a creator's registered patterns

const crypto = require('crypto');
const connectDB = require('../lib/db');
const Pattern = require('../models/Pattern');

module.exports = async function handler(req, res) {
  await connectDB();

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleGet(req, res) {
  const { hash, creator } = req.query;
  try {
    if (hash) {
      const pattern = await Pattern.findOne({ contentHash: hash }).lean();
      if (!pattern) return res.status(404).json({ error: 'Pattern not found' });
      return res.status(200).json({ pattern });
    }
    if (creator) {
      const patterns = await Pattern.find({ creatorWallet: creator.toLowerCase() })
        .sort({ createdAt: -1 })
        .lean();
      return res.status(200).json({ patterns });
    }
    return res.status(400).json({ error: 'hash or creator query param required' });
  } catch (err) {
    console.error('[api/pattern] GET failed', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handlePost(req, res) {
  try {
    const { creatorWallet, title, bpm, sourceType, stems, chart } = req.body || {};

    if (!creatorWallet || !title || !bpm || !sourceType || !chart) {
      return res.status(400).json({ error: 'Missing required pattern fields' });
    }

    // Canonical hash: this is the id ghosts and on-chain mints key off of.
    // Sorting stem URLs before hashing keeps the hash stable regardless of
    // upload order.
    const sortedStemUrls = (stems || []).map((s) => s.url).sort();
    const canonical = JSON.stringify({ chart, bpm, stems: sortedStemUrls });
    const contentHash = '0x' + crypto.createHash('sha256').update(canonical).digest('hex');

    const existing = await Pattern.findOne({ contentHash }).lean();
    if (existing) {
      return res.status(200).json({ pattern: existing, message: 'Pattern already registered' });
    }

    const pattern = await Pattern.create({
      contentHash,
      creatorWallet: creatorWallet.toLowerCase(),
      title,
      bpm,
      sourceType,
      stems: stems || [],
      chart,
    });

    return res.status(201).json({ pattern });
  } catch (err) {
    console.error('[api/pattern] POST failed', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
