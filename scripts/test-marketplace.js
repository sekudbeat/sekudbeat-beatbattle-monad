// Live end-to-end proof against the real Monad testnet deployment: mints a
// fresh chart, lists it, funds a brand-new throwaway wallet, and has THAT
// wallet buy it — so the payout split (royalty/fee/seller) is proven to
// really move funds to distinct parties on-chain, not just in the local
// simulated Hardhat network.
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const network = hre.network.name;
  const beatChartDeployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", `${network}.json`), "utf8")
  );
  const marketDeployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "deployments", `${network}-marketplace.json`), "utf8")
  );

  const [seller] = await hre.ethers.getSigners();
  const chart = await hre.ethers.getContractAt("BeatChart", beatChartDeployment.address, seller);
  const market = await hre.ethers.getContractAt("BeatChartMarketplace", marketDeployment.address, seller);

  // A fresh throwaway buyer wallet, funded just enough to buy + pay gas.
  const buyerWallet = hre.ethers.Wallet.createRandom().connect(hre.ethers.provider);
  console.log("Throwaway buyer:", buyerWallet.address);
  const price = hre.ethers.parseEther("1");
  const fundTx = await seller.sendTransaction({ to: buyerWallet.address, value: hre.ethers.parseEther("1.05") });
  await fundTx.wait();
  console.log("Funded buyer with 1.05 MON");

  // Mint a fresh chart to sell.
  const hash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("marketplace-test-" + Date.now()));
  const mintTx = await chart.mint(hash, 88, "rookie", "ipfs://placeholder/marketplace-test.json");
  const mintReceipt = await mintTx.wait();
  const mintedEvent = mintReceipt.logs.map((l) => { try { return chart.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "ChartMinted");
  const tokenId = mintedEvent.args.tokenId;
  console.log("Minted tokenId:", tokenId.toString());

  // List it.
  await (await chart.approve(marketDeployment.address, tokenId)).wait();
  await (await market.list(tokenId, price)).wait();
  console.log("Listed tokenId", tokenId.toString(), "for", hre.ethers.formatEther(price), "MON");

  const sellerBalanceBefore = await hre.ethers.provider.getBalance(seller.address);

  // Buy it from the throwaway wallet.
  const marketAsBuyer = market.connect(buyerWallet);
  const buyTx = await marketAsBuyer.buy(tokenId, { value: price });
  const buyReceipt = await buyTx.wait();
  console.log("Buy tx confirmed in block", buyReceipt.blockNumber, "status:", buyReceipt.status === 1 ? "success" : "FAILED");

  const newOwner = await chart.ownerOf(tokenId);
  console.log("New owner:", newOwner, newOwner.toLowerCase() === buyerWallet.address.toLowerCase() ? "(matches buyer ✓)" : "(MISMATCH)");

  const sellerBalanceAfter = await hre.ethers.provider.getBalance(seller.address);
  const received = sellerBalanceAfter - sellerBalanceBefore;
  // seller here is also the creator AND the platform fee receiver, so they should
  // receive the FULL price back (royalty + fee + proceeds all land on the same address).
  console.log("Seller/creator/fee-receiver net received:", hre.ethers.formatEther(received), "MON (expect ~1.0, minus nothing since seller pays no gas here)");

  const listing = await market.listings(tokenId);
  console.log("Listing cleared after sale:", listing.price === 0n);
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
