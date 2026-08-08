const { expect } = require("chai");
const { ethers } = require("hardhat");

// All on Hardhat's local network — no testnet gas spent. This contract moves
// real value at buy(), so it gets the most thorough test pass of anything
// in this repo: correct payout split, refund-on-overpay, and every revert
// path a seller/buyer could hit.
describe("BeatChartMarketplace", function () {
  const PLATFORM_FEE_BPS = 250n; // 2.5%
  const ROYALTY_BPS = 500n; // 5%, fixed by BeatChart itself

  async function deploy() {
    const [creator, buyer, feeReceiver, other] = await ethers.getSigners();

    const BeatChart = await ethers.getContractFactory("BeatChart");
    const chart = await BeatChart.deploy();
    await chart.waitForDeployment();

    const Marketplace = await ethers.getContractFactory("BeatChartMarketplace");
    const market = await Marketplace.deploy(await chart.getAddress(), feeReceiver.address, PLATFORM_FEE_BPS);
    await market.waitForDeployment();

    const hash = ethers.keccak256(ethers.toUtf8Bytes("chart-" + Math.random()));
    const mintTx = await chart.connect(creator).mint(hash, 90, "pro", "ipfs://meta/1");
    await mintTx.wait();
    const tokenId = 1n;

    return { chart, market, creator, buyer, feeReceiver, other, tokenId };
  }

  async function listed(price) {
    const ctx = await deploy();
    await ctx.chart.connect(ctx.creator).approve(await ctx.market.getAddress(), ctx.tokenId);
    await ctx.market.connect(ctx.creator).list(ctx.tokenId, price);
    return { ...ctx, price };
  }

  it("moves the NFT into escrow on list()", async function () {
    const { chart, market, tokenId } = await listed(ethers.parseEther("1"));
    expect(await chart.ownerOf(tokenId)).to.equal(await market.getAddress());
    const l = await market.listings(tokenId);
    expect(l.price).to.equal(ethers.parseEther("1"));
  });

  it("rejects listing without prior approval", async function () {
    const { chart, market, creator, tokenId } = await deploy();
    await expect(market.connect(creator).list(tokenId, ethers.parseEther("1"))).to.be.reverted;
  });

  it("rejects a zero price listing", async function () {
    const { chart, market, creator, tokenId } = await deploy();
    await chart.connect(creator).approve(await market.getAddress(), tokenId);
    await expect(market.connect(creator).list(tokenId, 0)).to.be.revertedWith("Marketplace: price must be > 0");
  });

  it("rejects listing something already listed", async function () {
    // Token is already in escrow after listed() — the seller no longer owns it, so a
    // second list() call must revert on the "already listed" check before it ever gets
    // to the ownership check.
    const { market, creator, tokenId } = await listed(ethers.parseEther("1"));
    await expect(market.connect(creator).list(tokenId, ethers.parseEther("1"))).to.be.revertedWith(
      "Marketplace: already listed"
    );
  });

  it("cancelListing returns the NFT to the seller and clears the listing", async function () {
    const { chart, market, creator, tokenId } = await listed(ethers.parseEther("1"));
    await market.connect(creator).cancelListing(tokenId);
    expect(await chart.ownerOf(tokenId)).to.equal(creator.address);
    const l = await market.listings(tokenId);
    expect(l.price).to.equal(0n);
  });

  it("rejects cancelListing from anyone but the seller", async function () {
    const { market, other, tokenId } = await listed(ethers.parseEther("1"));
    await expect(market.connect(other).cancelListing(tokenId)).to.be.revertedWith("Marketplace: not your listing");
  });

  it("buy() splits payment correctly: royalty to creator, fee to platform, rest to seller", async function () {
    const price = ethers.parseEther("10");
    const { chart, market, creator, buyer, feeReceiver, tokenId } = await listed(price);

    const creatorBefore = await ethers.provider.getBalance(creator.address);
    const feeReceiverBefore = await ethers.provider.getBalance(feeReceiver.address);

    const tx = await market.connect(buyer).buy(tokenId, { value: price });
    await tx.wait();

    const royaltyAmount = (price * ROYALTY_BPS) / 10_000n; // 0.5 MON
    const platformFeeAmount = (price * PLATFORM_FEE_BPS) / 10_000n; // 0.25 MON
    const sellerProceeds = price - royaltyAmount - platformFeeAmount; // 9.25 MON — creator IS the seller here too

    // creator is both the royalty receiver AND the seller in this test, so they get both
    const creatorAfter = await ethers.provider.getBalance(creator.address);
    expect(creatorAfter - creatorBefore).to.equal(royaltyAmount + sellerProceeds);

    const feeReceiverAfter = await ethers.provider.getBalance(feeReceiver.address);
    expect(feeReceiverAfter - feeReceiverBefore).to.equal(platformFeeAmount);

    expect(await chart.ownerOf(tokenId)).to.equal(buyer.address);
    const l = await market.listings(tokenId);
    expect(l.price).to.equal(0n);
  });

  it("buy() with a resale pays royalty to the ORIGINAL creator, not the reselling seller", async function () {
    const price1 = ethers.parseEther("10");
    const { chart, market, creator, buyer, other, feeReceiver, tokenId } = await listed(price1);
    await market.connect(buyer).buy(tokenId, { value: price1 });
    expect(await chart.ownerOf(tokenId)).to.equal(buyer.address);

    // buyer (now owner) relists and sells to `other`
    const price2 = ethers.parseEther("20");
    await chart.connect(buyer).approve(await market.getAddress(), tokenId);
    await market.connect(buyer).list(tokenId, price2);

    const creatorBefore = await ethers.provider.getBalance(creator.address);
    const sellerBefore = await ethers.provider.getBalance(buyer.address);

    await market.connect(other).buy(tokenId, { value: price2 });

    const royaltyAmount2 = (price2 * ROYALTY_BPS) / 10_000n;
    const platformFeeAmount2 = (price2 * PLATFORM_FEE_BPS) / 10_000n;
    const sellerProceeds2 = price2 - royaltyAmount2 - platformFeeAmount2;

    const creatorAfter = await ethers.provider.getBalance(creator.address);
    expect(creatorAfter - creatorBefore).to.equal(royaltyAmount2); // original creator, still gets royalty on resale

    const sellerAfter = await ethers.provider.getBalance(buyer.address);
    expect(sellerAfter - sellerBefore).to.equal(sellerProceeds2); // reseller does NOT get royalty share

    expect(await chart.ownerOf(tokenId)).to.equal(other.address);
  });

  it("refunds any overpayment to the buyer", async function () {
    const price = ethers.parseEther("1");
    const { market, buyer, tokenId } = await listed(price);
    const overpay = ethers.parseEther("1.5");

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const tx = await market.connect(buyer).buy(tokenId, { value: overpay });
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed * receipt.gasPrice;

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    // buyer should be down exactly `price` + gas, not the full overpay amount
    expect(buyerBalanceBefore - buyerBalanceAfter).to.equal(price + gasCost);
  });

  it("rejects buy() with insufficient payment", async function () {
    const price = ethers.parseEther("1");
    const { market, buyer, tokenId } = await listed(price);
    await expect(
      market.connect(buyer).buy(tokenId, { value: ethers.parseEther("0.5") })
    ).to.be.revertedWith("Marketplace: insufficient payment");
  });

  it("rejects buy() on something not listed", async function () {
    const { market, buyer, tokenId } = await deploy();
    await expect(market.connect(buyer).buy(tokenId, { value: ethers.parseEther("1") })).to.be.revertedWith(
      "Marketplace: not listed"
    );
  });

  it("rejects buying a cancelled listing", async function () {
    const { market, creator, buyer, tokenId } = await listed(ethers.parseEther("1"));
    await market.connect(creator).cancelListing(tokenId);
    await expect(market.connect(buyer).buy(tokenId, { value: ethers.parseEther("1") })).to.be.revertedWith(
      "Marketplace: not listed"
    );
  });

  it("rejects buying the same listing twice", async function () {
    const price = ethers.parseEther("1");
    const { market, buyer, other, tokenId } = await listed(price);
    await market.connect(buyer).buy(tokenId, { value: price });
    await expect(market.connect(other).buy(tokenId, { value: price })).to.be.revertedWith("Marketplace: not listed");
  });

  it("only the owner can change the platform fee receiver, and the fee bps itself is immutable", async function () {
    const { market, creator, other, feeReceiver } = await deploy();
    await expect(market.connect(other).setPlatformFeeReceiver(other.address)).to.be.reverted; // not owner
    await market.connect(creator).setPlatformFeeReceiver(other.address); // deployer IS the owner
    expect(await market.platformFeeReceiver()).to.equal(other.address);
    expect(await market.platformFeeBps()).to.equal(PLATFORM_FEE_BPS); // no setter exists at all
  });

  it("rejects a constructor fee above the 10% sanity cap", async function () {
    const [deployer, , feeReceiver] = await ethers.getSigners();
    const BeatChart = await ethers.getContractFactory("BeatChart");
    const chart = await BeatChart.deploy();
    await chart.waitForDeployment();
    const Marketplace = await ethers.getContractFactory("BeatChartMarketplace");
    await expect(
      Marketplace.deploy(await chart.getAddress(), feeReceiver.address, 1001)
    ).to.be.revertedWith("Marketplace: fee too high (max 10%)");
  });
});
