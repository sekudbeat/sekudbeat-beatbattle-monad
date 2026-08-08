// Deploys BeatChartMarketplace, wired to the already-deployed BeatChart
// contract (deployments/<network>.json). Writes its own deployment info to
// deployments/<network>-marketplace.json.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

const PLATFORM_FEE_BPS = 250; // 2.5%, confirmed with the project owner

async function main() {
  const network = hre.network.name;
  const beatChartFile = path.join(__dirname, "..", "deployments", `${network}.json`);
  if (!fs.existsSync(beatChartFile)) {
    throw new Error(`No BeatChart deployment found for ${network} — run scripts/deploy.js first.`);
  }
  const beatChartDeployment = JSON.parse(fs.readFileSync(beatChartFile, "utf8"));

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`Deploying from ${deployer.address} on ${network} (balance: ${hre.ethers.formatEther(balance)} MON)`);
  if (balance === 0n) {
    throw new Error(`Deployer ${deployer.address} has 0 balance on ${network}.`);
  }

  // Platform fee goes to the deployer wallet itself, per the confirmed design.
  const platformFeeReceiver = deployer.address;

  const Marketplace = await hre.ethers.getContractFactory("BeatChartMarketplace");
  const market = await Marketplace.deploy(beatChartDeployment.address, platformFeeReceiver, PLATFORM_FEE_BPS);
  await market.waitForDeployment();
  const address = await market.getAddress();
  const deployTx = market.deploymentTransaction();

  console.log("BeatChartMarketplace deployed to:", address);
  console.log("Wired to BeatChart at:", beatChartDeployment.address);
  console.log("Platform fee:", PLATFORM_FEE_BPS / 100, "% to", platformFeeReceiver);
  console.log("Deployment tx:", deployTx.hash);

  const artifact = await hre.artifacts.readArtifact("BeatChartMarketplace");
  const outFile = path.join(__dirname, "..", "deployments", `${network}-marketplace.json`);
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        network,
        chainId: Number((await hre.ethers.provider.getNetwork()).chainId),
        address,
        beatChartAddress: beatChartDeployment.address,
        platformFeeReceiver,
        platformFeeBps: PLATFORM_FEE_BPS,
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
