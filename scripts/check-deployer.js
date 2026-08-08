// Prints the address derived from DEPLOYER_PRIVATE_KEY (.env.local) and its
// Monad testnet balance — never prints the key itself.
require("dotenv").config({ path: ".env.local", quiet: true });
const { ethers } = require("ethers");

async function main() {
  const key = process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env.local");
  const wallet = new ethers.Wallet(key);
  console.log("Derived address:", wallet.address);

  const provider = new ethers.JsonRpcProvider(process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz/");
  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "MON");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
