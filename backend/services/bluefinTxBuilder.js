// services/bluefinTxBuilder.js
// Updated: 2025-07-08 06:56:42 UTC by jake1318

import { TransactionBlock } from "@mysten/sui.js/transactions";
import {
  BLUEFIN_PACKAGE_ID,
  SUI_CLOCK_OBJECT_ID,
  getBluefinConfigObjectId,
} from "./bluefinService.js";
import { getSuiClient } from "./suiClient.js";
import { getPoolDetails } from "./bluefinService.js";

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
 * Builds a transaction for opening a position with liquidity in one step
 * with proper handling of SUI whether it's coinTypeA or coinTypeB
 */
export async function buildDepositTx({
  poolId,
  amountA,
  amountB = 0,
  lowerTickFactor = 0.5,
  upperTickFactor = 2.0,
  walletAddress,
}) {
  if (!poolId || !walletAddress) {
    throw new Error("Missing required parameters: poolId and walletAddress");
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin config object ID
  const configId = await getBluefinConfigObjectId();
  console.log(`Using Bluefin config object ID: ${configId}`);

  try {
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

    // Get pool details using our helper for the coin types
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

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

    // Get the correct decimal places for each token
    const decimalsA = isCoinA_SUI ? 9 : 6; // SUI has 9 decimals, most others have 6
    const decimalsB = isCoinB_SUI ? 9 : 6; // SUI has 9 decimals, most others have 6

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
    const effectiveAmountA = amountA || 0.03;
    const effectiveAmountB = amountB || 0.1;

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

    // Convert human amounts to chain amounts
    const amountAOnChain = Math.floor(effectiveAmountA * 10 ** decimalsA);
    const amountBOnChain = Math.floor(effectiveAmountB * 10 ** decimalsB);

    console.log("Building transaction to provide liquidity:", {
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
      tickSpacing,
      decimalsA,
      decimalsB,
    });

    // Safety checks for amounts
    if (isCoinA_SUI) {
      // If coinA is SUI, ensure we're not using more than 90% of balance for gas safety
      if (amountAOnChain > totalBalanceA * 0.9) {
        const reducedAmount = Math.floor(totalBalanceA * 0.3);
        console.log(
          `WARNING: Requested SUI amount ${amountAOnChain} is too close to balance ${totalBalanceA}. Reducing to ${reducedAmount}`
        );
        amountAOnChain = reducedAmount;
      }
    }

    if (isCoinB_SUI) {
      // If coinB is SUI, ensure we're not using more than 90% of balance for gas safety
      if (amountBOnChain > totalBalanceB * 0.9) {
        const reducedAmount = Math.floor(totalBalanceB * 0.3);
        console.log(
          `WARNING: Requested SUI amount ${amountBOnChain} is too close to balance ${totalBalanceB}. Reducing to ${reducedAmount}`
        );
        amountBOnChain = reducedAmount;
      }
    }

    // Create transaction block - essential to create a new one for each attempt
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // =========== STEP 1: Create the Position ============
    // First, we create the position - NOW WITH UPDATED CONFIG ID
    const position = txb.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::pool::open_position`,
      arguments: [
        txb.object(configId), // Use the current config object
        txb.object(poolId),
        txb.pure(toU32(lowerTickSnapped), "u32"),
        txb.pure(toU32(upperTickSnapped), "u32"),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // =========== STEP 2: Prepare Coins ================
    let coinA, coinB;

    // Handle coinA preparation based on whether it's SUI or not
    if (isCoinA_SUI) {
      // If coinA is SUI, use the gas coin
      coinA = txb.splitCoins(txb.gas, [txb.pure(amountAOnChain)]);
    } else {
      // If coinA is not SUI, use a regular coin
      const firstCoinAId = coinsA.data[0].coinObjectId;
      coinA = txb.splitCoins(txb.object(firstCoinAId), [
        txb.pure(amountAOnChain),
      ]);
    }

    // Handle coinB preparation based on whether it's SUI or not
    if (isCoinB_SUI) {
      // If coinB is SUI, use the gas coin
      coinB = txb.splitCoins(txb.gas, [txb.pure(amountBOnChain)]);
    } else {
      // If coinB is not SUI, use a regular coin
      const firstCoinBId = coinsB.data[0].coinObjectId;
      coinB = txb.splitCoins(txb.object(firstCoinBId), [
        txb.pure(amountBOnChain),
      ]);
    }

    // =========== STEP 3: Add Liquidity to Position ============
    // Add liquidity to the created position - UPDATED WITH CORRECT PARAMETER ORDER
    txb.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::provide_liquidity_with_fixed_amount`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(configId), // Use the current config object
        txb.object(poolId),
        position,
        coinA,
        coinB,
        txb.pure(amountBOnChain.toString(), "u64"),
        txb.pure(amountAOnChain.toString(), "u64"),
        txb.pure(amountBOnChain.toString(), "u64"),
        txb.pure(true, "bool"),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // =========== STEP 4: Return Position to User ============
    // Transfer the position to the user - not the return value from provide_liquidity
    txb.transferObjects([position], txb.pure(walletAddress));

    // =========== STEP 5: Build and Return Transaction ============
    // This is the simplest transaction that should work
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Transaction built successfully with proper coin handling");
    return base64Tx;
  } catch (error) {
    console.error("Error building transaction:", error);
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
  walletAddress,
}) {
  if (!poolId || !positionId || !walletAddress) {
    throw new Error(
      "Missing required parameters: poolId, positionId, and walletAddress"
    );
  }

  const suiClient = await getSuiClient();

  // Get the latest Bluefin config object ID
  const configId = await getBluefinConfigObjectId();
  console.log(`Using Bluefin config object ID: ${configId}`);

  try {
    // Get pool details
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

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

    // Get the correct decimal places for each token
    const decimalsA = isCoinA_SUI ? 9 : 6; // SUI has 9 decimals, most others have 6
    const decimalsB = isCoinB_SUI ? 9 : 6; // SUI has 9 decimals, most others have 6

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
    const effectiveAmountA = amountA || 0.03;
    const effectiveAmountB = amountB || 0.1;

    // Convert human amounts to chain amounts
    const amountAOnChain = Math.floor(effectiveAmountA * 10 ** decimalsA);
    const amountBOnChain = Math.floor(effectiveAmountB * 10 ** decimalsB);

    console.log("Building transaction to add liquidity:", {
      poolId,
      positionId,
      coinTypeA,
      coinTypeB,
      amountA: effectiveAmountA,
      amountB: effectiveAmountB,
      amountAOnChain,
      amountBOnChain,
      decimalsA,
      decimalsB,
    });

    // Safety checks for amounts
    if (isCoinA_SUI) {
      // If coinA is SUI, ensure we're not using more than 90% of balance for gas safety
      if (amountAOnChain > totalBalanceA * 0.9) {
        const reducedAmount = Math.floor(totalBalanceA * 0.3);
        console.log(
          `WARNING: Requested SUI amount ${amountAOnChain} is too close to balance ${totalBalanceA}. Reducing to ${reducedAmount}`
        );
        amountAOnChain = reducedAmount;
      }
    }

    if (isCoinB_SUI) {
      // If coinB is SUI, ensure we're not using more than 90% of balance for gas safety
      if (amountBOnChain > totalBalanceB * 0.9) {
        const reducedAmount = Math.floor(totalBalanceB * 0.3);
        console.log(
          `WARNING: Requested SUI amount ${amountBOnChain} is too close to balance ${totalBalanceB}. Reducing to ${reducedAmount}`
        );
        amountBOnChain = reducedAmount;
      }
    }

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // =========== STEP 1: Prepare Coins ================
    let coinA, coinB;

    // Handle coinA preparation based on whether it's SUI or not
    if (isCoinA_SUI) {
      // If coinA is SUI, use the gas coin
      coinA = txb.splitCoins(txb.gas, [txb.pure(amountAOnChain)]);
    } else {
      // If coinA is not SUI, use a regular coin
      const firstCoinAId = coinsA.data[0].coinObjectId;
      coinA = txb.splitCoins(txb.object(firstCoinAId), [
        txb.pure(amountAOnChain),
      ]);
    }

    // Handle coinB preparation based on whether it's SUI or not
    if (isCoinB_SUI) {
      // If coinB is SUI, use the gas coin
      coinB = txb.splitCoins(txb.gas, [txb.pure(amountBOnChain)]);
    } else {
      // If coinB is not SUI, use a regular coin
      const firstCoinBId = coinsB.data[0].coinObjectId;
      coinB = txb.splitCoins(txb.object(firstCoinBId), [
        txb.pure(amountBOnChain),
      ]);
    }

    // =========== STEP 2: Add Liquidity to Position ============
    const liquidity = txb.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::provide_liquidity_with_fixed_amount`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID),
        txb.object(configId), // Use the current config object
        txb.object(poolId),
        txb.object(positionId),
        coinA,
        coinB,
        txb.pure(amountBOnChain.toString(), "u64"),
        txb.pure(amountAOnChain.toString(), "u64"),
        txb.pure(amountBOnChain.toString(), "u64"),
        txb.pure(true, "bool"),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Transfer any returned liquidity tokens back to user
    txb.transferObjects([liquidity], txb.pure(walletAddress));

    // =========== STEP 3: Build and Return Transaction ============
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Add liquidity transaction built successfully");
    return base64Tx;
  } catch (error) {
    console.error("Error building add liquidity transaction:", error);
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

  // Get the latest Bluefin config object ID
  const configId = await getBluefinConfigObjectId();
  console.log(`Using Bluefin config object ID: ${configId}`);

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

    // Call the remove liquidity function
    const removedCoins = txb.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::remove_liquidity`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // Clock first
        txb.object(configId), // Updated: Use the current config object
        txb.object(poolId), // Pool
        txb.object(positionId), // Position
        txb.pure(liquidityToRemove.toString(), "u64"),
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Transfer removed coins back to user
    txb.transferObjects([removedCoins], txb.pure(walletAddress));

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Remove liquidity transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building remove liquidity transaction:", error);
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

  // Get the latest Bluefin config object ID
  const configId = await getBluefinConfigObjectId();
  console.log(`Using Bluefin config object ID: ${configId}`);

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

    // Call the collect fees function (from available functions list)
    const feeCoins = txb.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_fee`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // Clock first
        txb.object(configId), // Updated: Use the current config object
        txb.object(poolId), // Pool
        txb.object(positionId), // Position
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Transfer collected fee coins back to user
    txb.transferObjects([feeCoins], txb.pure(walletAddress));

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Collect fees transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building collect fees transaction:", error);
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

  // Get the latest Bluefin config object ID
  const configId = await getBluefinConfigObjectId();
  console.log(`Using Bluefin config object ID: ${configId}`);

  try {
    // Get pool details using the helper
    const pool = await getPoolDetails(poolId);
    const { coinTypeA, coinTypeB } = pool.parsed;

    // Default reward coin type
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

    // Call the collect rewards function (from available functions list)
    const rewardCoins = txb.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_reward`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // Clock first
        txb.object(configId), // Updated: Use the current config object
        txb.object(poolId), // Pool
        txb.object(positionId), // Position
      ],
      typeArguments: [coinTypeA, coinTypeB, rewardCoinType],
    });

    // Transfer collected reward coins back to user
    txb.transferObjects([rewardCoins], txb.pure(walletAddress));

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Collect rewards transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building collect rewards transaction:", error);
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

  // Get the latest Bluefin config object ID
  const configId = await getBluefinConfigObjectId();
  console.log(`Using Bluefin config object ID: ${configId}`);

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

    // Check if position has any liquidity
    const currentLiquidity = BigInt(positionFields.liquidity);

    console.log("Building close position transaction:", {
      poolId,
      positionId,
      currentLiquidity: currentLiquidity.toString(),
    });

    // Create the transaction block
    const txb = new TransactionBlock();
    txb.setSender(walletAddress);
    txb.setGasBudget(30_000_000);

    // If there's liquidity, remove it first
    if (currentLiquidity > 0n) {
      // First remove all liquidity
      const removedCoins = txb.moveCall({
        target: `${BLUEFIN_PACKAGE_ID}::gateway::remove_liquidity`,
        arguments: [
          txb.object(SUI_CLOCK_OBJECT_ID), // Clock first
          txb.object(configId), // Updated: Use the current config object
          txb.object(poolId), // Pool
          txb.object(positionId), // Position
          txb.pure(currentLiquidity.toString(), "u64"),
        ],
        typeArguments: [coinTypeA, coinTypeB],
      });

      // Transfer removed liquidity coins back to user
      txb.transferObjects([removedCoins], txb.pure(walletAddress));

      // Then collect all fees
      const feeCoins = txb.moveCall({
        target: `${BLUEFIN_PACKAGE_ID}::gateway::collect_fee`,
        arguments: [
          txb.object(SUI_CLOCK_OBJECT_ID), // Clock first
          txb.object(configId), // Updated: Use the current config object
          txb.object(poolId), // Pool
          txb.object(positionId), // Position
        ],
        typeArguments: [coinTypeA, coinTypeB],
      });

      // Transfer collected fee coins back to user
      txb.transferObjects([feeCoins], txb.pure(walletAddress));
    }

    // Finally close the position
    txb.moveCall({
      target: `${BLUEFIN_PACKAGE_ID}::gateway::close_position`,
      arguments: [
        txb.object(SUI_CLOCK_OBJECT_ID), // Clock first
        txb.object(configId), // Updated: Use the current config object
        txb.object(poolId), // Pool
        txb.object(positionId), // Position
      ],
      typeArguments: [coinTypeA, coinTypeB],
    });

    // Serialize the transaction to bytes and encode as base64
    const txBytes = await txb.build({ client: suiClient });
    const base64Tx = Buffer.from(txBytes).toString("base64");

    console.log("Close position transaction built successfully");
    return base64Tx; // Return base64 encoded string
  } catch (error) {
    console.error("Error building close position transaction:", error);
    throw error;
  }
}
