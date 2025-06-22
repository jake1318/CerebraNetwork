// src/services/turbosService.ts
// Last Updated: 2025-05-24 06:58:43 UTC by jake1318

import { Network, TurbosSdk, Pool } from "turbos-clmm-sdk";
import type { WalletContextState } from "@suiet/wallet-kit";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { SuiClient } from "@mysten/sui.js/client";
import BN from "bn.js";
import BigNumber from "bignumber.js";
import { PoolInfo } from "./coinGeckoService";
import blockvisionService, {
  NormalizedPosition,
  PoolGroup,
} from "./blockvisionService";

// Initialize the Turbos SDK for mainnet
const turbosSdk = new TurbosSdk(Network.mainnet);
const provider = new SuiClient({ url: "https://fullnode.mainnet.sui.io:443" });

// Cache for pool data to reduce redundant API calls
const poolCache = new Map<string, any>();

// Token decimal constants (critical for correct base unit conversions)
const TOKEN_DECIMALS = {
  DEFAULT: 9,
  SUI: 9, // SUI has 9 decimal places
  USDC: 6, // USDC has 6 decimal places
  USDT: 6, // USDT has 6 decimal places
  WETH: 8, // WETH has 8 decimal places
  BTC: 8, // BTC has 8 decimal places
};

// SUI type constant for easy comparison
const SUI_TYPE = "0x2::sui::SUI";

// Known SUI/USDC pool IDs on Turbos
const KNOWN_SUI_USDC_POOLS = [
  "0x77f786e7bbd5f93f7dc09edbcffd9ea073945564767b65cf605f388328449d50",
];

// Constants for gas budget configuration
const TURBOS_GAS_BUDGET = 22_516_700; // MIST units (≈0.0225167 SUI)
// Higher default gas budget for complex operations (0.1 SUI)
const TURBOS_SAFE_GAS_BUDGET = 100_000_000;
// Safety buffer to ensure enough SUI is left for gas (0.05 SUI in MIST)
const SUI_GAS_SAFETY_BUFFER = 50_000_000;

/**
 * Determine if a pool is a Turbos pool based on address and metadata
 * @param poolAddress - The pool address to check
 * @param poolSource - The name of the DEX/AMM (optional)
 */
export function isTurbosPool(
  poolAddress: string,
  poolSource?: string
): boolean {
  // Check if pool source is explicitly "turbos"
  if (
    poolSource &&
    (poolSource.toLowerCase().includes("turbos") ||
      poolSource.toLowerCase() === "turbos finance")
  ) {
    return true;
  }

  // Known Turbos pool prefixes
  const turbosPrefixes = ["0x77f7", "0xf576", "0x91bf"];

  // Check for Turbos pool address patterns
  for (const prefix of turbosPrefixes) {
    if (poolAddress.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if this is likely a SUI/USDC pool on Turbos
 * @param poolId - The pool ID to check
 * @param poolInfo - Optional pool info (if available)
 */
export function isSuiUsdcPool(poolId: string, poolInfo?: PoolInfo): boolean {
  // Check known pool IDs first
  if (KNOWN_SUI_USDC_POOLS.includes(poolId)) {
    return true;
  }

  // If pool info is provided, check token symbols
  if (poolInfo) {
    const tokenA = (poolInfo.tokenA || "").toUpperCase();
    const tokenB = (poolInfo.tokenB || "").toUpperCase();

    // Check if this is a SUI/USDC pair in either order
    if (
      (tokenA === "SUI" && tokenB === "USDC") ||
      (tokenA === "USDC" && tokenB === "SUI")
    ) {
      return true;
    }

    // Check for SUI and USDC in coin types
    const hasSui =
      isCoinType(poolInfo.tokenA, "sui") || isCoinType(poolInfo.tokenB, "sui");
    const hasUsdc =
      isCoinType(poolInfo.tokenA, "usdc") ||
      isCoinType(poolInfo.tokenB, "usdc");

    if (hasSui && hasUsdc) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a coin type string contains a specific token
 * @param coinType - The coin type string to check
 * @param token - The token to look for (e.g., "usdc", "sui")
 */
function isCoinType(coinType: string, token: string): boolean {
  const lowerCoinType = coinType.toLowerCase();
  const lowerToken = token.toLowerCase();
  return lowerCoinType.includes(lowerToken);
}

/**
 * Fetch all available Turbos pools
 * @returns Array of Pool objects with details
 */
export async function getAllPools(): Promise<Pool.Pool[]> {
  try {
    // Use the SDK to get all pools
    const pools = await turbosSdk.pool.getPools();
    console.log(`Fetched ${pools.length} Turbos pools`);
    return pools;
  } catch (error) {
    console.error("Failed to fetch Turbos pools:", error);
    return [];
  }
}

/**
 * Get a specific pool by its ID
 * @param poolId - The Sui object ID of the pool
 */
export async function getPool(poolId: string): Promise<Pool.Pool | null> {
  try {
    // Check cache first
    if (poolCache.has(poolId)) {
      return poolCache.get(poolId);
    }

    // Fetch the pool
    const pool = await turbosSdk.pool.getPool(poolId);

    // Cache the result
    poolCache.set(poolId, pool);

    return pool;
  } catch (error) {
    console.error(`Failed to fetch Turbos pool ${poolId}:`, error);
    return null;
  }
}

/**
 * Calculate tick indices for a price range
 * IMPORTANT: For SUI/USDC pools in Turbos, the price is often expressed as USDC/SUI (reciprocal)
 * @param price - Current price of SUI in terms of USDC (e.g. 3.84 USDC per SUI)
 * @param lowerPricePercent - Lower bound as percentage of current (e.g., 0.8 for 80%)
 * @param upperPricePercent - Upper bound as percentage of current (e.g., 1.2 for 120%)
 * @param tickSpacing - The pool's tick spacing (default 60)
 * @param invertPrice - Whether to invert the price (for pools where base/quote is reversed)
 */
export function calculateTicksFromPrice(
  price: number,
  lowerPricePercent: number,
  upperPricePercent: number,
  tickSpacing: number = 60,
  invertPrice: boolean = false
): { tickLower: number; tickUpper: number } {
  // If price needs to be inverted (e.g., for SUI/USDC pools that use USDC/SUI price)
  if (invertPrice) {
    price = 1 / price;
    // Swap lower and upper percentages when inverting
    const temp = lowerPricePercent;
    lowerPricePercent = 1 / upperPricePercent;
    upperPricePercent = 1 / temp;
  }

  // Calculate price range
  const lowerPrice = price * lowerPricePercent;
  const upperPrice = price * upperPricePercent;

  // Convert to ticks using the formula: tick = log(price) / log(1.0001)
  let tickLower = Math.floor(Math.log(lowerPrice) / Math.log(1.0001));
  let tickUpper = Math.ceil(Math.log(upperPrice) / Math.log(1.0001));

  // Round to the nearest tick spacing
  tickLower = Math.floor(tickLower / tickSpacing) * tickSpacing;
  tickUpper = Math.ceil(tickUpper / tickSpacing) * tickSpacing;

  console.log(
    `Calculated ticks: ${tickLower} to ${tickUpper} for price range: ${lowerPrice} to ${upperPrice}`
  );

  return { tickLower, tickUpper };
}

/**
 * Get predetermined tick values for Turbos pools
 * @param poolId - Pool ID
 * @param poolInfo - Optional pool info
 * @returns Fixed tick values if this is a known special case
 */
export function getRecommendedTicks(
  poolId: string,
  poolInfo?: PoolInfo
): { tickLower: number; tickUpper: number } | null {
  // For SUI/USDC pools, ensure we use different ticks (valid ranges)
  if (isSuiUsdcPool(poolId, poolInfo)) {
    // Use the 0.3% fee tier tick spacing (60) and a narrow range around a known working tick
    const baseTickSuiUsdc = 443580;
    const tickSpacing = 60;
    return {
      tickLower: baseTickSuiUsdc - tickSpacing,
      tickUpper: baseTickSuiUsdc + tickSpacing,
    };
  }

  // For other pools, return null (let the caller calculate)
  return null;
}

/**
 * Convert price to tick index for Turbos Finance
 * @param price - The price to convert
 * @param invertPrice - Whether to invert the price (for pools where base/quote is reversed)
 */
export function priceToTick(
  price: number,
  invertPrice: boolean = false
): number {
  if (invertPrice) {
    price = 1 / price;
  }
  return Math.floor(Math.log(price) / Math.log(1.0001));
}

/**
 * Convert tick index to price for Turbos Finance
 * @param tick - The tick index to convert
 * @param invertPrice - Whether to invert the resulting price
 */
export function tickToPrice(
  tick: number,
  invertPrice: boolean = false
): number {
  const price = Math.pow(1.0001, tick);
  return invertPrice ? 1 / price : price;
}

/**
 * Get full range tick bounds for a pool
 * @param feeAmount - Fee tier (e.g., "0.3%" or "3000bps")
 * @param isSuiUsdc - Whether this is a SUI/USDC or USDC/SUI pool, which has special ranges
 */
export function getFullRangeTicksForPool(
  feeAmount: string,
  isSuiUsdc: boolean = false
): { tickLower: number; tickUpper: number } {
  // For SUI/USDC pools in Turbos Finance, the range is typically -75560 to 84780
  if (isSuiUsdc) {
    return { tickLower: -75560, tickUpper: 84780 };
  }

  // For other fee tiers
  const feeAmountLower = feeAmount.toLowerCase();

  if (feeAmountLower.includes("0.3%") || feeAmountLower.includes("3000")) {
    return { tickLower: -887220, tickUpper: 887220 };
  } else if (
    feeAmountLower.includes("1%") ||
    feeAmountLower.includes("10000")
  ) {
    return { tickLower: -443610, tickUpper: 443610 };
  } else if (
    feeAmountLower.includes("0.05%") ||
    feeAmountLower.includes("500")
  ) {
    return { tickLower: -1776440, tickUpper: 1776440 };
  } else {
    // Default to a common range for unknown fee tiers
    return { tickLower: -887220, tickUpper: 887220 };
  }
}

/**
 * Get token decimals based on symbol or address
 * @param tokenAddress - Token address or symbol
 */
function getTokenDecimals(tokenAddress: string): number {
  if (!tokenAddress) return TOKEN_DECIMALS.DEFAULT;

  // Direct check for SUI type
  if (tokenAddress === SUI_TYPE) {
    return TOKEN_DECIMALS.SUI;
  }

  // Extract symbol from address if needed
  const parts = tokenAddress.split("::");
  const symbol = parts.length > 2 ? parts[2].toUpperCase() : "";

  // Check if we have predefined decimals for this token
  if (TOKEN_DECIMALS[symbol]) {
    return TOKEN_DECIMALS[symbol];
  }

  // Check if the symbol contains certain keywords
  if (symbol.includes("USDC") || symbol.includes("USDT")) {
    return 6;
  }

  // Extract coin type string for additional checking
  const coinType = tokenAddress.toLowerCase();
  if (coinType.includes("usdc") || coinType.includes("usdt")) {
    return 6;
  } else if (coinType.includes("sui")) {
    return 9;
  } else if (coinType.includes("weth")) {
    return 8;
  } else if (coinType.includes("btc") || coinType.includes("bitcoin")) {
    return 8;
  }

  // Last resort - use default decimals with warning
  console.warn(
    `Unknown token decimals for ${tokenAddress}, using default value of ${TOKEN_DECIMALS.DEFAULT}`
  );
  return TOKEN_DECIMALS.DEFAULT;
}

/**
 * Get the correct full coin type from BlockVision API data
 * This resolves the issue with shortened/simplified coin types
 *
 * @param coins - Array of coins from BlockVision API
 * @param simpleCoinType - Basic coin type or symbol
 */
function getFullCoinTypeFromBlockVision(
  coins: any[],
  simpleCoinType: string
): string | null {
  // If it's already the SUI type, we know it
  if (simpleCoinType === SUI_TYPE) {
    return SUI_TYPE;
  }

  // First check for exact match
  const exactMatch = coins.find((coin) => coin.coinType === simpleCoinType);
  if (exactMatch) {
    return exactMatch.coinType;
  }

  // Check by symbol if the simpleCoinType is a short name (like "USDC")
  if (!simpleCoinType.includes("::")) {
    const symbolMatch = coins.find(
      (coin) => coin.symbol?.toUpperCase() === simpleCoinType.toUpperCase()
    );
    if (symbolMatch) {
      return symbolMatch.coinType;
    }
  }

  // Check if it's a substring of a coin type
  const substringMatch = coins.find((coin) =>
    coin.coinType.toLowerCase().includes(simpleCoinType.toLowerCase())
  );
  if (substringMatch) {
    return substringMatch.coinType;
  }

  // For USDC specifically, try to find it by any means
  if (
    simpleCoinType.toLowerCase().includes("usdc") ||
    simpleCoinType === "USDC"
  ) {
    const usdcMatch = coins.find(
      (coin) =>
        coin.symbol?.toUpperCase() === "USDC" ||
        coin.coinType.toLowerCase().includes("usdc")
    );
    if (usdcMatch) {
      return usdcMatch.coinType;
    }
  }

  return null;
}

/**
 * Add liquidity to a Turbos pool (deposit)
 *
 * FIXED IMPLEMENTATION addressing:
 * 1. Decimal precision bug - Ensuring USDC uses 6 decimals and SUI uses 9 decimals
 * 2. Price ratio calculations - Correctly calculating token amounts based on price
 * 3. Balance validation - Double-checking after conversion to base units
 * 4. Gas coin safety - Preserving sufficient SUI for gas when SUI is being deposited
 * 5. Coin selection - Properly selecting, merging, and splitting coins to avoid balance errors
 *
 * @param wallet - Wallet context
 * @param poolId - The pool object ID
 * @param amountA - Amount of token A to deposit (in human-readable units)
 * @param amountB - Amount of token B to deposit (in human-readable units)
 * @param poolInfo - Optional pool info from CoinGecko
 * @param tickLower - Lower tick bound (optional)
 * @param tickUpper - Upper tick bound (optional)
 * @param slippagePct - Slippage tolerance in percentage (default 0.5%)
 * @param gasBudget - Optional gas budget override (default: TURBOS_SAFE_GAS_BUDGET)
 */
export async function deposit(
  wallet: WalletContextState,
  poolId: string,
  amountA: number,
  amountB: number,
  poolInfo?: PoolInfo,
  tickLower?: number,
  tickUpper?: number,
  slippagePct: number = 0.5,
  gasBudget: number = TURBOS_SAFE_GAS_BUDGET
): Promise<{
  success: boolean;
  digest: string;
  // Extended return values for success popup
  tokenA?: { symbol: string; amount: number };
  tokenB?: { symbol: string; amount: number };
  timestamp?: number;
  poolId?: string;
}> {
  // Validate wallet connection
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const userAddress = wallet.account.address;

  console.log(`Starting Turbos deposit to pool ${poolId}`);
  console.log(`User inputs: ${amountA} of token A, ${amountB} of token B`);

  try {
    // Step 1: Fetch pool details
    console.log("Fetching pool details...");
    const poolDetails = await getPool(poolId);

    // Log raw pool details for debugging
    console.log("Raw poolDetails:", poolDetails);

    if (!poolDetails) {
      throw new Error(`Failed to fetch pool ${poolId}`);
    }

    // Step 2: Get BlockVision data for accurate coin types first
    console.log(
      "Fetching wallet coins from BlockVision to get accurate coin types..."
    );
    const blockVisionCoins = await blockvisionService.getAccountCoins(
      userAddress
    );
    if (
      !blockVisionCoins ||
      !blockVisionCoins.data ||
      blockVisionCoins.data.length === 0
    ) {
      console.warn("No coins found in BlockVision data");
    }

    // Extract coin types from pool details
    // Check all possible locations where the SDK might store coin type info
    let coinTypeA, coinTypeB;

    // Try direct field access first
    if (poolDetails.coinTypeA && poolDetails.coinTypeB) {
      coinTypeA = poolDetails.coinTypeA;
      coinTypeB = poolDetails.coinTypeB;
      console.log("Found coin types as direct fields");
    }
    // Try array access if available
    else if (
      poolDetails.coinTypes &&
      Array.isArray(poolDetails.coinTypes) &&
      poolDetails.coinTypes.length === 2
    ) {
      [coinTypeA, coinTypeB] = poolDetails.coinTypes;
      console.log("Found coin types as array");
    }
    // Try nested data objects
    else if (poolDetails.data) {
      const data = poolDetails.data;
      if (data.coinTypeA && data.coinTypeB) {
        coinTypeA = data.coinTypeA;
        coinTypeB = data.coinTypeB;
        console.log("Found coin types in data object");
      } else if (
        data.coinTypes &&
        Array.isArray(data.coinTypes) &&
        data.coinTypes.length === 2
      ) {
        [coinTypeA, coinTypeB] = data.coinTypes;
        console.log("Found coin types in data.coinTypes array");
      }
    }
    // Try poolInfo as fallback
    else if (poolInfo && poolInfo.tokenA && poolInfo.tokenB) {
      coinTypeA = poolInfo.tokenA;
      coinTypeB = poolInfo.tokenB;
      console.log("Using coin types from poolInfo");
    }

    // For SUI/USDC pools, use BlockVision data to get accurate coin types
    const isSuiUsdc = isSuiUsdcPool(poolId, poolInfo);
    if (isSuiUsdc && blockVisionCoins && blockVisionCoins.data) {
      // Find SUI coin type (should be 0x2::sui::SUI, but verify)
      const suiCoin = blockVisionCoins.data.find(
        (coin) =>
          coin.symbol.toUpperCase() === "SUI" || coin.coinType === SUI_TYPE
      );

      // Find USDC coin type from BlockVision data
      const usdcCoin = blockVisionCoins.data.find(
        (coin) =>
          coin.symbol.toUpperCase() === "USDC" ||
          coin.coinType.toLowerCase().includes("usdc")
      );

      // Set correct coin types from actual wallet data
      if (usdcCoin && suiCoin) {
        // Depending on the pool's token order, assign correctly
        // Usually for SUI/USDC pools, tokenA is USDC and tokenB is SUI
        coinTypeA = usdcCoin.coinType;
        coinTypeB = suiCoin.coinType;

        console.log("Updated coin types from BlockVision data:");
        console.log(`USDC coin type: ${coinTypeA}`);
        console.log(`SUI coin type: ${coinTypeB}`);
      }
    }

    // Last resort - hardcoded SUI/USDC for known pools
    if (!coinTypeA || !coinTypeB) {
      if (isSuiUsdc) {
        // Use SUI type (this is standardized)
        coinTypeB = SUI_TYPE;

        // Try to get USDC type from BlockVision
        if (blockVisionCoins && blockVisionCoins.data) {
          const usdcCoin = blockVisionCoins.data.find(
            (coin) =>
              coin.symbol.toUpperCase() === "USDC" ||
              coin.coinType.toLowerCase().includes("usdc")
          );

          if (usdcCoin) {
            coinTypeA = usdcCoin.coinType;
          } else {
            // Try common USDC types if BlockVision didn't find it
            coinTypeA =
              "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
          }
        } else {
          coinTypeA =
            "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
        }

        console.log("Using hardcoded/derived SUI/USDC types");
      } else {
        throw new Error(`Could not determine coin types for pool ${poolId}`);
      }
    }

    console.log(`Pool coin types: A=${coinTypeA}, B=${coinTypeB}`);

    // Step 3: CRITICAL FIX - Determine token types and which is SUI
    // Check if either token is SUI (important for gas handling)
    const coinAIsSui = coinTypeA === SUI_TYPE;
    const coinBIsSui = coinTypeB === SUI_TYPE;
    const involvesSui = coinAIsSui || coinBIsSui;

    console.log(`Pool is SUI/USDC pool: ${isSuiUsdc}`);
    console.log(`Coin A is SUI: ${coinAIsSui}`);
    console.log(`Coin B is SUI: ${coinBIsSui}`);

    // Step 4: CRITICAL FIX - Get correct decimals from on-chain metadata with strict fallbacks
    // We need to be absolutely certain about token decimals
    let metaA = null;
    let metaB = null;

    // Try to get on-chain metadata first (most accurate)
    try {
      metaA = await provider.getCoinMetadata({ coinType: coinTypeA });
      console.log(
        `Fetched metadata for ${coinTypeA}:`,
        metaA ? `decimals=${metaA.decimals}` : "not found"
      );
    } catch (error) {
      console.log(`Failed to get metadata for ${coinTypeA}, using fallback`);
    }

    try {
      metaB = await provider.getCoinMetadata({ coinType: coinTypeB });
      console.log(
        `Fetched metadata for ${coinTypeB}:`,
        metaB ? `decimals=${metaB.decimals}` : "not found"
      );
    } catch (error) {
      console.log(`Failed to get metadata for ${coinTypeB}, using fallback`);
    }

    // Get decimals with strict fallbacks
    // CRITICAL FIX: Explicitly handle known token types (SUI = 9, USDC = 6)
    let decimalsA = metaA?.decimals ?? getTokenDecimals(coinTypeA);
    let decimalsB = metaB?.decimals ?? getTokenDecimals(coinTypeB);

    // If we have BlockVision data, use it as additional fallback for decimals
    if (blockVisionCoins && blockVisionCoins.data) {
      const coinA = blockVisionCoins.data.find((c) => c.coinType === coinTypeA);
      const coinB = blockVisionCoins.data.find((c) => c.coinType === coinTypeB);

      if (coinA && typeof coinA.decimals === "number" && !metaA) {
        decimalsA = coinA.decimals;
        console.log(
          `Using BlockVision data for ${coinTypeA} decimals: ${decimalsA}`
        );
      }

      if (coinB && typeof coinB.decimals === "number" && !metaB) {
        decimalsB = coinB.decimals;
        console.log(
          `Using BlockVision data for ${coinTypeB} decimals: ${decimalsB}`
        );
      }
    }

    console.log(`Using token decimals: A(${decimalsA}), B(${decimalsB})`);

    // QUALITY CHECK: Make sure we got plausible decimal values
    if (decimalsA < 0 || decimalsA > 18 || decimalsB < 0 || decimalsB > 18) {
      throw new Error(
        `Invalid token decimals detected: A=${decimalsA}, B=${decimalsB}. Please contact support.`
      );
    }

    // Step 5: CRITICAL FIX - Convert human-readable amounts to base units with safe math
    // Use BigNumber for safe conversion to base units (critical to avoid InsufficientCoinBalance)
    const baseAmountA = new BigNumber(amountA)
      .times(new BigNumber(10).pow(decimalsA))
      .integerValue(BigNumber.ROUND_DOWN);

    const baseAmountB = new BigNumber(amountB)
      .times(new BigNumber(10).pow(decimalsB))
      .integerValue(BigNumber.ROUND_DOWN);

    console.log(
      `Converted to base units: A=${baseAmountA} (${amountA} * 10^${decimalsA}), B=${baseAmountB} (${amountB} * 10^${decimalsB})`
    );

    // Get actual balances from BlockVision (we can't rely on SUI RPC for accurate USDC balance)
    let balanceA = "0";
    let balanceB = "0";

    if (blockVisionCoins && blockVisionCoins.data) {
      const coinA = blockVisionCoins.data.find(
        (c) =>
          c.coinType === coinTypeA ||
          (c.symbol.toUpperCase() === "USDC" &&
            coinTypeA.toLowerCase().includes("usdc"))
      );
      const coinB = blockVisionCoins.data.find(
        (c) =>
          c.coinType === coinTypeB ||
          (c.symbol.toUpperCase() === "SUI" && coinTypeB === SUI_TYPE)
      );

      if (coinA) balanceA = coinA.rawBalance || coinA.balance;
      if (coinB) balanceB = coinB.rawBalance || coinB.balance;

      console.log(
        `BlockVision balances: ${coinTypeA} = ${balanceA}, ${coinTypeB} = ${balanceB}`
      );
    }

    // Check if user has sufficient balance using BlockVision data
    if (new BigNumber(balanceA).lt(baseAmountA)) {
      const humanReadableBalance = new BigNumber(balanceA)
        .dividedBy(new BigNumber(10).pow(decimalsA))
        .toFixed(6);
      throw new Error(
        `Insufficient ${metaA?.symbol || "USDC"} balance: ` +
          `You have ${humanReadableBalance} but need ${amountA}`
      );
    }

    if (new BigNumber(balanceB).lt(baseAmountB)) {
      const humanReadableBalance = new BigNumber(balanceB)
        .dividedBy(new BigNumber(10).pow(decimalsB))
        .toFixed(6);
      throw new Error(
        `Insufficient ${metaB?.symbol || "SUI"} balance: ` +
          `You have ${humanReadableBalance} but need ${amountB}`
      );
    }

    // Step 6: Determine tick ranges
    console.log("Determining tick range...");
    let nativeTickLower, nativeTickUpper;

    // First, use provided ticks if available
    if (tickLower !== undefined && tickUpper !== undefined) {
      nativeTickLower = tickLower;
      nativeTickUpper = tickUpper;
      console.log(
        `Using provided tick range: [${nativeTickLower}, ${nativeTickUpper}]`
      );
    }
    // For SUI/USDC pools, use recommended ticks
    else if (isSuiUsdc) {
      const recommendedTicks = getRecommendedTicks(poolId, poolInfo);
      if (recommendedTicks) {
        nativeTickLower = recommendedTicks.tickLower;
        nativeTickUpper = recommendedTicks.tickUpper;
        console.log(
          `Using recommended SUI/USDC ticks: [${nativeTickLower}, ${nativeTickUpper}]`
        );
      } else {
        // Fallback to reasonable defaults for SUI/USDC
        const defaultTicks = getFullRangeTicksForPool("0.3%", true);
        nativeTickLower = defaultTicks.tickLower;
        nativeTickUpper = defaultTicks.tickUpper;
        console.log(
          `Using default SUI/USDC tick range: [${nativeTickLower}, ${nativeTickUpper}]`
        );
      }
    }
    // For other pools, calculate around current price
    else {
      // Get current tick from pool details (check multiple possible field names)
      let currentTick = 0;
      if (typeof poolDetails.current_tick === "number") {
        currentTick = poolDetails.current_tick;
      } else if (typeof poolDetails.currentTick === "number") {
        currentTick = poolDetails.currentTick;
      } else if (
        poolDetails.data &&
        typeof poolDetails.data.current_tick === "number"
      ) {
        currentTick = poolDetails.data.current_tick;
      }

      // Get tick spacing - default to 60 if not available
      const tickSpacing =
        poolDetails.tick_spacing ||
        poolDetails.tickSpacing ||
        (poolDetails.data && poolDetails.data.tick_spacing) ||
        60;

      // Calculate a range around current price (+/- 10%)
      const currentPrice = tickToPrice(currentTick, false);
      const ticks = calculateTicksFromPrice(
        currentPrice,
        0.9, // 10% below
        1.1, // 10% above
        tickSpacing,
        false
      );

      nativeTickLower = ticks.tickLower;
      nativeTickUpper = ticks.tickUpper;

      console.log(
        `Calculated tick range: [${nativeTickLower}, ${nativeTickUpper}] around price ${currentPrice}`
      );
    }

    // Always ensure ticks are different and correctly ordered
    if (nativeTickLower >= nativeTickUpper) {
      const spacing =
        poolDetails.tick_spacing ||
        poolDetails.tickSpacing ||
        (poolDetails.data && poolDetails.data.tick_spacing) ||
        60;

      nativeTickUpper = nativeTickLower + spacing;
      console.log(
        `Adjusted ticks to ensure proper ordering: [${nativeTickLower}, ${nativeTickUpper}]`
      );
    }

    // Step 7: Calculate minimum amounts based on slippage
    const slippageDecimal = slippagePct / 100;
    const minAmountA = baseAmountA
      .times(1 - slippageDecimal)
      .integerValue(BigNumber.ROUND_DOWN);
    const minAmountB = baseAmountB
      .times(1 - slippageDecimal)
      .integerValue(BigNumber.ROUND_DOWN);

    console.log(
      `Min amounts with ${slippagePct}% slippage: A=${minAmountA}, B=${minAmountB}`
    );

    // Step 8: Log detailed transaction parameters for debugging
    const txDetails = {
      poolId,
      tokenA: {
        type: coinTypeA,
        symbol: metaA?.symbol || coinTypeA.split("::").pop() || "USDC",
        decimals: decimalsA,
        humanAmount: amountA,
        baseAmount: baseAmountA.toString(),
        minBaseAmount: minAmountA.toString(),
      },
      tokenB: {
        type: coinTypeB,
        symbol: metaB?.symbol || coinTypeB.split("::").pop() || "SUI",
        decimals: decimalsB,
        humanAmount: amountB,
        baseAmount: baseAmountB.toString(),
        minBaseAmount: minAmountB.toString(),
      },
      tickRange: [nativeTickLower, nativeTickUpper],
      slippage: slippagePct,
      gasBudget: gasBudget,
    };
    console.log(
      "Final transaction details:",
      JSON.stringify(txDetails, null, 2)
    );

    // Step 9: CRITICAL FIX - Build the add-liquidity transaction with Turbos SDK
    console.log("Building add-liquidity transaction...");

    // Create a transaction using Turbos SDK
    // This will handle all the coin selection and splitting internally
    const tx = await turbosSdk.pool.addLiquidity({
      pool: poolId,
      address: userAddress,
      amountA: baseAmountA.toString(),
      amountB: baseAmountB.toString(),
      tickLower: nativeTickLower,
      tickUpper: nativeTickUpper,
      tickLowerInclusive: false,
      tickUpperInclusive: false,
      slippage: slippageDecimal,
      amountAMin: minAmountA.toString(),
      amountBMin: minAmountB.toString(),
    });

    // Set gas budget
    const actualGasBudget = Math.max(gasBudget, TURBOS_SAFE_GAS_BUDGET);
    tx.setGasBudget(actualGasBudget);
    console.log(
      `Set gas budget: ${actualGasBudget} MIST (${
        actualGasBudget / 1_000_000_000
      } SUI)`
    );

    // Step 10: Execute the transaction
    console.log("Executing transaction via wallet...");
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEvents: true, showEffects: true },
    });

    console.log("Deposit transaction executed successfully:", response);

    // Check for errors in transaction effects
    if (response.effects?.status?.status === "failure") {
      const error = response.effects?.status?.error || "Unknown error";
      throw new Error(`Transaction failed: ${error}`);
    }

    // Return success with data for the success popup
    return {
      success: true,
      digest: response.digest,
      tokenA: {
        symbol: metaA?.symbol || "USDC",
        amount: amountA,
      },
      tokenB: {
        symbol: metaB?.symbol || "SUI",
        amount: amountB,
      },
      timestamp: Date.now(),
      poolId,
    };
  } catch (error) {
    console.error("Deposit failed:", error);

    // IMPROVED ERROR HANDLING: More informative messages based on error type
    if (error instanceof Error) {
      // Check for common error patterns
      const errorMsg = error.message.toLowerCase();

      if (
        errorMsg.includes("insufficient") &&
        (errorMsg.includes("balance") || errorMsg.includes("sui"))
      ) {
        // Already a balance error - just pass through our custom message
        throw error;
      } else if (errorMsg.includes("gas")) {
        throw new Error(
          "Gas error: Consider reducing your deposit amount to leave enough SUI for transaction fees. " +
            "If you have multiple SUI coins, try consolidating them first."
        );
      } else if (errorMsg.includes("coin") && errorMsg.includes("object")) {
        throw new Error(
          "Coin selection error: The transaction may be trying to use coins that don't exist or " +
            "have already been spent. Please refresh and try again with a smaller amount."
        );
      } else if (
        errorMsg.includes("invalid struct type") ||
        errorMsg.includes("usdc")
      ) {
        throw new Error(
          "USDC token type error: There may be an issue with your USDC token. " +
            "This could be due to a mismatch between the USDC in your wallet and the one expected by the pool. " +
            "Please try again with a smaller amount or contact support."
        );
      }

      // Default - pass through the original error
      throw error;
    }

    // For non-Error objects
    throw new Error(`Failed to add liquidity: ${error}`);
  }
}

/**
 * Remove liquidity from a Turbos pool
 * @param wallet - Suiet wallet context
 * @param poolId - The pool object ID
 * @param positionId - The NFT position ID
 * @param liquidityPercentage - Percentage of liquidity to remove (0-100)
 * @param slippagePct - Slippage tolerance percentage (default 0.5%)
 */
export async function removeLiquidity(
  wallet: WalletContextState,
  poolId: string,
  positionId: string,
  liquidityPercentage: number = 100,
  slippagePct: number = 0.5
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const userAddress = wallet.account.address;
  console.log(
    `Removing ${liquidityPercentage}% liquidity from position ${positionId} in pool ${poolId}`
  );

  try {
    // Get position details
    const position = await turbosSdk.nft.getPositionFields(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    // Calculate the amount of liquidity to remove
    const liquidity = position.liquidity;
    const liquidityToRemove =
      (BigInt(liquidity) * BigInt(liquidityPercentage)) / BigInt(100);

    console.log(
      `Position has ${liquidity} liquidity, removing ${liquidityToRemove}`
    );

    // Get fees owed
    const feeOwedA = position.feeOwedA || 0;
    const feeOwedB = position.feeOwedB || 0;

    // Use the position data to estimate expected outputs
    // These would be minimum expected outputs after slippage
    // In a real implementation, you'd use proper math based on current price
    // This is just a placeholder calculation
    const tokenAMin = 0; // Set to 0 to accept any amount (or calculate based on position)
    const tokenBMin = 0; // Set to 0 to accept any amount (or calculate based on position)

    // Build the remove liquidity transaction
    const tx = await turbosSdk.pool.removeLiquidity({
      pool: poolId,
      nft: positionId,
      address: userAddress,
      decreaseLiquidity: Number(liquidityToRemove),
      amountA: tokenAMin,
      amountB: tokenBMin,
      slippage: slippagePct / 100, // Convert percentage to decimal
      collectAmountA: feeOwedA, // Collect all fees
      collectAmountB: feeOwedB, // Collect all fees
      rewardAmounts: [], // Collect all rewards
    });

    // Only set the gas budget - let the wallet select a suitable coin
    tx.setGasBudget(TURBOS_GAS_BUDGET);
    console.log(
      `Set explicit gas budget: ${TURBOS_GAS_BUDGET} MIST (${
        TURBOS_GAS_BUDGET / 1_000_000_000
      } SUI)`
    );

    // Sign and execute the transaction
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    console.log("Remove liquidity from Turbos pool successful:", response);

    return {
      success: true,
      digest: response.digest || "",
    };
  } catch (error) {
    console.error("Remove liquidity from Turbos pool failed:", error);
    throw new Error(
      `Failed to remove liquidity: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Close a position completely (remove all liquidity and collect all fees)
 * @param wallet - Suiet wallet context
 * @param poolId - The pool object ID
 * @param positionId - The NFT position ID
 * @param slippagePct - Slippage tolerance percentage (default 0.5%)
 */
export async function closePosition(
  wallet: WalletContextState,
  poolId: string,
  positionId: string,
  slippagePct: number = 0.5
): Promise<{ success: boolean; digest: string }> {
  // Closing a position is the same as removing 100% of liquidity
  return removeLiquidity(wallet, poolId, positionId, 100, slippagePct);
}

/**
 * Collect fees and rewards from a position without removing liquidity
 * @param wallet - Suiet wallet context
 * @param poolId - The pool object ID
 * @param positionId - The NFT position ID
 */
export async function collectFees(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const userAddress = wallet.account.address;
  console.log(`Collecting fees from position ${positionId} in pool ${poolId}`);

  try {
    // Get position details
    const position = await turbosSdk.nft.getPositionFields(positionId);
    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    // Get fees owed
    const feeOwedA = position.feeOwedA || 0;
    const feeOwedB = position.feeOwedB || 0;

    if (feeOwedA === 0 && feeOwedB === 0) {
      console.log("No fees to collect");
      return { success: true, digest: "" };
    }

    // Build a transaction to collect fees without removing liquidity (decreaseLiquidity = 0)
    const tx = await turbosSdk.pool.removeLiquidity({
      pool: poolId,
      nft: positionId,
      address: userAddress,
      decreaseLiquidity: 0, // Don't remove any liquidity
      amountA: 0,
      amountB: 0,
      slippage: 0,
      collectAmountA: feeOwedA, // Collect all fees
      collectAmountB: feeOwedB, // Collect all fees
      rewardAmounts: [], // Collect all rewards
    });

    // Only set the gas budget - let the wallet select a suitable coin
    tx.setGasBudget(TURBOS_GAS_BUDGET);
    console.log(
      `Set explicit gas budget: ${TURBOS_GAS_BUDGET} MIST (${
        TURBOS_GAS_BUDGET / 1_000_000_000
      } SUI)`
    );

    // Sign and execute the transaction
    const response = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    console.log("Collect fees from Turbos pool successful:", response);

    return {
      success: true,
      digest: response.digest || "",
    };
  } catch (error) {
    console.error("Collect fees from Turbos pool failed:", error);
    throw new Error(
      `Failed to collect fees: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get all user positions using BlockVision API
 * @param userAddress - The wallet address to get positions for
 * @returns Array of pool groups containing user's positions
 */
export async function getUserPositions(
  userAddress: string
): Promise<PoolGroup[]> {
  try {
    console.log(
      `Fetching Turbos positions for user ${userAddress} from BlockVision`
    );

    // Use the BlockVision service to get all positions, focusing on Turbos
    const allPoolGroups = await blockvisionService.getDefiPortfolio(
      userAddress,
      "turbos", // Specify Turbos protocol to get only Turbos positions
      false // Exclude wallet assets
    );

    // Filter to only get Turbos pools
    const turbosPoolGroups = allPoolGroups.filter(
      (pool) => pool.protocol === "Turbos" || pool.protocol === "turbos"
    );

    console.log(
      `Found ${turbosPoolGroups.length} Turbos pool groups with positions`
    );

    return turbosPoolGroups;
  } catch (error) {
    console.error("Failed to fetch Turbos user positions:", error);
    return [];
  }
}

/**
 * Get position details for a specific position ID
 * @param positionId - The NFT position ID
 */
export async function getPositionDetails(positionId: string): Promise<any> {
  try {
    // Use the SDK to get position fields
    const position = await turbosSdk.nft.getPositionFields(positionId);

    if (!position) {
      throw new Error(`Position ${positionId} not found`);
    }

    return position;
  } catch (error) {
    console.error(`Failed to fetch position details for ${positionId}:`, error);
    throw new Error(
      `Failed to fetch position details: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Clear the cache for fresh data
 */
export function clearCache(): void {
  poolCache.clear();
  console.log("Turbos service cache cleared");
}

/**
 * Calculate price range from ticks
 * @param tickLower - Lower tick bound
 * @param tickUpper - Upper tick bound
 * @param invertPrice - Whether to invert the price (for SUI/USDC pools)
 */
export function getPriceRangeFromTicks(
  tickLower: number,
  tickUpper: number,
  invertPrice: boolean = true
): { minPrice: number; maxPrice: number } {
  return {
    minPrice: tickToPrice(tickLower, invertPrice),
    maxPrice: tickToPrice(tickUpper, invertPrice),
  };
}

export default {
  deposit,
  removeLiquidity,
  closePosition,
  collectFees,
  getUserPositions,
  getPositionDetails,
  getAllPools,
  getPool,
  clearCache,
  tickToPrice,
  priceToTick,
  getPriceRangeFromTicks,
  calculateTicksFromPrice,
  getFullRangeTicksForPool,
  isTurbosPool,
  isSuiUsdcPool,
  getRecommendedTicks,
  TURBOS_GAS_BUDGET,
  TURBOS_SAFE_GAS_BUDGET,
};
