const { expect } = require("chai");
const { ethers } = require("hardhat");

// Runs entirely on Hardhat's built-in local network — no testnet gas spent.
// Sanity-checks the contract logic before it ever touches Monad testnet.
describe("BeatChart", function () {
  async function deploy() {
    const [creator, other] = await ethers.getSigners();
    const BeatChart = await ethers.getContractFactory("BeatChart");
    const chart = await BeatChart.deploy();
    await chart.waitForDeployment();
    return { chart, creator, other };
  }

  const hash1 = ethers.keccak256(ethers.toUtf8Bytes("beat-one"));
  const hash2 = ethers.keccak256(ethers.toUtf8Bytes("beat-two"));

  it("mints a token to the caller and records chart info", async function () {
    const { chart, creator } = await deploy();
    const tx = await chart.connect(creator).mint(hash1, 97, "pro", "ipfs://metadata/1");
    await expect(tx).to.emit(chart, "ChartMinted").withArgs(1, creator.address, hash1, 97, "pro");

    expect(await chart.ownerOf(1)).to.equal(creator.address);
    expect(await chart.tokenURI(1)).to.equal("ipfs://metadata/1");

    const info = await chart.charts(1);
    expect(info.creator).to.equal(creator.address);
    expect(info.contentHash).to.equal(hash1);
    expect(info.score).to.equal(97);
    expect(info.difficulty).to.equal("pro");
  });

  it("sets a 5% ERC-2981 royalty to the original creator", async function () {
    const { chart, creator } = await deploy();
    await chart.connect(creator).mint(hash1, 80, "rookie", "ipfs://metadata/1");
    const [receiver, amount] = await chart.royaltyInfo(1, 10_000n);
    expect(receiver).to.equal(creator.address);
    expect(amount).to.equal(500n); // 5% of a 10,000 sale price
  });

  it("rejects a score over 100", async function () {
    const { chart, creator } = await deploy();
    await expect(chart.connect(creator).mint(hash1, 101, "legend", "u")).to.be.revertedWith(
      "BeatChart: score must be 0-100"
    );
  });

  it("rejects minting the same content hash twice, even from a different wallet", async function () {
    const { chart, creator, other } = await deploy();
    await chart.connect(creator).mint(hash1, 90, "pro", "ipfs://metadata/1");
    await expect(chart.connect(other).mint(hash1, 90, "pro", "ipfs://metadata/2")).to.be.revertedWith(
      "BeatChart: already minted"
    );
  });

  it("lets different wallets mint different content hashes independently", async function () {
    const { chart, creator, other } = await deploy();
    await chart.connect(creator).mint(hash1, 90, "pro", "u1");
    await chart.connect(other).mint(hash2, 60, "newbie", "u2");
    expect(await chart.ownerOf(1)).to.equal(creator.address);
    expect(await chart.ownerOf(2)).to.equal(other.address);
  });

  it("rejects a zero content hash", async function () {
    const { chart, creator } = await deploy();
    await expect(
      chart.connect(creator).mint(ethers.ZeroHash, 50, "rookie", "u")
    ).to.be.revertedWith("BeatChart: contentHash required");
  });
});
