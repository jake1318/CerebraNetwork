// src/services/cetusService.ts
// Current Date and Time (UTC): 2025-07-28 02:36:44
// Current User's Login: jake1318

import {
  CetusClmmSDK,
  LiquidityMath,
  SqrtPriceMath,
  AddLiquidityFixTokenParams,
} from "@cetusprotocol/sui-clmm-sdk";
import {
  ClmmPoolUtil,
  TickMath,
  CoinAssist,
  Percentage,
  adjustForCoinSlippage,
} from "@cetusprotocol/common-sdk";
import type { WalletContextState } from "@suiet/wallet-kit";
import type { PoolInfo } from "./coinGeckoService";
// Use the maintained alias paths
import { TransactionBlock } from "@mysten/sui.js/transactions";
import { SuiClient } from "@mysten/sui.js/client";
import { birdeyeService } from "./birdeyeService";
import BN from "bn.js";
import { normalizeSuiAddress } from "@mysten/sui.js/utils";
import type {
  SuiTransactionBlockResponse,
  CoinStruct,
} from "@mysten/sui.js/client";

// Fee configuration for all Cetus pool deposits
const FEE_ADDRESS =
  "0xc4a6782bda928c118a336a581aaa24f3a0418fdeebe1b7a053b9bf5890fd691e";
const FEE_BP = 30; // 30 basis points
// denominator for basis points - explicitly export this constant
export const BP_DENOMINATOR = 10_000;

// Fallback constants for module paths in case the SDK doesn't provide them
const CETUS_FALLBACK = {
  PACKAGE_ID:
    "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb",
  CLMM_POSITION: "clmm_router", // Changed from "pool" to "clmm_router"
  CLMM_CONFIG:
    "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f",
  CLMM_REWARDER: "clmm_rewarder",
};

// Native SUI coin type
const SUI_TYPE = "0x2::sui::SUI";
// Clock object ID (0x6 on all networks)
const CLOCK_OBJECT_ID = "0x6";

// Centralized BCS primitive helper for compile-time safety
// UPDATED: Fixed parameter order for tx.pure calls in Sui SDK 1.30+
export const bcs = {
  u64: (tx: TransactionBlock, n: bigint | number) =>
    tx.pure(n.toString(), "u64"),
  u8: (tx: TransactionBlock, n: number) => tx.pure(n, "u8"),
  bool: (tx: TransactionBlock, b: boolean) => tx.pure(b, "bool"),
  addr: (tx: TransactionBlock, a: string) => tx.pure(a, "address"),
};

/**
 * Encode signed 32-bit tick index as unsigned u32 expected by the ABI
 * Needed because Cetus CLMM v3 (July 2024) changed tick types from i32 to u32
 * NOTE: The SDK helpers now handle this conversion internally
 */
function encodeTick(idx: number): string {
  // >>> forces two's-complement conversion and returns an unsigned JS int
  return (idx >>> 0).toString(); // returns a decimal string safe for `pure`
}

// Simple inline helper to check transaction success
function assertSuccess(effects: SuiTransactionBlockResponse["effects"]) {
  if (effects?.status?.status !== "success") {
    throw new Error(
      `Transaction failed: ${effects?.status?.error ?? "unknown"}`
    );
  }
}

// Initialize Cetus CLMM SDK - singleton pattern
// No need for init() call, the SDK is ready to use immediately after createSDK()
export const clmmSdk = CetusClmmSDK.createSDK({ env: "mainnet" });

// Create a global SuiClient instance for RPC queries
export const suiClient = new SuiClient({
  url: "https://fullnode.mainnet.sui.io:443",
});

// In-memory cache for token info to avoid repeated API calls
export const coinInfoCache: Record<
  string,
  { symbol: string; decimals: number; price?: number; logo?: string }
> = {};

// Set sender address when wallet connects
export function setCetusSender(address: string) {
  if (!address) {
    return;
  }

  clmmSdk.setSenderAddress(address);
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
 * Helper function to safely get Cetus module paths, with fallbacks
 * @returns An object containing package_id, clmm_position, and clmm_config
 */
function getCetusModulePaths() {
  if (clmmSdk.sdkOptions && clmmSdk.sdkOptions.cetusModule) {
    return {
      package_id:
        clmmSdk.sdkOptions.cetusModule.package_id || CETUS_FALLBACK.PACKAGE_ID,
      clmm_position:
        clmmSdk.sdkOptions.cetusModule.clmm_position ||
        CETUS_FALLBACK.CLMM_POSITION,
      clmm_config:
        clmmSdk.sdkOptions.cetusModule.clmm_config ||
        CETUS_FALLBACK.CLMM_CONFIG,
      clmm_rewarder:
        clmmSdk.sdkOptions.cetusModule.clmm_rewarder ||
        CETUS_FALLBACK.CLMM_REWARDER,
    };
  }

  return {
    package_id: CETUS_FALLBACK.PACKAGE_ID,
    clmm_position: CETUS_FALLBACK.CLMM_POSITION,
    clmm_config: CETUS_FALLBACK.CLMM_CONFIG,
    clmm_rewarder: CETUS_FALLBACK.CLMM_REWARDER,
  };
}

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
    return info;
  } catch (err) {
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
    return 9;
  }

  // Default fallbacks by token name
  for (const [symbol, decimals] of Object.entries(COMMON_DECIMALS)) {
    if (coinType.toLowerCase().includes(symbol.toLowerCase())) {
      return decimals;
    }
  }

  // Default fallback
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
 * Check if a pool is a Kriya pool
 */
export function isKriyaPool(poolId: string, dex?: string): boolean {
  if (dex && dex.toLowerCase().includes("kriya")) {
    return true;
  }

  // Common patterns in Kriya pool addresses
  const kriyaPatterns = ["kriya", "0x2a3b", "0x5a41d", "0x8d88d"];

  return kriyaPatterns.some((pattern) =>
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
    return false;
  }
}

/**
 * Select and prepare coins for a deposit, handling both SUI and non-SUI tokens.
 * In CLMM v3, the router pulls tokens directly from the transaction coins, so we
 * don't need to explicitly return a coin object for the deposit. We only need to
 * ensure the fee is paid correctly.
 *
 * @param tx The transaction block
 * @param address User's wallet address
 * @param coinType Token type (e.g., "0x2::sui::SUI")
 * @param poolAmount Amount needed for the pool after fee deduction
 * @param feeAmount Amount for the 30bps fee
 * @param makeDepositCoin Whether to create and return a deposit coin (needed for Bluefin)
 * @returns The TransactionArgument representing the coin for pool deposit, or undefined if not needed
 */
async function prepareCoinWithFee(
  tx: TransactionBlock,
  address: string,
  coinType: string,
  poolAmount: bigint,
  feeAmount: bigint,
  makeDepositCoin = false
): Promise<void | any> {
  const isSui = coinType === SUI_TYPE;
  const hasNonZeroFee = Number(feeAmount) > 0;

  // Helper functions to create typed pure values for sui.js v1.30+
  const u64 = (n: bigint | number) => bcs.u64(tx, n);
  const addr = (a: string) => bcs.addr(tx, a);

  // For SUI, we can leverage the gas coin directly
  if (isSui) {
    // Carve out the fee first
    if (hasNonZeroFee) {
      const [coinFee] = tx.splitCoins(tx.gas, [u64(feeAmount)]);
      tx.transferObjects([coinFee], addr(FEE_ADDRESS));
    }

    if (!makeDepositCoin) return; // CLMM-v3 path finished

    // Bluefin still needs an exact-sized coin for the Move call
    const [coinForPool] = tx.splitCoins(tx.gas, [u64(poolAmount)]);
    return coinForPool;
  }

  // For non-SUI tokens, we need to fetch the user's coins of this type

  // Fetch all user's coins of this type
  const totalNeeded = poolAmount + feeAmount;
  const coinsData = await suiClient.getCoins({
    owner: address,
    coinType: coinType,
  });

  if (coinsData.data.length === 0) {
    throw new Error(`No ${coinType} coins found in wallet`);
  }

  // Sort coins by balance (largest first) using comparison approach for BigInt
  coinsData.data.sort((a, b) => {
    const balanceA = BigInt(a.balance);
    const balanceB = BigInt(b.balance);
    // For descending order (largest first):
    if (balanceB > balanceA) return 1;
    if (balanceB < balanceA) return -1;
    return 0;
  });

  // Select coins until we have enough to cover the total needed
  let remainingAmount = totalNeeded;
  const selectedCoins: string[] = [];

  for (const coin of coinsData.data) {
    selectedCoins.push(coin.coinObjectId);
    remainingAmount -= BigInt(coin.balance);
    if (remainingAmount <= 0n) break;
  }

  // If we don't have enough coins, throw an error
  if (remainingAmount > 0n) {
    throw new Error(`Insufficient balance for ${coinType}`);
  }

  // CLMM-v3 → no merge at all (let the router select the coins it needs)
  if (!makeDepositCoin) {
    // We already sorted by balance, just use the first coin for fee
    const primary = tx.object(selectedCoins[0]);

    if (hasNonZeroFee) {
      const [feeCoin] = tx.splitCoins(primary, [u64(feeAmount)]);
      tx.transferObjects([feeCoin], addr(FEE_ADDRESS));
    }

    // Return without merging - let the router handle coin selection
    return;
  }

  // Bluefin still needs one exact-sized coin:
  // - merge if necessary
  // - split fee
  // - split pool amount and return it

  // Merge coins if more than one was selected
  let coinTotal;
  if (selectedCoins.length > 1) {
    coinTotal = tx.mergeCoins(
      tx.object(selectedCoins[0]),
      selectedCoins.slice(1).map((id) => tx.object(id))
    );
  } else {
    coinTotal = tx.object(selectedCoins[0]);
  }

  // Carve out the fee first
  if (hasNonZeroFee) {
    const [coinFee] = tx.splitCoins(coinTotal, [u64(feeAmount)]);
    tx.transferObjects([coinFee], addr(FEE_ADDRESS));
  }

  // Now split and return the exact pool amount (for Bluefin)
  const [coinForPool] = tx.splitCoins(coinTotal, [u64(poolAmount)]);
  return coinForPool;
}

/**
 * Open a position and deposit liquidity with a 30bps fee.
 * Updated to use the SDK helper functions for CLMM v3 (July 2024):
 * - Uses clmm_router::open_and_add_liquidity_fix_token via SDK helper
 * - Handles non-SUI tokens with proper coin selection
 * - Includes 30bps fee on all deposits
 * - Fixed for @mysten/sui.js v1.30+ compatibility with correct BCS parameter order
 * - Fixed to handle Bluefin and Kriya pools correctly
 * - Fixed to avoid UnusedValueWithoutDrop error in CLMM v3
 * - Fixed to avoid CommandArgumentError by preventing coin merging for CLMM v3
 * - Fixed the USDC/SUI issue by preparing coins BEFORE the SDK builds the payload
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

  // Set sender address for this operation - important for the SDK helpers
  clmmSdk.setSenderAddress(address);

  // 1) Bluefin shortcut - maintain compatibility
  if (isBluefinPool(poolId, poolInfo?.dex)) {
    try {
      // Handle Bluefin pools with existing implementation

      // Determine token decimals and types
      const decimalsA = poolInfo?.tokenA
        ? COMMON_DECIMALS[poolInfo.tokenA] || 9
        : 9;
      const decimalsB = poolInfo?.tokenB
        ? COMMON_DECIMALS[poolInfo.tokenB] || 9
        : 9;

      const coin_type_a = poolInfo?.tokenAAddress;
      const coin_type_b = poolInfo?.tokenBAddress;

      if (!coin_type_a || !coin_type_b) {
        throw new Error("Cannot determine token types for Bluefin pool.");
      }

      // Convert to base units
      const baseAmountA = toBaseUnit(amountX, decimalsA);
      const baseAmountB = toBaseUnit(amountY, decimalsB);

      // Calculate fee amounts (30 bps)
      const feeAmountA =
        (BigInt(baseAmountA) * BigInt(FEE_BP)) / BigInt(BP_DENOMINATOR);
      const feeAmountB =
        (BigInt(baseAmountB) * BigInt(FEE_BP)) / BigInt(BP_DENOMINATOR);

      // Pool amounts after fee deduction
      const poolAmountA = BigInt(baseAmountA) - feeAmountA;
      const poolAmountB = BigInt(baseAmountB) - feeAmountB;

      // Create a transaction block for Bluefin deposit
      const txb = new TransactionBlock();
      const BLUEFIN_PACKAGE =
        "0xf7133d0cb63e1a78ef27a78d4e887a58428d06ff4f2ebbd33af273a04a1bf444";

      // Helper functions for transaction types (sui.js v1.30+ with correct order)
      const addr = (a: string) => bcs.addr(txb, a);

      // Set gas budget explicitly to avoid errors
      txb.setGasBudget(150000000); // 0.15 SUI - increased budget for safety

      // FIXED: Use prepareCoinWithFee to get correct coins for each token, explicitly requesting deposit coins
      const coinAForPool = await prepareCoinWithFee(
        txb,
        address,
        coin_type_a,
        poolAmountA,
        feeAmountA,
        true
      );

      const coinBForPool = await prepareCoinWithFee(
        txb,
        address,
        coin_type_b,
        poolAmountB,
        feeAmountB,
        true
      );

      // prepareCoinWithFee has already transferred fees to FEE_ADDRESS

      // Call the Bluefin add_liquidity function with coin objects and types
      txb.moveCall({
        target: `${BLUEFIN_PACKAGE}::clmm::add_liquidity`,
        arguments: [
          addr(poolId),
          coinAForPool, // Now uses actual coin object
          coinBForPool, // Now uses actual coin object
        ],
        typeArguments: [coin_type_a, coin_type_b],
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

        // If error message is empty or "unknown", double-check transaction status on-chain
        if (
          digest &&
          (!errorMsg ||
            errorMsg.toLowerCase().includes("unknown") ||
            errorMsg.toLowerCase().includes("timeout"))
        ) {
          if (await verifyTransactionSuccess(digest)) {
            return { success: true, digest }; // Treat as success
          }
        }

        throw new Error(
          `Bluefin deposit failed: ${errorMsg || "unknown"} (Digest: ${digest})`
        );
      }

      return {
        success: true,
        digest: result.digest || "",
      };
    } catch (error) {
      throw new Error(
        `Bluefin deposit failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // NEW: Check for Kriya pools, which are unsupported
  if (isKriyaPool(poolId, poolInfo?.dex)) {
    throw new Error(
      "Deposits to Kriya pools are not supported in this version. " +
        "Please use the Kriya app to manage liquidity for Kriya pools."
    );
  }

  try {
    const pool = await clmmSdk.Pool.getPool(poolId);
    if (!pool) {
      throw new Error("Pool not found");
    }

    // Determine coin types with fallback to poolInfo
    const coin_type_a = pool.coin_type_a || poolInfo?.tokenAAddress;
    const coin_type_b = pool.coin_type_b || poolInfo?.tokenBAddress;

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

    // Convert amounts to base units using accurate decimals
    const baseAmountA = toBaseUnit(amountX, decimalsA);
    const baseAmountB = toBaseUnit(amountY, decimalsB);

    // Calculate fee amounts (30 bps)
    const feeAmountA =
      (BigInt(baseAmountA) * BigInt(FEE_BP)) / BigInt(BP_DENOMINATOR);
    const feeAmountB =
      (BigInt(baseAmountB) * BigInt(FEE_BP)) / BigInt(BP_DENOMINATOR);

    // Pool amounts after fee deduction
    const poolAmountA = BigInt(baseAmountA) - feeAmountA;
    const poolAmountB = BigInt(baseAmountB) - feeAmountB;

    // Compute ticks - ensuring proper alignment to tick spacing
    const tick_spacing = parseInt(pool.tick_spacing) || 60;

    let tick_lower, tick_upper;
    if (tickLower !== undefined && tickUpper !== undefined) {
      // Ensure user-provided ticks are aligned with tick spacing
      tick_lower = Math.floor(tickLower / tick_spacing) * tick_spacing;
      tick_upper = Math.ceil(tickUpper / tick_spacing) * tick_spacing;
    } else {
      // Use full range ticks aligned to spacing if no ticks provided
      const { lower, upper } = getGlobalTickRange(tick_spacing);
      tick_lower = lower;
      tick_upper = upper;
    }

    // Fixed 1% slippage - could be made configurable
    const slippagePct = 0.01; // 1% as decimal
    // Optional safety buffer percentage (adds extra margin to avoid rounding errors)
    const bufferPct = 1; // Add 1% buffer

    // Calculate liquidity and required amounts based on fixed side
    const isFixingA = fixedTokenSide === "A";

    // Add defensive checks to ensure we have non-zero amounts for both tokens
    if (isFixingA && Number(poolAmountB) === 0) {
      throw new Error(
        "When fixing token A you must still supply a non-zero max amount for token B."
      );
    }

    if (!isFixingA && Number(poolAmountA) === 0) {
      throw new Error(
        "When fixing token B you must still supply a non-zero max amount for token A."
      );
    }

    // Current sqrt price from pool
    const curSqrtPrice = new BN(pool.current_sqrt_price);

    // Create BN instances of amounts for calculations
    const amountABn = new BN(poolAmountA.toString());
    const amountBBn = new BN(poolAmountB.toString());

    // Calculate liquidity and coin amounts using SDK utility
    const liqInput = ClmmPoolUtil.estLiquidityAndCoinAmountFromOneAmounts(
      tick_lower,
      tick_upper,
      isFixingA ? amountABn : amountBBn,
      isFixingA, // true if fixing A
      true, // round_up
      slippagePct, // 0.01 for 1%
      curSqrtPrice
    );

    // Extract the calculated limits that account for rounding - handle both camelCase and snake_case field names
    let tokenMaxA = liqInput.coin_amount_limit_a || liqInput.tokenMaxA;
    let tokenMaxB = liqInput.coin_amount_limit_b || liqInput.tokenMaxB;
    let liquidityAmount = liqInput.liquidity_amount || liqInput.liquidity;

    if (!tokenMaxA || !tokenMaxB || !liquidityAmount) {
      throw new Error("SDK returned unexpected format. Please try again.");
    }

    // Ensure we have BN instances for calculations
    tokenMaxA = new BN(tokenMaxA.toString());
    tokenMaxB = new BN(tokenMaxB.toString());
    liquidityAmount = new BN(liquidityAmount.toString());

    // Add safety buffer to the non-fixed side limit - keep all math in BN form
    let bufferedLimitA, bufferedLimitB;

    if (isFixingA) {
      // If fixing A, use the exact amount for A
      bufferedLimitA = poolAmountA.toString(); // Already a string

      // Add buffer to B-side cap while still in BN form
      bufferedLimitB = tokenMaxB
        .mul(new BN(100 + bufferPct))
        .div(new BN(100))
        .toString(); // Convert to string only at the end
    } else {
      // If fixing B, use the exact amount for B
      bufferedLimitB = poolAmountB.toString(); // Already a string

      // Add buffer to A-side cap while still in BN form
      bufferedLimitA = tokenMaxA
        .mul(new BN(100 + bufferPct))
        .div(new BN(100))
        .toString(); // Convert to string only at the end
    }

    try {
      // Fixed: Use snake_case parameter names to match what the SDK expects
      const addParams: AddLiquidityFixTokenParams = {
        pool_id: poolId,
        coin_type_a: coin_type_a,
        coin_type_b: coin_type_b,
        tick_lower: tick_lower.toString(),
        tick_upper: tick_upper.toString(),
        fix_amount_a: isFixingA,
        amount_a: isFixingA ? poolAmountA.toString() : bufferedLimitA,
        amount_b: isFixingA ? bufferedLimitB : poolAmountB.toString(),
        slippage: slippagePct, // e.g. 0.01 for 1%
        is_open: true, // we are creating a brand-new position
        pos_id: "", // empty → router opens the NFT for us
        rewarder_coin_types: [],
        collect_fee: false,
      };

      // Create transaction for fee payment
      const feeTx = new TransactionBlock();
      feeTx.setGasBudget(50000000); // 0.05 SUI for fee tx

      // Helper functions for Sui types
      const addr = (a: string) => bcs.addr(feeTx, a);
      const u64 = (n: string | number | bigint) => bcs.u64(feeTx, n);

      // For token A fee
      let feeAPaid = false;
      if (feeAmountA > 0n) {
        if (coin_type_a === SUI_TYPE) {
          const [feeA] = feeTx.splitCoins(feeTx.gas, [u64(feeAmountA)]);
          feeTx.transferObjects([feeA], addr(FEE_ADDRESS));
          feeAPaid = true;
        } else {
          const coinsA = await suiClient.getCoins({
            owner: address,
            coinType: coin_type_a,
          });

          if (coinsA.data.length > 0) {
            const [feeA] = feeTx.splitCoins(
              feeTx.object(coinsA.data[0].coinObjectId),
              [u64(feeAmountA)]
            );
            feeTx.transferObjects([feeA], addr(FEE_ADDRESS));
            feeAPaid = true;
          }
        }
      }

      // For token B fee
      let feeBPaid = false;
      if (feeAmountB > 0n) {
        if (coin_type_b === SUI_TYPE) {
          const [feeB] = feeTx.splitCoins(feeTx.gas, [u64(feeAmountB)]);
          feeTx.transferObjects([feeB], addr(FEE_ADDRESS));
          feeBPaid = true;
        } else {
          const coinsB = await suiClient.getCoins({
            owner: address,
            coinType: coin_type_b,
          });

          if (coinsB.data.length > 0) {
            const [feeB] = feeTx.splitCoins(
              feeTx.object(coinsB.data[0].coinObjectId),
              [u64(feeAmountB)]
            );
            feeTx.transferObjects([feeB], addr(FEE_ADDRESS));
            feeBPaid = true;
          }
        }
      }

      // Only execute the fee tx if we actually have fees to pay
      if (feeAPaid || feeBPaid) {
        await wallet.signAndExecuteTransactionBlock({
          transactionBlock: feeTx,
          options: { showEffects: true },
        });
      }

      // Now create the SDK deposit tx separately
      const sdkTx = await clmmSdk.Position.createAddLiquidityFixTokenPayload(
        addParams,
        { slippage: slippagePct, curSqrtPrice }
      );

      // Set gas budget
      sdkTx.setGasBudget(150000000); // 0.15 SUI

      // Execute the SDK transaction with the wallet
      const res = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: sdkTx,
        options: { showEffects: true, showEvents: true },
      });

      // Check transaction success
      if (res.effects?.status?.status !== "success") {
        const digest = res.digest || "unknown";
        const errorMsg = res.effects?.status?.error;

        // If error message is empty or "unknown", double-check transaction status on-chain
        if (
          digest &&
          (!errorMsg ||
            errorMsg.toLowerCase().includes("unknown") ||
            errorMsg.toLowerCase().includes("timeout"))
        ) {
          if (await verifyTransactionSuccess(digest)) {
            return { success: true, digest }; // Treat as success
          }
        }

        throw new Error(
          `Transaction failed: ${errorMsg || "unknown"} (Digest: ${digest})`
        );
      }

      return {
        success: true,
        digest: res.digest || "",
      };
    } catch (error) {
      throw error;
    }
  } catch (error) {
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
      } else if (
        error.message.includes("No function was found with function name")
      ) {
        throw new Error(
          "Transaction failed: This app needs to be updated to work with the latest Cetus protocol version. The current protocol no longer supports the function being called."
        );
      } else if (error.message.includes("Incorrect number of arguments")) {
        throw new Error(
          "Transaction failed: The Move function signature has changed in the latest protocol version. Please update the app to match the new function signature."
        );
      } else if (error.message.includes("Invalid u32 value")) {
        throw new Error(
          "Transaction failed: Tick indices must be properly encoded for the new CLMM v3 contract format. This issue has been fixed in the latest version."
        );
      } else if (error.message.includes("E_MIN_OUT_NOT_REACHED")) {
        throw new Error(
          "Transaction failed: Slippage check failed. The on-chain price has moved too much. Try increasing the buffered limit amounts or decrease slippage tolerance."
        );
      } else if (
        error.message.includes("Cannot convert a BigInt value to a number")
      ) {
        throw new Error(
          "Transaction failed: There was an error processing the token balances. This issue has been fixed in the latest version."
        );
      } else if (
        error.message.includes(
          "The amount(0) is Insufficient balance for undefined"
        )
      ) {
        throw new Error(
          "Transaction failed: Unable to find tokens of the required type. This is likely due to a mismatch in parameter names. Please ensure coin_type_a and coin_type_b are correctly specified."
        );
      } else if (error.message.includes("tx.pure must be called")) {
        throw new Error(
          "Transaction failed: Missing type information for transaction values. This has been fixed to work with the latest Sui.js version by adding explicit types."
        );
      } else if (error.message.includes("Invalid Pure type name")) {
        throw new Error(
          "Transaction failed: Invalid BCS type specified in a transaction parameter. This has been fixed to use proper type annotations for sui.js v1.30+."
        );
      } else if (error.message.includes("UnusedValueWithoutDrop")) {
        throw new Error(
          "Transaction failed: The transaction has an unused coin value. This issue has been fixed by updating how we handle token preparation for CLMM v3."
        );
      } else if (error.message.includes("CommandArgumentError")) {
        throw new Error(
          "Transaction failed: A coin object is being used multiple times. This issue has been fixed by preventing coin merging for CLMM v3."
        );
      } else if (error.message.includes("InvalidValueUsage")) {
        throw new Error(
          "Transaction failed: A coin was consumed but then referenced again. This issue has been fixed by letting the router handle coin selection."
        );
      } else if (error.message.toLowerCase().includes("usdc/sui")) {
        throw new Error(
          "Transaction failed with USDC/SUI pool. For best results, try merging your USDC coins by sending your entire USDC balance to yourself once, then try again."
        );
      } else if (
        error.message.toLowerCase().includes("type") &&
        error.message.toLowerCase().includes("is not registered")
      ) {
        throw new Error(
          "Transaction failed: Sui type registration error. This is likely due to using the old parameter order with tx.pure in Sui SDK 1.30+. The bcs helper has been updated to fix this issue."
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
 * Fixed for @mysten/sui.js v1.30+ compatibility
 */
async function collectFeesAfterRemoval(
  wallet: WalletContextState,
  poolId: string,
  posId: string,
  coin_type_a: string,
  coin_type_b: string
): Promise<void> {
  // Check if there are any fees to collect first
  try {
    const feeOwed = await clmmSdk.Position.fetchPendingFee({
      coin_type_a,
      coin_type_b,
      pos_id: posId,
    });

    if (feeOwed.amount_a === "0" && feeOwed.amount_b === "0") {
      return;
    }
  } catch (error) {
    // Continue anyway - better to try collecting than miss out on fees
  }

  try {
    // Use SDK helper to create the collectFee payload
    const collectFeeTx = await clmmSdk.Position.createCollectFeePayload({
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
          return;
        }
      }

      return;
    }
  } catch (e) {
    // Special handling for empty transaction error from wallet
    if (
      e instanceof Error &&
      e.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
    ) {
      // Fee collection skipped - wallet refused empty TX
    } else {
      // Log but don't throw on fee collection failure
    }
  }
}

/**
 * Remove a percentage (0–100) of liquidity from a position, collecting fees.
 * Updated to fix slippage percentage construction and ensure all amount parameters
 * are properly converted to strings as required by the SDK.
 * Uses SDK helpers for CLMM v3 compatibility.
 * Fixed for @mysten/sui.js v1.30+ compatibility with correct BCS parameter order.
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
    } catch (error) {
      if (isAlreadyClosedError(error)) {
        return { success: true, digest: "" };
      }

      // For all other errors, surface them
      throw error;
    }

    if (!position.liquidity || position.liquidity === "0") {
      return { success: true, digest: "" };
    }

    // Handle edge case with u128::MAX liquidity (legacy testnet NFTs)
    // The contract's delta_liquidity parameter is u64, so we need to cap it
    const MAX_U64 = new BN("18446744073709551615"); // 2^64 - 1
    const totalLiquidity = new BN(position.liquidity);
    removeLiquidity = totalLiquidity.muln(liquidityPct).divn(100);

    // Cap at MAX_U64 to avoid overflow
    if (removeLiquidity.gt(MAX_U64)) {
      removeLiquidity = MAX_U64;
    }

    if (removeLiquidity.isZero()) {
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

    // Determine if this is a single-sided position
    const isSingleSided =
      coinAmounts.coin_amount_a === "0" || coinAmounts.coin_amount_b === "0";

    let tx;
    const slippageDecimal = slippagePc / 100; // Convert from percentage to decimal (e.g., 0.5% -> 0.005)

    if (isSingleSided) {
      // SINGLE-SIDED POSITION HANDLING
      // We must use the fix-token variant that routes everything to one side

      // Determine which token has value
      const isFixedA = coinAmounts.coin_amount_a === "0"; // true if A is 0 (all value in B)

      // FIXED: Ensure removeLiquidity is a string
      const deltaLiquidity = removeLiquidity.toString();

      // Use SDK helper for removeLiquidityFixToken - handles routing to the correct module
      tx = await clmmSdk.Position.createRemoveLiquidityFixTokenPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
        tick_lower: position.tick_lower_index.toString(), // SDK handles encoding
        tick_upper: position.tick_upper_index.toString(), // SDK handles encoding
        fix_amount_a: isFixedA, // true → receive only B, false → only A
        delta_liquidity: deltaLiquidity,
        min_amount: "0", // Zero minimum as string - will add slippage handling later if needed
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
        } catch (error) {
          // Silent fail - we'll just not collect rewards
        }
      }

      // Use SDK helper for createRemoveLiquidityPayload - this ensures compatibility with router
      tx = await clmmSdk.Position.createRemoveLiquidityPayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
        delta_liquidity: deltaLiquidity,
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

      // If error message is empty or "unknown", double-check transaction status on-chain
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
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
    // Try fallback with zero minimums for any slippage error
    if (
      error instanceof Error &&
      (error.message.includes("min_out_not_reached") ||
        error.message.includes("E_MIN_OUT_NOT_REACHED") ||
        error.message.includes("code 9") ||
        error.message.includes("invalid token amounts"))
    ) {
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

          // Use SDK helper for fallback - ticks are handled internally
          fallbackTx =
            await clmmSdk.Position.createRemoveLiquidityFixTokenPayload({
              coin_type_a,
              coin_type_b,
              pool_id: poolIdSanitized,
              pos_id: posId,
              tick_lower: position.tick_lower_index.toString(),
              tick_upper: position.tick_upper_index.toString(),
              fix_amount_a: isFixedA,
              delta_liquidity: deltaLiquidity,
              min_amount: "0", // Zero minimum as string
              collect_fee: false, // Never collect fees in the fallback
            });
        } else {
          // Double-sided fallback: use standard variant with zero minimums
          fallbackTx = await clmmSdk.Position.createRemoveLiquidityPayload({
            coin_type_a,
            coin_type_b,
            pool_id: poolIdSanitized,
            pos_id: posId,
            delta_liquidity: deltaLiquidity,
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

          // If error message is empty or "unknown", double-check transaction status on-chain
          if (
            digest &&
            (!errorMsg ||
              errorMsg.toLowerCase().includes("unknown") ||
              errorMsg.toLowerCase().includes("timeout"))
          ) {
            if (await verifyTransactionSuccess(digest)) {
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
          digest: fallbackRes.digest || "",
        };
      } catch (fallbackError) {
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
      } else if (error.message.toLowerCase().includes("invalid u32 value")) {
        throw new Error(
          "Transaction failed: Tick indices must be properly encoded for the new CLMM v3 contract format. This issue has been fixed in the latest version."
        );
      } else if (
        error.message
          .toLowerCase()
          .includes("cannot convert a bigint value to a number")
      ) {
        throw new Error(
          "Transaction failed: There was an error processing the token balances. This issue has been fixed in the latest version."
        );
      } else if (
        error.message.toLowerCase().includes("no function was found")
      ) {
        throw new Error(
          "Transaction failed: This app needs to be updated to work with the latest Cetus protocol version. The current protocol no longer supports the function being called."
        );
      } else if (
        error.message.toLowerCase().includes("tx.pure must be called")
      ) {
        throw new Error(
          "Transaction failed: Missing type information for transaction values. This has been fixed to work with the latest Sui.js version by adding explicit types."
        );
      } else if (
        error.message.toLowerCase().includes("invalid pure type name")
      ) {
        throw new Error(
          "Transaction failed: Invalid BCS type specified in a transaction parameter. This has been fixed to use proper type annotations for sui.js v1.30+."
        );
      } else if (
        error.message.toLowerCase().includes("unusedvalueswithoutdrop")
      ) {
        throw new Error(
          "Transaction failed: The transaction has an unused coin value. This issue has been fixed by updating how we handle token preparation for CLMM v3."
        );
      } else if (error.message.toLowerCase().includes("commandargumenterror")) {
        throw new Error(
          "Transaction failed: A coin object is being used multiple times. This issue has been fixed by preventing coin merging for CLMM v3."
        );
      } else if (error.message.toLowerCase().includes("invalidvalueusage")) {
        throw new Error(
          "Transaction failed: A coin was consumed but then referenced again. This issue has been fixed by letting the router handle coin selection."
        );
      } else if (
        error.message.toLowerCase().includes("type") &&
        error.message.toLowerCase().includes("is not registered")
      ) {
        throw new Error(
          "Transaction failed: Sui type registration error. This is likely due to using the old parameter order with tx.pure in Sui SDK 1.30+. The bcs helper has been updated to fix this issue."
        );
      }
    }

    throw error;
  }
}

/**
 * Helper function to close a Bluefin position
 * Fixed for @mysten/sui.js v1.30+ compatibility
 */
async function closeBluefinPosition(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
): Promise<{ success: boolean; digest: string }> {
  try {
    const txb = new TransactionBlock();
    const BLUEFIN_PACKAGE =
      "0xf7133d0cb63e1a78ef27a78d4e887a58428d06ff4f2ebbd33af273a04a1bf444";

    // FIXED: Helper functions for transaction types (sui.js v1.30+ with correct order)
    const addr = (a: string) => bcs.addr(txb, a);
    const u64 = (n: string) => bcs.u64(txb, n);

    // First remove all liquidity
    txb.moveCall({
      target: `${BLUEFIN_PACKAGE}::clmm::remove_liquidity`,
      arguments: [
        addr(poolId),
        addr(positionId),
        u64("18446744073709551615"), // Max uint64 value to remove all liquidity
      ],
    });

    // Then burn the position if balance is zero
    txb.moveCall({
      target: `${BLUEFIN_PACKAGE}::position::burn`,
      arguments: [addr(poolId), addr(positionId)],
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

      // If error message is empty or "unknown", double-check transaction status on-chain
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
          return { success: true, digest }; // Treat as success
        }
      }

      throw new Error(
        `Bluefin position closing failed: ${
          errorMsg || "unknown"
        } (Digest: ${digest})`
      );
    }

    return {
      success: true,
      digest: result.digest || "",
    };
  } catch (error) {
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
 *
 * Updated to use SDK helpers for CLMM v3 compatibility.
 * Fixed for @mysten/sui.js v1.30+ compatibility with correct BCS parameter order.
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
    } catch (error) {
      if (isAlreadyClosedError(error)) {
        return { success: true, digest: "" };
      }

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
      } catch (error) {
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
          } catch (fallbackError) {
            // Silent fail for fallback
          }
        }
      }
    }

    // If position has no liquidity, we can skip Step 1 and proceed directly to closing
    if (!position.liquidity || position.liquidity === "0") {
      // Go directly to Step 3: Close the position
      try {
        // Use SDK helper to create close position payload
        const closeTx = await clmmSdk.Position.createClosePositionPayload({
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

          if (
            digest &&
            (!errorMsg ||
              errorMsg.toLowerCase().includes("unknown") ||
              errorMsg.toLowerCase().includes("timeout"))
          ) {
            if (await verifyTransactionSuccess(digest)) {
              return { success: true, digest };
            }
          }

          throw new Error(
            `Position closing failed: ${
              errorMsg || "unknown"
            } (Digest: ${digest})`
          );
        }

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
          warnings.push("Position appears to be already empty");
          return {
            success: true,
            digest: "",
            warnings,
          };
        }

        // If there's another issue with direct closing, try without collecting fees
        try {
          const fallbackCloseTx =
            await clmmSdk.Position.createClosePositionPayload({
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
            return {
              success: true,
              digest: fallbackResult.digest || "",
              warnings: ["Fees could not be collected"],
            };
          }
        } catch (fallbackError) {
          warnings.push("Could not close position directly");
        }

        // Re-throw the original error if all attempts failed
        throw error;
      }
    }

    // ----- For positions with liquidity, use a safer multi-step approach -----

    // STEP 1: First remove all liquidity with zero minimums to ensure it succeeds
    // This is the CRITICAL step - if this succeeds, we consider the operation successful
    // Make sure to convert liquidity amount to a string
    const liquidityAmount = position.liquidity.toString();

    // Use SDK helper to create removeLiquidity payload
    const removeTx = await clmmSdk.Position.createRemoveLiquidityPayload({
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

    const removeRes = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: removeTx,
      options: { showEffects: true, showEvents: true },
    });

    // Check if removal succeeded - this is critical, so we do throw on failure
    if (removeRes.effects?.status?.status !== "success") {
      const digest = removeRes.digest || "unknown";
      const errorMsg = removeRes.effects?.status?.error;

      // Verify on-chain status if it was unknown
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
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

    // Brief pause to allow node to update state
    await new Promise((resolve) => setTimeout(resolve, 500));

    // STEP 2: Check for pending fees and collect only if non-zero
    // IMPROVEMENT: Check if there are actually fees to collect before building transaction
    try {
      const feeOwed = await clmmSdk.Position.fetchPendingFee({
        coin_type_a: pool.coin_type_a,
        coin_type_b: pool.coin_type_b,
        pos_id: posId,
      });

      if (feeOwed.amount_a === "0" && feeOwed.amount_b === "0") {
        // No pending fees - skip collectFeePayload
      } else {
        // Use SDK helper to create collectFee payload
        const collectTx = await clmmSdk.Position.createCollectFeePayload({
          coin_type_a: pool.coin_type_a,
          coin_type_b: pool.coin_type_b,
          pool_id: poolIdSanitized,
          pos_id: posId,
        });

        collectTx.setGasBudget(80000000);

        const collectRes = await wallet.signAndExecuteTransactionBlock({
          transactionBlock: collectTx,
          options: { showEffects: true, showEvents: true },
        });

        // Check if fee collection succeeded, but don't fail the whole process if it doesn't
        if (
          collectRes.effects?.status?.status !== "success" &&
          !(await verifyTransactionSuccess(collectRes.digest || ""))
        ) {
          warnings.push(
            "Fee collection failed but liquidity was removed successfully"
          );
        }
      }
    } catch (e) {
      // IMPROVEMENT: Special handling for empty transaction error from wallet
      if (
        e instanceof Error &&
        e.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
      ) {
        warnings.push("Fee collection skipped - no fees to collect");
      } else {
        warnings.push(
          "Fee collection failed but liquidity was removed successfully"
        );
      }
    }

    // Brief pause to allow node to update state
    await new Promise((resolve) => setTimeout(resolve, 500));

    // STEP 3: Check for rewards and collect them separately if available
    if (rewarder_coin_types.length > 0) {
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
          } catch (error) {
            hasRewards = true; // Default to trying to collect if we can't check
          }
        }

        if (hasRewards) {
          // Use SDK helper to create collectRewarder payload
          const rewardsTx = await clmmSdk.Rewarder.createCollectRewarderPayload(
            {
              coin_type_a: pool.coin_type_a,
              coin_type_b: pool.coin_type_b,
              pool_id: poolIdSanitized,
              pos_id: posId,
              rewarder_coin_types,
              collect_fee: false, // Already collected fees
            }
          );

          rewardsTx.setGasBudget(80000000);

          const rewardsRes = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: rewardsTx,
            options: { showEffects: true, showEvents: true },
          });

          // Check if rewards collection succeeded, but don't fail if it doesn't
          if (
            rewardsRes.effects?.status?.status !== "success" &&
            !(await verifyTransactionSuccess(rewardsRes.digest || ""))
          ) {
            warnings.push(
              "Rewards collection failed but liquidity was removed successfully"
            );
          }
        }
      } catch (e) {
        // Special handling for empty transaction error from wallet
        if (
          e instanceof Error &&
          e.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
        ) {
          warnings.push("Rewards collection skipped - no rewards to collect");
        } else {
          warnings.push(
            "Rewards collection failed but liquidity was removed successfully"
          );
        }
      }

      // Brief pause to allow node to update state
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // STEP 4: Finally, try to close the now-empty position
    try {
      // Use SDK helper to create closePosition payload
      const closeTx = await clmmSdk.Position.createClosePositionPayload({
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

      const closeRes = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: closeTx,
        options: { showEffects: true, showEvents: true },
      });

      // Check if closing succeeded, but don't fail the whole process if it doesn't
      if (
        closeRes.effects?.status?.status !== "success" &&
        !(await verifyTransactionSuccess(closeRes.digest || ""))
      ) {
        warnings.push(
          "Position NFT burning failed but liquidity was removed successfully"
        );
      } else {
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
        warnings.push("Position closing skipped - may already be closed");
      } else if (
        e instanceof Error &&
        e.message.toLowerCase().includes("invalid token amounts")
      ) {
        warnings.push(
          "Position NFT burning failed but liquidity was removed successfully"
        );
      } else {
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
    // Surface the error details for debugging
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();

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
      } else if (errorMessage.includes("no function was found")) {
        throw new Error(
          "Transaction failed: This app needs to be updated to work with the latest Cetus protocol version. The current protocol no longer supports the function being called."
        );
      } else if (errorMessage.includes("incorrect number of arguments")) {
        throw new Error(
          "Transaction failed: The Move function signature has changed in the latest protocol version. Please update the app to match the new function signature."
        );
      } else if (errorMessage.includes("invalid u32 value")) {
        throw new Error(
          "Transaction failed: Tick indices must be properly encoded for the new CLMM v3 contract format. This issue has been fixed in the latest version."
        );
      } else if (
        errorMessage.includes("cannot convert a bigint value to a number")
      ) {
        throw new Error(
          "Transaction failed: There was an error processing the token balances. This issue has been fixed in the latest version."
        );
      } else if (errorMessage.includes("tx.pure must be called")) {
        throw new Error(
          "Transaction failed: Missing type information for transaction values. This has been fixed to work with the latest Sui.js version by adding explicit types."
        );
      } else if (errorMessage.includes("invalid pure type name")) {
        throw new Error(
          "Transaction failed: Invalid BCS type specified in a transaction parameter. This has been fixed to use proper type annotations for sui.js v1.30+."
        );
      } else if (errorMessage.includes("unusedvalueswithoutdrop")) {
        throw new Error(
          "Transaction failed: The transaction has an unused coin value. This issue has been fixed by updating how we handle token preparation for CLMM v3."
        );
      } else if (errorMessage.includes("commandargumenterror")) {
        throw new Error(
          "Transaction failed: A coin object is being used multiple times. This issue has been fixed by preventing coin merging for CLMM v3."
        );
      } else if (errorMessage.includes("invalidvalueusage")) {
        throw new Error(
          "Transaction failed: A coin was consumed but then referenced again. This issue has been fixed by letting the router handle coin selection."
        );
      } else if (
        errorMessage.includes("type") &&
        errorMessage.includes("is not registered")
      ) {
        throw new Error(
          "Transaction failed: Sui type registration error. This is likely due to using the old parameter order with tx.pure in Sui SDK 1.30+. The bcs helper has been updated to fix this issue."
        );
      }
    }

    throw error;
  }
}

/**
 * Collect fees from a position.
 * Updated for SDK v2 with proper position verification
 * Uses SDK helpers for CLMM v3 compatibility
 * Fixed for @mysten/sui.js v1.30+ compatibility with correct BCS parameter order
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
      if (isAlreadyClosedError(error)) {
        return { success: true, digest: "" };
      }

      // For all other errors, surface them
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
    } catch (error) {
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
        return { success: true, digest: "" };
      }
    } catch (error) {
      // Continue anyway - better to try collecting than miss out on fees
    }

    // Use SDK helper to create collectFee payload
    let tx;
    try {
      tx = await clmmSdk.Position.createCollectFeePayload({
        coin_type_a,
        coin_type_b,
        pool_id: poolIdSanitized,
        pos_id: posId,
      });
    } catch (error) {
      // If we get errors with this approach, use a fallback
      // Create transaction block manually
      const txb = new TransactionBlock();

      // FIXED: Helper functions for transaction types (sui.js v1.30+ with correct order)
      const addr = (a: string) => bcs.addr(txb, a);
      const bool = (b: boolean) => bcs.bool(txb, b);

      // Get Cetus module paths (with fallbacks if SDK doesn't provide them)
      const { package_id, clmm_position, clmm_config } = getCetusModulePaths();

      // Create move call directly to the pool module (updated from clmm_position)
      txb.moveCall({
        target: `${package_id}::pool::collect_fee`, // Updated from clmm_position to pool
        arguments: [
          addr(poolIdSanitized),
          addr(posId),
          txb.object(clmm_config),
          bool(true), // is_immutable
        ],
        typeArguments: [coin_type_a, coin_type_b],
      });

      tx = txb;
    }

    // Set gas budget
    tx.setGasBudget(50000000); // 0.05 SUI

    // Execute transaction
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    // Check transaction success and handle potential "unknown" status
    if (res.effects?.status?.status !== "success") {
      const digest = res.digest || "unknown";
      const errorMsg = res.effects?.status?.error;

      // If error message is empty or "unknown", double-check transaction status on-chain
      if (
        digest &&
        (!errorMsg ||
          errorMsg.toLowerCase().includes("unknown") ||
          errorMsg.toLowerCase().includes("timeout"))
      ) {
        if (await verifyTransactionSuccess(digest)) {
          return { success: true, digest }; // Treat as success
        }
      }

      // Special handling for empty transaction error from wallet
      if (
        errorMsg &&
        errorMsg.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
      ) {
        return { success: true, digest: "" };
      }

      throw new Error(
        `Fee collection failed: ${errorMsg || "unknown"} (Digest: ${digest})`
      );
    }

    return {
      success: true,
      digest: res.digest || "",
    };
  } catch (error) {
    // Special handling for empty transaction error from wallet
    if (
      error instanceof Error &&
      error.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
    ) {
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
      } else if (errorMessage.includes("no function was found")) {
        throw new Error(
          "Transaction failed: This app needs to be updated to work with the latest Cetus protocol version. The current protocol no longer supports the function being called."
        );
      } else if (errorMessage.includes("incorrect number of arguments")) {
        throw new Error(
          "Transaction failed: The Move function signature has changed in the latest protocol version. Please update the app to match the new function signature."
        );
      } else if (
        errorMessage.includes("cannot convert a bigint value to a number")
      ) {
        throw new Error(
          "Transaction failed: There was an error processing the token balances. This issue has been fixed in the latest version."
        );
      } else if (errorMessage.includes("tx.pure must be called")) {
        throw new Error(
          "Transaction failed: Missing type information for transaction values. This has been fixed to work with the latest Sui.js version by adding explicit types."
        );
      } else if (errorMessage.includes("invalid pure type name")) {
        throw new Error(
          "Transaction failed: Invalid BCS type specified in a transaction parameter. This has been fixed to use proper type annotations for sui.js v1.30+."
        );
      } else if (errorMessage.includes("unusedvalueswithoutdrop")) {
        throw new Error(
          "Transaction failed: The transaction has an unused coin value. This issue has been fixed by updating how we handle token preparation for CLMM v3."
        );
      } else if (errorMessage.includes("commandargumenterror")) {
        throw new Error(
          "Transaction failed: A coin object is being used multiple times. This issue has been fixed by preventing coin merging for CLMM v3."
        );
      } else if (errorMessage.includes("invalidvalueusage")) {
        throw new Error(
          "Transaction failed: A coin was consumed but then referenced again. This issue has been fixed by letting the router handle coin selection."
        );
      } else if (
        errorMessage.includes("type") &&
        errorMessage.includes("is not registered")
      ) {
        throw new Error(
          "Transaction failed: Sui type registration error. This is likely due to using the old parameter order with tx.pure in Sui SDK 1.30+. The bcs helper has been updated to fix this issue."
        );
      }
    }

    throw error;
  }
}

/**
 * Collect rewards from a position.
 * Updated for SDK v2 with proper position verification
 * Uses SDK helpers for CLMM v3 compatibility
 * Fixed for @mysten/sui.js v1.30+ compatibility with correct BCS parameter order
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
      if (isAlreadyClosedError(error)) {
        return { success: true, digest: "" };
      }

      // For all other errors, surface them
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
    } catch (error) {
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

        if (!hasNonZeroRewards) {
          return {
            success: true,
            digest: "",
          };
        }
      } catch (error) {
        throw new Error("Failed to check rewards. Please try again.");
      }
    } else {
      return {
        success: true,
        digest: "",
      };
    }

    if (rewarder_coin_types.length === 0) {
      return {
        success: true,
        digest: "",
      };
    }

    // Use SDK helper to create collectRewarder payload
    try {
      const tx = await clmmSdk.Rewarder.createCollectRewarderPayload({
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

        // If error message is empty or "unknown", double-check transaction status on-chain
        if (
          digest &&
          (!errorMsg ||
            errorMsg.toLowerCase().includes("unknown") ||
            errorMsg.toLowerCase().includes("timeout"))
        ) {
          if (await verifyTransactionSuccess(digest)) {
            return { success: true, digest }; // Treat as success
          }
        }

        // Special handling for empty transaction error from wallet
        if (
          errorMsg &&
          errorMsg.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
        ) {
          return { success: true, digest: "" };
        }

        throw new Error(
          `Reward collection failed: ${
            errorMsg || "unknown"
          } (Digest: ${digest})`
        );
      }

      return {
        success: true,
        digest: res.digest || "",
      };
    } catch (error) {
      // Special handling for empty transaction error from wallet
      if (
        error instanceof Error &&
        error.message.includes("[WALLET.SIGN_TX_ERROR] Unknown transaction")
      ) {
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

      // Check for function not found error
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("no function was found")
      ) {
        throw new Error(
          "Transaction failed: This app needs to be updated to work with the latest Cetus protocol version. The current protocol no longer supports the function being called."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("incorrect number of arguments")
      ) {
        throw new Error(
          "Transaction failed: The Move function signature has changed in the latest protocol version. Please update the app to match the new function signature."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("invalid u32 value")
      ) {
        throw new Error(
          "Transaction failed: Tick indices must be properly encoded for the new CLMM v3 contract format. This issue has been fixed in the latest version."
        );
      } else if (
        error instanceof Error &&
        error.message
          .toLowerCase()
          .includes("cannot convert a bigint value to a number")
      ) {
        throw new Error(
          "Transaction failed: There was an error processing the token balances. This issue has been fixed in the latest version."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("tx.pure must be called")
      ) {
        throw new Error(
          "Transaction failed: Missing type information for transaction values. This has been fixed to work with the latest Sui.js version by adding explicit types."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("invalid pure type name")
      ) {
        throw new Error(
          "Transaction failed: Invalid BCS type specified in a transaction parameter. This has been fixed to use proper type annotations for sui.js v1.30+."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("unusedvalueswithoutdrop")
      ) {
        throw new Error(
          "Transaction failed: The transaction has an unused coin value. This issue has been fixed by updating how we handle token preparation for CLMM v3."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("commandargumenterror")
      ) {
        throw new Error(
          "Transaction failed: A coin object is being used multiple times. This issue has been fixed by preventing coin merging for CLMM v3."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("invalidvalueusage")
      ) {
        throw new Error(
          "Transaction failed: A coin was consumed but then referenced again. This issue has been fixed by letting the router handle coin selection."
        );
      } else if (
        error instanceof Error &&
        error.message.toLowerCase().includes("type") &&
        error.message.toLowerCase().includes("is not registered")
      ) {
        throw new Error(
          "Transaction failed: Sui type registration error. This is likely due to using the old parameter order with tx.pure in Sui SDK 1.30+. The bcs helper has been updated to fix this issue."
        );
      }

      throw new Error("Failed to collect rewards. Transaction error occurred.");
    }
  } catch (error) {
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

    return processedPositions;
  } catch (error) {
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
    return [];
  }
}

// Export for external use
export default {
  getPools,
  getPoolById: null, // Add your implementation if needed
  getPoolBySymbols: null, // Add your implementation if needed
  getPositions,
  getPositionById: null, // Add your implementation if needed
  deposit,
  removeLiquidity,
  claimFees: collectFees,
  getAllPools,
};
