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
// almost always.
//
// The one case that ISN'T cheap: a genuinely cold index (fresh kv store, or
// this endpoint hasn't been hit in a long time) against a deploy block far
// in the past — confirmed locally at 43s to fully catch up from this
// contract's actual deploy block, which blows well past a serverless
// function's execution timeout. MAX_BLOCKS_PER_REQUEST bounds how much any
// single invocation will scan; if there's a bigger backlog than that, this
// persists partial progress and returns what's known so far (accurate as
// of lastScannedBlock, just possibly not fully caught up to chain head
// yet) rather than trying to finish it all in one request. Repeated
// requests (naturally, every time someone opens the Marketplace tab)
// advance the index further until it's caught up.
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
const MAX_BLOCKS_PER_REQUEST = 1200; // ~12 chunked calls — measured ~1s/call against Monad's public testnet RPC, so this keeps one request's worst case (cold index) well under a 10s serverless timeout

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

// One unfiltered eth_getLogs call per 100-block chunk (address only, no
// topic filter) instead of one call per event TYPE per chunk — each call
// against Monad's public testnet RPC costs roughly 1s regardless of how
// much of the 100-block range it actually covers, so the real cost driver
// is call COUNT, not block count. Filtering by topic would need a separate
// call per event name; parsing the (small) unfiltered result client-side
// instead cuts total calls 3x.
async function queryMarketEventsChunked(provider, marketAddress, marketInterface, fromBlock, toBlock) {
  const chunkStarts = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK_SIZE) chunkStarts.push(start);
  const chunks = await Promise.all(
    chunkStarts.map((start) =>
      provider.getLogs({ address: marketAddress, fromBlock: start, toBlock: Math.min(start + LOG_CHUNK_SIZE - 1, toBlock) })
    )
  );
  // The marketplace also inherits Ownable, which emits its own
  // OwnershipTransferred event at deploy time (and on any future ownership
  // change) — same contract address, so the unfiltered getLogs call above
  // returns it too. parseLog() happily parses it (it's a real event in the
  // ABI), just with no tokenId field, so it has to be filtered out here
  // rather than assumed away.
  const RELEVANT_EVENTS = new Set(["ChartListed", "ChartSold", "ChartListingCancelled"]);
  const events = [];
  for (const log of chunks.flat()) {
    let parsed;
    try { parsed = marketInterface.parseLog(log); } catch (e) { continue; }
    if (!parsed || !RELEVANT_EVENTS.has(parsed.name)) continue;
    events.push({ name: parsed.name, args: parsed.args, blockNumber: log.blockNumber, logIndex: log.index });
  }
  return events;
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

  try {
    const provider = new ethers.JsonRpcProvider(deployment.rpcUrl, deployment.chainId);
    const market = new ethers.Contract(deployment.marketplace.address, deployment.marketplace.abi, provider);
    const chart = new ethers.Contract(deployment.address, deployment.abi, provider);

    const state = await loadIndexState();
    const deployBlock = await getDeployBlock(provider);
    const fromBlock = state.lastScannedBlock !== null ? state.lastScannedBlock + 1 : deployBlock;
    const chainHeadBlock = await provider.getBlockNumber();
    const toBlock = Math.min(chainHeadBlock, fromBlock + MAX_BLOCKS_PER_REQUEST - 1);

    if (fromBlock <= toBlock) {
      const events = await queryMarketEventsChunked(provider, deployment.marketplace.address, market.interface, fromBlock, toBlock);
      events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);

      for (const evt of events) {
        const tokenId = evt.args.tokenId.toString();
        if (evt.name === "ChartListed") state.listings[tokenId] = { seller: evt.args.seller, price: evt.args.price.toString() };
        else if (evt.name === "ChartSold" || evt.name === "ChartListingCancelled") delete state.listings[tokenId];
      }
      state.lastScannedBlock = toBlock;
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

    res.status(200).json({
      marketplaceAddress: deployment.marketplace.address,
      listings,
      indexedThroughBlock: toBlock,
      chainHeadBlock,
      caughtUp: toBlock >= chainHeadBlock,
    });
  } catch (e) {
    // Network/RPC hiccups should surface as a clean JSON error the frontend
    // can show a message for, not an uncaught exception — an unhandled
    // throw here becomes Vercel's generic HTML 500 page, which is exactly
    // the "Unexpected token '<'" class of bug fixed earlier this session.
    res.status(502).json({ error: "Could not reach the Monad RPC to load marketplace listings. Try again shortly." });
  }
}
