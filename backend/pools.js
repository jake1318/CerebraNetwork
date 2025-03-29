// pools.js - Fetch and serve Cetus Sui liquidity pools with metadata and stats (Router module)

const express = require("express");
const axios = require("axios");
// Import SDK using the correct method
const { CetusClmmSDK } = require("@cetusprotocol/cetus-sui-clmm-sdk");

// Create a router instead of a full app
const router = express.Router();

// Define required package IDs for Cetus on mainnet
// These values are crucial for the SDK to work properly
const CETUS_CONFIG = {
  clmm: {
    package_id:
      "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb",
    published_at:
      "0xc33c3e937e5aa9759c4cfa30d132372377604325edc58e8bbc321cb7d686e07e",
    config: {
      global_config_id:
        "0x0c7b553fb8a896aec8d3cf29746406f8e15e5c2d1c2454b14f5656ecb3d7fcb3",
      global_vault_id:
        "0xce7fcecd651047fde4e51d3c48e013728edda34b2487cbc96c8d8d96debcd6e7",
      pools_id:
        "0xf3114a74dc7338bd4d32f55e03c3d3336790a678a37ad8c6ad4397fa6d615af3",
      partner_list_id:
        "0xc090b101978bd6370def2666b5438c406fa6e6b1d0b1d29c2e80ac2780e024e1",
    },
  },
  swap: {
    package_id:
      "0x5e1e8a38e695d5572b80f90f0da0ae1328c43da0185505dacaaa18a1720b6b06",
    published_at:
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    config: {
      global_config_id:
        "0x0a7eeb1103180a8d12b44ffdf4e85c9809291236930a5113bad2a7aef31cbfe0",
      pools_id:
        "0xbe2b3c90e2e11e48bcaa499c47d24594c0e9b8df16f2dfa96fbb02c2e894aa2c",
      coins_id:
        "0x5f6efd1da3f36363b26f46ff3828b746c62b408537d7576408c504006c21997d",
    },
  },
};

// Initialize Cetus SDK for Sui mainnet with proper configuration
let sdk;
try {
  sdk = new CetusClmmSDK({
    // Network can be 'testnet', 'mainnet', or 'devnet'
    network: "mainnet",
    // Full node URL for the selected network
    fullRpcUrl: "https://fullnode.mainnet.sui.io",
    // These are the package IDs and configuration needed for Cetus SDK
    clmmConfig: CETUS_CONFIG.clmm,
    cetusConfig: {
      package_id: CETUS_CONFIG.swap.package_id,
      published_at: CETUS_CONFIG.swap.published_at,
      config: CETUS_CONFIG.swap.config,
    },
    // Optional simulation account
    simulationAccount: {
      address:
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
    // Optional Cetus API URL for getting extra stats
    cetusApiUrl: "https://api-sui.cetus.zone",
    // Whether to fetch token logos
    fetchTokenLogos: true,
  });
  console.log("Cetus SDK initialized successfully");
} catch (err) {
  console.error("Failed to initialize Cetus SDK:", err);
  process.exit(1); // Exit if SDK initialization fails since we need it for the API
}

// Define the /api/pools endpoint
router.get("/pools", async (req, res) => {
  console.log("Received request to /api/pools");

  try {
    // 1. Fetch all pools from Cetus CLMM on Sui mainnet
    console.log("Fetching pools from Cetus SDK...");
    const allPools = await sdk.Pool.getPools();
    console.log(`Retrieved ${allPools.length} total pools`);

    // 2. Filter out pools with zero liquidity
    const activePools = allPools.filter((pool) => {
      try {
        // pool.liquidity is a big number (string). Use BigInt for comparison.
        return pool.liquidity && BigInt(pool.liquidity) > 0n;
      } catch (e) {
        // If liquidity is missing or invalid, log and exclude the pool
        console.error(`Invalid liquidity in pool ${pool.poolAddress}:`, e);
        return false;
      }
    });
    console.log(`Filtered to ${activePools.length} active pools`);

    // 3. Fetch coin metadata (symbol and decimals) for each unique coin in the pools
    const coinTypes = new Set();
    for (const pool of activePools) {
      if (pool.coinTypeA) coinTypes.add(pool.coinTypeA);
      if (pool.coinTypeB) coinTypes.add(pool.coinTypeB);
    }
    console.log(`Found ${coinTypes.size} unique coin types`);

    const coinMetaMap = {};
    for (const coinType of coinTypes) {
      try {
        const meta = await sdk.Coin.getCoinMetadata(coinType);
        if (meta) {
          coinMetaMap[coinType] = {
            symbol: meta.symbol,
            decimals: meta.decimals,
          };
        }
      } catch (err) {
        console.error(`Error fetching metadata for coin ${coinType}:`, err);
      }
    }

    // 4. Call Cetus API for pool TVL, volume, and APR stats
    console.log("Fetching pool stats from Cetus API...");
    const statsMap = {};
    try {
      const response = await axios.get(
        "https://api-sui.cetus.zone/v2/sui/swap/count"
      );
      const apiData = response.data;
      if (apiData && apiData.data && Array.isArray(apiData.data.pools)) {
        for (const poolStats of apiData.data.pools) {
          if (!poolStats.swap_account) continue;
          statsMap[poolStats.swap_account] = {
            tvl: poolStats.tvl !== undefined ? poolStats.tvl : null,
            volume24h:
              poolStats.volume_24h !== undefined
                ? poolStats.volume_24h
                : poolStats.volume24h !== undefined
                ? poolStats.volume24h
                : null,
            apr: poolStats.apr !== undefined ? poolStats.apr : null,
          };
        }
        console.log(
          `Retrieved stats for ${Object.keys(statsMap).length} pools`
        );
      } else {
        console.error("Unexpected Cetus API response format:", apiData);
      }
    } catch (err) {
      console.error("Error fetching data from Cetus API:", err);
      // Proceed without stats if API call fails (statsMap will remain partially filled or empty)
    }

    // 5. Enrich pool data with metadata and stats to match frontend expectations
    console.log("Enriching pool data...");
    const enrichedPools = activePools.map((pool) => {
      const coinAType = pool.coinTypeA;
      const coinBType = pool.coinTypeB;
      const coinAInfo = coinMetaMap[coinAType] || {};
      const coinBInfo = coinMetaMap[coinBType] || {};
      const stats = statsMap[pool.poolAddress] || {};

      // Calculate fee rate percentage from pool.fee if available
      // Pool fee is typically in basis points (1/10000), convert to percentage
      const feeRatePct = pool.fee ? Number(pool.fee) / 10000 : undefined;

      return {
        symbolA: coinAInfo.symbol || "Unknown",
        symbolB: coinBInfo.symbol || "Unknown",
        poolAddress: pool.poolAddress,
        feeRatePct: feeRatePct,
        apr: stats.apr !== undefined ? stats.apr : undefined,
        tvlUsd: stats.tvl !== undefined ? stats.tvl : 0,
        // If you have reward APY data, add it here. For now setting to undefined
        rewardApy: undefined,
      };
    });

    // 6. Handle pagination: parse query params ?page and ?limit
    console.log("Processing pagination...");
    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    if (page < 1) page = 1;
    const totalPools = enrichedPools.length;
    const totalPages = totalPools > 0 ? Math.ceil(totalPools / limit) : 0;
    if (page > totalPages && totalPools > 0) page = totalPages; // clamp page to last page if out of range

    // Calculate start and end index for slicing the results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const pagePools = enrichedPools.slice(startIndex, endIndex);

    // 7. Respond with JSON
    console.log(
      `Responding with ${pagePools.length} pools (page ${page}/${totalPages})`
    );
    res.json({
      pools: pagePools,
      totalPools: totalPools,
      totalPages: totalPages,
      page: page,
      limit: limit,
    });
  } catch (err) {
    console.error("Error handling /api/pools request:", err);
    res
      .status(500)
      .json({ error: "Failed to fetch pools data", details: err.message });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Pools API is running",
    sdkInitialized: !!sdk,
  });
});

// Export the router to be mounted in server.js
module.exports = router;
