// models/RoyaltyLedger.js
// Off-chain accrual ledger. Keep the source of truth here; settle to an
// on-chain split contract periodically or on-withdraw rather than per-play,
// to avoid a tx per battle.

const mongoose = require('mongoose');

const RoyaltyEventSchema = new mongoose.Schema(
  {
    patternHash: { type: String, required: true, index: true },
    creatorWallet: { type: String, required: true, lowercase: true, index: true },
    playerWallet: { type: String, required: true, lowercase: true }, // who triggered the accrual
    eventType: { type: String, enum: ['play', 'battle', 'ghost_challenge'], required: true },
    // basis points of some reference unit (e.g. entry fee, or a flat protocol credit)
    amountBps: { type: Number, required: true, default: 250 }, // default 2.5%
    settled: { type: Boolean, default: false, index: true },
    settledTxHash: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { minimize: false }
);

RoyaltyEventSchema.index({ creatorWallet: 1, settled: 1 });

module.exports =
  mongoose.models.RoyaltyEvent || mongoose.model('RoyaltyEvent', RoyaltyEventSchema);
