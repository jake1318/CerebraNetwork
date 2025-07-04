// Current Date and Time (UTC): 2025-07-04 05:10:49
// Current User's Login: jake1318

import {
  CetusClmmSDK,
  LiquidityMath,
  SqrtPriceMath,
} from "@cetusprotocol/sui-clmm-sdk";
import {
  ClmmPoolUtil,
  TickMath,
  CoinAssist,
  Percentage,
  adjustForCoinSlippage, // Restored this missing import
} from "@cetusprotocol/common-sdk";
import type { WalletContextState } from "@suiet/wallet-kit";
import type { PoolInfo } from "./coinGeckoService";
// Use the maintained alias paths
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { SuiClient } from "@mysten/sui.js/client";
import { birdeyeService } from "./birdeyeService";
import BN from "bn.js";
import { normalizeSuiAddress } from "@mysten/sui.js/utils";
import type { SuiTransactionBlockResponse } from "@mysten/sui.js/client";

// Simple inline helper to check transaction success
function assertSuccess(effects: SuiTransactionBlockResponse["effects"]) {
  if (effects?.status?.status !== "success") {
    throw new Error(
      `Transaction failed: ${effects?.status?.error ?? "unknown"}`
    );
  }
}

// Correct mainnet object IDs for Cetus CLMM SDK v2
const CETUS_MAINNET_ADDRESSES = {
  // CLMM core modules
  CLMM_MODULES:
    "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb",
  // Global config object
  CONFIG_OBJECT:
    "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f",
};

// Initialize Cetus CLMM SDK - singleton pattern
// No need for init() call, the SDK is ready to use immediately after createSDK()
export const clmmSdk = CetusClmmSDK.createSDK({ env: "mainnet" });
console.log("Cetus SDK created with mainnet environment");

// In-memory cache for token info to avoid repeated API calls
export const coinInfoCache: Record<
  string,
  { symbol: string; decimals: number; price?: number; logo?: string }
> = {};

// Set sender address when wallet connects
export function setCetusSender(address: string) {
  if (!address) {
    console.warn("Cannot set sender address: address is undefined");
    return;
  }

  clmmSdk.setSenderAddress(address);
  console.log(`Set SDK sender address to ${address}`);
}

// Common token decimals - helps us handle the most common ones
const COMMON_DECIMALS: Record<string, number> = {
  SUI: 9,
  USDC: 6,
  USDT: 6,
  BTC: 8,
  ETH: 8,
  WETH: 8,
  CETUS: 9,
  WAL: 9,
};

/**
 * Helper function to apply slippage to an amount
 * @param n Amount as string
 * @param bps Basis points of slippage (1% = 100 bps)
 * @returns String representing the amount after slippage
 */
function compareWithSlippage(n: string, bps: number): string {
  try {
    // Return "0" for empty string, "0", or invalid inputs
    if (!n || n === "0" || isNaN(Number(n))) return "0";

    const bn = new BN(n);
    // If the amount is already 0, return 0
    if (bn.isZero()) return "0";

    // Calculate with slippage: amount * (10_000 - bps) / 10_000
    return bn
      .muln(10_000 - bps)
      .divn(10_000)
      .toString();
  } catch (error) {
    console.error(`Error in compareWithSlippage for value ${n}:`, error);
    return "0"; // Safe fallback
  }
}

// Helper to get coin metadata (symbol & decimals) with fallback
export async function getCoinInfo(
  coinType: string
): Promise<{ symbol: string; decimals: number }> {
  if (!coinType) return { symbol: "Unknown", decimals: 9 };

  // Check cache first
  if (coinInfoCache[coinType]) {
    return coinInfoCache[coinType];
  }

  try {
    // 1. Try Birdeye API first
    const metadata = await birdeyeService.getTokenMetadata(coinType);
    if (metadata && metadata.symbol) {
      const info = {
        symbol: metadata.symbol,
        decimals: metadata.decimals || 9,
      };
      coinInfoCache[coinType] = info;
      return info;
    }

    // 2. Fallback for well-known tokens
    if (coinType.includes("::SUI")) {
      const info = { symbol: "SUI", decimals: 9 };
      coinInfoCache[coinType] = info;
      return info;
    }

    if (coinType.toLowerCase().includes("usdc")) {
      const info = { symbol: "USDC", decimals: 6 };
      coinInfoCache[coinType] = info;
      return info;
    }

    if (coinType.toLowerCase().includes("usdt")) {
      const info = { symbol: "USDT", decimals: 6 };
      coinInfoCache[coinType] = info;
      return info;
    }

    // 3. Try to extract a symbol from the coin type
    const parts = coinType.split("::");
    const symbol = parts[parts.length - 1] || "Unknown";

    // Try to guess decimals based on common patterns
    let decimals = 9; // Default
    for (const [knownSymbol, knownDecimals] of Object.entries(
      COMMON_DECIMALS
    )) {
      if (coinType.toLowerCase().includes(knownSymbol.toLowerCase())) {
        decimals = knownDecimals;
        break;
      }
    }

    const info = { symbol, decimals };
    coinInfoCache[coinType] = info;
    console.log(
      `Using extracted info for ${coinType}: ${symbol}, ${decimals} decimals`
    );
    return info;
  } catch (err) {
    console.error(`Failed to fetch metadata for ${coinType}`, err);

    // Last resort fallback
    const parts = coinType.split("::");
    const symbol = parts[parts.length - 1] || "Unknown";
    const decimals = 9;

    const info = { symbol, decimals };
    coinInfoCache[coinType] = info;
    return info;
  }
}

// Fetch all pools with pagination
export async function getPools() {
  // Updated to V2 method signature
  const pools = await clmmSdk.Pool.getPoolsWithPage("all", true);

  // Enrich pool info with token symbols/decimals
  const uniqueCoinTypes = new Set<string>();
  pools.forEach((p) => {
    if (p.coin_type_a) uniqueCoinTypes.add(p.coin_type_a);
    if (p.coin_type_b) uniqueCoinTypes.add(p.coin_type_b);
  });

  // Fetch metadata for each unique coin type
  await Promise.all([...uniqueCoinTypes].map((t) => getCoinInfo(t)));

  // Attach symbol and decimals to pool objects
  return pools.map((p) => {
    const infoA =
      p.coin_type_a && coinInfoCache[p.coin_type_a]
        ? coinInfoCache[p.coin_type_a]
        : { symbol: "Unknown", decimals: 9 };

    const infoB =
      p.coin_type_b && coinInfoCache[p.coin_type_b]
        ? coinInfoCache[p.coin_type_b]
        : { symbol: "Unknown", decimals: 9 };

    return {
      ...p,
      symbolA: infoA.symbol,
      symbolB: infoB.symbol,
      decimalsA: infoA.decimals,
      decimalsB: infoB.decimals,
      label: `${infoA.symbol}-${infoB.symbol}${
        p.tick_spacing ? "[" + p.tick_spacing + "]" : ""
      }`,
    };
  });
}

/**
 * Convert amount to smallest unit based on token decimals
 * e.g., 1.5 USDC with 6 decimals becomes 1500000
 */
function toBaseUnit(amount: number, decimals: number): string {
  // Handle potential floating point precision issues
  const multiplier = Math.pow(10, decimals);
  const baseAmount = Math.floor(amount * multiplier);
  return baseAmount.toString();
}

/**
 * Try to determine token decimals from the type string
 */
function guessTokenDecimals(coinType?: string): number {
  // Guard against undefined coinType
  if (!coinType) {
    console.warn("guessTokenDecimals: no coinType provided, defaulting to 9");
    return 9;
  }

  // Default fallbacks by token name
  for (const [symbol, decimals] of Object.entries(COMMON_DECIMALS)) {
    if (coinType.toLowerCase().includes(symbol.toLowerCase())) {
      console.log(
        `Guessed ${decimals} decimals for ${coinType} based on symbol ${symbol}`
      );
      return decimals;
    }
  }

  // Default fallback
  console.log(
    `Could not determine decimals for ${coinType}, using default of 9`
  );
  return 9;
}

// Utility to compute full-range tick indices aligned to tickSpacing
function getGlobalTickRange(tickSpacing: number): {
  lower: number;
  upper: number;
} {
  const MAX_TICK = 443636;
  const remainder = MAX_TICK % tickSpacing;
  const lower = -MAX_TICK + remainder;
  const upper = MAX_TICK - remainder;
  return { lower, upper };
}

/**
 * Check if a pool is a Bluefin pool
 */
export function isBluefinPool(poolId: string, dex?: string): boolean {
  if (dex && dex.toLowerCase().includes("bluefin")) {
    return true;
  }

  // Common patterns in Bluefin pool addresses
  const bluefinPatterns = [
    "bluefin",
    "bf_",
    "0x71f3d", // Some Bluefin pools share this prefix
    "0xf7133d",
    "0xf4a5d8",
  ];

  return bluefinPatterns.some((pattern) =>
    poolId.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Helper function to verify transaction success on-chain when the wallet reports unknown status
 * @param digest Transaction digest to check
 * @returns true if the transaction succeeded on-chain, false otherwise
 */
async function verifyTransactionSuccess(digest: string): Promise<boolean> {
  if (!digest || digest === "unknown") {
    return false;
  }

  try {
    const suiClient = new SuiClient({
      url: "https://fullnode.mainnet.sui.io:443",
    });
    // Query the transaction status from a full node
    let txStatus = await suiClient.getTransactionBlock({
      digest,
      options: { showEffects: true },
    });
    if (txStatus?.effects?.status?.status !== "success") {
      // If not immediately available, wait briefly and retry once
      await new Promise((res) => setTimeout(res, 2000));
      txStatus = await suiClient.getTransactionBlock({
        digest,
        options: { showEffects: true },
      });
    }
    return txStatus?.effects?.status?.status === "success";
  } catch (queryError) {
    console.error("Failed to query transaction status from RPC:", queryError);
    return false;
  }
}

/**
 * Open a position and deposit liquidity.
 * Updated to use SDK v2 helpers for transaction creation
 * Fixed to use calculated coin limits from SDK to handle rounding issues
 */
export async function deposit(
  wallet: WalletContextState,
  poolId: string,
  amountX: number,
  amountY: number,
  poolInfo?: PoolInfo,
  tickLower?: number,
  tickUpper?: number,
  fixedTokenSide: "A" | "B" = "A"
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = wallet.account.address;
  console.log("Starting deposit process for address:", address);

  // Set sender address for this operation - important for the SDK helpers
  clmmSdk.setSenderAddress(address);

  // 1) Bluefin shortcut - maintain compatibility
  if (isBluefinPool(poolId, poolInfo?.dex)) {
    try {
      // Handle Bluefin pools with existing implementation
      console.log(`Using Bluefin deposit implementation for pool ${poolId}`);

      // Create a transaction block for Bluefin deposit
      const txb = new TransactionBlock();
      const BLUEFIN_PACKAGE =
        "0xf7133d0cb63e1a78ef27a78d4e887a58428d06ff4f2ebbd33af273a04a1bf444";

      // Determine token decimals based on symbols if available
      const decimalsA = poolInfo?.tokenA
        ? COMMON_DECIMALS[poolInfo.tokenA] || 9
        : 9;
      const decimalsB = poolInfo?.tokenB
        ? COMMON_DECIMALS[poolInfo.tokenB] || 9
        : 9;

      // Convert to base units
      const baseAmountA = toBaseUnit(amountX, decimalsA);
      const baseAmountB = toBaseUnit(amountY, decimalsB);

      console.log(
        `Bluefin deposit with amounts: ${amountX}(${baseAmountA}) and ${amountY}(${baseAmountB})`
      );

      // Set gas budget explicitly to avoid errors
      txb.setGasBudget(150000000); // 0.15 SUI - increased budget for safety

      // Call the Bluefin add_liquidity function
      txb.moveCall({
        target: `${BLUEFIN_PACKAGE}::clmm::add_liquidity`,
        arguments: [
          txb.pure(poolId),
          txb.pure(baseAmountA),
          txb.pure(baseAmountB),
        ],
      });

      // Execute the transaction
      const result = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: txb,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      // Check transaction success
      if (result.effects?.status?.status !== "success") {
        const digest = result.digest || "unknown";
        const errorMsg = result.effects?.status?.error;
        console.error(`Bluefin transaction failed with digest: ${digest}`);
        console.error(`Error details: ${errorMsg || "unknown"}`);

        // If error message is empty or "unknown", double-check transaction status on-chain
        if (
          digest &&
          (!errorMsg ||
            errorMsg.toLowerCase().includes("unknown") ||
            errorMsg.toLowerCase().includes("timeout"))
        ) {
          if (await verifyTransactionSuccess(digest)) {
            console.warn(
              `Bluefin transaction digest ${digest} succeeded on-chain despite earlier error`
            );
            return { success: true, digest }; // Treat as success
          }
        }

        throw new Error(
          `Bluefin deposit failed: ${errorMsg || "unknown"} (Digest: ${digest})`
        );
      }

      console.log(
        "Bluefin deposit transaction completed, digest:",
        result.digest
      );

      return {
        success: true,
        digest: result.digest || "",
      };
    } catch (error) {
      console.error("Bluefin deposit failed:", error);
      throw new Error(
        `Bluefin deposit failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  try {
    console.log(`Fetching pool information for: ${poolId}`);
    const pool = await clmmSdk.Pool.getPool(poolId);
    if (!pool) {
      throw new Error("Pool not found");
    }

    // Determine coin types with fallback to poolInfo
    const coin_type_a = pool.coin_type_a || poolInfo?.tokenAAddress;
    const coin_type_b = pool.coin_type_b || poolInfo?.tokenBAddress;

    console.log(
      `Resolved coin types: A=${coin_type_a || "undefined"}, B=${
        coin_type_b || "undefined"
      }`
    );

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Cannot determine token types for this pool. Please try again or contact support."
      );
    }

    // Get token metadata using the resolved coin types
    const tokenAInfo = await getCoinInfo(coin_type_a);
    const tokenBInfo = await getCoinInfo(coin_type_b);

    const decimalsA = tokenAInfo.decimals;
    const decimalsB = tokenBInfo.decimals;

    console.log(
      `Token A (${coin_type_a}): ${tokenAInfo.symbol}, ${decimalsA} decimals`
    );
    console.log(
      `Token B (${coin_type_b}): ${tokenBInfo.symbol}, ${decimalsB} decimals`
    );

    // Convert amounts to base units using accurate decimals
    const baseAmountA = toBaseUnit(amountX, decimalsA);
    const baseAmountB = toBaseUnit(amountY, decimalsB);

    console.log(
      `User requested amounts: A=${baseAmountA}, B=${baseAmountB} (in base units)`
    );

    // Compute ticks - ensuring proper alignment to tick spacing
    const tick_spacing = parseInt(pool.tick_spacing) || 60;
    console.log(`Pool tick spacing: ${tick_spacing}`);

    let tick_lower, tick_upper;
    if (tickLower !== undefined && tickUpper !== undefined) {
      // Ensure user-provided ticks are aligned with tick spacing
      tick_lower = Math.floor(tickLower / tick_spacing) * tick_spacing;
      tick_upper = Math.ceil(tickUpper / tick_spacing) * tick_spacing;
      console.log(`Using provided tick range: ${tick_lower} to ${tick_upper}`);
    } else {
      // Use full range ticks aligned to spacing if no ticks provided
      const { lower, upper } = getGlobalTickRange(tick_spacing);
      tick_lower = lower;
      tick_upper = upper;
      console.log(`Using full range ticks: ${tick_lower} to ${tick_upper}`);
    }

    // Fixed 1% slippage - could be made configurable
    const slippagePct = 1;
    // Optional safety buffer percentage (adds extra margin to avoid rounding errors)
    const bufferPct = 1; // Add 1% buffer

    // Calculate liquidity and required amounts based on fixed side
    const isFixingA = fixedTokenSide === "A";
    console.log(`Fixed token side: ${isFixingA ? "A" : "B"}`);

    // Add defensive checks to ensure we have non-zero amounts for both tokens
    if (isFixingA && Number(baseAmountB) === 0) {
      throw new Error(
        "When fixing token A you must still supply a non-zero max amount for token B."
      );
    }

    if (!isFixingA && Number(baseAmountA) === 0) {
      throw new Error(
        "When fixing token B you must still supply a non-zero max amount for token A."
      );
    }

    // Current sqrt price from pool
    const curSqrtPrice = new BN(pool.current_sqrt_price);

    // Create BN instances of amounts for calculations
    const amountABn = new BN(baseAmountA);
    const amountBBn = new BN(baseAmountB);

    console.log("Calculating liquidity and coin amounts using SDK utility...");

    // Calculate liquidity and coin amounts using SDK utility
    const liqInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower,
      tick_upper,
      isFixingA ? amountABn : amountBBn,
      isFixingA, // true if fixing A
      true, // round_up
      slippagePct / 100, // 0.01 for 1%
      curSqrtPrice
    );

    console.log("Raw liqInput object:", liqInput);

    // Extract the calculated limits that account for rounding - handle both camelCase and snake_case field names
    let tokenMaxA = liqInput.coin_amount_limit_a || liqInput.tokenMaxA;
    let tokenMaxB = liqInput.coin_amount_limit_b || liqInput.tokenMaxB;
    let liquidityAmount = liqInput.liquidity_amount || liqInput.liquidity;

    if (!tokenMaxA || !tokenMaxB || !liquidityAmount) {
      console.error("Unexpected liqInput format:", liqInput);
      throw new Error("SDK returned unexpected format. Please try again.");
    }

    // Ensure we have BN instances for calculations
    tokenMaxA = new BN(tokenMaxA.toString());
    tokenMaxB = new BN(tokenMaxB.toString());
    liquidityAmount = new BN(liquidityAmount.toString());

    console.log("Type checks:", {
      tokenMaxA_type: typeof tokenMaxA,
      tokenMaxA_isBN: tokenMaxA instanceof BN,
      tokenMaxB_type: typeof tokenMaxB,
      tokenMaxB_isBN: tokenMaxB instanceof BN,
      liquidityAmount_type: typeof liquidityAmount,
      liquidityAmount_isBN: liquidityAmount instanceof BN,
    });

    // Add safety buffer to the non-fixed side limit - keep all math in BN form
    let bufferedLimitA, bufferedLimitB;

    if (isFixingA) {
      // If fixing A, use the exact amount for A
      bufferedLimitA = baseAmountA; // Already a string

      // Add buffer to B-side cap while still in BN form
      bufferedLimitB = tokenMaxB
        .mul(new BN(100 + bufferPct))
        .div(new BN(100))
        .toString(); // Convert to string only at the end
    } else {
      // If fixing B, use the exact amount for B
      bufferedLimitB = baseAmountB; // Already a string

      // Add buffer to A-side cap while still in BN form
      bufferedLimitA = tokenMaxA
        .mul(new BN(100 + bufferPct))
        .div(new BN(100))
        .toString(); // Convert to string only at the end
    }

    console.log("Calculated values from SDK:", {
      liquidity: liquidityAmount.toString(),
      tokenMaxA: tokenMaxA.toString(),
      tokenMaxB: tokenMaxB.toString(),
      bufferedLimitA,
      bufferedLimitB,
    });

    try {
      console.log("Building transaction payload with SDK helper");

      // Build param object for createAddLiquidityFixTokenPayload
      const params = {
        coin_type_a,
        coin_type_b,
        pool_id: pool.id, // object ID, not display address
        tick_lower: tick_lower.toString(),
        tick_upper: tick_upper.toString(),

        fix_amount_a: isFixingA, // true → exact A, false → exact B
        amount_a: bufferedLimitA, // Use exact A if fixing A, or buffered limit if fixing B
        amount_b: bufferedLimitB, // Use exact B if fixing B, or buffered limit if fixing A

        slippage: slippagePct / 100, // 0.01 for 1%
        is_open: true, // open a brand-new position NFT
        pos_id: "", // "" for new position
        collect_fee: false, // usually false when opening
        rewarder_coin_types: [], // no rewards to claim when opening
      };

      console.log("Transaction params:", {
        fix_amount_a: params.fix_amount_a,
        amount_a: params.amount_a,
        amount_b: params.amount_b,
      });

      // Get a ready-to-sign TransactionBlock from the SDK helper
      // Pass both the params and the options with curSqrtPrice for completeness
      const tx = await clmmSdk.Position.createAddLiquidityFixTokenPayload(
        params,
        {
          slippage: slippagePct / 100,
          curSqrtPrice: curSqrtPrice,
        }
      );

      // Set a higher gas budget for this complex transaction
      tx.setGasBudget(150000000); // 0.15 SUI

      // Have the wallet sign & execute
      console.log("Sending transaction...");
      const res = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEffects: true, showEvents: true },
      });

      // Check transaction success and get detailed error if available
      if (res.effects?.status?.status !== "success") {
        const digest = res.digest || "unknown";
        const errorMsg = res.effects?.status?.error;
        console.error(`Transaction failed with digest: ${digest}`);
        console.error(`Error details: ${errorMsg || "unknown"}`);

        // NEW: If error message is empty or "unknown", double-check transaction status on-chain
        if (
          digest &&
          (!errorMsg ||
            errorMsg.toLowerCase().includes("unknown") ||
            errorMsg.toLowerCase().includes("timeout"))
        ) {
          if (await verifyTransactionSuccess(digest)) {
            console.warn(
              `Transaction digest ${digest} succeeded on-chain despite earlier error`
            );
            return { success: true, digest }; // Treat as success
          }
        }

        // If we reach here, consider it a genuine failure
        throw new Error(
          `Transaction failed: ${errorMsg || "unknown"} (Digest: ${digest})`
        );
      }

      console.log("Transaction completed successfully");
      console.log("Transaction digest:", res.digest);

      return {
        success: true,
        digest: res.digest || "",
      };
    } catch (error) {
      console.error("Transaction failed:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error in deposit function:", error);

    // Provide user-friendly error messages
    if (error instanceof Error) {
      // Check for specific error patterns
      if (
        error.message.includes("repay_add_liquidity") ||
        error.message.includes("MoveAbort") ||
        error.message.includes("pool_script_v2") ||
        error.message.includes("ratio") ||
        error.message.includes("E_INSUFFICIENT_X_SIDE_COINS") ||
        error.message.includes("E_INSUFFICIENT_Y_SIDE_COINS")
      ) {
        throw new Error(
          "Transaction failed: The token amounts don't match the required ratio for this price range. Try one of the following:\n" +
            "1. Only enter an amount for one token and let the interface calculate the other\n" +
            "2. Try a wider price range (click Full Range)\n" +
            "3. For special pairs like WAL/SUI, be very precise with the ratio or let the interface calculate it"
        );
      } else if (error.message.includes("Insufficient balance")) {
        throw new Error(
          "Insufficient balance to complete the transaction. Please check your token balances."
        );
      } else if (error.message.includes("Could not find gas coin")) {
        throw new Error(
          "Not enough SUI to cover gas fees. Please add more SUI to your wallet."
        );
      } else if (error.message.includes("budget")) {
        throw new Error(
          "Transaction failed due to gas budget issues. Please try again with different amounts."
        );
      } else if (error.message.includes("Failed to find position ID")) {
        throw new Error(
          "Position was created but we couldn't identify it. Please check your positions in Cetus app."
        );
      } else if (
        error.message.includes("getIdFromCallArg") ||
        error.message.includes("Cannot read properties of undefined")
      ) {
        throw new Error(
          "Transaction preparation failed. This may be due to insufficient SUI for gas or incorrectly formatted transaction data."
        );
      } else if (
        error.message.includes("Package object does not exist") ||
        error.message.includes("No module found with module name")
      ) {
        throw new Error(
          "Transaction failed: One of the Cetus package addresses is incorrect. The app may need to be updated to work with the latest Cetus protocol version."
        );
      } else if (
        error.message.includes("Cannot convert undefined to a BigInt")
      ) {
        throw new Error(
          "Transaction preparation failed: Invalid parameter format. Please try again with different amounts."
        );
      } else if (error.message.includes("Invalid tick")) {
        throw new Error(
          "Transaction failed: The selected price range is invalid. Please try using the Full Range option or adjust the price range to match the pool's tick spacing."
        );
      } else if (error.message.includes("is not a function")) {
        throw new Error(
          "Transaction preparation failed due to a calculation error. This is likely a bug in our code. Please try again with different amounts or contact support."
        );
      } else if (error.message.includes("SDK returned unexpected format")) {
        throw new Error(
          "Transaction preparation failed due to an SDK data format issue. This could be due to a version mismatch. Please try again with different amounts or contact support."
        );
      }
    }

    throw error;
  }
}

// -------- NEW HELPER --------------------------------------------
export interface WithdrawOpts {
  poolId: string;
  /** one or many NFTs selected in the UI */
  positionIds: string[];
  /** 1 – 100  */
  withdrawPercent: number;
  /** true = also claim fees when removing liquidity */
  collectFees: boolean;
  /** true  = close   NFT(s) (only legal with 100 %)  
      false = keep NFT(s) and just remove liquidity           */
  closePosition: boolean;
  /** slippage in percent, e.g. 0.5  */
  slippage: number;
}

export async function withdraw(
  wallet: WalletContextState,
  opts: WithdrawOpts
): Promise<{ success: boolean; digests: string[]; warnings?: string[] }> {
  const digests: string[] = [];
  const warnings: string[] = [];

  // Keep track of processed position IDs to avoid duplicates
  const processedIds = new Set<string>();

  for (const posId of opts.positionIds) {
    // Skip if this position has already been processed
    if (processedIds.has(posId)) {
      console.log(`Skipping duplicate position ID: ${posId}`);
      continue;
    }

    processedIds.add(posId);

    if (opts.closePosition) {
      // ---- CLOSE (will always force 100 %)
      const result = await closePosition(wallet, opts.poolId, posId);

      if (!result.success) throw new Error(`Close failed for ${posId}`);
      if (result.digest) digests.push(result.digest);
      if (result.warnings) warnings.push(...result.warnings);
    } else {
      // ---- PARTIAL / FULL WITHDRAW, keep NFT
      const { success, digest } = await removeLiquidity(
        wallet,
        opts.poolId,
        posId,
        opts.withdrawPercent,
        opts.collectFees,
        opts.slippage
      );
      if (!success) throw new Error(`Withdraw failed for ${posId}`);
      if (digest) digests.push(digest);
    }
  }

  return {
    success: true,
    digests,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Helper function to check if an error is a "position already closed" type error
 * Updated to be more specific and not catch "Invalid Sui Object id" as closed
 */
function isAlreadyClosedError(e: unknown) {
  const msg = String((e as Error).message || "").toLowerCase();
  return (
    msg.includes("already closed") ||
    msg.includes("object not found") ||
    msg.includes("not exist") ||
    (msg.includes("moveabort") && msg.includes("7"))
  );
}

/**
 * Helper function to collect fees after a liquidity removal
 * Used primarily for single-sided positions
 */
async function collectFeesAfterRemoval(
  wallet: WalletContextState,
  poolId: string,
  posId: string,
  coin_type_a: string,
  coin_type_b: string
): Promise<void> {
  console.log("Collecting fees separately after removal");

  // Check if there are any fees to collect first
  try {
    const feeOwed = await clmmSdk.Position.fetchPendingFee({
      coin_type_a,
      coin_type_b,
      pos_id: posId,
    });

    if (feeOwed.amount_a === "0" && feeOwed.amount_b === "0") {
      console.log("No pending fees - skip collectFeePayload");
      return;
    }

    console.log(
      `Pending fees detected: ${feeOwed.amount_a} / ${feeOwed.amount_b}. Collecting...`
    );
  } catch (error) {
    console.warn("Error checking pending fees:", error);
    // Continue anyway - better to try collecting than miss out on fees
  }

  try {
    const collectFeeTx = await clmmSdk.Position.collectFeePayload({
      coin_type_a,
      coin_type_b,
      pool_id: poolId,
      pos_id: posId,
    });

    collectFeeTx.setGasBudget(50000000); // 0.05 SUI

    const collectFeeRes = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: collectFeeTx,
      options: { showEffects: true, showEvents: true },
    });

    // Check transaction success and handle potential "unknown" status
    if (collectFeeRes.effects?.status?.status !== "success") {
      const digest = collectFeeRes.digest || "unknown";
      const errorMsg = collectFeeRes.effects?.status?.error;

      // If error message is empty or "unknown", double-check transaction status on-chain
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
          console.warn(
            `Fee collection transaction digest ${digest} succeeded on-chain despite earlier error`
          );
          console.log(
            "Fees collected separately after removal, digest:",
            digest
          );
          return;
        }
      }

      console.warn(
        `Fee collection failed but continuing: ${
          errorMsg || "unknown"
        } (Digest: ${digest})`
      );
      return;
    }

    console.log(
      "Fees collected separately after removal, digest:",
      collectFeeRes.digest
    );
  } catch (e) {
    // Special handling for empty transaction error from wallet
    if (
      e instanceof Error &&
      e.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
    ) {
      console.warn("Fee collection skipped - wallet refused empty TX");
    } else {
      // Log but don't throw on fee collection failure
      console.warn("Error collecting fees after removal:", e);
    }
  }
}

/**
 * Remove a percentage (0–100) of liquidity from a position, collecting fees.
 * Updated to fix slippage percentage construction and ensure all amount parameters
 * are properly converted to strings as required by the SDK.
 */
export async function removeLiquidity(
  wallet: WalletContextState,
  poolId: string,
  positionId: string,
  liquidityPct: number = 100,
  collectFee: boolean = true,
  slippagePc: number = 1 // UI sends 0.5 etc.
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = wallet.account.address;

  // Set sender address for this operation
  clmmSdk.setSenderAddress(address);

  // Define variables at wider scope so they're available in catch block
  let position;
  let pool;
  let lowerSqrt, upperSqrt, curSqrt;
  let coinAmounts;
  let coin_type_a, coin_type_b;
  let removeLiquidity;
  let posId, poolIdSanitized;

  try {
    console.log(
      `Removing ${liquidityPct}% liquidity from position ${positionId} in pool ${poolId}`
    );

    // Sanitize IDs
    posId = normalizeSuiAddress(positionId.trim());
    poolIdSanitized = normalizeSuiAddress(poolId.trim());

    // Use getPositionById instead of getPosition - recommended SDK v2 method
    // Disable unnecessary features to reduce errors
    try {
      position = await clmmSdk.Position.getPositionById(
        posId,
        /*calculate_rewarder=*/ false,
        /*show_display=*/ false
      );

      if (!position) {
        throw new Error(`Position ${posId} not found`);
      }
      console.log(`Position found: ${posId}, liquidity: ${position.liquidity}`);
    } catch (error) {
      console.warn(`Position verification failed for ${posId}:`, error);

      if (isAlreadyClosedError(error)) {
        console.log(`Position ${posId} appears to be already closed`);
        return { success: true, digest: "" };
      }

      // For all other errors, surface them
      console.error(
        `Failed to get position data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }

    if (!position.liquidity || position.liquidity === "0") {
      console.log("Position has zero liquidity, nothing to withdraw");
      return { success: true, digest: "" };
    }

    // Handle edge case with u128::MAX liquidity (legacy testnet NFTs)
    // The contract's delta_liquidity parameter is u64, so we need to cap it
    const MAX_U64 = new BN("18446744073709551615"); // 2^64 - 1
    const totalLiquidity = new BN(position.liquidity);
    removeLiquidity = totalLiquidity.muln(liquidityPct).divn(100);

    // Cap at MAX_U64 to avoid overflow
    if (removeLiquidity.gt(MAX_U64)) {
      console.log("Liquidity exceeds u64 max, capping to MAX_U64");
      removeLiquidity = MAX_U64;
    }

    if (removeLiquidity.isZero()) {
      console.log("No liquidity to withdraw based on percentage");
      return { success: true, digest: "" };
    }

    // Get pool data - with showPositions option
    pool = await clmmSdk.Pool.getPool(poolIdSanitized, {
      showTick: true,
      showRewarder: true,
      showPositions: true,
    });

    if (!pool) {
      throw new Error(`Pool ${poolIdSanitized} not found`);
    }

    // Ensure we have the coin types
    coin_type_a = pool.coin_type_a;
    coin_type_b = pool.coin_type_b;

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Pool coin types are missing. Cannot proceed with removal."
      );
    }

    // Calculate expected withdrawal amounts
    lowerSqrt = TickMath.tickIndexToSqrtPriceX64(position.tick_lower_index);
    upperSqrt = TickMath.tickIndexToSqrtPriceX64(position.tick_upper_index);
    curSqrt = new BN(pool.current_sqrt_price);

    coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
      removeLiquidity,
      curSqrt,
      lowerSqrt,
      upperSqrt,
      false
    );

    console.log("Expected withdrawal amounts:", {
      coin_amount_a: coinAmounts.coin_amount_a,
      coin_amount_b: coinAmounts.coin_amount_b,
    });

    // Determine if this is a single-sided position
    const isSingleSided =
      coinAmounts.coin_amount_a === "0" || coinAmounts.coin_amount_b === "0";

    let tx;

    if (isSingleSided) {
      // SINGLE-SIDED POSITION HANDLING
      // We must use the fix-token variant that routes everything to one side
      console.log("Detected single-sided position, using fix-token variant");

      // Determine which token has value
      const isFixedA = coinAmounts.coin_amount_a === "0"; // true if A is 0 (all value in B)
      console.log(
        `Single-sided position with ${isFixedA ? "B" : "A"} token only`
      );

      // FIXED: Ensure removeLiquidity is a string
      const deltaLiquidity = removeLiquidity.toString();
      console.log(`Removing liquidity amount (as string): ${deltaLiquidity}`);

      // Build transaction with removeLiquidityFixTokenPayload
      tx = await clmmSdk.Position.removeLiquidityFixTokenPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
        tick_lower: position.tick_lower_index.toString(),
        tick_upper: position.tick_upper_index.toString(),
        fix_amount_a: isFixedA, // true → receive only B, false → only A
        delta_liquidity: deltaLiquidity, // FIXED: Ensure it's a string
        min_amount: "0", // Ensure it's a string
        collect_fee: false, // Never collect fees during fix-token removal
      });

      // If we want to collect fees, do it in a separate step after liquidity removal
    } else {
      // DOUBLE-SIDED POSITION HANDLING
      // Set minimum amounts based on slippage
      const slippageBps = Math.round(slippagePc * 100); // 0.5% -> 50 bps

      // HOTFIX: Properly construct Percentage with BN numerator/denominator
      // Use SDK's helper for slippage adjustment
      const slippagePercentage = new Percentage(
        new BN(slippageBps), // numerator (e.g. 50)
        new BN(10_000) // denominator (basis-points)
      );

      const adjustedAmounts = adjustForCoinSlippage(
        {
          amount_a: coinAmounts.coin_amount_a,
          amount_b: coinAmounts.coin_amount_b,
        },
        slippagePercentage,
        false // round down for safety
      );

      // FIXED: Explicitly convert BN objects to strings
      const min_amount_a = (adjustedAmounts.amount_a ?? "0").toString();
      const min_amount_b = (adjustedAmounts.amount_b ?? "0").toString();
      const deltaLiquidity = removeLiquidity.toString();

      console.log(
        `Using min amounts (with ${slippagePc}% slippage, as strings):`,
        {
          min_amount_a,
          min_amount_b,
          deltaLiquidity,
        }
      );

      // For double-sided positions, we can use the regular removeLiquidityPayload
      // Get rewards if collecting fees
      let rewarder_coin_types: string[] = [];
      if (pool.positions_handle && collectFee) {
        try {
          const rewards = await clmmSdk.Rewarder.fetchPosRewardersAmount(
            poolIdSanitized,
            pool.positions_handle,
            posId
          );

          rewarder_coin_types = rewards
            .filter((r: any) => r && Number(r.amount_owed) > 0)
            .map((r: any) => r.coin_address);

          console.log(
            `Found ${rewarder_coin_types.length} reward types to claim`
          );
        } catch (error) {
          console.warn(`Error fetching rewards: ${error}`);
        }
      }

      // Build transaction payload - double-sided approach
      tx = await clmmSdk.Position.removeLiquidityPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
        delta_liquidity: deltaLiquidity, // FIXED: Ensure it's a string
        min_amount_a, // Already converted to string
        min_amount_b, // Already converted to string
        collect_fee: collectFee, // Safe for double-sided positions
        rewarder_coin_types,
      });
    }

    // Set explicit gas budget
    tx.setGasBudget(150000000); // Increased to 0.15 SUI

    // Execute transaction
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    // Check transaction success and handle potential "unknown" status
    if (res.effects?.status?.status !== "success") {
      const digest = res.digest || "unknown";
      const errorMsg = res.effects?.status?.error;
      console.error(`Liquidity removal failed with digest: ${digest}`);
      console.error(`Error details: ${errorMsg || "unknown"}`);

      // If error message is empty or "unknown", double-check transaction status on-chain
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
          console.warn(
            `Liquidity removal transaction digest ${digest} succeeded on-chain despite earlier error`
          );

          // For single-sided positions, still try to collect fees separately if requested
          if (isSingleSided && collectFee) {
            await collectFeesAfterRemoval(
              wallet,
              poolIdSanitized,
              posId,
              coin_type_a,
              coin_type_b
            );
          }

          return { success: true, digest }; // Treat as success
        }
      }

      // If we reach here, consider it a genuine failure
      throw new Error(
        `Liquidity removal failed: ${errorMsg || "unknown"} (Digest: ${digest})`
      );
    }

    console.log("Liquidity removal successful, digest:", res.digest);

    // For single-sided positions, collect fees separately if requested
    if (isSingleSided && collectFee) {
      await collectFeesAfterRemoval(
        wallet,
        poolIdSanitized,
        posId,
        coin_type_a,
        coin_type_b
      );
    }

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    console.error("Error in removeLiquidity:", error);

    // Try fallback with zero minimums for any slippage error
    if (
      error instanceof Error &&
      (error.message.includes("min_out_not_reached") ||
        error.message.includes("E_MIN_OUT_NOT_REACHED") ||
        error.message.includes("code 9") ||
        error.message.includes("invalid token amounts"))
    ) {
      console.log(
        "Slippage or token amounts error detected, trying fallback approach"
      );

      try {
        // Variables are now accessible thanks to wider scope
        if (
          !position ||
          !pool ||
          !curSqrt ||
          !lowerSqrt ||
          !upperSqrt ||
          !removeLiquidity
        ) {
          throw new Error("Missing required data for fallback");
        }

        // Determine if this is a single-sided position
        const isSingleSided =
          coinAmounts.coin_amount_a === "0" ||
          coinAmounts.coin_amount_b === "0";

        let fallbackTx;

        // FIXED: Make sure we convert removeLiquidity to a string
        const deltaLiquidity = removeLiquidity.toString();

        if (isSingleSided) {
          // Single-sided fallback: use fix-token variant
          const isFixedA = coinAmounts.coin_amount_a === "0"; // true if A is 0 (all value in B)

          fallbackTx = await clmmSdk.Position.removeLiquidityFixTokenPayload({
            coin_type_a,
            coin_type_b,
            pool_id: poolIdSanitized,
            pos_id: posId,
            tick_lower: position.tick_lower_index.toString(),
            tick_upper: position.tick_upper_index.toString(),
            fix_amount_a: isFixedA,
            delta_liquidity: deltaLiquidity, // FIXED: Use string
            min_amount: "0", // Zero minimum as string
            collect_fee: false, // Never collect fees in the fallback
          });
        } else {
          // Double-sided fallback: use standard variant with zero minimums
          fallbackTx = await clmmSdk.Position.removeLiquidityPayload({
            coin_type_a,
            coin_type_b,
            pool_id: poolIdSanitized,
            pos_id: posId,
            delta_liquidity: deltaLiquidity, // FIXED: Use string
            min_amount_a: "0", // Zero minimum as string
            min_amount_b: "0", // Zero minimum as string
            collect_fee: false, // Don't collect fees in the fallback
            rewarder_coin_types: [], // Don't collect rewards in the fallback
          });
        }

        fallbackTx.setGasBudget(150000000); // Increased to 0.15 SUI

        const fallbackRes = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: fallbackTx,
          options: { showEffects: true, showEvents: true },
        });

        // Check transaction success and handle potential "unknown" status
        if (fallbackRes.effects?.status?.status !== "success") {
          const digest = fallbackRes.digest || "unknown";
          const errorMsg = fallbackRes.effects?.status?.error;
          console.error(`Fallback removal failed with digest: ${digest}`);
          console.error(`Error details: ${errorMsg || "unknown"}`);

          // If error message is empty or "unknown", double-check transaction status on-chain
          if (
            digest &&
            (!errorMsg ||
              errorMsg.toLowerCase().includes("unknown") ||
              errorMsg.toLowerCase().includes("timeout"))
          ) {
            if (await verifyTransactionSuccess(digest)) {
              console.warn(
                `Fallback liquidity removal transaction digest ${digest} succeeded on-chain despite earlier error`
              );

              // For single-sided positions, still try to collect fees separately if requested
              if (isSingleSided && collectFee) {
                await collectFeesAfterRemoval(
                  wallet,
                  poolIdSanitized,
                  posId,
                  coin_type_a,
                  coin_type_b
                );
              }

              return { success: true, digest }; // Treat as success
            }
          }

          throw new Error(
            `Fallback liquidity removal failed: ${
              errorMsg || "unknown"
            } (Digest: ${digest})`
          );
        }

        console.log(
          "Fallback liquidity removal succeeded, digest:",
          fallbackRes.digest
        );

        // For single-sided positions, collect fees separately if requested
        if (isSingleSided && collectFee) {
          await collectFeesAfterRemoval(
            wallet,
            poolIdSanitized,
            posId,
            coin_type_a,
            coin_type_b
          );
        }

        return {
          success: true,
          digest: fallbackRes.digest,
        };
      } catch (fallbackError) {
        console.error("Fallback approach also failed:", fallbackError);
        throw new Error(
          "Failed to remove liquidity: Both standard and fallback approaches failed"
        );
      }
    }

    // Only return success for truly closed positions
    if (error instanceof Error && isAlreadyClosedError(error)) {
      return { success: true, digest: "" };
    }

    // Surface the error details for debugging
    if (error instanceof Error) {
      console.warn(`removeLiquidity failed. Error: ${error.message}`);

      if (error.message.toLowerCase().includes("invalid sui object id")) {
        throw new Error(
          "Invalid position ID format or RPC node error. This position might exist but the node couldn't fetch it correctly."
        );
      } else if (
        error.message.toLowerCase().includes("invalid token amounts")
      ) {
        throw new Error(
          "Invalid token amounts error. This is likely due to a formatting issue with the transaction parameters. Please try again."
        );
      }
    }

    throw error;
  }
}

/**
 * Helper function to close a Bluefin position
 */
async function closeBluefinPosition(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  try {
    console.log(`Closing Bluefin position ${positionId} in pool ${poolId}`);

    const txb = new TransactionBlock();
    const BLUEFIN_PACKAGE =
      "0xf7133d0cb63e1a78ef27a78d4e887a58428d06ff4f2ebbd33af273a04a1bf444";

    // First remove all liquidity
    txb.moveCall({
      target: `${BLUEFIN_PACKAGE}::clmm::remove_liquidity`,
      arguments: [
        txb.pure(poolId),
        txb.pure(positionId),
        txb.pure("18446744073709551615"), // Max uint64 value to remove all liquidity
      ],
    });

    // Then burn the position if balance is zero
    txb.moveCall({
      target: `${BLUEFIN_PACKAGE}::position::burn`,
      arguments: [txb.pure(poolId), txb.pure(positionId)],
    });

    txb.setGasBudget(150000000); // Increased to 0.15 SUI

    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: txb,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    // Check transaction success and handle potential "unknown" status
    if (result.effects?.status?.status !== "success") {
      const digest = result.digest || "unknown";
      const errorMsg = result.effects?.status?.error;
      console.error(`Bluefin position closing failed with digest: ${digest}`);
      console.error(`Error details: ${errorMsg || "unknown"}`);

      // If error message is empty or "unknown", double-check transaction status on-chain
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
          console.warn(
            `Bluefin position closing transaction digest ${digest} succeeded on-chain despite earlier error`
          );
          return { success: true, digest }; // Treat as success
        }
      }

      throw new Error(
        `Bluefin position closing failed: ${
          errorMsg || "unknown"
        } (Digest: ${digest})`
      );
    }

    console.log("Bluefin position closed successfully, digest:", result.digest);

    return {
      success: true,
      digest: result.digest || "",
    };
  } catch (error) {
    console.error("Bluefin position closing failed:", error);

    // Check if it's a benign error
    if (isAlreadyClosedError(error)) {
      return { success: true, digest: "" };
    }
    throw error;
  }
}

/**
 * Withdraw all liquidity, fees and rewards, and close the position.
 * Using a safer multi-step approach with enhanced error handling:
 * 1. Remove all liquidity first (critical step)
 * 2. Check and only collect fees if non-zero (optional step)
 * 3. Check and only collect rewards if available (optional step)
 * 4. Close/burn the empty position (optional but recommended)
 *
 * This fixes the "$Intent,$kind" error by skipping empty transactions
 * and treating wallet signature errors for optional steps as warnings.
 */
export async function closePosition(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string; warnings?: string[] }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = wallet.account.address;
  const warnings: string[] = [];

  // Sanitize IDs
  const posId = normalizeSuiAddress(positionId.trim());
  const poolIdSanitized = normalizeSuiAddress(poolId.trim());

  // Check for Bluefin pools - they use a different flow
  if (isBluefinPool(poolIdSanitized)) {
    return await closeBluefinPosition(wallet, poolIdSanitized, posId);
  }

  // Set sender address for this operation
  clmmSdk.setSenderAddress(address);

  try {
    console.log(`Closing position ${posId} in pool ${poolIdSanitized}`);

    // Step 0: Check if the position exists and get position info
    let position;
    try {
      position = await clmmSdk.Position.getPositionById(
        posId,
        /*calculate_rewarder=*/ false,
        /*show_display=*/ false
      );

      if (!position) {
        throw new Error(`Position ${posId} not found`);
      }

      console.log(`Position found: ${posId}, liquidity: ${position.liquidity}`);
    } catch (error) {
      console.warn(`Position verification failed for ${posId}:`, error);

      if (isAlreadyClosedError(error)) {
        console.log(`Position ${posId} appears to be already closed`);
        return { success: true, digest: "" };
      }

      console.error(
        `Failed to get position data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }

    // Get pool data for coin types and rewards
    const pool = await clmmSdk.Pool.getPool(poolIdSanitized, {
      showTick: true,
      showRewarder: true,
      showPositions: true,
    });

    if (!pool || !pool.coin_type_a || !pool.coin_type_b) {
      throw new Error("Pool or coin types not found");
    }

    // Get ALL reward coin types from the pool
    let rewarder_coin_types: string[] = [];
    if (pool.reward_manager && pool.reward_manager.rewards) {
      try {
        // Get ALL reward coin types configured in the pool
        rewarder_coin_types = pool.reward_manager.rewards.map(
          (r: any) => r.reward_coin
        );
        console.log(
          `Including all ${rewarder_coin_types.length} reward coin types from pool: ${rewarder_coin_types}`
        );
      } catch (error) {
        console.warn(`Error getting reward types: ${error}`);
        warnings.push("Could not fetch all reward types");

        // Fallback: try to get at least the non-zero reward amounts
        if (pool.positions_handle) {
          try {
            const rewards = await clmmSdk.Rewarder.fetchPosRewardersAmount(
              poolIdSanitized,
              pool.positions_handle,
              posId
            );

            rewarder_coin_types = rewards
              .filter((r: any) => r && r.coin_address)
              .map((r: any) => r.coin_address);

            console.log(
              `Using fallback: found ${rewarder_coin_types.length} reward types: ${rewarder_coin_types}`
            );
          } catch (fallbackError) {
            console.warn(`Fallback reward fetch also failed: ${fallbackError}`);
          }
        }
      }
    }

    // If position has no liquidity, we can skip Step 1 and proceed directly to closing
    if (!position.liquidity || position.liquidity === "0") {
      console.log("Position has zero liquidity, proceeding to direct close");

      // Go directly to Step 3: Close the position
      try {
        const closeTx = await clmmSdk.Position.closePositionPayload({
          coin_type_a: pool.coin_type_a,
          coin_type_b: pool.coin_type_b,
          pool_id: poolIdSanitized,
          pos_id: posId,
          min_amount_a: "0", // No liquidity to remove
          min_amount_b: "0", // No liquidity to remove
          rewarder_coin_types, // Include ALL reward types
          collect_fee: true, // Safe to collect fees during close if there's no liquidity
        });

        closeTx.setGasBudget(150000000); // 0.15 SUI

        const result = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: closeTx,
          options: { showEffects: true, showEvents: true },
        });

        // Check transaction success and verify on-chain if needed
        if (result.effects?.status?.status !== "success") {
          const digest = result.digest || "unknown";
          const errorMsg = result.effects?.status?.error;
          console.error(
            `Direct position closing failed with digest: ${digest}`
          );
          console.error(`Error details: ${errorMsg || "unknown"}`);

          if (
            digest &&
            (!errorMsg ||
              errorMsg.toLowerCase().includes("unknown") ||
              errorMsg.toLowerCase().includes("timeout"))
          ) {
            if (await verifyTransactionSuccess(digest)) {
              console.warn(
                `Position closing transaction digest ${digest} succeeded on-chain despite earlier error`
              );
              return { success: true, digest };
            }
          }

          throw new Error(
            `Position closing failed: ${
              errorMsg || "unknown"
            } (Digest: ${digest})`
          );
        }

        console.log(
          "Direct position closing succeeded, digest:",
          result.digest
        );
        return {
          success: true,
          digest: result.digest || "",
        };
      } catch (error) {
        // Check for "$Intent,$kind" error, which indicates an empty transaction that wallet rejected
        if (
          error instanceof Error &&
          error.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
        ) {
          console.warn(
            "Wallet refused to sign empty transaction. Position is already empty."
          );
          warnings.push("Position appears to be already empty");
          return {
            success: true,
            digest: "",
            warnings,
          };
        }

        // If there's another issue with direct closing, try without collecting fees
        try {
          console.log(
            "Direct closing failed. Trying without fee collection..."
          );

          const fallbackCloseTx = await clmmSdk.Position.closePositionPayload({
            coin_type_a: pool.coin_type_a,
            coin_type_b: pool.coin_type_b,
            pool_id: poolIdSanitized,
            pos_id: posId,
            min_amount_a: "0",
            min_amount_b: "0",
            rewarder_coin_types,
            collect_fee: false, // Don't try to collect fees
          });

          fallbackCloseTx.setGasBudget(80000000);

          const fallbackResult = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: fallbackCloseTx,
            options: { showEffects: true, showEvents: true },
          });

          if (
            fallbackResult.effects?.status?.status === "success" ||
            (await verifyTransactionSuccess(fallbackResult.digest || ""))
          ) {
            console.log(
              "Fallback direct close succeeded (without fee collection)"
            );
            return {
              success: true,
              digest: fallbackResult.digest || "",
              warnings: ["Fees could not be collected"],
            };
          }
        } catch (fallbackError) {
          console.warn("Fallback direct close also failed:", fallbackError);
          warnings.push("Could not close position directly");
        }

        // Re-throw the original error if all attempts failed
        throw error;
      }
    }

    // ----- For positions with liquidity, use a safer multi-step approach -----

    // STEP 1: First remove all liquidity with zero minimums to ensure it succeeds
    // This is the CRITICAL step - if this succeeds, we consider the operation successful
    console.log("STEP 1: Removing all liquidity from position");

    // Make sure to convert liquidity amount to a string
    const liquidityAmount = position.liquidity.toString();
    console.log(`Liquidity amount to remove (as string): ${liquidityAmount}`);

    const removeTx = await clmmSdk.Position.removeLiquidityPayload({
      coin_type_a: pool.coin_type_a,
      coin_type_b: pool.coin_type_b,
      pool_id: poolIdSanitized,
      pos_id: posId,
      delta_liquidity: liquidityAmount,
      min_amount_a: "0", // Zero minimum to ensure success
      min_amount_b: "0", // Zero minimum to ensure success
      collect_fee: false, // Don't collect fees in this step
      rewarder_coin_types: [], // Don't collect rewards in this step
    });

    removeTx.setGasBudget(150000000);

    console.log("Executing liquidity removal transaction");
    const removeRes = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: removeTx,
      options: { showEffects: true, showEvents: true },
    });

    // Check if removal succeeded - this is critical, so we do throw on failure
    if (removeRes.effects?.status?.status !== "success") {
      const digest = removeRes.digest || "unknown";
      const errorMsg = removeRes.effects?.status?.error;
      console.error(`Liquidity removal failed with digest: ${digest}`);
      console.error(`Error details: ${errorMsg || "unknown"}`);

      // Verify on-chain status if it was unknown
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
          console.warn(
            `Liquidity removal transaction digest ${digest} succeeded on-chain despite earlier error`
          );
          // Continue to next step - liquidity was removed
        } else {
          throw new Error(
            `Liquidity removal failed: ${
              errorMsg || "unknown"
            } (Digest: ${digest})`
          );
        }
      } else {
        throw new Error(
          `Liquidity removal failed: ${
            errorMsg || "unknown"
          } (Digest: ${digest})`
        );
      }
    }

    console.log("Liquidity removal succeeded, digest:", removeRes.digest);

    // Brief pause to allow node to update state
    await new Promise((resolve) => setTimeout(resolve, 500));

    // STEP 2: Check for pending fees and collect only if non-zero
    console.log("STEP 2: Checking for pending fees");

    // IMPROVEMENT: Check if there are actually fees to collect before building transaction
    try {
      const feeOwed = await clmmSdk.Position.fetchPendingFee({
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        pos_id: posId,
      });

      if (feeOwed.amount_a === "0" && feeOwed.amount_b === "0") {
        console.log("No pending fees - skip collectFeePayload");
      } else {
        console.log(
          `Pending fees detected: ${feeOwed.amount_a} / ${feeOwed.amount_b}. Collecting...`
        );

        const collectTx = await clmmSdk.Position.collectFeePayload({
          coin_type_a: pool.coin_type_a,
          coin_type_b: pool.coin_type_b,
          pool_id: poolIdSanitized,
          pos_id: posId,
        });

        collectTx.setGasBudget(80000000);

        console.log("Executing fee collection transaction");
        const collectRes = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: collectTx,
          options: { showEffects: true, showEvents: true },
        });

        // Check if fee collection succeeded, but don't fail the whole process if it doesn't
        if (
          collectRes.effects?.status?.status !== "success" &&
          !(await verifyTransactionSuccess(collectRes.digest || ""))
        ) {
          console.warn(
            `Fee collection failed: ${
              collectRes.effects?.status?.error || "unknown"
            }`
          );
          warnings.push(
            "Fee collection failed but liquidity was removed successfully"
          );
        } else {
          console.log("Fee collection succeeded, digest:", collectRes.digest);
        }
      }
    } catch (e) {
      // IMPROVEMENT: Special handling for empty transaction error from wallet
      if (
        e instanceof Error &&
        e.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
      ) {
        console.warn("Fee collection skipped - wallet refused empty TX");
        warnings.push("Fee collection skipped - no fees to collect");
      } else {
        console.warn("Fee collection failed but continuing:", e);
        warnings.push(
          "Fee collection failed but liquidity was removed successfully"
        );
      }
    }

    // Brief pause to allow node to update state
    await new Promise((resolve) => setTimeout(resolve, 500));

    // STEP 3: Check for rewards and collect them separately if available
    if (rewarder_coin_types.length > 0) {
      console.log("STEP 3: Checking for rewards");

      try {
        // Check if there are actually rewards to collect
        let hasRewards = false;
        if (pool.positions_handle) {
          try {
            const rewards = await clmmSdk.Rewarder.fetchPosRewardersAmount(
              poolIdSanitized,
              pool.positions_handle,
              posId
            );

            hasRewards = rewards.some(
              (r: any) => r && Number(r.amount_owed) > 0
            );
            if (hasRewards) {
              console.log("Pending rewards detected. Collecting...");
            } else {
              console.log("No pending rewards - skip collectRewarderPayload");
            }
          } catch (error) {
            console.warn("Error checking reward amounts:", error);
            hasRewards = true; // Default to trying to collect if we can't check
          }
        }

        if (hasRewards) {
          const rewardsTx = await clmmSdk.Rewarder.collectRewarderPayload({
            coin_type_a: pool.coin_type_a,
            coin_type_b: pool.coin_type_b,
            pool_id: poolIdSanitized,
            pos_id: posId,
            rewarder_coin_types,
            collect_fee: false, // Already collected fees
          });

          rewardsTx.setGasBudget(80000000);

          console.log("Executing rewards collection transaction");
          const rewardsRes = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: rewardsTx,
            options: { showEffects: true, showEvents: true },
          });

          // Check if rewards collection succeeded, but don't fail if it doesn't
          if (
            rewardsRes.effects?.status?.status !== "success" &&
            !(await verifyTransactionSuccess(rewardsRes.digest || ""))
          ) {
            console.warn(
              `Rewards collection failed: ${
                rewardsRes.effects?.status?.error || "unknown"
              }`
            );
            warnings.push(
              "Rewards collection failed but liquidity was removed successfully"
            );
          } else {
            console.log(
              "Rewards collection succeeded, digest:",
              rewardsRes.digest
            );
          }
        }
      } catch (e) {
        // Special handling for empty transaction error from wallet
        if (
          e instanceof Error &&
          e.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
        ) {
          console.warn("Rewards collection skipped - wallet refused empty TX");
          warnings.push("Rewards collection skipped - no rewards to collect");
        } else {
          console.warn("Rewards collection failed but continuing:", e);
          warnings.push(
            "Rewards collection failed but liquidity was removed successfully"
          );
        }
      }

      // Brief pause to allow node to update state
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // STEP 4: Finally, try to close the now-empty position
    console.log("STEP 4: Closing the now-empty position");

    try {
      const closeTx = await clmmSdk.Position.closePositionPayload({
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
        min_amount_a: "0", // No liquidity left to remove
        min_amount_b: "0", // No liquidity left to remove
        rewarder_coin_types, // Include ALL reward types to be safe
        collect_fee: false, // Already collected fees
      });

      closeTx.setGasBudget(80000000);

      console.log("Executing position closing transaction");
      const closeRes = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: closeTx,
        options: { showEffects: true, showEvents: true },
      });

      // Check if closing succeeded, but don't fail the whole process if it doesn't
      if (
        closeRes.effects?.status?.status !== "success" &&
        !(await verifyTransactionSuccess(closeRes.digest || ""))
      ) {
        console.warn(
          `Final position closing failed: ${
            closeRes.effects?.status?.error || "unknown"
          }`
        );
        warnings.push(
          "Position NFT burning failed but liquidity was removed successfully"
        );
      } else {
        console.log("Position successfully closed, digest:", closeRes.digest);
        return {
          success: true,
          digest: closeRes.digest || "",
          warnings: warnings.length > 0 ? warnings : undefined,
        };
      }
    } catch (e) {
      // Special handling for empty transaction error from wallet
      if (
        e instanceof Error &&
        e.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
      ) {
        console.warn("Position closing skipped - wallet refused empty TX");
        warnings.push("Position closing skipped - may already be closed");
      } else if (
        e instanceof Error &&
        e.message.toLowerCase().includes("invalid token amounts")
      ) {
        console.warn(
          "Position closing failed with 'invalid token amounts' - likely already empty"
        );
        warnings.push(
          "Position NFT burning failed but liquidity was removed successfully"
        );
      } else {
        console.warn("Position closing failed but continuing:", e);
        warnings.push(
          "Position NFT burning failed but liquidity was removed successfully"
        );
      }
    }

    // If we get here, the liquidity removal was successful but closing may have failed
    // This is still considered a success because the user's funds were retrieved
    return {
      success: true,
      digest: removeRes.digest || "", // Return the liquidity removal digest as the main success
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  } catch (error) {
    console.error("Error in closePosition:", error);

    // Surface the error details for debugging
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      console.warn(`closePosition failed. Error: ${error.message}`);

      // Check if it matches patterns for already closed positions
      if (isAlreadyClosedError(error)) {
        return { success: true, digest: "" };
      }

      // Provide more specific error messages
      if (errorMessage.includes("invalid sui object id")) {
        throw new Error(
          "Invalid position ID format or RPC node error. This position might exist but the node couldn't fetch it correctly."
        );
      } else if (errorMessage.includes("insufficient")) {
        throw new Error(
          "Insufficient funds to execute the transaction. Check your SUI balance for gas."
        );
      } else if (
        errorMessage.includes("position is not empty") ||
        errorMessage.includes("code 7")
      ) {
        throw new Error(
          "Position still has liquidity. Failed to remove all liquidity before closing. This might be due to a contract issue or an edge case in the Cetus protocol."
        );
      } else if (errorMessage.includes("invalid token amounts")) {
        throw new Error(
          "Invalid token amounts error. The transaction parameters couldn't be processed by the contract. The position's liquidity has likely been removed, but the NFT might remain in your wallet."
        );
      }
    }

    throw error;
  }
}

/**
 * Collect fees from a position.
 * Updated for SDK v2 with proper position verification
 * Fixed to handle string conversions for amount parameters
 */
export async function collectFees(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }
  const address = wallet.account.address;

  // Set sender address for this operation
  clmmSdk.setSenderAddress(address);

  try {
    console.log(
      `Collecting fees for position: ${positionId} in pool: ${poolId}`
    );

    // Sanitize IDs
    const posId = normalizeSuiAddress(positionId.trim());
    const poolIdSanitized = normalizeSuiAddress(poolId.trim());

    // Use getPositionById instead of getPosition - recommended SDK v2 method
    // Disable unnecessary features to reduce errors
    let position;
    try {
      position = await clmmSdk.Position.getPositionById(
        posId,
        /*calculate_rewarder=*/ false,
        /*show_display=*/ false
      );

      if (!position) {
        throw new Error(`Position ${posId} not found`);
      }
      console.log(`Position found: ${posId}`);
    } catch (error) {
      console.warn(`Position verification failed for ${posId}:`, error);

      if (isAlreadyClosedError(error)) {
        return { success: true, digest: "" };
      }

      // For all other errors, surface them
      console.error(
        `Failed to get position data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }

    // Get on-chain pool with options
    let pool;
    try {
      pool = await clmmSdk.Pool.getPool(poolIdSanitized, {
        showTick: true,
        showRewarder: true,
        showPositions: true,
      });

      if (!pool) {
        throw new Error(`Pool ${poolIdSanitized} not found`);
      }
      console.log("Found pool:", poolIdSanitized);
    } catch (error) {
      console.error("Error fetching pool:", error);
      throw new Error(`Pool not found: ${poolIdSanitized}`);
    }

    // Ensure we have the coin types
    const coin_type_a = pool.coin_type_a;
    const coin_type_b = pool.coin_type_b;

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Pool coin types are missing. Cannot proceed with fee collection."
      );
    }

    // IMPROVEMENT: Check if there are any fees to collect first
    try {
      const feeOwed = await clmmSdk.Position.fetchPendingFee({
        coin_type_a,
        coin_type_b,
        pos_id: posId,
      });

      if (feeOwed.amount_a === "0" && feeOwed.amount_b === "0") {
        console.log("No pending fees - nothing to collect");
        return { success: true, digest: "" };
      }

      console.log(
        `Pending fees detected: ${feeOwed.amount_a} / ${feeOwed.amount_b}. Collecting...`
      );
    } catch (error) {
      console.warn("Error checking pending fees:", error);
      // Continue anyway - better to try collecting than miss out on fees
    }

    // Create transaction payload - updated to V2 method name
    let tx;
    try {
      tx = await clmmSdk.Position.collectFeePayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
      });
    } catch (error) {
      console.error("SDK collect fee transaction creation failed:", error);

      // If we get errors with this approach, use a fallback
      // Create transaction block manually
      const txb = new TransactionBlock();

      // Get the correct module path from the SDK config
      const clmmModule =
        clmmSdk.sdkOptions?.cetusModule?.clmm ||
        `${CETUS_MAINNET_ADDRESSES.CLMM_MODULES}::clmm`;

      const configAddress =
        clmmSdk.sdkOptions?.cetusModule?.config ||
        CETUS_MAINNET_ADDRESSES.CONFIG_OBJECT;

      // Create move call directly to the position module
      txb.moveCall({
        target: `${clmmModule}::position::collect_fee`,
        arguments: [
          txb.object(poolIdSanitized),
          txb.object(posId),
          txb.object(configAddress),
          txb.pure(true), // is_immutable
        ],
        typeArguments: [coin_type_a, coin_type_b],
      });

      tx = txb;
    }

    // Set gas budget
    tx.setGasBudget(50000000); // 0.05 SUI

    // Execute transaction
    console.log("Executing fee collection transaction");
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    // Check transaction success and handle potential "unknown" status
    if (res.effects?.status?.status !== "success") {
      const digest = res.digest || "unknown";
      const errorMsg = res.effects?.status?.error;
      console.error(`Fee collection failed with digest: ${digest}`);
      console.error(`Error details: ${errorMsg || "unknown"}`);

      // If error message is empty or "unknown", double-check transaction status on-chain
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
          console.warn(
            `Fee collection transaction digest ${digest} succeeded on-chain despite earlier error`
          );
          return { success: true, digest }; // Treat as success
        }
      }

      // Special handling for empty transaction error from wallet
      if (
        errorMsg &&
        errorMsg.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
      ) {
        console.warn("Fee collection skipped - wallet refused empty TX");
        return { success: true, digest: "" };
      }

      throw new Error(
        `Fee collection failed: ${errorMsg || "unknown"} (Digest: ${digest})`
      );
    }

    console.log("Fee collection transaction successful, digest:", res.digest);

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    console.error("Fee collection failed:", error);

    // Special handling for empty transaction error from wallet
    if (
      error instanceof Error &&
      error.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
    ) {
      console.warn("Fee collection skipped - wallet refused empty TX");
      return { success: true, digest: "" };
    }

    // Only return success for truly closed positions
    if (error instanceof Error && isAlreadyClosedError(error)) {
      return { success: true, digest: "" };
    }

    // Surface specific errors
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes("invalid sui object id")) {
        throw new Error(
          "Invalid position ID format or RPC node error. This position might exist but the node couldn't fetch it correctly."
        );
      } else if (errorMessage.includes("invalid token amounts")) {
        throw new Error(
          "Invalid token amounts error. This is likely due to a formatting issue with the transaction parameters. Please try again."
        );
      }
    }

    throw error;
  }
}

/**
 * Collect rewards from a position.
 * Updated for SDK v2 with proper position verification
 * Fixed to handle string conversions for amount parameters
 */
export async function collectRewards(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }
  const address = wallet.account.address;

  // Set sender address for this operation
  clmmSdk.setSenderAddress(address);

  try {
    console.log(
      `Attempting to collect rewards for position ${positionId} in pool ${poolId}`
    );

    // Sanitize IDs
    const posId = normalizeSuiAddress(positionId.trim());
    const poolIdSanitized = normalizeSuiAddress(poolId.trim());

    // Use getPositionById instead of getPosition - recommended SDK v2 method
    // Disable unnecessary features to reduce errors
    let position;
    try {
      position = await clmmSdk.Position.getPositionById(
        posId,
        /*calculate_rewarder=*/ false,
        /*show_display=*/ false
      );

      if (!position) {
        throw new Error(`Position ${posId} not found`);
      }
    } catch (error) {
      console.warn(`Position verification failed for ${posId}:`, error);

      if (isAlreadyClosedError(error)) {
        return { success: true, digest: "" };
      }

      // For all other errors, surface them
      console.error(
        `Failed to get position data: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      throw error;
    }

    // Get on-chain pool - with options
    let pool;
    try {
      pool = await clmmSdk.Pool.getPool(poolIdSanitized, {
        showTick: true,
        showRewarder: true,
        showPositions: true,
      });

      if (!pool) {
        throw new Error(`Pool ${poolIdSanitized} not found`);
      }
      console.log("Found pool:", poolIdSanitized);
    } catch (error) {
      console.error("Error fetching pool:", error);
      throw new Error(`Pool not found: ${poolIdSanitized}`);
    }

    // Ensure we have the coin types
    const coin_type_a = pool.coin_type_a;
    const coin_type_b = pool.coin_type_b;

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Pool coin types are missing. Cannot proceed with reward collection."
      );
    }

    // Check for rewards with guard for positions_handle
    let rewarder_coin_types: string[] = [];
    let hasNonZeroRewards = false;

    if (pool.positions_handle) {
      try {
        const rewards = await clmmSdk.Rewarder.fetchPosRewardersAmount(
          poolIdSanitized,
          pool.positions_handle,
          posId
        );

        rewarder_coin_types = rewards
          .filter((r: any) => r && r.coin_address)
          .map((r: any) => r.coin_address);

        hasNonZeroRewards = rewards.some(
          (r: any) => r && Number(r.amount_owed) > 0
        );

        console.log(
          `Found ${rewarder_coin_types.length} reward types, ${
            hasNonZeroRewards ? "has" : "no"
          } non-zero rewards`
        );

        if (!hasNonZeroRewards) {
          console.log("No rewards available to claim");
          return {
            success: true,
            digest: "",
          };
        }
      } catch (error) {
        console.error("Error checking rewards:", error);
        throw new Error("Failed to check rewards. Please try again.");
      }
    } else {
      console.warn("Pool has no positions_handle – skip reward query");
      return {
        success: true,
        digest: "",
      };
    }

    if (rewarder_coin_types.length === 0) {
      console.log("No reward types found");
      return {
        success: true,
        digest: "",
      };
    }

    // If we have rewards, collect them - using the correct SDK v2 method name
    try {
      const tx = await clmmSdk.Rewarder.collectRewarderPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
        rewarder_coin_types,
        collect_fee: false, // We're just collecting rewards, not fees
      });

      // Set explicit gas budget
      tx.setGasBudget(50000000); // 0.05 SUI

      const res = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEffects: true, showEvents: true },
      });

      // Check transaction success and handle potential "unknown" status
      if (res.effects?.status?.status !== "success") {
        const digest = res.digest || "unknown";
        const errorMsg = res.effects?.status?.error;
        console.error(`Reward collection failed with digest: ${digest}`);
        console.error(`Error details: ${errorMsg || "unknown"}`);

        // If error message is empty or "unknown", double-check transaction status on-chain
        if (
          digest &&
          (!errorMsg ||
            errorMsg.toLowerCase().includes("unknown") ||
            errorMsg.toLowerCase().includes("timeout"))
        ) {
          if (await verifyTransactionSuccess(digest)) {
            console.warn(
              `Reward collection transaction digest ${digest} succeeded on-chain despite earlier error`
            );
            return { success: true, digest }; // Treat as success
          }
        }

        // Special handling for empty transaction error from wallet
        if (
          errorMsg &&
          errorMsg.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
        ) {
          console.warn("Reward collection skipped - wallet refused empty TX");
          return { success: true, digest: "" };
        }

        throw new Error(
          `Reward collection failed: ${
            errorMsg || "unknown"
          } (Digest: ${digest})`
        );
      }

      console.log("Rewards successfully collected, digest:", res.digest);

      return {
        success: true,
        digest: res.digest || "",
      };
    } catch (error) {
      console.error("Error in reward collection transaction:", error);

      // Special handling for empty transaction error from wallet
      if (
        error instanceof Error &&
        error.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
      ) {
        console.warn("Reward collection skipped - wallet refused empty TX");
        return { success: true, digest: "" };
      }

      // Check for "invalid token amounts" error and provide specific guidance
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("invalid token amounts")
      ) {
        throw new Error(
          "Invalid token amounts error when collecting rewards. This is likely due to a formatting issue with the transaction parameters. Please try again."
        );
      }

      throw new Error("Failed to collect rewards. Transaction error occurred.");
    }
  } catch (error) {
    console.error("Error in collectRewards:", error);

    // Only return success for truly closed positions
    if (error instanceof Error && isAlreadyClosedError(error)) {
      return { success: true, digest: "" };
    }

    throw error;
  }
}

/**
 * Fetch all positions owned by an address.
 * Updated to use SDK v2 methods and properly prioritize NFT ID
 */
export async function getPositions(
  ownerAddress: string
): Promise<Array<{ id: string; poolAddress: string; liquidity: number }>> {
  try {
    // Set sender address for this operation
    clmmSdk.setSenderAddress(ownerAddress);

    // Use the SDK v2 method
    const positions = await clmmSdk.Position.getPositionList(ownerAddress);
    console.log(`Found ${positions.length} positions for ${ownerAddress}`);

    // Process positions to extract useful information
    const processedPositions = positions
      .filter((p) => {
        // Include all positions with "Exists" status, even those with zero liquidity
        return p.position_status === "Exists";
      })
      .map((p) => {
        // Fix: Prioritize nft_id or id over pos_object_id
        return {
          id: p.nft_id || p.id || p.position_id || p.pos_object_id || "",
          poolAddress: p.pool || p.pool_id || "",
          liquidity: Number(p.liquidity) || 0,
        };
      });

    console.log(`Returning ${processedPositions.length} positions`);
    return processedPositions;
  } catch (error) {
    console.error("Error fetching positions:", error);
    return []; // Return empty array instead of throwing
  }
}

/**
 * Get all pools from the Cetus service
 */
export async function getAllPools() {
  try {
    // Set default sender address (needed for some SDK operations)
    if (!clmmSdk.senderAddress) {
      clmmSdk.setSenderAddress("0x0000000000000000000000000000000000000000");
    }

    // Get all pools - updated to use V2 method
    const pools = await clmmSdk.Pool.getPoolsWithPage("all", true);

    // Process the pools to match the expected format
    return pools.map((pool) => {
      return {
        address: pool.address,
        tokenA: pool.symbolA || "Unknown",
        tokenB: pool.symbolB || "Unknown",
        decimalsA: pool.decimalsA || 9,
        decimalsB: pool.decimalsB || 9,
        liquidityUSD: parseFloat(pool.liquidity || "0") || 0,
        volumeUSD: parseFloat(pool.volume_24h || "0") || 0,
        feesUSD:
          parseFloat(pool.volume_24h || "0") *
            parseFloat(pool.fee_rate || "0") || 0,
        apr: parseFloat(pool.apr || "0") || 0,
        dex: "cetus",
        tokenAAddress: pool.coin_type_a,
        tokenBAddress: pool.coin_type_b,
      };
    });
  } catch (error) {
    console.error("Failed to fetch Cetus pools:", error);
    return [];
  }
}

/**
 * Check if a pool is a Kriya pool
 */
export function isKriyaPool(poolAddress: string): boolean {
  if (!poolAddress) return false;

  // Common patterns in Kriya pool addresses
  const kriyaPatterns = ["kriya", "0x2a3b", "0x5a41d", "0x8d88d"];

  return kriyaPatterns.some((pattern) =>
    poolAddress.toLowerCase().includes(pattern.toLowerCase())
  );
}
