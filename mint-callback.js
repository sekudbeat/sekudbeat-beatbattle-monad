// api/mint-callback.js
// POST /api/mint-callback
// Called by the frontend after a mint tx confirms on-chain (see
// public/js/web3-mint.js). This endpoint does NOT trust the client's claim
// of success blindly — it re-verifies the tx against the RPC before writing
// on-chain state, since a client could otherwise fabricate a fake mint record.

const connectDB = require('../lib/db');
const Pattern = require('../models/Pattern');
const { JsonRpcProvider, Interface } = require('ethers');

const MONAD_RPC_URL = process.env.MONAD_RPC_URL; // e.g. testnet/mainnet RPC endpoint
const CHART_REGISTRY_ADDRESS = process.env.CHART_REGISTRY_ADDRESS;

// Minimal ABI fragment for the event we care about — replace with your
// actual ChartRegistry contract's Minted event signature.
const REGISTRY_ABI = ['event Minted(address indexed creator, bytes32 indexed contentHash, uint256 tokenId)'];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await connectDB();

  try {
    const { contentHash, txHash } = req.body || {};
    if (!contentHash || !txHash) {
      return res.status(400).json({ error: 'contentHash and txHash are required' });
    }

    const provider = new JsonRpcProvider(MONAD_RPC_URL);
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: 'Transaction not found or failed' });
    }

    const iface = new Interface(REGISTRY_ABI);
    const mintLog = receipt.logs.find((log) => {
      try {
        const parsed = iface.parseLog(log);
        return parsed?.name === 'Minted' && parsed.args.contentHash === contentHash;
      } catch {
        return false;
      }
    });

    if (!mintLog) {
      return res.status(400).json({ error: 'No matching Minted event in this transaction' });
    }

    const parsed = iface.parseLog(mintLog);

    const pattern = await Pattern.findOneAndUpdate(
      { contentHash },
      {
        $set: {
          'onChain.chainId': Number(receipt.chainId ?? 0),
          'onChain.contractAddress': CHART_REGISTRY_ADDRESS,
          'onChain.tokenId': parsed.args.tokenId.toString(),
          'onChain.txHash': txHash,
          'onChain.mintedAt': new Date(),
        },
      },
      { new: true }
    );

    if (!pattern) return res.status(404).json({ error: 'Pattern not found for this contentHash' });

    return res.status(200).json({ pattern });
  } catch (err) {
    console.error('[api/mint-callback] failed', err);
    return res.status(500).json({ error: 'Internal error verifying mint' });
  }
};
