// pools.js - Fetch and serve Cetus Sui liquidity pools with metadata and stats (Router module)

const express = require("express");
const axios = require("axios");
const { initCetusSDK } = require("@cetusprotocol/cetus-sui-clmm-sdk");

// Create a router instead of a full app
const router = express.Router();

// Initialize Cetus SDK for Sui mainnet
let sdk;
try {
  sdk = initCetusSDK({ network: "mainnet" });
  console.log("Cetus SDK initialized successfully");
} catch (err) {
  console.error("Failed to initialize Cetus SDK:", err);
  // Continue without crashing the entire server
}

// Define the /api/pools endpoint
router.get("/pools", async (req, res) => {
  console.log("Received request to /api/pools");

  if (!sdk) {
    return res.status(500).json({ error: "Cetus SDK not initialized" });
  }

  try {
    // 1. Fetch all pools from Cetus CLMM on Sui mainnet
    console.log("Fetching pools from Cetus SDK...");
    const allPools = await sdk.Pool.getPools([]);
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
        const meta = await sdk.fullClient.getCoinMetadata({ coinType });
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

    // 5. Enrich pool data with metadata and stats - UPDATED to match frontend expectations
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
    res.status(500).json({ error: "Failed to fetch pools data" });
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Pools API is running" });
});

// Export the router to be mounted in server.js
module.exports = router;
