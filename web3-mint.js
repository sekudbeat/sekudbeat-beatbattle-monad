// public/js/web3-mint.js
// Wallet-signed mint/registration stubs for custom beat charts.
// Uses ethers v6 UMD build already common in vanilla setups; swap the
// import for viem's `createWalletClient({ transport: custom(window.ethereum) })`
// if you'd rather standardize on viem — the surface below stays the same either way.

import { BrowserProvider, Contract, keccak256, toUtf8Bytes } from 'ethers';

// Replace with your deployed contract's ABI + address once written.
// Minimal shape: register(bytes32 contentHash, string uri) returns (uint256 tokenId)
const CHART_REGISTRY_ABI = [
  'function register(bytes32 contentHash, string calldata uri) external returns (uint256 tokenId)',
  'event Minted(address indexed creator, bytes32 indexed contentHash, uint256 tokenId)',
];

const CHART_REGISTRY_ADDRESS = 'CONTRACT_ADDRESS_HERE'; // Monad chart registry contract
const MONAD_CHAIN_ID = 'YOUR_MONAD_CHAIN_ID_HERE'; // as hex string, e.g. '0x...'

/**
 * Ensures window.ethereum is present and connected to Monad. Throws with a
 * user-facing message on failure rather than a raw provider error.
 */
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('No wallet detected. Install a browser wallet to mint charts.');
  }
  const provider = new BrowserProvider(window.ethereum);
  const accounts = await provider.send('eth_requestAccounts', []);

  const network = await provider.getNetwork();
  if (MONAD_CHAIN_ID && `0x${network.chainId.toString(16)}` !== MONAD_CHAIN_ID) {
    await switchToMonad();
  }

  return { provider, address: accounts[0] };
}

async function switchToMonad() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_CHAIN_ID }],
    });
  } catch (err) {
    // 4902 = chain not added to wallet yet
    if (err.code === 4902) {
      throw new Error('Add the Monad network to your wallet, then retry.');
    }
    throw err;
  }
}

/**
 * Mints/registers a pattern already saved via POST /api/pattern.
 * `metadataUri` should point at a small JSON blob (IPFS/HTTP) describing the
 * chart — title, bpm, stem references, cover art — NOT the full chart data
 * itself, to keep gas cost low.
 *
 * @param {string} contentHash  the same hash returned by /api/pattern (0x-prefixed hex)
 * @param {string} metadataUri
 */
export async function mintChart(contentHash, metadataUri) {
  const { provider, address } = await connectWallet();
  const signer = await provider.getSigner();
  const registry = new Contract(CHART_REGISTRY_ADDRESS, CHART_REGISTRY_ABI, signer);

  const tx = await registry.register(contentHash, metadataUri);
  const receipt = await tx.wait();

  // Report the confirmed mint back to the backend so it can verify + record
  // on-chain state (see api/mint-callback.js) — never trust the client's
  // own read of the receipt for anything that grants royalty rights.
  await fetch('/api/mint-callback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentHash, txHash: receipt.hash }),
  });

  return { address, txHash: receipt.hash };
}

/**
 * Deterministic content hash helper for anything computed client-side before
 * the pattern is registered server-side (server recomputes and is the source
 * of truth — this is for optimistic UI only, e.g. showing the hash before
 * the POST /api/pattern round-trip completes).
 */
export function previewContentHash(chart, bpm, stemUrls = []) {
  const canonical = JSON.stringify({ chart, bpm, stems: [...stemUrls].sort() });
  return keccak256(toUtf8Bytes(canonical));
}
