// Serves the deployment info scripts/deploy.js wrote to
// deployments/monadTestnet.json (address + ABI — public information, safe
// to re-serve; no keys in here). Statically imported (not read via fs at
// request time) so Next's serverless file-tracing bundles it correctly —
// a dynamic fs.readFileSync path can silently 404 in a deployed serverless
// function even though it works fine under `next dev`.
import deployment from "../deployments/monadTestnet.json";

const MONAD_TESTNET = {
  network: "monadTestnet",
  chainId: 10143,
  chainIdHex: "0x279f",
  rpcUrl: "https://testnet-rpc.monad.xyz/",
  explorerUrl: "https://testnet.monadexplorer.com",
  currency: { name: "Monad", symbol: "MON", decimals: 18 },
};

export function getContractDeployment() {
  if (!deployment || !deployment.address) return null;
  return {
    ...MONAD_TESTNET,
    address: deployment.address,
    abi: deployment.abi,
    deployedAt: deployment.deployedAt,
  };
}
