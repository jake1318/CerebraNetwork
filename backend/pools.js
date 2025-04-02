import dotenv from "dotenv";
dotenv.config();

import express from "express";
import fetch from "node-fetch"; // For Node <18; if using Node 18+, you can use global fetch.
const router = express.Router();

import { TurbosSdk, Network } from "turbos-clmm-sdk";

// Initialize Turbos SDK for Sui mainnet using the Ankr RPC provider.
const ANKR_API_KEY = process.env.ANKR_API_KEY || "YOUR_ANKR_API_KEY";
const RPC_URL = `https://rpc.ankr.com/sui/${ANKR_API_KEY}`;
const sdk = new TurbosSdk(Network.mainnet, { fullnode: RPC_URL });

// In-memory caches for pools and vault strategies.
let poolsCache = [];
let vaultsCache = [];
let dataLoaded = false; // indicates if initial load is complete

// Utility: delay for a given number of milliseconds.
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * JSON-RPC call helper – makes a single call to the Ankr RPC endpoint.
 */
async function callRpc(method, params) {
  const rpcBody = { jsonrpc: "2.0", id: Date.now(), method, params };
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rpcBody),
  });
  if (!response.ok) {
    throw new Error(`RPC request failed with status ${response.status}`);
  }
  const result = await response.json();
  if (result.error) {
    throw new Error(
      `RPC error: ${result.error.message || JSON.stringify(result.error)}`
    );
  }
  return result.result;
}

/**
 * JSON-RPC call with retry logic.
 */
async function callRpcWithRetry(method, params, retries = 3) {
  try {
    return await callRpc(method, params);
  } catch (err) {
    if (retries <= 0) throw err;
    console.warn(
      `RPC call ${method} failed, retrying... (${retries} retries left). Error:`,
      err.message
    );
    await delay(500);
    return callRpcWithRetry(method, params, retries - 1);
  }
}

/**
 * Helper to fetch all dynamic field object IDs under a given parent ID.
 */
async function fetchAllDynamicChildren(parentId) {
  let results = [];
  let cursor = null;
  do {
    // Use a limit of 50 per page.
    const res = await callRpcWithRetry("suix_getDynamicFields", [
      parentId,
      cursor,
      50,
    ]);
    const fields = res.data || [];
    for (const entry of fields) {
      if (entry.objectId) results.push(entry.objectId);
    }
    cursor = res.nextCursor;
  } while (cursor);
  return results;
}

/**
 * Fetch and enrich all pools and vault strategies from Turbos.
 * Uses the registry IDs obtained from sdk.contract.getConfig().
 */
async function fetchPoolsAndVaults() {
  try {
    // Retrieve on-chain config via Turbos SDK.
    const config = await sdk.contract.getConfig();
    const poolRegistryId = config.PoolTableId || config.pools_id;
    const vaultRegistryId =
      config.VaultGlobalConfig || config.vaultGlobalConfigId;
    if (!poolRegistryId || !vaultRegistryId) {
      throw new Error("Could not obtain registry IDs from config");
    }
    console.log("Pool Registry ID:", poolRegistryId);
    console.log("Vault Registry ID:", vaultRegistryId);

    // 1. Fetch all pool IDs via dynamic fields of the pool registry.
    const poolIDs = await fetchAllDynamicChildren(poolRegistryId);
    // 2. Fetch all vault strategy IDs via dynamic fields of the vault registry.
    const vaultIDs = await fetchAllDynamicChildren(vaultRegistryId);
    console.log(
      `Found ${poolIDs.length} pool IDs and ${vaultIDs.length} vault IDs`
    );

    // 3. Batch-fetch pool objects.
    const poolObjects = [];
    const options = { showType: true, showContent: true, showOwner: true };
    const batchSize = 5;
    for (let i = 0; i < poolIDs.length; i += batchSize) {
      const batchIds = poolIDs.slice(i, i + batchSize);
      const objectsPage = await callRpcWithRetry("sui_multiGetObjects", [
        batchIds,
        options,
      ]);
      poolObjects.push(...objectsPage);
      await delay(1000); // throttle ~5 calls/sec
    }

    // 4. Batch-fetch vault objects.
    const vaultObjects = [];
    for (let i = 0; i < vaultIDs.length; i += batchSize) {
      const batchIds = vaultIDs.slice(i, i + batchSize);
      const objectsPage = await callRpcWithRetry("sui_multiGetObjects", [
        batchIds,
        options,
      ]);
      vaultObjects.push(...objectsPage);
      await delay(1000);
    }

    // 5. Enrich pool data: parse coin types, fee, liquidity, and lock status.
    const enrichedPools = [];
    for (const obj of poolObjects) {
      if (obj.error || !obj.data || !obj.data.content) continue;
      const poolId = obj.data.objectId;
      const typeStr = obj.data.type; // e.g., "0x...::pool::Pool<0x...::sui::SUI, 0x...::coin::USDC, 5>"
      const content = obj.data.content;
      const fields = content.fields || {};
      let coinTypeA = "";
      let coinTypeB = "";
      let feeBps = null;
      if (typeStr.includes("<") && typeStr.includes(">")) {
        const typeParams = typeStr.substring(
          typeStr.indexOf("<") + 1,
          typeStr.lastIndexOf(">")
        );
        const params = typeParams.split(",").map((s) => s.trim());
        if (params.length >= 2) {
          coinTypeA = params[0];
          coinTypeB = params[1];
        }
        const feeParam = params.find((p) => /^\d+$/.test(p));
        if (feeParam) feeBps = parseInt(feeParam, 10);
      }
      const liquidity =
        fields.liquidity !== undefined
          ? typeof fields.liquidity === "string" &&
            fields.liquidity.startsWith("0x")
            ? BigInt(fields.liquidity).toString()
            : fields.liquidity.toString()
          : "0";
      const isLocked = fields.is_locked || fields.is_paused || false;
      if (!coinTypeA || !coinTypeB) continue;
      enrichedPools.push({
        id: poolId,
        coinTypeA,
        coinTypeB,
        feeBps,
        liquidity,
        isLocked,
      });
    }

    // 6. Enrich vault strategy data.
    const enrichedVaults = [];
    for (const obj of vaultObjects) {
      if (obj.error || !obj.data || !obj.data.content) continue;
      const strategyId = obj.data.objectId;
      const typeStr = obj.data.type;
      const content = obj.data.content;
      const fields = content.fields || {};
      let poolId = fields.pool_id || fields.pool || null;
      let coinTypeA = fields.coin_type_a || "";
      let coinTypeB = fields.coin_type_b || "";
      if (
        (!coinTypeA || !coinTypeB) &&
        typeStr.includes("<") &&
        typeStr.includes(">")
      ) {
        const typeParams = typeStr.substring(
          typeStr.indexOf("<") + 1,
          typeStr.lastIndexOf(">")
        );
        const params = typeParams.split(",").map((s) => s.trim());
        if (params.length >= 2) {
          coinTypeA = coinTypeA || params[0];
          coinTypeB = coinTypeB || params[1];
        }
      }
      const isActive =
        fields.is_paused !== undefined ? !fields.is_paused : true;
      enrichedVaults.push({
        strategyId,
        poolId,
        coinTypeA,
        coinTypeB,
        isActive,
      });
    }

    poolsCache = enrichedPools;
    vaultsCache = enrichedVaults;
    dataLoaded = true;
    console.log(
      `Fetched and enriched ${poolsCache.length} pools and ${vaultsCache.length} vault strategies from Turbos.`
    );
  } catch (error) {
    console.error("Error fetching Turbos pools/vaults:", error);
    setTimeout(fetchPoolsAndVaults, 5000);
  }
}

fetchPoolsAndVaults();

// Endpoint: GET /api/pools – returns the list of pools.
router.get("/", (req, res) => {
  if (!dataLoaded) {
    return res.status(503).json({
      error: "Pool data is still loading. Please try again shortly.",
    });
  }
  // Return the pool data as a plain array.
  res.json(poolsCache);
});

// Endpoint: GET /api/pools/vault-strategies – returns the list of vault strategies.
router.get("/vault-strategies", (req, res) => {
  if (!dataLoaded) {
    return res.status(503).json({
      error: "Vault strategy data is still loading. Please try again shortly.",
    });
  }
  // Return the vault strategy data as a plain array.
  res.json(vaultsCache);
});

export default router;
