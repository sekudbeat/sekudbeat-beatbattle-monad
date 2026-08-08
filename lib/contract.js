// Reads the deployment info scripts/deploy.js wrote to deployments/<network>.json
// (address + ABI — public information, safe to read and re-serve; no keys in
// here). Used by pages/api/contract.js so the frontend can fetch the current
// BeatChart address/ABI without hardcoding it or needing a rebuild after a
// redeploy.
import fs from "fs";
import path from "path";

const MONAD_TESTNET = {
  network: "monadTestnet",
  chainId: 10143,
  chainIdHex: "0x279f",
  rpcUrl: "https://testnet-rpc.monad.xyz/",
  explorerUrl: "https://testnet.monadexplorer.com",
  currency: { name: "Monad", symbol: "MON", decimals: 18 },
};

export function getContractDeployment(network = "monadTestnet") {
  const file = path.join(process.cwd(), "deployments", `${network}.json`);
  if (!fs.existsSync(file)) return null;
  const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    ...MONAD_TESTNET,
    address: deployment.address,
    abi: deployment.abi,
    deployedAt: deployment.deployedAt,
  };
}
