// GET /api/contract — public info the frontend needs to mint a BeatChart NFT
// directly from the player's own connected wallet: address, ABI, chain
// params (for wallet_addEthereumChain/switchEthereumChain), and an explorer
// URL. No server-side signing happens here — minting is a transaction the
// player's own wallet signs client-side; the server never touches their key.
import { getContractDeployment } from "../../lib/contract";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const deployment = getContractDeployment("monadTestnet");
  if (!deployment) {
    return res.status(404).json({ error: "BeatChart is not deployed yet — run scripts/deploy.js." });
  }
  res.status(200).json(deployment);
}
