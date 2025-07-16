// services/bluefinTxBuilder.js
// Updated: 2025-07-16 00:12:15 UTC by jake1318

import { TransactionBlock } from "@mysten/sui.js/transactions";
import {
  SUI_CLOCK_OBJECT_ID,
  getBluefinConfigObjectId,
  getBluefinPackageId,
} from "./bluefinService.js";
import { getSuiClient } from "./suiClient.js";
import { getPoolDetails } from "./bluefinService.js";

// Default slippage percentage to apply to minimum amounts
const DEFAULT_SLIPPAGE_PCT = 0.005; // 0.5% - same as Bluefin frontend default

// Buffer for the max_other_amount to ensure we provide enough counterpart coins
const MAX_OTHER_BUFFER_PCT = 0.05; // Add 5% more of the counterpart coin to avoid insufficient coin errors

// Define Bluefin-specific error codes and their user-friendly messages
const BLUEFIN_ABORTS = {
  1003: "Selected price range is no longer valid",
  1004: "Required token amount exceeds your maximum",
  1005: "Slippage tolerance exceeded",
};

// Helper to extract error information from SUI transaction failures
function extractBluefinError(error) {
  try {
    if (!error || !error.message) return null;

    // Check if this is a MoveAbort error
    const moveAbortMatch = error.message.match(
      /MoveAbort\(.*?\) in (\w+)::(\w+)::(\w+): (\d+)/
    );
    if (moveAbortMatch) {
      const [_, pkg, mod, func, code] = moveAbortMatch;
      const errorCode = parseInt(code);

      // Check if it's a known Bluefin error code
      if (BLUEFIN_ABORTS[errorCode]) {
        return {
          type: "bluefin",
          code: errorCode,
          message: BLUEFIN_ABORTS[errorCode],
          originalError: error.message,
        };
      }
    }

    return null;
  } catch (e) {
    console.error("Failed to parse error", e);
    return null;
  }
}

/**
 * Cache for storing coin decimals to avoid repeated RPC calls
 */
const decimalsCache = new Map();

/**
 * Get the decimal precision for a coin type from on-chain metadata
 * @param {SuiClient} client - Sui client instance
 * @param {string} coinType - The coin type (e.g. "0x2::sui::SUI")
 * @returns {Promise<number>} The number of decimal places for the coin
 */
async function getDecimals(client, coinType) {
  // Return cached value if available
  if (decimalsCache.has(coinType)) {
    return decimalsCache.get(coinType);
  }

  // SUI always has 9 decimals
  if (coinType === "0x2::sui::SUI") {
    decimalsCache.set(coinType, 9);
    return 9;
  }

  try {
    // Fetch metadata from chain
    const meta = await client.getCoinMetadata({ coinType });
    const decimals = meta?.decimals ?? 9; // Default to 9 if not found

    console.log(`Fetched decimals for ${coinType}: ${decimals}`);
    decimalsCache.set(coinType, decimals);
    return decimals;
  } catch (e) {
    console.warn(`No metadata for ${coinType}:`, e.message);
    // Default to 9 as the safest fallback (better than 6)
    decimalsCache.set(coinType, 9);
    return 9;
  }
}

/**
 * Convert a signed number to an unsigned 32-bit integer (two's complement)
 */
function toU32(signed) {
  // Keep value in 32-bit range first
  const i = signed & 0xffffffff; // two-complement cast
  return i >>> 0; // >>> 0 ⇒ unsigned JS number
}

/**
 * Convert unsigned 32-bit integer to signed 32-bit integer (two's complement)
 */
function toSignedI32(u) {
  return u & 0x80000000 ? u - 0x100000000 : u;
}

/**
 * Helper function for type-safe boolean conversion in transaction arguments
 */
function pureBool(txb, value) {
  return txb.pure(value ? 1 : 0, "bool");
}

/**
 * Calculate required counterpart amount for CLMM liquidity provision
 * This is an accurate implementation based on CLMM math for calculating required token amounts
 *
 * @param {object} poolData - Pool details including current price and tick data
 * @param {number} fixedAmount - The amount of the fixed coin in human units
 * @param {boolean} isFixedCoinA - Whether the fixed coin is coin A
 * @param {number} lowerTick - Lower tick of the position
 * @param {number} upperTick - Upper tick of the position
 * @returns {number} Estimated amount of the other coin required in human units
 */
function calculateCounterpartAmount(
  poolData,
  fixedAmount,
  isFixedCoinA,
  lowerTick,
  upperTick
) {
  // Get the current price from pool data - IMPORTANT: Make sure it's properly squared
  // The current_sqrt_price in the pool is often stored as sqrtPriceX96, which is sqrt(price) * 2^96
  // We need the actual price, not the sqrt
  let currentPrice;
  if (poolData.currentSqrtPrice) {
    // If we have sqrt price, we need to square it and adjust by the 2^96 factor
    // Note: 2^96 = 2^192 in the squared result, so we divide by 2^192
    const sqrtPriceX96 = poolData.currentSqrtPrice;
    currentPrice = Math.pow(sqrtPriceX96 / Math.pow(2, 96), 2);
  } else {
    // If we already have the price, use it directly
    currentPrice = poolData.currentPrice;
  }

  // Calculate the price at the ticks (these are the price boundaries of our range)
  const lowerPrice = Math.pow(1.0001, lowerTick);
  const upperPrice = Math.pow(1.0001, upperTick);

  console.log(
    `Price calculation: currentPrice=${currentPrice}, lowerPrice=${lowerPrice}, upperPrice=${upperPrice}`
  );

  let coinARequired, coinBRequired;

  // Calculate liquidity from fixed amount and price range
  if (isFixedCoinA) {
    // Fixed amount is for coin A, calculate coin B required
    // This is the case where we want to provide X tokens of A and need to know how many B tokens are required

    // Calculate liquidity based on the fixed amount of A
    let liquidity;

    if (currentPrice <= lowerPrice) {
      // Current price is below the range, only A is required (B = 0)
      liquidity =
        (fixedAmount * Math.sqrt(lowerPrice) * Math.sqrt(upperPrice)) /
        (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
      coinBRequired = 0;
    } else if (currentPrice >= upperPrice) {
      // Current price is above the range, need both but primarily B
      liquidity = fixedAmount / (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
      coinBRequired =
        liquidity * (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
    } else {
      // Current price is within the range, need both A and B
      liquidity =
        fixedAmount / (Math.sqrt(upperPrice) - Math.sqrt(currentPrice));
      coinBRequired =
        liquidity * (Math.sqrt(currentPrice) - Math.sqrt(lowerPrice));
    }

    console.log(
      `For ${fixedAmount} of coin A, estimated ${coinBRequired} of coin B required (liquidity: ${liquidity})`
    );
    return coinBRequired;
  } else {
    // Fixed amount is for coin B, calculate coin A required
    // This is the case where we want to provide Y tokens of B and need to know how many A tokens are required

    // Calculate liquidity based on the fixed amount of B
    let liquidity;

    if (currentPrice <= lowerPrice) {
      // Current price is below the range, need both but primarily A
      liquidity = fixedAmount / (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
      coinARequired =
        liquidity * (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
    } else if (currentPrice >= upperPrice) {
      // Current price is above the range, only B is required (A = 0)
      liquidity = fixedAmount / (Math.sqrt(upperPrice) - Math.sqrt(lowerPrice));
      coinARequired = 0;
    } else {
      // Current price is within the range, need both A and B
      liquidity =
        fixedAmount / (Math.sqrt(currentPrice) - Math.sqrt(lowerPrice));
      coinARequired =
        liquidity * (Math.sqrt(upperPrice) - Math.sqrt(currentPrice));
    }

    console.log(
      `For ${fixedAmount} of coin B, estimated ${coinARequired} of coin A required (liquidity: ${liquidity})`
    );
    return coinARequired;
  }
}

/**
 * Choose which coin should be fixed based on strategic considerations
 *
 * @param {number} amountA - Amount of coin A in human units
 * @param {number} amountB - Amount of coin B in human units
 * @param {boolean} isCoinA_SUI - Whether coin A is SUI
 * @param {boolean} isCoinB_SUI - Whether coin B is SUI
 * @param {number} currentPrice - Current price of B in terms of A (B/A)
 * @param {string} fixedCoinOverride - Optional override to explicitly set which coin is fixed
 * @returns {boolean} Whether to fix coin A (true) or coin B (false)
 */
function chooseFixedSide(
  amountA,
  amountB,
  isCoinA_SUI,
  isCoinB_SUI,
  currentPrice,
  fixedCoinOverride
) {
  // If there's an explicit override, respect it
  if (fixedCoinOverride === "A") {
    console.log("Using coin A as fixed side (explicitly requested)");
    return true;
  } else if (fixedCoinOverride === "B") {
    console.log("Using coin B as fixed side (explicitly requested)");
    return false;
  }

  // Calculate the value of each side in terms of coin B
  const valueA = amountA * currentPrice;
  const valueB = amountB;

  console.log(
    `Value comparison: coinA=${amountA} (${valueA} in terms of B), coinB=${amountB}`
  );

  // Strategy: Fix the coin with LOWER value to avoid insufficient counterpart
  // This ensures we don't try to use more of the higher-value coin than can be paired
  if (valueA < valueB * 0.95) {
    // Coin A has much less value, fix A
    console.log("Fixing coin A (lower value asset)");
    return true;
  } else if (valueB < valueA * 0.95) {
    // Coin B has much less value, fix B
    console.log("Fixing coin B (lower value asset)");
    return false;
  } else {
    // Values are similar, prefer fixing non-SUI for gas efficiency
    const fixNonSui = !isCoinA_SUI;
    console.log(
      `Values are similar, fixing ${
        fixNonSui ? "coin A" : "coin B"
      } (non-SUI preference)`
    );
    return fixNonSui;
  }
}

/**
 * Prepares a coin object with sufficient balance for a transaction
 * Merges multiple coin objects if needed and splits to get the exact amount
 *
 * @param {object} txb - Transaction block instance
 * @param {Array} coinObjects - Array of coin objects from getCoins()
 * @param {number|BigInt} requiredAmount - Amount needed in base units
 * @param {boolean} isSui - Whether this is a SUI coin (special handling for gas coin)
 * @returns {object} Transaction block object reference for the prepared coin
 */
function prepareCoinWithSufficientBalance(
  txb,
  coinObjects,
  requiredAmount,
  isSui
) {
  if (!coinObjects || !coinObjects.length) {
    throw new Error("No coin objects provided");
  }

  const requiredBigInt = BigInt(requiredAmount);

  // For SUI, we can use the gas coin and split from it
  if (isSui) {
    // Make sure we're not using too much of the gas coin
    const gasBalance = BigInt(coinObjects[0].balance);
    if (requiredBigInt > (gasBalance * BigInt(90)) / BigInt(100)) {
      throw new Error(
        `Requested SUI amount ${requiredBigInt} is too close to total balance ${gasBalance}`
      );
    }
    return txb.splitCoins(txb.gas, [txb.pure(requiredBigInt.toString())]);
  }

  // For non-SUI tokens, sort coins by balance (largest first)
  // FIX: Use proper BigInt comparison instead of subtraction to avoid "Cannot convert BigInt to number" error
  const sortedCoins = [...coinObjects].sort((a, b) => {
    const aBal = BigInt(a.balance);
    const bBal = BigInt(b.balance);
    // Sort descending (largest first)
    if (bBal > aBal) return 1; // b is larger, put it first
    if (bBal < aBal) return -1; // a is larger, put it first
    return 0; // equal balance
  });

  // Check if we have enough total balance
  const totalBalance = sortedCoins.reduce(
    (acc, coin) => acc + BigInt(coin.balance),
    BigInt(0)
  );

  if (totalBalance < requiredBigInt) {
    throw new Error(
      `Insufficient balance. Required: ${requiredBigInt}, Available: ${totalBalance}`
    );
  }

  // Find a single coin with enough balance if possible
  const sufficientCoin = sortedCoins.find(
    (coin) => BigInt(coin.balance) >= requiredBigInt
  );

  if (sufficientCoin) {
    // If we have a single coin with sufficient balance, just split from it
    const coinObj = txb.object(sufficientCoin.coinObjectId);
    return txb.splitCoins(coinObj, [txb.pure(requiredBigInt.toString())]);
  }

  // Otherwise, we need to merge coins until we have enough
  let primaryCoinId = sortedCoins[0].coinObjectId;
  let primaryCoin = txb.object(primaryCoinId);
  let mergedBalance = BigInt(sortedCoins[0].balance);
  let coinIndex = 1;

  // Merge additional coins until we have enough balance
  while (mergedBalance < requiredBigInt && coinIndex < sortedCoins.length) {
    const nextCoin = sortedCoins[coinIndex];
    const nextCoinId = nextCoin.coinObjectId;
    mergedBalance += BigInt(nextCoin.balance);

    // Merge the next coin into our primary coin
    txb.mergeCoins(primaryCoin, [txb.object(nextCoinId)]);
    coinIndex++;
  }

  // Now split the exact amount needed from the merged coin
  return txb.splitCoins(primaryCoin, [txb.pure(requiredBigInt.toString())]);
}

/**
 * Helper function to build the correct argument list for provide_liquidity_with_fixed_amount
 * based on the Bluefin contract's expected parameter order
 *
 * @param {boolean} aIsFixed - Whether coin A is the fixed side (based on coinTypeA, coinTypeB order)
 * @param {object} coinA - Coin A object from transaction builder
 * @param {object} coinB - Coin B object from transaction builder
 * @param {number} amountARaw - Raw amount A in base units (not a TransactionArgument)
 * @param {number} amountBRaw - Raw amount B in base units (not a TransactionArgument)
 * @param {number} slippagePct - Slippage percentage - used for logging only
 * @param {object} txb - Transaction block instance for creating pure values
 * @returns {Array} - Array of arguments in the correct order for the contract
 */
function buildLiquidityArgs(
  aIsFixed,
  coinA,
  coinB,
  amountARaw,
  amountBRaw,
  slippagePct,
  txb
) {
  // Convert to BigInt for precise calculations
  const rawAmountA = BigInt(amountARaw);
  const rawAmountB = BigInt(amountBRaw);

  // IMPORTANT: In Bluefin, the order of coin arguments must ALWAYS match the generic types
  // The first coin MUST be of type CoinTypeA, and the second must be of type CoinTypeB
  // The a_is_fixed boolean tells the contract which one to treat as the fixed side

  // Calculate the fixed amount based on which side is fixed
  const fixedAmount = aIsFixed ? rawAmountA : rawAmountB;

  // Set max amounts - the fixed side's max should equal its exact amount
  const coinAMax = aIsFixed ? fixedAmount : rawAmountA; // If A is fixed, A max = fixed amount, else regular A amount
  const coinBMax = aIsFixed ? rawAmountB : fixedAmount; // If B is fixed, B max = fixed amount, else regular B amount

  // Ensure all values are positive
  if (fixedAmount <= 0n) {
    console.error("Fixed amount must be greater than 0");
  }

  if (coinAMax <= 0n || coinBMax <= 0n) {
    console.error("Max amounts must be greater than 0");
  }

  console.log(`Building liquidity args with a_is_fixed=${aIsFixed}:
    fixed_coin_type: ${aIsFixed ? "CoinTypeA" : "CoinTypeB"}
    fixed_amount: ${fixedAmount.toString()}
    coin_a_max: ${coinAMax.toString()}
    coin_b_max: ${coinBMax.toString()}`);

  // Return arguments for provide_liquidity_with_fixed_amount
  // NOTE: Coin order MUST be [coinA, coinB] regardless of which is fixed
  // This ensures type parameters align correctly with the Move function
  return [
    coinA, // Always CoinTypeA
    coinB, // Always CoinTypeB
    txb.pure(fixedAmount.toString(), "u64"), // fixed_amount (of whichever coin is fixed)
    txb.pure(coinAMax.toString(), "u64"), // coin_a_max
    txb.pure(coinBMax.toString(), "u64"), // coin_b_max
  ];
}

/**
 * Helper function to get the initial shared version of a pool object
 * @param {string} objectId - ID of the object to look up
 * @returns {Promise<string>} - Initial shared version as a string
 */
async function getInitialVersion(objectId) {
  try {
    const suiClient = await getSuiClient();

    // Request the object with showOwner option to get the initial_shared_version
    const object = await suiClient.getObject({
      id: objectId,
      options: { showOwner: true },
    });

    // Extract the initial_shared_version from owner.Shared
    const initVersionStr = object.data?.owner?.Shared?.initial_shared_version;

    if (initVersionStr) {
      console.log(
        `Found initial shared version for ${objectId}: ${initVersionStr}`
      );
      return initVersionStr; // Return as string, TransactionBlock will handle conversion
    }

    // Fallback to default version "1" if not found
    console.log(
      `No initial shared version found for ${objectId}, using default "1"`
    );
    return "1";
  } catch (error) {
    console.error(`Failed to get initial version for ${objectId}:`, error);
    return "1"; // Default to "1" if we can't get it
  }
}

/**
 * Safely transfers vectors of coins to an address
 * @param {object} txb - Transaction block instance
 * @param {TransactionArgument} vec - Vector to transfer
 * @param {TransactionArgument} addr - Address to transfer to
 */
function safeTransferVector(txb, vec, addr) {
  // Check if the vector is empty first
  const isEmpty = txb.moveCall({
    target: "0x2::vector::is_empty",
    arguments: [vec],
    typeArguments: ["0x2::coin::Coin"],
  });

  // If not empty, transfer the coins
  txb.makeMoveVec({ type: "bool" }, [isEmpty]).whenFalse(() => {
    txb.transferObjects([vec], addr);
  });
}

/**
 * Builds a transaction for opening a position with liquidity in one step
 * with proper handling of SUI whether it's coinTypeA or coinTypeB
 */
export async function buildDepositTx({
  poolId,
  amountA,
  amountB = 0,
  lowerTickFactor = 0.5,
  upperTickFactor = 2.0,
  slippagePct = DEFAULT_SLIPPAGE_PCT, // Allow UI to pass this
  walletAddress,
  // Allow optionally overriding which coin is fixed
  fixedCoinOverride = null, // "A", "B", or null (for auto-determine)
}) {
  if (!poolId || !walletAddress) {
    throw new Error("Missing required parameters: poolId and walletAddress");
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin package ID and config object ID
  const packageId = await getBluefinPackageId();
  const configId = await getBluefinConfigObjectId();
  console.log(
    `Using Bluefin package ID: ${packageId}, config object ID: ${configId}`
  );

  try {
    // Get pool details and current state
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    // Ensure we have the correct price - this was a critical issue in the original code
    // Make sure we're working with the actual price, not the square root
    const currentPrice = pool.currentPrice;
    console.log(
      `Current pool price: ${currentPrice} ${coinTypeB}/${coinTypeA}`
    );

    // Get the pool object with content details
    const poolResponse = await suiClient.getObject({
      id: poolId,
      options: { showContent: true, showType: true },
    });

    if (!poolResponse.data) {
      throw new Error(`Failed to retrieve pool data for ${poolId}`);
    }

    // Extract pool parameters
    const poolFields = poolResponse.data.content.fields;

    // Extract tick-spacing from the TickManager
    const tickSpacing = Number(
      poolFields.ticks_manager?.fields?.tick_spacing ?? 60 // sensible default
    );

    // Convert the unsigned 32-bit tick index to signed int (from `bits`)
    const bits = poolFields.current_tick_index?.fields?.bits;
    if (bits === undefined) {
      console.dir(poolFields, { depth: null });
      throw new Error(
        `Could not read current_tick_index for pool ${poolId} – structure changed`
      );
    }

    const currentTick = toSignedI32(Number(bits));

    // Determine if either coin is SUI
    const SUI_TYPE = "0x2::sui::SUI";
    const isCoinA_SUI = coinTypeA === SUI_TYPE;
    const isCoinB_SUI = coinTypeB === SUI_TYPE;

    console.log(
      `Pool ${poolId} coin types: A=${coinTypeA} (${
        isCoinA_SUI ? "SUI" : "not SUI"
      }), B=${coinTypeB} (${isCoinB_SUI ? "SUI" : "not SUI"})`
    );

    // === GET USER BALANCE INFORMATION ===
    // Get coins for both token types
    const coinsA = await suiClient.getCoins({
      owner: walletAddress,
      coinType: coinTypeA,
    });

    const coinsB = await suiClient.getCoins({
      owner: walletAddress,
      coinType: coinTypeB,
    });

    // Check if we have the coins available
    if (!coinsA.data || coinsA.data.length === 0) {
      throw new Error(`No coins of type ${coinTypeA} found in wallet`);
    }

    if (!coinsB.data || coinsB.data.length === 0) {
      throw new Error(`No coins of type ${coinTypeB} found in wallet`);
    }

    // Calculate total balances
    let totalBalanceA = 0;
    for (const coin of coinsA.data) {
      totalBalanceA += Number(coin.balance);
    }

    let totalBalanceB = 0;
    for (const coin of coinsB.data) {
      totalBalanceB += Number(coin.balance);
    }

    // Get the correct decimal places for each token from on-chain metadata
    const decimalsA = await getDecimals(suiClient, coinTypeA);
    const decimalsB = await getDecimals(suiClient, coinTypeB);

    console.log(
      `Using correct decimal precision: ${coinTypeA}=${decimalsA}, ${coinTypeB}=${decimalsB}`
    );

    // Convert to human-readable amounts
    const availableA = totalBalanceA / 10 ** decimalsA;
    const availableB = totalBalanceB / 10 ** decimalsB;

    console.log(
      `Available ${coinTypeA}: ${availableA} (${totalBalanceA} base units)`
    );
    console.log(
      `Available ${coinTypeB}: ${availableB} (${totalBalanceB} base units)`
    );

    // Use user-provided amounts or set reasonable defaults
    let effectiveAmountA = amountA || 0.03;
    let effectiveAmountB = amountB || 0.1;

    // Calculate price range ticks
    const lowerTick = Math.floor(
      currentTick - Math.log(1 / lowerTickFactor) / Math.log(1.0001)
    );
    const upperTick = Math.ceil(
      currentTick + Math.log(upperTickFactor) / Math.log(1.0001)
    );

    // Snap to initializable grid - we still need *signed* ticks for our logic
    const snap = (t) => Math.round(t / tickSpacing) * tickSpacing;
    const lowerTickSnapped = snap(lowerTick);
    const upperTickSnapped = snap(upperTick);

    // Safety check: ensure ticks are within allowed range
    if (
      Math.abs(lowerTickSnapped) > 443636 ||
      Math.abs(upperTickSnapped) > 443636
    ) {
      throw new Error("Tick out of allowed range");
    }

    // Calculate the approximate values of each coin to determine which to fix
    const valueA = effectiveAmountA * currentPrice;
    const valueB = effectiveAmountB;

    // =========== DETERMINE FIXED SIDE STRATEGY ============
    // Choose which side to fix based on strategic considerations including:
    // - User intent (override if provided)
    // - Value comparison (fix the lower-value asset)
    // - Gas considerations (prefer non-SUI if values are similar)
    const aIsFixed = chooseFixedSide(
      effectiveAmountA,
      effectiveAmountB,
      isCoinA_SUI,
      isCoinB_SUI,
      currentPrice,
      fixedCoinOverride
    );

    // =========== CALCULATE REQUIRED COUNTERPART AMOUNT ============
    // For whichever side is fixed, calculate how much of the other coin is required
    // based on the fixed amount and the chosen price range

    if (aIsFixed) {
      // We're fixing coin A, calculate required amount of coin B
      const requiredCounterpartB = calculateCounterpartAmount(
        pool,
        effectiveAmountA,
        true, // isFixedCoinA = true
        lowerTickSnapped,
        upperTickSnapped
      );

      console.log(
        `For ${effectiveAmountA} ${coinTypeA}, calculated ${requiredCounterpartB} ${coinTypeB} needed`
      );

      // If the user didn't provide enough coin B, increase it (up to their available balance)
      // Add a small buffer to ensure we have enough
      const requiredWithBuffer =
        requiredCounterpartB * (1 + MAX_OTHER_BUFFER_PCT);

      if (effectiveAmountB < requiredWithBuffer) {
        const oldAmount = effectiveAmountB;
        // Cap at 95% of their balance to leave some for gas
        const maxAvailable = availableB * 0.95;
        effectiveAmountB = Math.min(requiredWithBuffer, maxAvailable);

        console.log(
          `Adjusted ${coinTypeB} amount from ${oldAmount} to ${effectiveAmountB} to ensure sufficient counterpart`
        );

        // If we still don't have enough of coin B, we should reduce coin A instead
        if (effectiveAmountB < requiredWithBuffer) {
          console.log(
            `Warning: Not enough ${coinTypeB} available. Will reduce the amount of ${coinTypeA} used.`
          );

          // Calculate how much of coin A we can actually use with the available coin B
          const reducedAmountA =
            effectiveAmountA * (effectiveAmountB / requiredWithBuffer);
          console.log(
            `Reducing ${coinTypeA} from ${effectiveAmountA} to ${reducedAmountA} due to limited ${coinTypeB}`
          );
          effectiveAmountA = reducedAmountA;
        }
      }
    } else {
      // We're fixing coin B, calculate required amount of coin A
      const requiredCounterpartA = calculateCounterpartAmount(
        pool,
        effectiveAmountB,
        false, // isFixedCoinA = false
        lowerTickSnapped,
        upperTickSnapped
      );

      console.log(
        `For ${effectiveAmountB} ${coinTypeB}, calculated ${requiredCounterpartA} ${coinTypeA} needed`
      );

      // If the user didn't provide enough coin A, increase it (up to their available balance)
      // Add a small buffer to ensure we have enough
      const requiredWithBuffer =
        requiredCounterpartA * (1 + MAX_OTHER_BUFFER_PCT);

      if (effectiveAmountA < requiredWithBuffer) {
        const oldAmount = effectiveAmountA;
        // Cap at 95% of their balance to leave some for gas
        const maxAvailable = availableA * 0.95;
        effectiveAmountA = Math.min(requiredWithBuffer, maxAvailable);

        console.log(
          `Adjusted ${coinTypeA} amount from ${oldAmount} to ${effectiveAmountA} to ensure sufficient counterpart`
        );

        // If we still don't have enough of coin A, we should reduce coin B instead
        if (effectiveAmountA < requiredWithBuffer) {
          console.log(
            `Warning: Not enough ${coinTypeA} available. Will reduce the amount of ${coinTypeB} used.`
          );

          // Calculate how much of coin B we can actually use with the available coin A
          const reducedAmountB =
            effectiveAmountB * (effectiveAmountA / requiredWithBuffer);
          console.log(
            `Reducing ${coinTypeB} from ${effectiveAmountB} to ${reducedAmountB} due to limited ${coinTypeA}`
          );
          effectiveAmountB = reducedAmountB;
        }
      }
    }

    // Convert human amounts to chain amounts using CORRECT decimals
    // Using 'let' instead of 'const' because these values might be adjusted later
    let amountAOnChain = Math.floor(effectiveAmountA * 10 ** decimalsA);
    let amountBOnChain = Math.floor(effectiveAmountB * 10 ** decimalsB);

    console.log("Final amounts for liquidity provision:", {
      poolId,
      coinTypeA,
      coinTypeB,
      amountA: effectiveAmountA,
      amountB: effectiveAmountB,
      amountAOnChain,
      amountBOnChain,
      lowerTick: lowerTickSnapped,
      upperTick: upperTickSnapped,
      currentTick,
      currentPrice,
      tickSpacing,
      decimalsA,
      decimalsB,
      slippagePct,
      fixedSide: aIsFixed ? coinTypeA : coinTypeB,
    });

    // Create transaction block - essential to create a new one for each attempt
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // =========== STEP 1: Create the Position ============
    // First, we create the position - NOW WITH UPDATED PACKAGE ID AND CONFIG ID
    const position = txb.moveCall({
      target: `${packageId}::pool::open_position`,
      arguments: [
        txb.object(configId), // Use the current config object
        txb.object(poolId),
        txb.pure(toU32(lowerTickSnapped), "u32"),
        txb.pure(toU32(upperTickSnapped), "u32"),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // =========== STEP 2: Prepare Coins ================
    // Prepare coinA with sufficient balance
    let coinA = prepareCoinWithSufficientBalance(
      txb,
      coinsA.data,
      amountAOnChain,
      isCoinA_SUI
    );

    // Prepare coinB with sufficient balance
    let coinB = prepareCoinWithSufficientBalance(
      txb,
      coinsB.data,
      amountBOnChain,
      isCoinB_SUI
    );

    console.log(`Prepared coins for deposit: 
      coinA (${isCoinA_SUI ? "SUI" : coinTypeA}): ${amountAOnChain}
      coinB (${isCoinB_SUI ? "SUI" : coinTypeB}): ${amountBOnChain}`);

    // =========== STEP 3: Add Liquidity to Position ============
    // Get the arguments in the correct order with slippage buffer for min amount
    // Pass RAW amounts to the helper, NOT transaction arguments
    const liquidityArgs = buildLiquidityArgs(
      aIsFixed,
      coinA,
      coinB,
      amountAOnChain, // Raw number
      amountBOnChain, // Raw number
      slippagePct,
      txb
    );

    // Create a proper TransactionArgument for the boolean
    const aIsFixedArg = pureBool(txb, aIsFixed);

    // Log which side is fixed for debugging
    console.log(
      `Fixed side is coin${aIsFixed ? "A" : "B"} (${
        aIsFixed ? coinTypeA : coinTypeB
      })`
    );

    // Get the correct initial shared version of the pool
    const initialSharedVersion = await getInitialVersion(poolId);
    console.log(
      `Using initial shared version for pool: ${initialSharedVersion}`
    );

    // Create a pool ref with the correct initial version and mutable=true
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialSharedVersion,
      mutable: true, // Pool must be mutable
    });

    // Add liquidity to the created position
    // IMPORTANT: gateway::provide_liquidity_with_fixed_amount returns TWO values:
    // 0 -> leftover_a: vector<Coin<CoinTypeA>> (may be empty vector)
    // 1 -> leftover_b: vector<Coin<CoinTypeB>> (may be empty vector)
    // The position is mutated in-place (&mut), it is NOT returned
    const [leftoverA, leftoverB] = txb.moveCall({
      target: `${packageId}::gateway::provide_liquidity_with_fixed_amount`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(configId),
        poolRef, // &mut Pool (shared, mutable)
        position, // &mut Position - mutated, not consumed
        ...liquidityArgs,
        aIsFixedArg,
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Always transfer any residual coins back to the user; otherwise
    // the transaction will abort if the vectors are non-empty.
    txb.transferObjects([leftoverA, leftoverB], txb.pure(walletAddress));

    // Finally return the mutated position to the user
    txb.transferObjects([position], txb.pure(walletAddress));

    // =========== STEP 4: Build and Return Transaction ============
    // This is the simplest transaction that should work
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log(
      "Transaction built successfully with proper argument ordering, correct decimal precision, and sufficient counterpart coins"
    );

    // Log the base64 transaction bytes for dev-inspect debugging
    console.log(
      `To debug with dev-inspect: sui client dev-inspect --gas-budget 30000000 --tx-bytes ${base64Tx.substring(
        0,
        20
      )}...`
    );

    return base64Tx;
  } catch (error) {
    console.error("Error building transaction:", error);

    // Check for Bluefin-specific errors
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      // Throw a more user-friendly error
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Otherwise throw the original error
    throw error;
  }
}

/**
 * Builds a transaction for adding liquidity to an existing position
 * with proper handling of SUI whether it's coinTypeA or coinTypeB
 */
export async function buildAddLiquidityTx({
  poolId,
  positionId,
  amountA,
  amountB = 0,
  slippagePct = DEFAULT_SLIPPAGE_PCT, // Allow UI to pass this
  walletAddress,
  // Allow optionally overriding which coin is fixed
  fixedCoinOverride = null, // "A", "B", or null (for auto-determine)
}) {
  if (!poolId || !positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: poolId, positionId, and walletAddress"
    );
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin package ID and config object ID
  const packageId = await getBluefinPackageId();
  const configId = await getBluefinConfigObjectId();
  console.log(
    `Using Bluefin package ID: ${packageId}, config object ID: ${configId}`
  );

  try {
    // Get pool details
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;
    const currentPrice = pool.currentPrice;

    // Determine if either coin is SUI
    const SUI_TYPE = "0x2::sui::SUI";
    const isCoinA_SUI = coinTypeA === SUI_TYPE;
    const isCoinB_SUI = coinTypeB === SUI_TYPE;

    console.log(
      `Pool ${poolId} coin types: A=${coinTypeA} (${
        isCoinA_SUI ? "SUI" : "not SUI"
      }), B=${coinTypeB} (${isCoinB_SUI ? "SUI" : "not SUI"})`
    );

    // Get position details to find the tick range
    const positionResponse = await suiClient.getObject({
      id: positionId,
      options: { showContent: true },
    });

    if (!positionResponse.data) {
      throw new Error(`Failed to retrieve position data for ${positionId}`);
    }

    const positionContent = positionResponse.data.content;
    const positionFields = positionContent.fields;

    // Extract tick range from position
    const lowerTickSnapped = Number(
      positionFields.lower_tick_index?.fields?.bits ?? "0"
    );
    const upperTickSnapped = Number(
      positionFields.upper_tick_index?.fields?.bits ?? "0"
    );

    // === GET USER BALANCE INFORMATION ===
    // Get coins for both token types
    const coinsA = await suiClient.getCoins({
      owner: walletAddress,
      coinType: coinTypeA,
    });

    const coinsB = await suiClient.getCoins({
      owner: walletAddress,
      coinType: coinTypeB,
    });

    // Check if we have the coins available
    if (!coinsA.data || coinsA.data.length === 0) {
      throw new Error(`No coins of type ${coinTypeA} found in wallet`);
    }

    if (!coinsB.data || coinsB.data.length === 0) {
      throw new Error(`No coins of type ${coinTypeB} found in wallet`);
    }

    // Calculate total balances
    let totalBalanceA = 0;
    for (const coin of coinsA.data) {
      totalBalanceA += Number(coin.balance);
    }

    let totalBalanceB = 0;
    for (const coin of coinsB.data) {
      totalBalanceB += Number(coin.balance);
    }

    // Get the correct decimal places for each token from on-chain metadata
    const decimalsA = await getDecimals(suiClient, coinTypeA);
    const decimalsB = await getDecimals(suiClient, coinTypeB);

    console.log(
      `Using correct decimal precision: ${coinTypeA}=${decimalsA}, ${coinTypeB}=${decimalsB}`
    );

    // Convert to human-readable amounts
    const availableA = totalBalanceA / 10 ** decimalsA;
    const availableB = totalBalanceB / 10 ** decimalsB;

    console.log(
      `Available ${coinTypeA}: ${availableA} (${totalBalanceA} base units)`
    );
    console.log(
      `Available ${coinTypeB}: ${availableB} (${totalBalanceB} base units)`
    );

    // Use user-provided amounts or set reasonable defaults
    let effectiveAmountA = amountA || 0.03;
    let effectiveAmountB = amountB || 0.1;

    // =========== DETERMINE FIXED SIDE STRATEGY ============
    // Choose which side to fix based on strategic considerations including:
    // - User intent (override if provided)
    // - Value comparison (fix the lower-value asset)
    // - Gas considerations (prefer non-SUI if values are similar)
    const aIsFixed = chooseFixedSide(
      effectiveAmountA,
      effectiveAmountB,
      isCoinA_SUI,
      isCoinB_SUI,
      currentPrice,
      fixedCoinOverride
    );

    // =========== CALCULATE REQUIRED COUNTERPART AMOUNT ============
    // For whichever side is fixed, calculate how much of the other coin is required
    // based on the fixed amount and the chosen price range

    if (aIsFixed) {
      // We're fixing coin A, calculate required amount of coin B
      const requiredCounterpartB = calculateCounterpartAmount(
        pool,
        effectiveAmountA,
        true, // isFixedCoinA = true
        lowerTickSnapped,
        upperTickSnapped
      );

      console.log(
        `For ${effectiveAmountA} ${coinTypeA}, calculated ${requiredCounterpartB} ${coinTypeB} needed`
      );

      // If the user didn't provide enough coin B, increase it (up to their available balance)
      // Add a small buffer to ensure we have enough
      const requiredWithBuffer =
        requiredCounterpartB * (1 + MAX_OTHER_BUFFER_PCT);

      if (effectiveAmountB < requiredWithBuffer) {
        const oldAmount = effectiveAmountB;
        // Cap at 95% of their balance to leave some for gas
        const maxAvailable = availableB * 0.95;
        effectiveAmountB = Math.min(requiredWithBuffer, maxAvailable);

        console.log(
          `Adjusted ${coinTypeB} amount from ${oldAmount} to ${effectiveAmountB} to ensure sufficient counterpart`
        );

        // If we still don't have enough of coin B, we should reduce coin A instead
        if (effectiveAmountB < requiredWithBuffer) {
          console.log(
            `Warning: Not enough ${coinTypeB} available. Will reduce the amount of ${coinTypeA} used.`
          );

          // Calculate how much of coin A we can actually use with the available coin B
          const reducedAmountA =
            effectiveAmountA * (effectiveAmountB / requiredWithBuffer);
          console.log(
            `Reducing ${coinTypeA} from ${effectiveAmountA} to ${reducedAmountA} due to limited ${coinTypeB}`
          );
          effectiveAmountA = reducedAmountA;
        }
      }
    } else {
      // We're fixing coin B, calculate required amount of coin A
      const requiredCounterpartA = calculateCounterpartAmount(
        pool,
        effectiveAmountB,
        false, // isFixedCoinA = false
        lowerTickSnapped,
        upperTickSnapped
      );

      console.log(
        `For ${effectiveAmountB} ${coinTypeB}, calculated ${requiredCounterpartA} ${coinTypeA} needed`
      );

      // If the user didn't provide enough coin A, increase it (up to their available balance)
      // Add a small buffer to ensure we have enough
      const requiredWithBuffer =
        requiredCounterpartA * (1 + MAX_OTHER_BUFFER_PCT);

      if (effectiveAmountA < requiredWithBuffer) {
        const oldAmount = effectiveAmountA;
        // Cap at 95% of their balance to leave some for gas
        const maxAvailable = availableA * 0.95;
        effectiveAmountA = Math.min(requiredWithBuffer, maxAvailable);

        console.log(
          `Adjusted ${coinTypeA} amount from ${oldAmount} to ${effectiveAmountA} to ensure sufficient counterpart`
        );

        // If we still don't have enough of coin A, we should reduce coin B instead
        if (effectiveAmountA < requiredWithBuffer) {
          console.log(
            `Warning: Not enough ${coinTypeA} available. Will reduce the amount of ${coinTypeB} used.`
          );

          // Calculate how much of coin B we can actually use with the available coin A
          const reducedAmountB =
            effectiveAmountB * (effectiveAmountA / requiredWithBuffer);
          console.log(
            `Reducing ${coinTypeB} from ${effectiveAmountB} to ${reducedAmountB} due to limited ${coinTypeA}`
          );
          effectiveAmountB = reducedAmountB;
        }
      }
    }

    // Convert human amounts to chain amounts using CORRECT decimals
    let amountAOnChain = Math.floor(effectiveAmountA * 10 ** decimalsA);
    let amountBOnChain = Math.floor(effectiveAmountB * 10 ** decimalsB);

    console.log("Final amounts for adding liquidity:", {
      poolId,
      positionId,
      coinTypeA,
      coinTypeB,
      amountA: effectiveAmountA,
      amountB: effectiveAmountB,
      amountAOnChain,
      amountBOnChain,
      lowerTickSnapped,
      upperTickSnapped,
      currentPrice,
      decimalsA,
      decimalsB,
      slippagePct,
      fixedSide: aIsFixed ? coinTypeA : coinTypeB,
    });

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // =========== STEP 1: Prepare Coins ================
    // Prepare coinA with sufficient balance
    let coinA = prepareCoinWithSufficientBalance(
      txb,
      coinsA.data,
      amountAOnChain,
      isCoinA_SUI
    );

    // Prepare coinB with sufficient balance
    let coinB = prepareCoinWithSufficientBalance(
      txb,
      coinsB.data,
      amountBOnChain,
      isCoinB_SUI
    );

    console.log(`Prepared coins for adding liquidity: 
      coinA (${isCoinA_SUI ? "SUI" : coinTypeA}): ${amountAOnChain}
      coinB (${isCoinB_SUI ? "SUI" : coinTypeB}): ${amountBOnChain}`);

    // =========== STEP 2: Add Liquidity to Position ============
    // Get the arguments in the correct order with slippage buffer for min amount
    const liquidityArgs = buildLiquidityArgs(
      aIsFixed,
      coinA,
      coinB,
      amountAOnChain,
      amountBOnChain,
      slippagePct,
      txb
    );

    // Create a proper TransactionArgument for the boolean
    const aIsFixedArg = pureBool(txb, aIsFixed);

    // Log which side is fixed for debugging
    console.log(
      `Fixed side is coin${aIsFixed ? "A" : "B"} (${
        aIsFixed ? coinTypeA : coinTypeB
      })`
    );

    // Get the correct initial shared version of the pool
    const initialSharedVersion = await getInitialVersion(poolId);
    console.log(
      `Using initial shared version for pool: ${initialSharedVersion}`
    );

    // Create a pool ref with the correct initial version and mutable=true
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialSharedVersion,
      mutable: true, // Pool must be mutable
    });

    // Call the provide liquidity function
    // IMPORTANT: gateway::provide_liquidity_with_fixed_amount returns TWO values:
    // 0 -> leftover_a: vector<Coin<CoinTypeA>> (may be empty vector)
    // 1 -> leftover_b: vector<Coin<CoinTypeB>> (may be empty vector)
    // The position is mutated in-place (&mut), it is NOT returned
    const [leftoverA, leftoverB] = txb.moveCall({
      target: `${packageId}::gateway::provide_liquidity_with_fixed_amount`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(configId),
        poolRef, // &mut Pool (shared, mutable)
        txb.object(positionId), // &mut Position - mutated, not consumed
        ...liquidityArgs,
        aIsFixedArg,
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Always transfer any residual coins back to the user; otherwise
    // the transaction will abort if the vectors are non-empty.
    txb.transferObjects([leftoverA, leftoverB], txb.pure(walletAddress));

    // We don't need to transfer positionId back since it was mutated in place
    // and the user already owns it

    // =========== STEP 3: Build and Return Transaction ============
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log(
      "Add liquidity transaction built successfully with slippage tolerance and sufficient counterpart coins"
    );

    // Log the base64 transaction bytes for dev-inspect debugging
    console.log(
      `To debug with dev-inspect: sui client dev-inspect --gas-budget 30000000 --tx-bytes ${base64Tx.substring(
        0,
        20
      )}...`
    );

    return base64Tx;
  } catch (error) {
    console.error("Error building add liquidity transaction:", error);

    // Check for Bluefin-specific errors
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      // Throw a more user-friendly error
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Otherwise throw the original error
    throw error;
  }
}

/**
 * Builds a transaction for removing liquidity from a position
 */
export async function buildRemoveLiquidityTx({
  poolId,
  positionId,
  percent = 100,
  walletAddress,
}) {
  if (!poolId || !positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: poolId, positionId, and walletAddress"
    );
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin package ID and config object ID
  const packageId = await getBluefinPackageId();
  const configId = await getBluefinConfigObjectId();
  console.log(
    `Using Bluefin package ID: ${packageId}, config object ID: ${configId}`
  );

  try {
    // Get pool details using the helper
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    // Get position details
    const positionResponse = await suiClient.getObject({
      id: positionId,
      options: { showContent: true },
    });

    if (!positionResponse.data) {
      throw new Error(`Failed to retrieve position data for ${positionId}`);
    }

    const positionContent = positionResponse.data.content;
    const positionFields = positionContent.fields;

    // Calculate liquidity to remove
    const currentLiquidity = positionFields.liquidity;
    const liquidityToRemove =
      (BigInt(currentLiquidity) * BigInt(percent)) / BigInt(100);

    console.log("Building remove liquidity transaction:", {
      poolId,
      positionId,
      percent,
      liquidityToRemove: liquidityToRemove.toString(),
    });

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the CORRECT initial shared version from the owner field
    const initialSharedVersion = await getInitialVersion(poolId);
    console.log(
      `Using initial shared version for pool: ${initialSharedVersion}`
    );

    // Create a pool ref with the correct initial version and mutable=true
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialSharedVersion,
      mutable: true, // Pool must be mutable
    });

    // FIXED: Updated argument order AND added destination parameter
    // Clock → Config → Pool → Position → liquidity → min_coins_a → min_coins_b → destination
    txb.moveCall({
      target: `${packageId}::gateway::remove_liquidity`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        txb.object(configId), // &mut Config (owned)
        poolRef, // &mut Pool (shared, mutable)
        txb.object(positionId), // &mut Position (owned)
        txb.pure(liquidityToRemove.toString(), "u128"), // liquidity amount
        txb.pure("0", "u64"), // min_amount_a (0 for no slippage check)
        txb.pure("0", "u64"), // min_amount_b (0 for no slippage check)
        txb.pure(walletAddress, "address"), // destination address for withdrawn coins
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // No need to manually transfer objects - the Move function sends coins directly to the destination address

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Remove liquidity transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building remove liquidity transaction:", error);

    // Check for Bluefin-specific errors
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      // Throw a more user-friendly error
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Otherwise throw the original error
    throw error;
  }
}

/**
 * Builds a transaction for collecting fees from a position
 */
export async function buildCollectFeesTx({
  poolId,
  positionId,
  walletAddress,
}) {
  if (!poolId || !positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: poolId, positionId, and walletAddress"
    );
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin package ID and config object ID
  const packageId = await getBluefinPackageId();
  const configId = await getBluefinConfigObjectId();
  console.log(
    `Using Bluefin package ID: ${packageId}, config object ID: ${configId}`
  );

  try {
    // Get pool details using the helper
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    console.log("Building collect fees transaction:", {
      poolId,
      positionId,
    });

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the CORRECT initial shared version from the owner field
    const initialSharedVersion = await getInitialVersion(poolId);
    console.log(
      `Using initial shared version for pool: ${initialSharedVersion}`
    );

    // Create a pool ref with the correct initial version and mutable=true
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialSharedVersion,
      mutable: true, // Pool must be mutable
    });

    // Clock → Config → Pool → Position
    // Note: Bluefin moves fees directly to the transaction signer
    txb.moveCall({
      target: `${packageId}::gateway::collect_fee`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        txb.object(configId), // &mut Config (owned)
        poolRef, // &mut Pool (shared, mutable)
        txb.object(positionId), // &mut Position (owned)
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // No need to capture return or transfer objects - fees are sent directly to wallet

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Collect fees transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building collect fees transaction:", error);

    // Check for Bluefin-specific errors
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      // Throw a more user-friendly error
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Otherwise throw the original error
    throw error;
  }
}

/**
 * Builds a transaction for collecting rewards from a position
 */
export async function buildCollectRewardsTx({
  poolId,
  positionId,
  walletAddress,
}) {
  if (!poolId || !positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: poolId, positionId, and walletAddress"
    );
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin package ID and config object ID
  const packageId = await getBluefinPackageId();
  const configId = await getBluefinConfigObjectId();
  console.log(
    `Using Bluefin package ID: ${packageId}, config object ID: ${configId}`
  );

  try {
    // Get pool details using the helper
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    // Default reward coin type for Bluefin (BLUE token)
    const rewardCoinType =
      "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::blue::BLUE";

    console.log("Building collect rewards transaction:", {
      poolId,
      positionId,
    });

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the CORRECT initial shared version from the owner field
    const initialSharedVersion = await getInitialVersion(poolId);
    console.log(
      `Using initial shared version for pool: ${initialSharedVersion}`
    );

    // Create a pool ref with the correct initial version and mutable=true
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialSharedVersion,
      mutable: true, // Pool must be mutable
    });

    // Clock → Config → Pool → Position
    // Note: Bluefin moves rewards directly to the transaction signer
    txb.moveCall({
      target: `${packageId}::gateway::collect_reward`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        txb.object(configId), // &mut Config (owned)
        poolRef, // &mut Pool (shared, mutable)
        txb.object(positionId), // &mut Position (owned)
      ],
      typeArguments: [coinTypeA, coinTypeB, rewardCoinType],
    });

    // Clock → Config → Pool → Position
    // Note: Bluefin moves rewards directly to the transaction signer
    txb.moveCall({
      target: `${packageId}::gateway::collect_reward`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        txb.object(configId), // &mut Config (owned)
        poolRef, // &mut Pool (shared, mutable)
        txb.object(positionId), // &mut Position (owned)
      ],
      typeArguments: [coinTypeA, coinTypeB, rewardCoinType],
    });

    // No need to capture return or transfer objects - rewards are sent directly to wallet

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Collect rewards transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building collect rewards transaction:", error);

    // Check for Bluefin-specific errors
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      // Throw a more user-friendly error
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Otherwise throw the original error
    throw error;
  }
}

/**
 * Builds a transaction for collecting both fees and rewards in one step
 */
export async function buildCollectFeesAndRewardsTx({
  poolId,
  positionId,
  walletAddress,
}) {
  if (!positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: positionId and walletAddress"
    );
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin package ID
  const packageId = await getBluefinPackageId();
  const configId = await getBluefinConfigObjectId();

  try {
    console.log("Building collect fees and rewards transaction:", {
      positionId,
    });

    // Get pool details using the helper
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the CORRECT initial shared version from the owner field
    const initialSharedVersion = await getInitialVersion(poolId);
    console.log(
      `Using initial shared version for pool: ${initialSharedVersion}`
    );

    // Create a pool ref with the correct initial version and mutable=true
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialSharedVersion,
      mutable: true, // Pool must be mutable
    });

    // Clock → Config → Pool → Position
    // Note: Bluefin moves fees and rewards directly to the transaction signer
    txb.moveCall({
      target: `${packageId}::gateway::collect_fee_and_rewards`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        txb.object(configId), // &mut Config (owned)
        poolRef, // &mut Pool (shared, mutable)
        txb.object(positionId), // &mut Position (owned)
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // No need to capture return or transfer objects - fees and rewards are sent directly to wallet

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Collect fees and rewards transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error(
      "Error building collect fees and rewards transaction:",
      error
    );

    // Check for Bluefin-specific errors
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      // Throw a more user-friendly error
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Otherwise throw the original error
    throw error;
  }
}

/**
 * Builds a transaction for closing a position
 */
export async function buildClosePositionTx({
  poolId,
  positionId,
  walletAddress,
}) {
  if (!poolId || !positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: poolId, positionId, and walletAddress"
    );
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin package ID and config object ID
  const packageId = await getBluefinPackageId();
  const configId = await getBluefinConfigObjectId();
  console.log(
    `Using Bluefin package ID: ${packageId}, config object ID: ${configId}`
  );

  try {
    // Get pool details using the helper
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    console.log("Building close position transaction:", {
      poolId,
      positionId,
    });

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the CORRECT initial shared version from the owner field
    const initialSharedVersion = await getInitialVersion(poolId);
    console.log(
      `Using initial shared version for pool: ${initialSharedVersion}`
    );

    // Create a pool ref with the correct initial version and mutable=true
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialSharedVersion,
      mutable: true, // Pool must be mutable
    });

    // FIXED: Updated argument order AND added destination parameter
    // Clock → Config → Pool → Position → destination
    txb.moveCall({
      target: `${packageId}::gateway::close_position`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        txb.object(configId), // &mut Config (owned)
        poolRef, // &mut Pool (shared, mutable)
        txb.object(positionId), // Position (owned by value)
        txb.pure(walletAddress, "address"), // destination address for withdrawn assets
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // No need to manually transfer objects - the Move function sends coins directly to the destination address

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Close position transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building close position transaction:", error);

    // Check for Bluefin-specific errors
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      // Throw a more user-friendly error
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }

    // Otherwise throw the original error
    throw error;
  }
}

// Export the error utilities to be used elsewhere
export { BLUEFIN_ABORTS, extractBluefinError };
