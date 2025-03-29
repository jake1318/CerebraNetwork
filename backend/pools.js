// pools.js - Fetch and serve Cetus Sui liquidity pools with metadata and stats (CommonJS)

const express = require("express");
const axios = require("axios");
const { initCetusSDK } = require("@cetusprotocol/cetus-sui-clmm-sdk");

const app = express();
// Initialize Cetus SDK for Sui mainnet
let sdk;
try {
  sdk = initCetusSDK({ network: "mainnet" });
} catch (err) {
  console.error("Failed to initialize Cetus SDK:", err);
  process.exit(1); // exit if we cannot initialize the SDK
}

// Define the /api/pools endpoint
app.get("/api/pools", async (req, res) => {
  try {
    // 1. Fetch all pools from Cetus CLMM on Sui mainnet
    const allPools = await sdk.Pool.getPools([]);
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

    // 3. Fetch coin metadata (symbol and decimals) for each unique coin in the pools
    const coinTypes = new Set();
    for (const pool of activePools) {
      if (pool.coinTypeA) coinTypes.add(pool.coinTypeA);
      if (pool.coinTypeB) coinTypes.add(pool.coinTypeB);
    }
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
      } else {
        console.error("Unexpected Cetus API response format:", apiData);
      }
    } catch (err) {
      console.error("Error fetching data from Cetus API:", err);
      // Proceed without stats if API call fails (statsMap will remain partially filled or empty)
    }

    // 5. Enrich pool data with metadata and stats
    const enrichedPools = activePools.map((pool) => {
      const coinAType = pool.coinTypeA;
      const coinBType = pool.coinTypeB;
      const coinAInfo = coinMetaMap[coinAType] || {};
      const coinBInfo = coinMetaMap[coinBType] || {};
      const stats = statsMap[pool.poolAddress] || {};
      return {
        poolAddress: pool.poolAddress,
        coinA: {
          type: coinAType,
          symbol: coinAInfo.symbol || null,
          decimals: coinAInfo.decimals || null,
        },
        coinB: {
          type: coinBType,
          symbol: coinBInfo.symbol || null,
          decimals: coinBInfo.decimals || null,
        },
        liquidity: pool.liquidity,
        tvl: stats.tvl !== undefined ? stats.tvl : null,
        volume24h: stats.volume24h !== undefined ? stats.volume24h : null,
        apr: stats.apr !== undefined ? stats.apr : null,
      };
    });

    // 6. Handle pagination: parse query params ?page and ?limit
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

    // 7. Respond with JSON containing pool data and pagination info
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

// Start the server (if this file is run directly)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
