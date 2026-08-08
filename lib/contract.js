// Serves the deployment info scripts/deploy.js and scripts/deploy-marketplace.js
// wrote to deployments/monadTestnet*.json (addresses + ABIs — public
// information, safe to re-serve; no keys in here). Statically imported (not
// read via fs at request time) so Next's serverless file-tracing bundles it
// correctly — a dynamic fs.readFileSync path can silently 404 in a deployed
// serverless function even though it works fine under `next dev`.
import beatChartDeployment from "../deployments/monadTestnet.json";
import marketplaceDeployment from "../deployments/monadTestnet-marketplace.json";

const MONAD_TESTNET = {
  network: "monadTestnet",
  chainId: 10143,
  chainIdHex: "0x279f",
  rpcUrl: "https://testnet-rpc.monad.xyz/",
  explorerUrl: "https://testnet.monadexplorer.com",
  currency: { name: "Monad", symbol: "MON", decimals: 18 },
};

export function getContractDeployment() {
  if (!beatChartDeployment || !beatChartDeployment.address) return null;
  return {
    ...MONAD_TESTNET,
    address: beatChartDeployment.address,
    abi: beatChartDeployment.abi,
    deployedAt: beatChartDeployment.deployedAt,
    marketplace:
      marketplaceDeployment && marketplaceDeployment.address
        ? {
            address: marketplaceDeployment.address,
            abi: marketplaceDeployment.abi,
            platformFeeBps: marketplaceDeployment.platformFeeBps,
            deployedAt: marketplaceDeployment.deployedAt,
          }
        : null,
  };
}
