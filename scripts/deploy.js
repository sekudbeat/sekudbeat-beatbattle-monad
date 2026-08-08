// Deploys BeatChart to whatever network Hardhat is pointed at (--network monadTestnet).
// Writes the resulting address + ABI to deployments/<network>.json so the app
// (lib/contract.js) and anyone else can pick it up without re-deploying.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const network = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error("No signer configured for this network — set DEPLOYER_PRIVATE_KEY in .env.local.");
  }

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deploying from ${deployer.address} on ${network} (balance: ${hre.ethers.formatEther(balance)} MON)`);
  if (balance === 0n) {
    throw new Error(
      `Deployer ${deployer.address} has 0 balance on ${network}. Fund it first ` +
      `(https://faucet.monad.xyz for Monad testnet) and try again.`
    );
  }

  const BeatChart = await hre.ethers.getContractFactory("BeatChart");
  const chart = await BeatChart.deploy();
  await chart.waitForDeployment();
  const address = await chart.getAddress();
  const deployTx = chart.deploymentTransaction();

  console.log("BeatChart deployed to:", address);
  console.log("Deployment tx:", deployTx.hash);

  const artifact = await hre.artifacts.readArtifact("BeatChart");
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network}.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network,
        chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
        address,
        deployTxHash: deployTx.hash,
        deployedAt: new Date().toISOString(),
        deployerAddress: deployer.address,
        abi: artifact.abi,
      },
      null,
      2
    )
  );
  console.log("Wrote deployment info to", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
