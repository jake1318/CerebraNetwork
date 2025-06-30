// Current Date and Time (UTC): 2025-06-29 20:19:51
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
} from "@cetusprotocol/common-sdk";
import type { WalletContextState } from "@suiet/wallet-kit";
import type { PoolInfo } from "./coinGeckoService";
// Use the maintained alias paths
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { SuiClient } from "@mysten/sui.js/client";
import { birdeyeService } from "./birdeyeService";
import BN from "bn.js";

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
 * Open a position and deposit liquidity.
 * Updated for Cetus SDK v2, using only CLMM SDK and safe deposit pattern
 * Always opens a new position instead of reusing existing ones
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

  // Set sender address for this operation
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
      txb.setGasBudget(100000000); // 0.1 SUI

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

      console.log("Bluefin deposit transaction completed:", result);

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
    const baseAmountA = new BN(toBaseUnit(amountX, decimalsA));
    const baseAmountB = new BN(toBaseUnit(amountY, decimalsB));

    console.log(
      `User requested amounts: A=${baseAmountA.toString()}, B=${baseAmountB.toString()} (in base units)`
    );

    // Check if SUI is involved for gas reservation
    const gasReserve = new BN(50_000_000); // 0.05 SUI
    let bnAmountA = baseAmountA;
    let bnAmountB = baseAmountB;

    // Flag to track if balance fetch was successful
    let fetchBalanceSuccess = true;

    // Get the SDK client once for all operations
    const suiClient = clmmSdk.FullClient;

    // Get current wallet balances for validation
    let balanceA = new BN(0);
    let balanceB = new BN(0);

    try {
      // Fetch token A balance
      if (coin_type_a.includes("sui::SUI")) {
        const balanceInfo = await suiClient.getBalance({
          owner: address,
          coinType: "0x2::sui::SUI",
        });
        balanceA = new BN(balanceInfo.totalBalance);
        console.log(`SUI balance: ${balanceA.toString()}`);
      } else {
        const balanceInfo = await suiClient.getBalance({
          owner: address,
          coinType: coin_type_a,
        });
        balanceA = new BN(balanceInfo.totalBalance);
        console.log(`Token A balance: ${balanceA.toString()}`);
      }

      // Fetch token B balance
      if (coin_type_b.includes("sui::SUI")) {
        const balanceInfo = await suiClient.getBalance({
          owner: address,
          coinType: "0x2::sui::SUI",
        });
        balanceB = new BN(balanceInfo.totalBalance);
        console.log(`SUI balance: ${balanceB.toString()}`);
      } else {
        const balanceInfo = await suiClient.getBalance({
          owner: address,
          coinType: coin_type_b,
        });
        balanceB = new BN(balanceInfo.totalBalance);
        console.log(`Token B balance: ${balanceB.toString()}`);
      }
    } catch (error) {
      console.warn("Failed to get wallet balances:", error);
      fetchBalanceSuccess = false;
    }

    // Only adjust amounts if we successfully fetched balances
    if (fetchBalanceSuccess) {
      // First, handle SUI gas reservation for A if needed
      if (
        coin_type_a.includes("sui::SUI") &&
        bnAmountA.add(gasReserve).gt(balanceA)
      ) {
        // Reduce A amount to leave gas, but never go below 0
        bnAmountA = balanceA.sub(gasReserve);
        if (bnAmountA.lt(new BN(0))) bnAmountA = new BN(0);
        console.log(
          `Reserved gas for SUI (A): adjusted A amount to ${bnAmountA.toString()}`
        );
      }

      // Handle SUI gas reservation for B if needed
      if (
        coin_type_b.includes("sui::SUI") &&
        bnAmountB.add(gasReserve).gt(balanceB)
      ) {
        // Reduce B amount to leave gas, but never go below 0
        bnAmountB = balanceB.sub(gasReserve);
        if (bnAmountB.lt(new BN(0))) bnAmountB = new BN(0);
        console.log(
          `Reserved gas for SUI (B): adjusted B amount to ${bnAmountB.toString()}`
        );
      }

      // Cap amounts at available balance
      if (bnAmountA.gt(balanceA)) {
        bnAmountA = balanceA;
        // If A is SUI, we need to ensure we leave gas (double-check after capping)
        if (coin_type_a.includes("sui::SUI")) {
          bnAmountA = bnAmountA.sub(gasReserve);
          if (bnAmountA.lt(new BN(0))) bnAmountA = new BN(0);
        }
        console.log(
          `Capped amount A to available balance: ${bnAmountA.toString()}`
        );
      }

      if (bnAmountB.gt(balanceB)) {
        bnAmountB = balanceB;
        // If B is SUI, we need to ensure we leave gas (double-check after capping)
        if (coin_type_b.includes("sui::SUI")) {
          bnAmountB = bnAmountB.sub(gasReserve);
          if (bnAmountB.lt(new BN(0))) bnAmountB = new BN(0);
        }
        console.log(
          `Capped amount B to available balance: ${bnAmountB.toString()}`
        );
      }
    } else {
      console.log("Skipping balance adjustment due to failed balance fetch");
    }

    // Check if either amount is zero - warn user
    if (bnAmountA.isZero() || bnAmountB.isZero()) {
      console.warn(
        `Warning: One or both token amounts are zero. A=${bnAmountA.toString()}, B=${bnAmountB.toString()}`
      );
      // For tokens with SUI, this could be because they have exactly the minimum for gas
      if (
        (coin_type_a.includes("sui::SUI") && bnAmountA.isZero()) ||
        (coin_type_b.includes("sui::SUI") && bnAmountB.isZero())
      ) {
        throw new Error(
          "Not enough SUI to cover gas fees. Please add more SUI to your wallet or use less SUI in your deposit."
        );
      }
    }

    // Final validation - make sure we're not trying to deposit with negative or zero amounts
    if (bnAmountA.lt(new BN(0)) || bnAmountB.lt(new BN(0))) {
      console.error(
        `Invalid amounts: A=${bnAmountA.toString()}, B=${bnAmountB.toString()}`
      );
      throw new Error(
        "Cannot deposit with negative amounts. Please try again with different values."
      );
    }

    // ALWAYS open a fresh position
    const is_open = true;
    const pos_id = ""; // empty string signals "open-position"

    // Compute ticks
    const tick_spacing = parseInt(pool.tick_spacing) || 60;

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

    // Get current price sqrt
    const curSqrtPrice = new BN(pool.current_sqrt_price);

    // Increase slippage to 1% for safer transactions (from 0.5%)
    const slippage = 0.01; // 1%

    // Fix the token ratio calculation - ALWAYS recalculate the non-fixed token amount
    const fix_amount_a = fixedTokenSide === "A";
    console.log(
      `Creating deposit with fixed token ${fix_amount_a ? "A" : "B"}`
    );

    try {
      // ------------------------------------------------------------------
      // NEW LOGIC – always let the SDK decide the "limit" amount
      // ------------------------------------------------------------------
      if (fix_amount_a) {
        // When token A (USDC) is fixed we *always* re‑compute the limit for B
        const est = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
          tick_lower,
          tick_upper,
          bnAmountA, // fixed side
          /* fix_a = */ true,
          /* by_amount = */ true,
          slippage,
          curSqrtPrice
        );
        // add 1% safety buffer
        bnAmountB = new BN(est.coin_amount_limit_b).muln(101).divn(100);
      } else {
        // Mirror logic when token B is fixed
        const est = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
          tick_lower,
          tick_upper,
          bnAmountB,
          /* fix_a = */ false,
          /* by_amount = */ true,
          slippage,
          curSqrtPrice
        );
        // add 1% safety buffer
        bnAmountA = new BN(est.coin_amount_limit_a).muln(101).divn(100);
      }

      console.log(
        `Final amounts sent to contract: A=${bnAmountA.toString()}, B=${bnAmountB.toString()} (buffered)`
      );

      // 1.3 - Let the SDK build the TransactionBlock
      console.log("Using SDK to build transaction payload");

      // CLMM SDK v2 approach - no fallback needed
      const payload = await clmmSdk.Position.createAddLiquidityFixTokenPayload(
        {
          coin_type_a,
          coin_type_b,
          pool_id: poolId,
          tick_lower: tick_lower.toString(),
          tick_upper: tick_upper.toString(),
          fix_amount_a,
          amount_a: bnAmountA.toString(),
          amount_b: bnAmountB.toString(),
          slippage,
          is_open,
          pos_id,
          rewarder_coin_types: [],
          collect_fee: false,
        },
        {
          slippage,
          cur_sqrt_price: curSqrtPrice,
        }
      );

      // Set higher gas budget
      payload.setGasBudget(110_000_000); // 0.11 SUI

      // 1.4 - Have the wallet sign & execute
      console.log("Sending SDK transaction...");
      const res = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: payload,
        options: { showEffects: true, showEvents: true },
      });

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
        error.message.includes("pool_script_v2")
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
): Promise<{ success: boolean; digests: string[] }> {
  const digests: string[] = [];

  for (const posId of opts.positionIds) {
    if (opts.closePosition) {
      // ---- CLOSE (will always force 100 %)
      const { success, digest } = await closePosition(
        wallet,
        opts.poolId,
        posId
      );
      if (!success) throw new Error(`Close failed for ${posId}`);
      if (digest) digests.push(digest);
    } else {
      // ---- PARTIAL / FULL WITHDRAW, keep NFT
      const { success, digest } = await removeLiquidity(
        wallet,
        opts.poolId,
        posId,
        opts.withdrawPercent,
        opts.collectFees, //      ↓ NEW PARAM
        opts.slippage //      ↓ NEW PARAM
      );
      if (!success) throw new Error(`Withdraw failed for ${posId}`);
      if (digest) digests.push(digest);
    }
  }

  return { success: true, digests };
}

/**
 * Remove a percentage (0–100) of liquidity from a position, collecting fees.
 * Updated for SDK v2
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

  try {
    console.log(
      `Removing ${liquidityPct}% liquidity from position ${positionId} in pool ${poolId}`
    );

    // Fetch position details
    const position = await clmmSdk.Position.getPosition(positionId);
    if (!position || !position.liquidity || position.liquidity === "0") {
      throw new Error("Position has zero liquidity or was not found");
    }

    // Get pool data
    const pool = await clmmSdk.Pool.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    // Ensure we have the coin types
    const coin_type_a = pool.coin_type_a;
    const coin_type_b = pool.coin_type_b;

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Pool coin types are missing. Cannot proceed with removal."
      );
    }

    // Calculate liquidity to remove
    const totalLiquidity = new BN(position.liquidity);
    const removeLiquidity = totalLiquidity.muln(liquidityPct).divn(100);

    if (removeLiquidity.isZero()) {
      throw new Error("No liquidity to withdraw");
    }

    // Calculate minimum expected amounts with slippage protection
    const lowerSqrt = TickMath.tickIndexToSqrtPriceX64(
      position.tick_lower_index
    );
    const upperSqrt = TickMath.tickIndexToSqrtPriceX64(
      position.tick_upper_index
    );
    const curSqrt = new BN(pool.current_sqrt_price);

    const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
      removeLiquidity,
      curSqrt,
      lowerSqrt,
      upperSqrt,
      false
    );

    // Apply custom slippage tolerance
    const slippageTol = new Percentage(
      new BN(Math.round(slippagePc * 100)), // numerator
      new BN(100 * 100) // denominator
    );
    const { tokenMaxA, tokenMaxB } = adjustForCoinSlippage(
      coinAmounts,
      slippageTol,
      false
    );

    // Build transaction payload - updated to V2 method name
    const tx = await clmmSdk.Position.removeLiquidityPayload({
      coin_type_a,
      coin_type_b,
      pool_id: poolId,
      pos_id: positionId,
      delta_liquidity: removeLiquidity.toString(),
      min_amount_a: tokenMaxA.toString(),
      min_amount_b: tokenMaxB.toString(),
      collect_fee: collectFee,
      rewarder_coin_types: [],
    });

    // Set explicit gas budget
    tx.setGasBudget(100000000); // 0.1 SUI

    // Execute transaction
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEvents: true, showEffects: true },
    });

    console.log("Liquidity removal successful:", res.digest);

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    console.error("Error in removeLiquidity:", error);

    // Provide helpful error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes("insufficient") ||
        errorMessage.includes("balance")
      ) {
        throw new Error("Insufficient balance to complete the transaction");
      } else if (errorMessage.includes("not found")) {
        throw new Error(
          "Position or pool not found. It may have been closed already."
        );
      } else if (errorMessage.includes("package object does not exist")) {
        throw new Error(
          "Transaction failed: One of the Cetus package addresses is incorrect. The app may need to be updated to work with the latest Cetus protocol version."
        );
      }
    }

    throw error;
  }
}

/**
 * Withdraw all liquidity, fees and rewards, and close the position.
 * Updated for SDK v2
 */
export async function closePosition(
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
    console.log(`Closing position ${positionId} in pool ${poolId}`);

    // Check if position exists
    let position;
    try {
      position = await clmmSdk.Position.getPosition(positionId);
    } catch (error) {
      console.warn("Position may not exist:", error);
      return { success: true, digest: "" }; // Position doesn't exist, no action needed
    }

    // Get pool info
    const pool = await clmmSdk.Pool.getPool(poolId);
    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    // Ensure we have the coin types
    const coin_type_a = pool.coin_type_a;
    const coin_type_b = pool.coin_type_b;

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Pool coin types are missing. Cannot proceed with closing position."
      );
    }

    // Check if position has liquidity to remove
    let hasLiquidity = false;
    if (position && position.liquidity) {
      const liquidity = new BN(position.liquidity);
      hasLiquidity = !liquidity.isZero();
    }

    if (hasLiquidity) {
      // Calculate minimum amounts with slippage
      const lowerSqrt = TickMath.tickIndexToSqrtPriceX64(
        position.tick_lower_index
      );
      const upperSqrt = TickMath.tickIndexToSqrtPriceX64(
        position.tick_upper_index
      );
      const curSqrt = new BN(pool.current_sqrt_price);

      const coinAmounts = ClmmPoolUtil.getCoinAmountFromLiquidity(
        new BN(position.liquidity),
        curSqrt,
        lowerSqrt,
        upperSqrt,
        false
      );

      // Apply 5% slippage tolerance for closing (more permissive)
      const slippageTol = new Percentage(new BN(5), new BN(100));
      const { tokenMaxA, tokenMaxB } = adjustForCoinSlippage(
        coinAmounts,
        slippageTol,
        false
      );

      // Create transaction to close position - updated to V2 method name
      const closeTx = await clmmSdk.Position.closePositionPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolId,
        pos_id: positionId,
        min_amount_a: tokenMaxA.toString(),
        min_amount_b: tokenMaxB.toString(),
        rewarder_coin_types: [], // Will collect all available rewards
      });

      // Set gas budget
      closeTx.setGasBudget(100000000); // 0.1 SUI

      // Execute transaction
      const closeResult = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: closeTx,
        options: { showEvents: true, showEffects: true },
      });

      console.log("Position closed successfully:", closeResult.digest);

      return {
        success: true,
        digest: closeResult.digest || "",
      };
    } else {
      // Position has no liquidity, just need to close it
      const closeTx = await clmmSdk.Position.closePositionPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolId,
        pos_id: positionId,
        min_amount_a: "0",
        min_amount_b: "0",
        rewarder_coin_types: [],
      });

      // Set gas budget
      closeTx.setGasBudget(100000000); // 0.1 SUI

      // Execute transaction
      const closeResult = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: closeTx,
        options: { showEvents: true, showEffects: true },
      });

      console.log("Empty position closed successfully:", closeResult.digest);

      return {
        success: true,
        digest: closeResult.digest || "",
      };
    }
  } catch (error) {
    console.error("Error in closePosition:", error);

    // Check if this is a "position already closed" error, which we can ignore
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes("not found") ||
        errorMessage.includes("already closed") ||
        (errorMessage.includes("moveabort") && errorMessage.includes("7"))
      ) {
        console.log("Position may have already been closed");
        return {
          success: true,
          digest: "",
        };
      } else if (errorMessage.includes("package object does not exist")) {
        throw new Error(
          "Transaction failed: One of the Cetus package addresses is incorrect. The app may need to be updated to work with the latest Cetus protocol version."
        );
      }
    }

    throw error;
  }
}

/**
 * Collect fees from a position.
 * Updated for SDK v2
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

    // Verify position exists
    let pos;
    try {
      pos = await clmmSdk.Position.getPosition(positionId);
      if (!pos) {
        throw new Error(`Position ${positionId} not found`);
      }
    } catch (error) {
      console.error("Error verifying position:", error);
      throw new Error(`Position verification failed: ${positionId}`);
    }

    // Get on-chain pool
    let pool;
    try {
      pool = await clmmSdk.Pool.getPool(poolId);
      if (!pool) {
        throw new Error(`Pool ${poolId} not found`);
      }
      console.log("Found pool:", poolId);
    } catch (error) {
      console.error("Error fetching pool:", error);
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Ensure we have the coin types
    const coin_type_a = pool.coin_type_a;
    const coin_type_b = pool.coin_type_b;

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Pool coin types are missing. Cannot proceed with fee collection."
      );
    }

    // Create transaction payload - updated to V2 method name
    let tx;
    try {
      tx = await clmmSdk.Position.collectFeePayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolId,
        pos_id: positionId,
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
          txb.object(poolId),
          txb.object(positionId),
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
      options: { showEvents: true, showEffects: true },
    });

    console.log("Fee collection transaction successful:", res.digest);

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    console.error("Fee collection failed:", error);

    // Provide user-friendly error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes("insufficient") ||
        errorMessage.includes("balance")
      ) {
        throw new Error("Insufficient balance to complete the transaction.");
      } else if (
        errorMessage.includes("gas") ||
        errorMessage.includes("budget")
      ) {
        throw new Error("Gas budget error. Please try again later.");
      } else if (
        errorMessage.includes("position") &&
        errorMessage.includes("not found")
      ) {
        throw new Error("Position no longer exists or has been closed.");
      } else if (errorMessage.includes("package object does not exist")) {
        throw new Error(
          "Transaction failed: One of the Cetus package addresses is incorrect. The app may need to be updated to work with the latest Cetus protocol version."
        );
      }
    }

    throw error;
  }
}

/**
 * Collect rewards from a position.
 * Updated for SDK v2
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

    // Verify position exists
    let pos;
    try {
      pos = await clmmSdk.Position.getPosition(positionId);
      if (!pos) {
        throw new Error(`Position ${positionId} not found`);
      }
    } catch (error) {
      console.error("Error verifying position:", error);
      throw new Error(`Position verification failed: ${positionId}`);
    }

    // Get on-chain pool
    let pool;
    try {
      pool = await clmmSdk.Pool.getPool(poolId);
      if (!pool) {
        throw new Error(`Pool ${poolId} not found`);
      }
      console.log("Found pool:", poolId);
      console.log("Pool positions handle:", pool.positions_handle);
    } catch (error) {
      console.error("Error fetching pool:", error);
      throw new Error(`Pool not found: ${poolId}`);
    }

    // Ensure we have the coin types
    const coin_type_a = pool.coin_type_a;
    const coin_type_b = pool.coin_type_b;

    if (!coin_type_a || !coin_type_b) {
      throw new Error(
        "Pool coin types are missing. Cannot proceed with reward collection."
      );
    }

    // Check for rewards - updated to V2 method name
    let rewarder_coin_types = [];
    try {
      const rewards = await clmmSdk.Rewarder.fetchPosRewardersAmount(
        poolId,
        pool.positions_handle,
        positionId
      );

      rewarder_coin_types = rewards
        .filter((r: any) => r && Number(r.amount_owed) > 0)
        .map((r: any) => r.coin_address);

      console.log(
        `Found ${rewarder_coin_types.length} reward types with non-zero amounts`
      );
    } catch (error) {
      console.error("Error checking rewards:", error);
      throw new Error("Failed to check rewards. Please try again.");
    }

    if (rewarder_coin_types.length === 0) {
      console.log("No rewards available to claim");
      return {
        success: true,
        digest: "",
      };
    }

    // If we have rewards, collect them - updated to V2 method name
    try {
      const tx = await clmmSdk.Rewarder.collectRewarderPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolId,
        pos_id: positionId,
        rewarder_coin_types,
        collect_fee: false, // We're just collecting rewards, not fees
      });

      // Set explicit gas budget
      tx.setGasBudget(50000000); // 0.05 SUI

      const res = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        options: { showEvents: true, showEffects: true },
      });

      console.log("Rewards successfully collected:", res.digest);

      return {
        success: true,
        digest: res.digest || "",
      };
    } catch (error) {
      console.error("Error in reward collection transaction:", error);
      throw new Error("Failed to collect rewards. Transaction error occurred.");
    }
  } catch (error) {
    console.error("Error in collectRewards:", error);
    throw error;
  }
}

/**
 * Fetch all positions owned by an address.
 */
export async function getPositions(
  ownerAddress: string
): Promise<Array<{ id: string; poolAddress: string; liquidity: number }>> {
  try {
    // Set sender address for this operation
    clmmSdk.setSenderAddress(ownerAddress);

    const positions = await clmmSdk.Position.getPositionList(ownerAddress);
    console.log(`Found ${positions.length} positions for ${ownerAddress}`);

    // Process positions to extract useful information
    const processedPositions = positions
      .filter((p) => {
        // Filter out positions with zero liquidity
        const liquidity = Number(p.liquidity) || 0;
        return liquidity > 0 && p.position_status === "Exists";
      })
      .map((p) => {
        return {
          id: p.pos_object_id || p.id || p.position_id || p.nft_id || "",
          poolAddress: p.pool || p.pool_id || "",
          liquidity: Number(p.liquidity) || 0,
        };
      });

    console.log(`Returning ${processedPositions.length} active positions`);
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
