// services/bluefinService.js
// Updated: 2025-07-08 17:17:34 UTC by jake1318

import { SuiClient } from "@mysten/sui.js/client";

/*───────────────────────────────────────────────────────────────────────────*\
│  Bluefin on-chain object / package IDs (main-net)                         │
\*───────────────────────────────────────────────────────────────────────────*/
// Current package ID (post-upgrade) as of July 2025
export const BLUEFIN_CURRENT_PKG =
  "0x67b34b728c4e28e704dcfecf7c5cf55c7fc593b6c65c20d1836d97c209c1928a";

// Initial/genesis package ID (used for event querying)
export const BLUEFIN_GENESIS_PKG =
  "0x3492c874c1e3b3e2984e8c41b589e642d4d0a5d6459e5a9cfc2d52fd7c89c267";

// Current GlobalConfig object ID
export const BLUEFIN_CONFIG_ID =
  "0x03db251ba509a8d5d8777b6338836082335d93eecbdd09a11e190a1cff51c352";

export const SUI_CLOCK_OBJECT_ID = "0x6"; // main-net clock object (never changes)

const SUI_RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443";

// Cache for the Bluefin IDs
let cachedIds = {
  packageId: BLUEFIN_CURRENT_PKG,
  configId: BLUEFIN_CONFIG_ID,
};
let idsLastFetched = 0;
const IDS_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get the current Bluefin package ID and config object ID
 * Uses caching to avoid too many RPC calls
 *
 * This function will query the latest InitializeConfig event to find the
 * most current package ID and config ID, even after future upgrades.
 */
export async function getCurrentIds() {
  const now = Date.now();

  // Return cached value if it's still fresh
  if (idsLastFetched > 0 && now - idsLastFetched < IDS_CACHE_TTL) {
    console.log(`Using cached Bluefin IDs: ${JSON.stringify(cachedIds)}`);
    return cachedIds;
  }

  try {
    const client = new SuiClient({ url: SUI_RPC_URL });

    // Try to query events from different package IDs in case Bluefin has upgraded
    // First try current package, then fallback to genesis
    const packageIds = [BLUEFIN_CURRENT_PKG, BLUEFIN_GENESIS_PKG];
    let eventData = null;

    for (const pkgId of packageIds) {
      try {
        console.log(
          `Querying InitializeConfig events from package ${pkgId}...`
        );

        const ev = await client.queryEvents({
          query: {
            MoveEventType: `${pkgId}::config::InitializeConfig`,
          },
          limit: 1, // newest first
          order: "descending",
        });

        if (ev.data && ev.data.length > 0) {
          eventData = ev.data[0];
          console.log(`Found InitializeConfig event from package ${pkgId}`);
          break;
        }
      } catch (err) {
        console.warn(
          `Failed to query events from package ${pkgId}:`,
          err.message
        );
      }
    }

    if (eventData) {
      // Every InitializeConfig event has the structure { current_package, config_id }
      const { current_package, config_id } = eventData.parsedJson;

      cachedIds = {
        packageId: current_package,
        configId: config_id,
      };
      idsLastFetched = now;

      console.log(`Retrieved latest Bluefin IDs: ${JSON.stringify(cachedIds)}`);
      return cachedIds;
    }

    console.warn(
      "Could not find Bluefin InitializeConfig events, using hardcoded values"
    );
    // If no events found, use the current known values
    cachedIds = {
      packageId: BLUEFIN_CURRENT_PKG,
      configId: BLUEFIN_CONFIG_ID,
    };
    idsLastFetched = now;
    return cachedIds;
  } catch (error) {
    console.error("Error fetching Bluefin IDs:", error);

    // Fall back to hardcoded values on error
    cachedIds = {
      packageId: BLUEFIN_CURRENT_PKG,
      configId: BLUEFIN_CONFIG_ID,
    };
    idsLastFetched = now;
    return cachedIds;
  }
}

/**
 * Alternative method to get Bluefin IDs using the Bluefin API
 * This can be used as a fallback if on-chain event querying fails
 */
export async function getBluefinIdsFromAPI() {
  try {
    const response = await fetch(
      "https://swap.api.sui-prod.bluefin.io/api/v1/pools/info"
    );

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const data = await response.json();

    // Extract the package ID and config ID from the API response
    // Note: The exact structure may differ based on Bluefin's API response
    const packageId = data.packageId || BLUEFIN_CURRENT_PKG;
    const configId = data.configId || BLUEFIN_CONFIG_ID;

    return { packageId, configId };
  } catch (error) {
    console.error("Failed to fetch Bluefin IDs from API:", error);
    return {
      packageId: BLUEFIN_CURRENT_PKG,
      configId: BLUEFIN_CONFIG_ID,
    };
  }
}

/**
 * Get the latest Bluefin package ID (for building transactions)
 */
export async function getBluefinPackageId() {
  const { packageId } = await getCurrentIds();
  return packageId;
}

/**
 * Get the latest Bluefin config object ID
 */
export async function getBluefinConfigObjectId() {
  const { configId } = await getCurrentIds();
  return configId;
}

/*───────────────────────────────────────────────────────────────────────────*\
│  Helpers                                                                   │
\*───────────────────────────────────────────────────────────────────────────*/

/**
 * Convert a *price* → nearest initialisable **tick** for the pool.
 * (tick = ln(price)/ln(1.0001) rounded to a multiple of `tickSpacing`)
 */
export function priceToTick(price, tickSpacing) {
  const raw = Math.floor(Math.log(price) / Math.log(1.0001));
  return Math.floor(raw / tickSpacing) * tickSpacing;
}

/**
 * Get a SUI client instance with the default RPC URL
 */
export function getSuiClient() {
  return new SuiClient({ url: SUI_RPC_URL });
}

/**
 * Fetch on-chain data for a Bluefin CLMM pool and derive a few useful fields.
 * This function also ensures it uses the latest package ID.
 */
export async function getPoolDetails(poolId) {
  console.log(`[Bluefin] fetch pool ${poolId}`);
  const client = new SuiClient({ url: SUI_RPC_URL });

  const poolObj = await client.getObject({
    id: poolId,
    options: { showType: true, showContent: true },
  });

  const fullType = poolObj.data.type;
  const pkgMatch = fullType.match(/^([^:]+)::pool::Pool/);
  const poolPackageId = pkgMatch ? pkgMatch[1] : null;

  /* coin types inside the <…> */
  const [coinTypeA, coinTypeB] = fullType
    .match(/<\s*([^,>]+)\s*,\s*([^>]+)\s*>/)
    .slice(1, 3)
    .map((s) => s.trim());

  /* tick spacing */
  const tickSpacing = Number(
    poolObj.data.content.fields.ticks_manager.fields.tick_spacing
  );

  /* Q64.64 → price */
  const rawSqrt = BigInt(poolObj.data.content.fields.current_sqrt_price);
  const currentPrice = (Number(rawSqrt) / 2 ** (64 ** 1)) * 1; // (sqrt → price)

  return {
    currentPrice,
    parsed: {
      poolPackageId,
      id: poolId,
      coinTypeA,
      coinTypeB,
      tickSpacing,
    },
    rawData: poolObj.data,
  };
}

/**
 * Creates a deposit transaction for Bluefin via the backend API
 * @param {Object} params - Parameters for the transaction
 * @returns {Promise<Object>} Result of the deposit action
 */
export async function deposit({ poolId, amountA, amountB, walletAddress }) {
  console.log(`Starting Bluefin deposit with parameters:`, {
    poolId,
    amountA,
    amountB,
    walletAddress,
  });

  try {
    // Call the backend API to create the transaction
    const res = await fetch("/api/bluefin/create-deposit-tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poolId,
        amountA,
        amountB,
        walletAddress,
      }),
    });

    if (!res.ok) {
      console.error(`API request failed with status ${res.status}`);
      const errorText = await res.text();
      throw new Error(`Failed to create deposit transaction: ${errorText}`);
    }

    const { txb64 } = await res.json();
    console.log(`Got base64 transaction payload (${txb64.length} bytes)`);

    // Return the transaction data for signing and execution
    return {
      txb64,
      poolId,
    };
  } catch (error) {
    console.error(`Deposit error:`, error);
    throw error;
  }
}

/**
 * Removes liquidity from a position
 * @param {Object} params - Parameters for removing liquidity
 * @returns {Promise<Object>} Result of the withdrawal
 */
export async function withdraw({
  poolId,
  positionId,
  percent = 100,
  walletAddress,
}) {
  console.log(`Starting Bluefin liquidity withdrawal with parameters:`, {
    poolId,
    positionId,
    percent,
    walletAddress,
  });

  try {
    // Call backend API to create the transaction
    const res = await fetch("/api/bluefin/create-withdraw-tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poolId,
        positionId,
        percent,
        walletAddress,
      }),
    });

    if (!res.ok) {
      console.error(`API request failed with status ${res.status}`);
      const errorText = await res.text();
      throw new Error(`Failed to create withdraw transaction: ${errorText}`);
    }

    const { txb64 } = await res.json();
    console.log(`Got base64 transaction payload (${txb64.length} bytes)`);

    return {
      txb64,
      poolId,
      positionId,
    };
  } catch (error) {
    console.error(`Withdraw error:`, error);
    throw error;
  }
}

/**
 * Collects fees from a position
 * @param {Object} params - Parameters for collecting fees
 * @returns {Promise<Object>} Result of the fee collection
 */
export async function collectFees({ poolId, positionId, walletAddress }) {
  console.log(`Starting Bluefin fee collection with parameters:`, {
    poolId,
    positionId,
    walletAddress,
  });

  try {
    // Call backend API to create the transaction
    const res = await fetch("/api/bluefin/create-collect-fees-tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poolId,
        positionId,
        walletAddress,
      }),
    });

    if (!res.ok) {
      console.error(`API request failed with status ${res.status}`);
      const errorText = await res.text();
      throw new Error(
        `Failed to create collect fees transaction: ${errorText}`
      );
    }

    const { txb64 } = await res.json();
    console.log(`Got base64 transaction payload (${txb64.length} bytes)`);

    return {
      txb64,
      poolId,
      positionId,
    };
  } catch (error) {
    console.error(`Collect fees error:`, error);
    throw error;
  }
}

/**
 * Collects rewards from a position
 * @param {Object} params - Parameters for collecting rewards
 * @returns {Promise<Object>} Result of the rewards collection
 */
export async function collectRewards({ poolId, positionId, walletAddress }) {
  console.log(`Starting Bluefin rewards collection with parameters:`, {
    poolId,
    positionId,
    walletAddress,
  });

  try {
    // Call backend API to create the transaction
    const res = await fetch("/api/bluefin/create-collect-rewards-tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poolId,
        positionId,
        walletAddress,
      }),
    });

    if (!res.ok) {
      console.error(`API request failed with status ${res.status}`);
      const errorText = await res.text();
      throw new Error(
        `Failed to create collect rewards transaction: ${errorText}`
      );
    }

    const { txb64 } = await res.json();
    console.log(`Got base64 transaction payload (${txb64.length} bytes)`);

    return {
      txb64,
      poolId,
      positionId,
    };
  } catch (error) {
    console.error(`Collect rewards error:`, error);
    throw error;
  }
}

/**
 * Closes a position completely
 * @param {Object} params - Parameters for closing a position
 * @returns {Promise<Object>} Result of the position closure
 */
export async function closePosition({ poolId, positionId, walletAddress }) {
  console.log(`Starting Bluefin position closure with parameters:`, {
    poolId,
    positionId,
    walletAddress,
  });

  try {
    // Call backend API to create the transaction
    const res = await fetch("/api/bluefin/create-close-position-tx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        poolId,
        positionId,
        walletAddress,
      }),
    });

    if (!res.ok) {
      console.error(`API request failed with status ${res.status}`);
      const errorText = await res.text();
      throw new Error(
        `Failed to create close position transaction: ${errorText}`
      );
    }

    const { txb64 } = await res.json();
    console.log(`Got base64 transaction payload (${txb64.length} bytes)`);

    return {
      txb64,
      poolId,
      positionId,
    };
  } catch (error) {
    console.error(`Close position error:`, error);
    throw error;
  }
}

// Export constants for backward compatibility with code that directly references
// the package and config IDs, but use the current values
export const BLUEFIN_PACKAGE_ID = BLUEFIN_CURRENT_PKG;
export const GLOBAL_CONFIG_ID = BLUEFIN_CONFIG_ID;
