// GET /api/marketplace — list every currently-active BeatChartMarketplace
// listing, with the chart's metadata attached for display.
//
// BeatChart is a plain ERC-721 (no Enumerable extension), so there is no
// on-chain way to ask "what's for sale" directly — this reconstructs it by
// replaying the marketplace contract's own ChartListed/ChartSold/
// ChartListingCancelled events.
//
// Two things make "just query from the deploy block every time" wrong on
// Monad specifically: its public RPC caps eth_getLogs to a 100-block range
// per call, and Monad's block time is ~1.3s — so the deploy-to-latest range
// only grows, forever, meaning that approach gets more expensive with every
// request, indefinitely. Instead this persists an incremental index in kv
// (last scanned block + the current active-listings map) and each request
// only replays whatever's new since the last scan — bounded, cheap work
// almost always, with chunked pagination only needed for the first cold
// scan (or if this has been offline a while).
import { ethers } from "ethers";
import { kv } from "../../lib/kv";
import { getContractDeployment } from "../../lib/contract";
// Statically imported (not read/imported dynamically at request time) for
// the same file-tracing reason as lib/contract.js: only need deployTxHash
// here, to find the block the marketplace was deployed in.
import marketplaceRaw from "../../deployments/monadTestnet-marketplace.json";

const INDEX_STATE_KEY = "marketplace:indexState:v1";
const DEPLOY_BLOCK_CACHE_KEY = "marketplace:deployBlock:" + marketplaceRaw.deployTxHash;
const LOG_CHUNK_SIZE = 100; // Monad testnet RPC's eth_getLogs range cap

async function getDeployBlock(provider) {
  const cached = await kv.get(DEPLOY_BLOCK_CACHE_KEY);
  if (cached) return Number(cached);
  const receipt = await provider.getTransactionReceipt(marketplaceRaw.deployTxHash);
  const blockNumber = receipt ? receipt.blockNumber : 0;
  await kv.set(DEPLOY_BLOCK_CACHE_KEY, String(blockNumber));
  return blockNumber;
}

async function loadIndexState() {
  const raw = await kv.get(INDEX_STATE_KEY);
  if (!raw) return { lastScannedBlock: null, listings: {} }; // listings: tokenId -> {seller, price}
  return JSON.parse(raw);
}

async function queryFilterChunked(contract, filter, fromBlock, toBlock) {
  const chunkStarts = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) chunkStarts.push(start);
  const chunks = await Promise.all(
    chunkStarts.map((start) => contract.queryFilter(filter, start, Math.min(start + LOG_CHUNK_SIZE - 1, toBlock)))
  );
  return chunks.flat();
}

function decodeDataUriMetadata(tokenURI) {
  try {
    if (!tokenURI || !tokenURI.startsWith("data:application/json;base64,")) return null;
    const base64 = tokenURI.slice("data:application/json;base64,".length);
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch (e) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const deployment = getContractDeployment();
  if (!deployment || !deployment.marketplace) {
    return res.status(404).json({ error: "Marketplace is not deployed yet." });
  }

  const provider = new ethers.JsonRpcProvider(deployment.rpcUrl, deployment.chainId);
  const market = new ethers.Contract(deployment.marketplace.address, deployment.marketplace.abi, provider);
  const chart = new ethers.Contract(deployment.address, deployment.abi, provider);

  const state = await loadIndexState();
  const deployBlock = await getDeployBlock(provider);
  const fromBlock = state.lastScannedBlock !== null ? state.lastScannedBlock + 1 : deployBlock;
  const latestBlock = await provider.getBlockNumber();

  if (fromBlock <= latestBlock) {
    const [listedEvents, soldEvents, cancelledEvents] = await Promise.all([
      queryFilterChunked(market, market.filters.ChartListed(), fromBlock, latestBlock),
      queryFilterChunked(market, market.filters.ChartSold(), fromBlock, latestBlock),
      queryFilterChunked(market, market.filters.ChartListingCancelled(), fromBlock, latestBlock),
    ]);

    const events = [
      ...listedEvents.map((e) => ({ type: "listed", tokenId: e.args.tokenId.toString(), seller: e.args.seller, price: e.args.price.toString(), blockNumber: e.blockNumber, logIndex: e.index })),
      ...soldEvents.map((e) => ({ type: "sold", tokenId: e.args.tokenId.toString(), blockNumber: e.blockNumber, logIndex: e.index })),
      ...cancelledEvents.map((e) => ({ type: "cancelled", tokenId: e.args.tokenId.toString(), blockNumber: e.blockNumber, logIndex: e.index })),
    ].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

    for (const evt of events) {
      if (evt.type === "listed") state.listings[evt.tokenId] = { seller: evt.seller, price: evt.price };
      else delete state.listings[evt.tokenId];
    }
    state.lastScannedBlock = latestBlock;
    await kv.set(INDEX_STATE_KEY, JSON.stringify(state));
  }

  const listings = await Promise.all(
    Object.entries(state.listings).map(async ([tokenIdStr, { seller, price }]) => {
      let metadata = null;
      let chartInfo = null;
      try {
        const [tokenURI, info] = await Promise.all([chart.tokenURI(tokenIdStr), chart.charts(tokenIdStr)]);
        metadata = decodeDataUriMetadata(tokenURI);
        chartInfo = { difficulty: info.difficulty, score: Number(info.score), creator: info.creator };
      } catch (e) {
        // Token may be in a state our replay can't explain (shouldn't happen
        // via normal use of the marketplace) — skip it rather than 500 the
        // whole listings page over one bad entry.
      }
      return {
        tokenId: tokenIdStr,
        seller,
        priceWei: price,
        priceMon: ethers.formatEther(price),
        name: metadata?.name || "Sekud Beat Arena Chart",
        description: metadata?.description || "",
        difficulty: chartInfo?.difficulty || null,
        score: chartInfo?.score ?? null,
        creator: chartInfo?.creator || null,
      };
    })
  );

  res.status(200).json({ marketplaceAddress: deployment.marketplace.address, listings });
}
