// services/bluefinService.js
// Updated: 2025-07-08 07:01:51 UTC by jake1318

import { SuiClient } from "@mysten/sui.js/client";

/*───────────────────────────────────────────────────────────────────────────*\
│  Bluefin on-chain object / package IDs (main-net)                         │
└───────────────────────────────────────────────────────────────────────────*/
export const BLUEFIN_PACKAGE_ID =
  // "CurrentPackage" extracted from the JSON blob you supplied
  "0x6c796c3ab3421a68158e0df18e4657b2827b1f8fed5ed4b82dba9c935988711b";

// NO LONGER USED DIRECTLY - only kept for backward compatibility
export const GLOBAL_CONFIG_ID =
  // "GlobalConfig" extracted from the same blob
  "0x03db251ba509a8d5d8777b6338836082335d93eecbdd09a11e190a1cff51c352";

export const SUI_CLOCK_OBJECT_ID = "0x6"; // main-net clock object

const SUI_RPC_URL =
  process.env.SUI_RPC_URL || "https://fullnode.mainnet.sui.io:443";

// Cache for the Bluefin config object ID
let cachedConfigObj = null;
let configLastFetched = 0;
const CONFIG_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get the latest Bluefin global config object ID
 * Uses caching to avoid too many RPC calls
 */
export async function getBluefinConfigObjectId() {
  const now = Date.now();

  // Return cached value if it's still fresh
  if (cachedConfigObj && now - configLastFetched < CONFIG_CACHE_TTL) {
    console.log(`Using cached Bluefin config object ID: ${cachedConfigObj}`);
    return cachedConfigObj;
  }

  try {
    const client = new SuiClient({ url: SUI_RPC_URL });

    // Bluefin publishes its global config under a well-known package;
    // the current object id is emitted in the `InitializeConfig` event
    // of module `config`. Query the latest event to discover it:
    const events = await client.queryEvents({
      query: {
        MoveEventType: `${BLUEFIN_PACKAGE_ID}::config::InitializeConfig`,
      },
      limit: 1,
      order: "descending", // newest first
    });

    if (!events.data || !events.data.length) {
      console.warn(
        "Cannot locate Bluefin global config object, falling back to hardcoded value"
      );
      // Fall back to hardcoded value if we can't get the new one
      cachedConfigObj = GLOBAL_CONFIG_ID;
      configLastFetched = now;
      return GLOBAL_CONFIG_ID;
    }

    // Extract config_id from the event's parsed JSON data
    cachedConfigObj = events.data[0].parsedJson.config_id;
    configLastFetched = now;

    console.log(
      `Retrieved latest Bluefin config object ID: ${cachedConfigObj}`
    );
    return cachedConfigObj;
  } catch (error) {
    console.error("Error fetching Bluefin config object ID:", error);

    // Fall back to hardcoded value on error
    if (!cachedConfigObj) {
      cachedConfigObj = GLOBAL_CONFIG_ID;
    }

    return cachedConfigObj;
  }
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
 * Fetch on-chain data for a Bluefin CLMM pool and derive a few useful fields.
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
 * Get a SUI client instance with the default RPC URL
 */
export function getSuiClient() {
  return new SuiClient({ url: SUI_RPC_URL });
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
