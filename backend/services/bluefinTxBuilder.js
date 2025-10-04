// services/bluefinTxBuilder.js
// Updated: 2025-08-07 02:50:15 UTC by jake1318

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
// Reduced to 1% as per user request to prevent taking too much extra
const MAX_OTHER_BUFFER_PCT = 0.01; // Reduced from 0.05 to 0.01 (1%)

// Define the default BLUE token address - updated with the correct one from transaction
const DEFAULT_BLUE_TOKEN =
  "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE";

// Define Bluefin-specific error codes and their user-friendly messages
const BLUEFIN_ABORTS = {
  1003: "Selected price range is no longer valid",
  1004: "Required token amount exceeds your maximum",
  1005: "Slippage tolerance exceeded",
  1010: "Invalid tick range for position - doesn't match pool's tick spacing",
  1018: "Position cannot be closed yet (cooldown period)",
  1029: "Position has no liquidity to remove",
};

/**
 * Helper function to create a pure u64 value for transaction arguments
 * @param {TransactionBlock} txb - Transaction block instance
 * @param {BigInt|number|string} n - The value to convert to u64
 * @returns {TransactionArgument} - A transaction argument of u64 type
 */
function toPureU64(txb, n) {
  return txb.pure(n.toString(), "u64");
}

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
 * Gets all available reward token types for a specific position using the Blockvision API
 *
 * @param {string} walletAddress - The wallet address of the user
 * @param {string} positionId - The position ID to get rewards for
 * @returns {Promise<{rewardTokens: string[], hasRewards: boolean, rewardData: Object}>} - Object with reward tokens, boolean if any rewards exist, and reward data
 */
export async function getRewardTokensForPosition(walletAddress, positionId) {
  try {
    // Get the API key from environment variables - check for Vite prefix
    const API_KEY =
      process.env.VITE_BLOCKVISION_API_KEY || process.env.BLOCKVISION_API_KEY;

    if (!API_KEY) {
      console.warn("Blockvision API key not found in environment variables");
      return {
        rewardTokens: [DEFAULT_BLUE_TOKEN],
        hasRewards: false,
        rewardData: null,
      };
    }

    const response = await fetch(
      `https://api.blockvision.org/v2/sui/account/defiPortfolio?address=${walletAddress}&protocol=bluefin`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": API_KEY,
        },
      }
    );

    const data = await response.json();

    if (data.code !== 200 || !data.result || !data.result.bluefin) {
      console.warn("Failed to get Bluefin portfolio from Blockvision:", data);
      return {
        rewardTokens: [DEFAULT_BLUE_TOKEN],
        hasRewards: false,
        rewardData: null,
      };
    }

    // Find the position in the API response
    const positions = data.result.bluefin.lps || [];
    const position = positions.find((p) => p.positionId === positionId);

    if (!position || !position.reward || !position.reward.rewards) {
      console.warn(
        `Position ${positionId} not found in Blockvision data or has no rewards`
      );
      return {
        rewardTokens: [DEFAULT_BLUE_TOKEN],
        hasRewards: false,
        rewardData: null,
      };
    }

    // Check if there are any fees to collect
    const hasFees =
      position.reward.fee &&
      (parseFloat(position.reward.fee.coinA) > 0 ||
        parseFloat(position.reward.fee.coinB) > 0);

    // Extract reward token types and filter out empty rewards
    const rewardTokensWithAmounts = position.reward.rewards
      .filter(
        (reward) => reward.coinAmount && parseFloat(reward.coinAmount) > 0
      )
      .map((reward) => ({
        type: reward.coinType,
        amount: parseFloat(reward.coinAmount),
      }));

    const hasRewards = rewardTokensWithAmounts.length > 0 || hasFees;

    // If no tokens with non-zero balance found, return default token
    if (rewardTokensWithAmounts.length === 0) {
      console.log(
        `No tokens with claimable rewards found for position ${positionId}, using default`
      );
      return {
        rewardTokens: [DEFAULT_BLUE_TOKEN],
        hasRewards: hasFees,
        rewardData: position.reward,
      };
    }

    const rewardTokens = rewardTokensWithAmounts.map((r) => r.type);

    console.log(
      `Found ${rewardTokens.length} reward tokens for position ${positionId}:`,
      rewardTokens
    );
    return {
      rewardTokens,
      hasRewards,
      rewardData: position.reward,
    };
  } catch (error) {
    console.error("Error fetching reward tokens from Blockvision:", error);
    // Return default token on error
    return {
      rewardTokens: [DEFAULT_BLUE_TOKEN],
      hasRewards: false,
      rewardData: null,
    };
  }
}

/**
 * Checks if a position has any liquidity
 *
 * @param {string} positionId - The position ID to check
 * @returns {Promise<boolean>} - Whether the position has liquidity
 */
export async function positionHasLiquidity(positionId) {
  try {
    const suiClient = await getSuiClient();

    // Get position details
    const positionResponse = await suiClient.getObject({
      id: positionId,
      options: { showContent: true },
    });

    if (!positionResponse.data) {
      console.warn(`Failed to retrieve position data for ${positionId}`);
      return false;
    }

    const positionContent = positionResponse.data.content;
    const positionFields = positionContent.fields;

    // Check if the position has any liquidity
    const liquidity = BigInt(positionFields.liquidity || "0");
    return liquidity > 0n;
  } catch (error) {
    console.error(
      `Error checking if position ${positionId} has liquidity:`,
      error
    );
    return false;
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
  return txb.pure.bool(value); // Use explicit boolean type
}

/**
 * Function to get the correct tick spacing based on pool fields
 * @param {Object} poolFields - Pool fields from the on-chain object
 * @returns {number} The correct tick spacing value
 */
function getCorrectTickSpacing(poolFields) {
  // Try to extract tick spacing from the pool fields
  let tickSpacing;
  if (typeof poolFields.ticks_manager?.fields?.tick_spacing === "number") {
    tickSpacing = poolFields.ticks_manager.fields.tick_spacing;
  } else if (
    typeof poolFields.ticks_manager?.fields?.tick_spacing === "string"
  ) {
    tickSpacing = Number(poolFields.ticks_manager.fields.tick_spacing);
  } else {
    // If we can't get the tick spacing properly, try to determine from the fee
    const poolFee = poolFields.fee_rate?.fields?.value;
    if (poolFee === "3000") {
      // 0.3% fee (expressed in basis points)
      tickSpacing = 60;
    } else if (poolFee === "500") {
      // 0.05% fee
      tickSpacing = 10;
    } else if (poolFee === "100") {
      // 0.01% fee
      tickSpacing = 1;
    } else {
      // Default to 60 which is the most common spacing
      tickSpacing = 60;
    }
  }

  // FIXED: Never override the on-chain value - Bluefin changed several pools to spacing 1
  // Only fall back if the field is genuinely missing
  if (tickSpacing === undefined || tickSpacing === null) {
    console.warn("Tick spacing value missing, defaulting to 60");
    tickSpacing = 60;
  }

  return tickSpacing;
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

  // IMPROVED: If the user provided both amounts, always fix the non-zero amount
  // or the larger amount if both are non-zero
  if (amountA > 0 && amountB === 0) {
    console.log("Fixing coin A (user only provided amount A)");
    return true;
  } else if (amountA === 0 && amountB > 0) {
    console.log("Fixing coin B (user only provided amount B)");
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
 * For non-SUI coins, uses a single coin or merges multiple coins without unnecessary splitting
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
    return txb.splitCoins(txb.gas, [txb.pure.u64(requiredBigInt.toString())]);
  }

  // For non-SUI tokens, sort coins by balance (largest first)
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
    // If we have a single coin with sufficient balance, use it directly
    return txb.object(sufficientCoin.coinObjectId);
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

  // Return the merged coin - contract will use what it needs and return leftovers
  return primaryCoin;
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
  // For the non-fixed side, we respect the exact user-provided amount
  const coinAMax = rawAmountA; // Use exactly what's provided
  const coinBMax = rawAmountB; // Use exactly what's provided

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
    toPureU64(txb, fixedAmount), // fixed_amount as u64
    toPureU64(txb, coinAMax), // coin_a_max as u64
    toPureU64(txb, coinBMax), // coin_b_max as u64
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
 * Builds a transaction for opening a position with liquidity in one step
 * with proper handling of SUI whether it's coinTypeA or coinTypeB
 */
export async function buildDepositTx({
  poolId,
  amountA,
  amountB = 0,
  lowerTickFactor = 0.5,
  upperTickFactor = 2.0,
  lowerTick, // Add direct tick inputs
  upperTick, // Add direct tick inputs
  isFullRange = false, // Add explicit full range flag
  slippagePct = DEFAULT_SLIPPAGE_PCT,
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

    // Get correct tick spacing
    const tickSpacing = getCorrectTickSpacing(poolFields);
    console.log(`Using tick spacing: ${tickSpacing} for pool ${poolId}`);

    // Convert the unsigned 32-bit tick index to signed int (from `bits`)
    const bits = poolFields.current_tick_index?.fields?.bits;
    if (bits === undefined) {
      console.dir(poolFields, { depth: null });
      throw new Error(
        `Could not read current_tick_index for pool ${poolId} – structure changed`
      );
    }

    const currentTick = toSignedI32(Number(bits));

    // Calculate or use provided ticks
    let lowerTickSnapped, upperTickSnapped;

    if (isFullRange) {
      // For full range positions, use the max range supported by Bluefin
      // The max range is typically around ±443636, but we snap to the tick spacing
      const maxTick = 443636;
      // Floor for lower tick, ceiling for upper tick to ensure we get the max range
      lowerTickSnapped = Math.floor(-maxTick / tickSpacing) * tickSpacing;
      upperTickSnapped = Math.ceil(maxTick / tickSpacing) * tickSpacing;

      console.log(
        `Setting FULL RANGE ticks: ${lowerTickSnapped} to ${upperTickSnapped}`
      );
    } else if (lowerTick !== undefined && upperTick !== undefined) {
      // If explicit ticks are provided, use them directly
      lowerTickSnapped = lowerTick;
      upperTickSnapped = upperTick;
      console.log(
        `Using explicit ticks: ${lowerTickSnapped} to ${upperTickSnapped}`
      );
    } else {
      // Calculate price range ticks from factors
      const lowerTick = Math.floor(
        currentTick - Math.log(1 / lowerTickFactor) / Math.log(1.0001)
      );
      const upperTick = Math.ceil(
        currentTick + Math.log(upperTickFactor) / Math.log(1.0001)
      );

      // Snap to initializable grid
      const snap = (t) => Math.round(t / tickSpacing) * tickSpacing;
      lowerTickSnapped = snap(lowerTick);
      upperTickSnapped = snap(upperTick);

      console.log(
        `Calculated ticks from factors: ${lowerTickSnapped} to ${upperTickSnapped}`
      );
    }

    // Safety check: ensure ticks are within allowed range
    const MAX_TICK = 443636;
    if (
      Math.abs(lowerTickSnapped) > MAX_TICK ||
      Math.abs(upperTickSnapped) > MAX_TICK
    ) {
      throw new Error(
        `Tick out of allowed range: ${lowerTickSnapped} to ${upperTickSnapped}`
      );
    }

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

    // Use exactly what the user provided - no defaults if amounts are specified
    // Only set defaults if no amounts are provided
    let effectiveAmountA =
      amountA !== undefined && amountA !== null ? amountA : 0.03;
    let effectiveAmountB =
      amountB !== undefined && amountB !== null ? amountB : 0;

    // IMPROVED: If both amounts are specified, respect user's values
    let aIsFixed;
    let aNeededIfBFixed = 0;
    let bNeededIfAFixed = 0;

    // Calculate counterpart amounts for information purposes
    if (effectiveAmountA > 0) {
      bNeededIfAFixed = calculateCounterpartAmount(
        pool,
        effectiveAmountA,
        true, // A is fixed
        lowerTickSnapped,
        upperTickSnapped
      );
    }

    if (effectiveAmountB > 0) {
      aNeededIfBFixed = calculateCounterpartAmount(
        pool,
        effectiveAmountB,
        false, // B is fixed
        lowerTickSnapped,
        upperTickSnapped
      );
    }

    // If user specified only one amount, fix that side
    if (effectiveAmountA > 0 && effectiveAmountB === 0) {
      aIsFixed = true;
      console.log(
        `User only specified amount A (${effectiveAmountA}), fixing coin A`
      );

      // Calculate how much of B is needed - use minimal buffer
      let requiredB = bNeededIfAFixed;
      // Only apply buffer if the amount is calculated (not user-provided)
      effectiveAmountB = requiredB * (1 + MAX_OTHER_BUFFER_PCT);

      // Cap at available balance (minus a safety margin for gas)
      const maxAvailableB = availableB * 0.95;
      if (effectiveAmountB > maxAvailableB) {
        console.log(
          `Calculated amount B (${effectiveAmountB}) exceeds available balance (${maxAvailableB}), capping`
        );
        effectiveAmountB = maxAvailableB;

        // If we can't provide enough B, proportionally reduce A
        if (requiredB > 0) {
          const reduction = effectiveAmountB / requiredB;
          const newAmountA = effectiveAmountA * reduction;
          console.log(
            `Reducing A from ${effectiveAmountA} to ${newAmountA} due to insufficient B`
          );
          effectiveAmountA = newAmountA;
        }
      }
    } else if (effectiveAmountA === 0 && effectiveAmountB > 0) {
      aIsFixed = false;
      console.log(
        `User only specified amount B (${effectiveAmountB}), fixing coin B`
      );

      // Calculate how much of A is needed - use minimal buffer
      let requiredA = aNeededIfBFixed;
      // Only apply buffer if the amount is calculated (not user-provided)
      effectiveAmountA = requiredA * (1 + MAX_OTHER_BUFFER_PCT);

      // Cap at available balance (minus a safety margin for gas)
      const maxAvailableA = availableA * 0.95;
      if (effectiveAmountA > maxAvailableA) {
        console.log(
          `Calculated amount A (${effectiveAmountA}) exceeds available balance (${maxAvailableA}), capping`
        );
        effectiveAmountA = maxAvailableA;

        // If we can't provide enough A, proportionally reduce B
        if (requiredA > 0) {
          const reduction = effectiveAmountA / requiredA;
          const newAmountB = effectiveAmountB * reduction;
          console.log(
            `Reducing B from ${effectiveAmountB} to ${newAmountB} due to insufficient A`
          );
          effectiveAmountB = newAmountB;
        }
      }
    } else {
      // Both amounts are specified or both are zero
      // Choose which side to fix based on strategic considerations
      aIsFixed = chooseFixedSide(
        effectiveAmountA,
        effectiveAmountB,
        isCoinA_SUI,
        isCoinB_SUI,
        currentPrice,
        fixedCoinOverride
      );

      // Respect user's amounts - no adjustment needed
      console.log(
        `Using user-provided amounts: A=${effectiveAmountA}, B=${effectiveAmountB}`
      );
    }

    // Convert human amounts to chain amounts using CORRECT decimals
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

    // =========== STEP 1: Get shared object references ============
    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create proper shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // =========== STEP 2: Create the Position ============
    // First, we create the position with explicit type annotations
    const newPosition = txb.moveCall({
      target: `${packageId}::pool::open_position`,
      arguments: [
        configRef,
        poolRef,
        txb.pure.u32(toU32(lowerTickSnapped)),
        txb.pure.u32(toU32(upperTickSnapped)),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // =========== STEP 3: Prepare Coins ================
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

    // =========== STEP 4: Add Liquidity to Position ============
    // Convert to BigInt for precise calculations
    const rawAmountA = BigInt(amountAOnChain);
    const rawAmountB = BigInt(amountBOnChain);

    // Calculate the fixed amount based on which side is fixed
    const fixedAmount = aIsFixed ? rawAmountA : rawAmountB;

    // Set max amounts - use exactly what the user provided
    const coinAMax = rawAmountA;
    const coinBMax = rawAmountB;

    // Log which side is fixed for debugging
    console.log(
      `Fixed side is coin${aIsFixed ? "A" : "B"} (${
        aIsFixed ? coinTypeA : coinTypeB
      })`
    );

    // FIXED: Pass numbers as u64 strings to match Move contract parameters
    txb.moveCall({
      target: `${packageId}::gateway::provide_liquidity_with_fixed_amount`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        configRef,
        poolRef,
        newPosition,
        coinA,
        coinB,
        toPureU64(txb, fixedAmount), // Properly serialized as u64
        toPureU64(txb, coinAMax), // Properly serialized as u64
        toPureU64(txb, coinBMax), // Properly serialized as u64
        txb.pure.bool(aIsFixed),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Transfer the position NFT to the user's wallet
    txb.transferObjects([newPosition], txb.pure.address(walletAddress));

    // =========== STEP 5: Build and Return Transaction ============
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Transaction built successfully with proper u64 serialization");

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

    // Use exactly what the user provided - no defaults if amounts are specified
    // Only set defaults if no amounts are provided
    let effectiveAmountA =
      amountA !== undefined && amountA !== null ? amountA : 0.03;
    let effectiveAmountB =
      amountB !== undefined && amountB !== null ? amountB : 0;

    // IMPROVED: Better fixed-side selection for full-range deposits
    // Check if this is a full-range deposit by calculating range width
    const rangeWidth = Math.abs(upperTickSnapped - lowerTickSnapped);
    const isFullRangeDeposit = rangeWidth >= 800000; // Rough estimate for full range

    // IMPROVED: If both amounts are specified, respect user's values
    let aIsFixed;
    let aNeededIfBFixed = 0;
    let bNeededIfAFixed = 0;

    // Calculate counterpart amounts for information purposes
    if (effectiveAmountA > 0) {
      bNeededIfAFixed = calculateCounterpartAmount(
        pool,
        effectiveAmountA,
        true, // A is fixed
        lowerTickSnapped,
        upperTickSnapped
      );
    }

    if (effectiveAmountB > 0) {
      aNeededIfBFixed = calculateCounterpartAmount(
        pool,
        effectiveAmountB,
        false, // B is fixed
        lowerTickSnapped,
        upperTickSnapped
      );
    }

    // If user specified only one amount, fix that side
    if (effectiveAmountA > 0 && effectiveAmountB === 0) {
      aIsFixed = true;
      console.log(
        `User only specified amount A (${effectiveAmountA}), fixing coin A`
      );

      // Calculate how much of B is needed - use minimal buffer
      let requiredB = bNeededIfAFixed;
      // Only apply buffer if the amount is calculated (not user-provided)
      effectiveAmountB = requiredB * (1 + MAX_OTHER_BUFFER_PCT);

      // Cap at available balance (minus a safety margin for gas)
      const maxAvailableB = availableB * 0.95;
      if (effectiveAmountB > maxAvailableB) {
        console.log(
          `Calculated amount B (${effectiveAmountB}) exceeds available balance (${maxAvailableB}), capping`
        );
        effectiveAmountB = maxAvailableB;

        // If we can't provide enough B, proportionally reduce A
        if (requiredB > 0) {
          const reduction = effectiveAmountB / requiredB;
          const newAmountA = effectiveAmountA * reduction;
          console.log(
            `Reducing A from ${effectiveAmountA} to ${newAmountA} due to insufficient B`
          );
          effectiveAmountA = newAmountA;
        }
      }
    } else if (effectiveAmountA === 0 && effectiveAmountB > 0) {
      aIsFixed = false;
      console.log(
        `User only specified amount B (${effectiveAmountB}), fixing coin B`
      );

      // Calculate how much of A is needed - use minimal buffer
      let requiredA = aNeededIfBFixed;
      // Only apply buffer if the amount is calculated (not user-provided)
      effectiveAmountA = requiredA * (1 + MAX_OTHER_BUFFER_PCT);

      // Cap at available balance (minus a safety margin for gas)
      const maxAvailableA = availableA * 0.95;
      if (effectiveAmountA > maxAvailableA) {
        console.log(
          `Calculated amount A (${effectiveAmountA}) exceeds available balance (${maxAvailableA}), capping`
        );
        effectiveAmountA = maxAvailableA;

        // If we can't provide enough A, proportionally reduce B
        if (requiredA > 0) {
          const reduction = effectiveAmountA / requiredA;
          const newAmountB = effectiveAmountB * reduction;
          console.log(
            `Reducing B from ${effectiveAmountB} to ${newAmountB} due to insufficient A`
          );
          effectiveAmountB = newAmountB;
        }
      }
    } else {
      // Both amounts are specified or both are zero
      // Choose which side to fix based on strategic considerations
      aIsFixed = chooseFixedSide(
        effectiveAmountA,
        effectiveAmountB,
        isCoinA_SUI,
        isCoinB_SUI,
        currentPrice,
        fixedCoinOverride
      );

      // Respect user's amounts - no adjustment needed
      console.log(
        `Using user-provided amounts: A=${effectiveAmountA}, B=${effectiveAmountB}`
      );
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

    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create proper shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // Prepare coins with sufficient balance
    let coinA = prepareCoinWithSufficientBalance(
      txb,
      coinsA.data,
      amountAOnChain,
      isCoinA_SUI
    );

    let coinB = prepareCoinWithSufficientBalance(
      txb,
      coinsB.data,
      amountBOnChain,
      isCoinB_SUI
    );

    // Convert to BigInt for precise calculations
    const rawAmountA = BigInt(amountAOnChain);
    const rawAmountB = BigInt(amountBOnChain);

    // Calculate the fixed amount based on which side is fixed
    const fixedAmount = aIsFixed ? rawAmountA : rawAmountB;
    const coinAMax = rawAmountA;
    const coinBMax = rawAmountB;

    // FIXED: Pass numbers as u64 strings to match Move contract parameters
    txb.moveCall({
      target: `${packageId}::gateway::provide_liquidity_with_fixed_amount`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        configRef,
        poolRef,
        txb.object(positionId),
        coinA,
        coinB,
        toPureU64(txb, fixedAmount), // Properly serialized as u64
        toPureU64(txb, coinAMax), // Properly serialized as u64
        toPureU64(txb, coinBMax), // Properly serialized as u64
        txb.pure.bool(aIsFixed),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Build and return transaction
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log(
      "Add liquidity transaction built successfully with proper u64 serialization"
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
 *
 * @param {object} options - Options for building the transaction
 * @returns {Promise<{tx: string|null, hasLiquidity: boolean}>} - Transaction bytes and whether position has liquidity
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

  try {
    const suiClient = await getSuiClient();

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

    // Check if the position has any liquidity
    const currentLiquidity = positionFields.liquidity || "0";
    if (BigInt(currentLiquidity) <= 0n) {
      console.log(
        `Position ${positionId} has no liquidity to remove, skipping`
      );
      return { tx: null, hasLiquidity: false };
    }

    // Calculate liquidity to remove
    const liquidityToRemove =
      (BigInt(currentLiquidity) * BigInt(percent)) / BigInt(100);

    console.log("Building remove liquidity transaction:", {
      poolId,
      positionId,
      percent,
      liquidityToRemove: liquidityToRemove.toString(),
    });

    // Get the latest Bluefin package ID and config object ID
    const packageId = await getBluefinPackageId();
    const configId = await getBluefinConfigObjectId();

    // Get pool details for coin types
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // REQUIRED: Include the recipient address as the eighth parameter for remove_liquidity
    // Continuing from where the file was cut off...

    // REQUIRED: Include the recipient address as the eighth parameter for remove_liquidity
    const result = txb.moveCall({
      target: `${packageId}::gateway::remove_liquidity`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        configRef,
        poolRef,
        txb.object(positionId),
        txb.pure(liquidityToRemove, "u128"), // Use u128 for liquidity
        txb.pure.u64("0"), // min_amount_a
        txb.pure.u64("0"), // min_amount_b
        txb.pure.address(walletAddress), // recipient address
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // With recipient address specified, tokens go directly to the wallet
    // No need to transfer objects, just build and return the transaction
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Remove liquidity transaction built successfully");
    return { tx: base64Tx, hasLiquidity: true };
  } catch (error) {
    console.error("Error building remove liquidity transaction:", error);
    // Check for Bluefin-specific errors and rethrow
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }
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

    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create proper shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // Note: Bluefin moves fees directly to the transaction signer
    txb.moveCall({
      target: `${packageId}::gateway::collect_fee`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        configRef,
        poolRef,
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
  rewardCoinType = DEFAULT_BLUE_TOKEN,
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

    console.log("Building collect rewards transaction:", {
      poolId,
      positionId,
      rewardCoinType,
    });

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create proper shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // Note: Bluefin moves rewards directly to the transaction signer
    txb.moveCall({
      target: `${packageId}::gateway::collect_reward`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // &Clock (immutable)
        configRef,
        poolRef,
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
 * by using separate collect_fee and collect_reward calls in a single transaction
 * Dynamically determines reward tokens using Blockvision API
 */
export async function buildCollectFeesAndRewardsTx({
  poolId,
  positionId,
  walletAddress,
  rewardCoinTypes, // Optional: can be provided or will be fetched from API
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
    // If reward coin types aren't provided, fetch them from the API
    if (
      !rewardCoinTypes ||
      !Array.isArray(rewardCoinTypes) ||
      rewardCoinTypes.length === 0
    ) {
      console.log(`Fetching reward tokens for position ${positionId}...`);
      const { rewardTokens } = await getRewardTokensForPosition(
        walletAddress,
        positionId
      );
      rewardCoinTypes = rewardTokens;
    }

    console.log("Building collect fees and rewards transaction:", {
      positionId,
      poolId,
      rewardCoinTypes,
    });

    // Get pool details using the helper
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create proper shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // APPROACH: Call collect_fee and collect_reward separately in one transaction
    console.log("Using separate collect_fee and collect_reward calls");

    // First collect fees
    txb.moveCall({
      target: `${packageId}::gateway::collect_fee`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        configRef,
        poolRef,
        txb.object(positionId),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Then collect rewards for each reward type
    for (const rewardCoinType of rewardCoinTypes) {
      console.log(`Adding collect_reward call for ${rewardCoinType}`);
      txb.moveCall({
        target: `${packageId}::gateway::collect_reward`,
        arguments: [
          txb.object(SUI_CLOCK_OBJECT_ID),
          configRef,
          poolRef,
          txb.object(positionId),
        ],
        typeArguments: [coinTypeA, coinTypeB, rewardCoinType],
      });
    }

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

  try {
    // Get pool details for coin types
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    console.log("Building close position transaction:", {
      poolId,
      positionId,
    });

    // Get the latest Bluefin package ID and config object ID
    const packageId = await getBluefinPackageId();
    const configId = await getBluefinConfigObjectId();

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // REQUIRED: Include the recipient address as the fifth parameter for close_position
    const result = txb.moveCall({
      target: `${packageId}::gateway::close_position`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        configRef,
        poolRef,
        txb.object(positionId),
        txb.pure.address(walletAddress), // recipient address
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // With recipient address specified, tokens go directly to the wallet
    // No need to transfer objects, just build and return the transaction
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Close position transaction built successfully");
    return base64Tx;
  } catch (error) {
    console.error("Error building close position transaction:", error);
    // Check for Bluefin-specific errors and rethrow
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }
    throw error;
  }
}

/**
 * Builds a transaction to force close a position
 *
 * @param {Object} options - The parameters for the force close operation
 * @returns {Promise<string>} - Base64 encoded transaction bytes
 */
export async function buildForceClosePositionTx({
  poolId,
  positionId,
  walletAddress,
  force = true,
}) {
  if (!poolId || !positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: poolId, positionId, and walletAddress"
    );
  }

  console.log(`Building FORCE CLOSE position transaction for ${positionId}`);

  const suiClient = await getSuiClient();

  try {
    // Get pool details for coin types
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    console.log(`Pool details loaded for ${poolId}: ${coinTypeA}/${coinTypeB}`);

    // Check the position exists
    const positionResponse = await suiClient.getObject({
      id: positionId,
      options: { showContent: true, showDisplay: true },
    });

    if (!positionResponse.data) {
      throw new Error(`Position ${positionId} not found`);
    }

    console.log(
      "Position details loaded:",
      positionResponse.data.display?.data
    );

    // Use direct force close implementation
    console.log("Using direct force close implementation");

    // Get the latest Bluefin package ID and config object ID
    const packageId = await getBluefinPackageId();
    const configId = await getBluefinConfigObjectId();

    console.log(`Using package ID: ${packageId}, config ID: ${configId}`);

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(50_000_000); // Use higher gas budget for force operations

    // Get the initial shared versions directly
    const poolObj = await suiClient.getObject({
      id: poolId,
      options: { showOwner: true },
    });

    const configObj = await suiClient.getObject({
      id: configId,
      options: { showOwner: true },
    });

    const initialPoolVersion =
      poolObj.data?.owner?.Shared?.initial_shared_version || "1";
    const initialConfigVersion =
      configObj.data?.owner?.Shared?.initial_shared_version || "1";

    console.log(
      `Using initial shared versions - pool: ${initialPoolVersion}, config: ${initialConfigVersion}`
    );

    // Create shared object references
    const poolRef = txb.sharedObjectRef({
      objectId: poolId,
      initialSharedVersion: initialPoolVersion,
      mutable: true,
    });

    const configRef = txb.sharedObjectRef({
      objectId: configId,
      initialSharedVersion: initialConfigVersion,
      mutable: true,
    });

    // REQUIRED: Include the recipient address as the fifth parameter for close_position
    const result = txb.moveCall({
      target: `${packageId}::gateway::close_position`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        configRef,
        poolRef,
        txb.object(positionId),
        txb.pure.address(walletAddress), // recipient address
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // With recipient address specified, tokens go directly to the wallet
    // No need to transfer objects, just build and return the transaction
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Force close position transaction built successfully");
    return base64Tx;
  } catch (error) {
    console.error("Error building force close position transaction:", error);
    // Check for Bluefin-specific errors and rethrow
    const bluefinError = extractBluefinError(error);
    if (bluefinError) {
      const enhancedError = new Error(bluefinError.message);
      enhancedError.code = bluefinError.code;
      enhancedError.type = "bluefin";
      enhancedError.originalError = error;
      throw enhancedError;
    }
    throw error;
  }
}

// Export the error utilities to be used elsewhere
export { BLUEFIN_ABORTS, extractBluefinError };
