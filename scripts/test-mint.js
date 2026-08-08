// Fires one real mint transaction against the deployed contract on whatever
// network is passed via --network, to prove the live deployment actually
// works end to end (not just that `deploy` succeeded). Uses a random
// contentHash so it's safe to run more than once.
const hre = require("hardhat");
const path = require("path");
const fs = require("fs");

async function main() {
  const network = hre.network.name;
  const deploymentFile = path.join(__dirname, "..", "deployments", `${network}.json`);
  const deployment = JSON.parse(fs.readFileSync(deploymentFile, "utf8"));

  const [signer] = await hre.ethers.getSigners();
  const chart = await hre.ethers.getContractAt("BeatChart", deployment.address, signer);

  const contentHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("test-mint-" + Date.now()));
  console.log("Minting from", signer.address, "on", network, "at", deployment.address);

  const tx = await chart.mint(contentHash, 97, "pro", "ipfs://placeholder-metadata/1.json");
  console.log("Mint tx:", tx.hash);
  const receipt = await tx.wait();
  console.log("Confirmed in block", receipt.blockNumber, "- status:", receipt.status === 1 ? "success" : "FAILED");

  const mintedEvent = receipt.logs
    .map((log) => {
      try { return chart.interface.parseLog(log); } catch (e) { return null; }
    })
    .find((e) => e && e.name === "ChartMinted");

  if (mintedEvent) {
    const tokenId = mintedEvent.args.tokenId;
    console.log("Minted tokenId:", tokenId.toString());
    console.log("Owner of token:", await chart.ownerOf(tokenId));
    const [royaltyReceiver, royaltyAmount] = await chart.royaltyInfo(tokenId, 10_000n);
    console.log("Royalty on a 10,000 unit sale:", royaltyAmount.toString(), "to", royaltyReceiver);
    console.log("tokenURI:", await chart.tokenURI(tokenId));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
