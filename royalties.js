// api/royalties.js
// GET  /api/royalties?wallet=   -> unsettled royalty summary for a creator
// POST /api/royalties/settle    -> mark a batch settled after an on-chain payout tx
//   (kept as one file with an `action` field to match a simple Vercel routing setup;
//    split into /api/royalties/settle.js if you prefer file-based routes)

const connectDB = require('../lib/db');
const RoyaltyEvent = require('../models/RoyaltyLedger');

module.exports = async function handler(req, res) {
  await connectDB();

  if (req.method === 'GET') return handleSummary(req, res);
  if (req.method === 'POST') return handleSettle(req, res);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleSummary(req, res) {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'wallet query param required' });

  try {
    const unsettled = await RoyaltyEvent.find({
      creatorWallet: wallet.toLowerCase(),
      settled: false,
    }).lean();

    const totalBps = unsettled.reduce((sum, e) => sum + e.amountBps, 0);
    const byPattern = unsettled.reduce((acc, e) => {
      acc[e.patternHash] = (acc[e.patternHash] || 0) + e.amountBps;
      return acc;
    }, {});

    return res.status(200).json({
      wallet: wallet.toLowerCase(),
      unsettledCount: unsettled.length,
      totalBps,
      byPattern,
    });
  } catch (err) {
    console.error('[api/royalties] summary failed', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function handleSettle(req, res) {
  try {
    const { wallet, txHash } = req.body || {};
    if (!wallet || !txHash) {
      return res.status(400).json({ error: 'wallet and txHash are required' });
    }

    // In production: verify txHash on-chain (like api/mint-callback.js does)
    // before marking events settled, so this can't be spoofed by the client.

    const result = await RoyaltyEvent.updateMany(
      { creatorWallet: wallet.toLowerCase(), settled: false },
      { $set: { settled: true, settledTxHash: txHash } }
    );

    return res.status(200).json({ settledCount: result.modifiedCount });
  } catch (err) {
    console.error('[api/royalties] settle failed', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
