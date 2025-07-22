// src/scallop/ScallopCollateralService.ts
// Last Updated: 2025-07-21 01:29:21 UTC by jake1318

import { Scallop } from "@scallop-io/sui-scallop-sdk";
import { SuiClient } from "@mysten/sui.js/client";
import { TransactionBlock } from "@mysten/sui.js/transactions";

// Import common utilities from ScallopService
import {
  extractWalletAddress,
  getCoinSymbol,
  getSymbolFromCoinType,
  normalizeCoinType,
  parseMoveCallError,
  SUI_MAINNET,
  SCALLOP_ADDRESS_ID,
  SCALLOP_VERSION_OBJECT,
  SUIVISION_URL,
} from "./ScallopService";

// Import Scallop package IDs and objects from config
import {
  SCALLOP_PACKAGE_IDS,
  SUI_MARKET_OBJECTS,
  SCALLOP_GLOBALS,
  SUI_NETWORK_CONFIG,
} from "./config";

// Define shared objects for direct Move calls (Clock)
export const SUI_CLOCK_OBJECT = {
  objectId: "0x6",
  initialSharedVersion: "1",
  mutable: true,
};

// Initialize the Scallop client for collateral operations
const client = new SuiClient({ url: SUI_MAINNET });
const scallop = new Scallop({
  addressId: SCALLOP_ADDRESS_ID,
  networkType: "mainnet",
  suiProvider: client,
});

// Define the proper SUI coin type constant
export const SUI_COIN_TYPE =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

// Cache for obligation IDs
const obligationIdCache: Record<string, { id: string; timestamp: number }> = {};

// Cache for obligation keys
const obligationKeyCache: Record<string, { key: string; timestamp: number }> =
  {};

/**
 * Helper to verify transaction success
 * @param digest The transaction digest
 * @returns True if transaction succeeded or was found
 * @throws Error if transaction fails with specific error
 */
async function verifyTransactionSuccess(digest: string): Promise<boolean> {
  if (!digest) {
    throw new Error("No transaction digest provided");
  }

  try {
    console.log(`[Collateral] Verifying transaction ${digest}`);
    const txResult = await client.getTransactionBlock({
      digest,
      options: { showEffects: true },
    });

    if (txResult && txResult.effects?.status?.status === "success") {
      console.log(`[Collateral] Transaction ${digest} verified successful`);
      return true;
    } else if (txResult && txResult.effects?.status?.status === "failure") {
      throw new Error(
        txResult.effects.status.error || "Transaction failed on chain"
      );
    } else {
      // Transaction exists but status is unknown - assume success
      console.log(
        `[Collateral] Transaction ${digest} exists on chain, assuming success`
      );
      return true;
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("Transaction not found")) {
      throw new Error("Transaction not found on chain");
    } else {
      // Rethrow other errors
      throw err;
    }
  }
}

/**
 * Add an obligation ID to the cache
 * @param address User address
 * @param id Obligation ID
 */
export function cacheObligationId(address: string, id: string) {
  obligationIdCache[address] = {
    id,
    timestamp: Date.now(),
  };
  console.log(`[Collateral] Cached obligation ID for ${address}: ${id}`);
}

/**
 * Clear an obligation ID from the cache
 * @param address User address
 */
export function clearObligationIdCache(address: string) {
  delete obligationIdCache[address];
  console.log(`[Collateral] Cleared obligation ID cache for ${address}`);
}

/**
 * Get an obligation ID from the cache or fetch it from the network
 * @param address User address
 * @returns Obligation ID or null
 */
export async function getObligationId(address: string): Promise<string | null> {
  // Check cache first (valid for 5 minutes)
  if (
    obligationIdCache[address] &&
    Date.now() - obligationIdCache[address].timestamp < 300000
  ) {
    console.log(
      `[Collateral] Using cached obligation ID for ${address}: ${obligationIdCache[address].id}`
    );
    return obligationIdCache[address].id;
  }

  try {
    console.log(`[Collateral] Fetching obligation ID for ${address}`);
    const query = await scallop.createScallopQuery();
    await query.init();

    // Get user portfolio to find obligation ID
    const portfolio = await query.getUserPortfolio({
      walletAddress: address,
    });

    if (portfolio?.borrowings && portfolio.borrowings.length > 0) {
      for (const borrowing of portfolio.borrowings) {
        if (borrowing.obligationId) {
          // Cache the ID
          cacheObligationId(address, borrowing.obligationId);
          return borrowing.obligationId;
        }
      }
    }

    return null;
  } catch (err) {
    console.error(
      `[Collateral] Error getting obligation ID for ${address}:`,
      err
    );
    return null;
  }
}

/**
 * Get the obligation key for a specific obligation ID
 * @param address User address
 * @param obligationId The ID of the obligation
 * @returns Obligation key or null if not found or boost-locked
 */
export async function getObligationKey(
  address: string,
  obligationId: string
): Promise<string | null> {
  // Check cache first (valid for 5 minutes)
  const cacheKey = `${address}:${obligationId}`;
  if (
    obligationKeyCache[cacheKey] &&
    Date.now() - obligationKeyCache[cacheKey].timestamp < 300000
  ) {
    console.log(
      `[Collateral] Using cached obligation key for ${obligationId}: ${obligationKeyCache[cacheKey].key}`
    );
    return obligationKeyCache[cacheKey].key;
  }

  try {
    console.log(`[Collateral] Fetching obligation key for ${obligationId}`);
    const query = await scallop.createScallopQuery();
    await query.init();

    // Query the specific obligation to get its key
    const obligation = await query.queryObligation(obligationId);

    // Check if the obligation has a key
    if (obligation?.keyId) {
      // Cache the key
      obligationKeyCache[cacheKey] = {
        key: obligation.keyId,
        timestamp: Date.now(),
      };
      console.log(`[Collateral] Found obligation key: ${obligation.keyId}`);
      return obligation.keyId;
    }

    console.log(
      `[Collateral] No obligation key found for ${obligationId} - likely boost-locked`
    );
    return null; // Obligation is boost-locked
  } catch (err) {
    console.error(
      `[Collateral] Error getting obligation key for ${obligationId}:`,
      err
    );
    return null;
  }
}

/**
 * Check if an obligation is locked in the borrow-incentive pool
 * @param address User address
 * @param obligationId Obligation ID to check
 * @returns True if the obligation is locked in borrow-incentive
 */
export async function isObligationInBorrowIncentive(
  address: string,
  obligationId: string
): Promise<boolean> {
  try {
    console.log(
      `[Collateral] Checking if obligation ${obligationId} is in borrow-incentive`
    );
    const query = await scallop.createScallopQuery();
    await query.init();

    // Query the obligation
    const obligation = await query.queryObligation(obligationId);

    if (obligation) {
      // Check if it's locked in borrow-incentive
      const isLocked =
        obligation.lockType === "borrow-incentive" ||
        obligation.hasBorrowIncentiveStake === true;

      console.log(
        `[Collateral] Obligation ${obligationId} in borrow-incentive: ${isLocked}`
      );
      return isLocked;
    }

    return false;
  } catch (err) {
    console.error(
      `[Collateral] Error checking if obligation is in borrow-incentive:`,
      err
    );
    return false; // Default to false on error
  }
}

/**
 * Creates an obligation account for the user, which is required for borrowing
 */
export async function createObligationAccount(signer: any) {
  try {
    // Get the sender's address
    const senderAddress = await extractWalletAddress(signer);

    if (!senderAddress) {
      throw new Error("Could not determine sender address from wallet");
    }

    console.log("[Collateral] Creating obligation account for:", senderAddress);

    // Create a ScallopBuilder instance to handle the transaction properly
    const scallopBuilder = await scallop.createScallopBuilder();
    const txb = scallopBuilder.createTxBlock();

    // Set the sender
    txb.setSender(senderAddress);

    // Create the obligation account using the SDK helper
    txb.openObligationEntry();

    // Set gas budget
    const txBlockToSign = txb.txBlock;
    txBlockToSign.setGasBudget(30000000); // 0.03 SUI

    // Sign and send the transaction
    console.log("[Collateral] Executing create obligation transaction...");
    const result = await signer.signAndExecuteTransactionBlock({
      transactionBlock: txBlockToSign,
      requestType: "WaitForLocalExecution", // Changed from WaitForEffectsCert
      options: { showEffects: true, showEvents: true },
    });

    console.log("[Collateral] Create obligation result:", result);

    // Verify transaction success
    if (!result.digest) {
      return {
        success: false,
        error: "No transaction digest returned",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      await verifyTransactionSuccess(result.digest);
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Transaction verification failed",
        timestamp: new Date().toISOString(),
        digest: result.digest, // Include the digest even if verification failed
      };
    }

    // Get transaction details for the response
    const digest = result.digest;
    const txLink = `${SUIVISION_URL}${digest}`;

    // Clear any cached obligation ID
    clearObligationIdCache(senderAddress);

    return {
      success: true,
      digest: digest,
      txLink: txLink,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(
      "[Collateral] Error creating obligation account:",
      errorMessage,
      err
    );
    return { success: false, digest: undefined, error: errorMessage };
  }
}

/**
 * Add collateral to the user's obligation account
 * @param wallet Connected wallet
 * @param coinType Coin type to use as collateral
 * @param amount Amount to add as collateral
 * @param decimals Decimals of the coin
 * @returns Transaction result
 */
export async function addCollateral(
  wallet: any,
  coinType: string,
  amount: number,
  decimals: number
) {
  try {
    // Get the sender's address
    const senderAddress = await extractWalletAddress(wallet);

    if (!senderAddress) {
      throw new Error("Could not determine sender address from wallet");
    }

    console.log("[Collateral] Adding collateral:", {
      coinType,
      amount,
      senderAddress,
    });

    // Calculate amount in base units
    const amountInBaseUnits = Math.floor(amount * Math.pow(10, decimals));

    // Clean up the coin type to ensure it's a proper Move type string
    // Use the full path for SUI
    const fullCoinType =
      coinType === "SUI" || coinType === "sui"
        ? SUI_COIN_TYPE
        : normalizeCoinType(coinType);

    console.log(
      `[Collateral] Using coin type: ${fullCoinType} for addCollateral operation`
    );

    // Let ScallopBuilder handle the complex transaction setup
    const scallopBuilder = await scallop.createScallopBuilder();
    const txb = scallopBuilder.createTxBlock();
    txb.setSender(senderAddress);

    // Extract coin symbol for SDK helpers
    const coinSymbol = getCoinSymbol(coinType).toLowerCase();

    // Let the SDK handle obligation creation/reuse automatically
    await txb.addCollateralQuick(amountInBaseUnits, coinSymbol);

    // Set gas budget
    const txBlockToSign = txb.txBlock;
    txBlockToSign.setGasBudget(50000000); // Higher gas budget for complex operations

    // Sign and execute transaction
    console.log("[Collateral] Executing add collateral transaction...");
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: txBlockToSign,
      requestType: "WaitForLocalExecution", // Changed from WaitForEffectsCert
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    console.log("[Collateral] Add collateral result:", result);

    // Verify transaction success
    if (!result.digest) {
      return {
        success: false,
        error: "No transaction digest returned",
        timestamp: new Date().toISOString(),
      };
    }

    try {
      await verifyTransactionSuccess(result.digest);
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error
            ? err.message
            : "Transaction verification failed",
        digest: result.digest, // Include the digest even if verification failed
        timestamp: new Date().toISOString(),
      };
    }

    // Get transaction details for the response
    const digest = result.digest;
    const txLink = `${SUIVISION_URL}${digest}`;

    return {
      success: true,
      digest,
      txLink,
      amount,
      symbol: getSymbolFromCoinType(coinType), // Use the original symbol for display
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[Collateral] Error adding collateral:", err);
    const errorMessage = parseMoveCallError(err) || "Failed to add collateral";
    return { success: false, error: errorMessage };
  }
}

/**
 * Two-step approach to unlock and withdraw collateral.
 * First unstakes the obligation in a separate transaction, then withdraws the collateral.
 */
export async function twoStepUnlockAndWithdrawCollateral(
  wallet: any,
  coinType: string,
  amount: number,
  obligationId: string,
  isBoostLocked: boolean,
  isInBorrowIncentive: boolean,
  decimals = 9
): Promise<{
  success: boolean;
  digest?: string;
  txLink?: string;
  error?: string;
}> {
  try {
    const sender = await extractWalletAddress(wallet);
    if (!sender) throw new Error("Wallet not connected");

    console.log(
      `[Collateral] Two-step unlock and withdraw for ${amount} ${getCoinSymbol(
        coinType
      )} from obligation ${obligationId}`
    );
    console.log(
      `[Collateral] Obligation status: boost-locked=${isBoostLocked}, borrow-incentive=${isInBorrowIncentive}`
    );

    // ── convert amount ───────────────────────────────────────────────
    const baseUnits = BigInt(Math.floor(amount * 10 ** decimals)); // Changed back to BigInt
    const symbol = getCoinSymbol(coinType).toLowerCase(); // "sui" | "usdc" | "usdt"...

    // Step 1: Unstake obligation in a separate transaction if needed
    if (isBoostLocked || isInBorrowIncentive) {
      console.log(`[Collateral] Step 1: Unlocking obligation ${obligationId}`);
      const builder = await scallop.createScallopBuilder();
      const txb = builder.createTxBlock();
      txb.setSender(sender);

      if (isBoostLocked) {
        // For boost-locked obligations, use unstakeObligationQuick
        console.log(
          `[Collateral] Unstaking from Boost-Pool using unstakeObligationQuick`
        );
        await txb.unstakeObligationQuick(obligationId);
      } else if (isInBorrowIncentive) {
        // For borrow-incentive locked obligations
        console.log(`[Collateral] Unstaking from Borrow-Incentive pool`);

        // Get the obligation key (should exist for borrow-incentive)
        const obligationKey = await getObligationKey(sender, obligationId);
        if (!obligationKey) {
          throw new Error(
            `Cannot find obligation key for borrow-incentive unlock. This is unexpected.`
          );
        }

        // Get the Scallop SDK's known addresses
        const addresses = builder.address.getAll();
        const borrowIncentivePackage = addresses["borrowIncentive.id"];
        const borrowIncentiveConfig = addresses["borrowIncentive.config"];
        const borrowIncentivePools =
          addresses["borrowIncentive.incentivePools"];
        const borrowIncentiveAccounts =
          addresses["borrowIncentive.incentiveAccounts"];
        const vescaSubsTable = addresses["vesca.subsTable"];
        const vescaSubsWhitelist = addresses["vesca.subsWhitelist"];

        if (
          !borrowIncentivePackage ||
          !borrowIncentiveConfig ||
          !borrowIncentivePools ||
          !borrowIncentiveAccounts
        ) {
          throw new Error(
            "Required borrow-incentive objects not found in Scallop SDK configuration"
          );
        }

        // Call user::unstake_v2
        console.log(`[Collateral] Calling borrow_incentive::user::unstake_v2`);
        txb.moveCall({
          target: `${borrowIncentivePackage}::user::unstake_v2`,
          arguments: [
            txb.object(borrowIncentiveConfig),
            txb.object(borrowIncentivePools),
            txb.object(borrowIncentiveAccounts),
            txb.object(obligationKey),
            txb.object(obligationId),
            txb.object(vescaSubsTable || "0x0"), // Use 0x0 as fallback
            txb.object(vescaSubsWhitelist || "0x0"), // Use 0x0 as fallback
            txb.object(SUI_CLOCK_OBJECT.objectId),
          ],
          typeArguments: [],
        });
      }

      txb.setGasBudget(40_000_000);

      console.log(`[Collateral] Executing unlock transaction`);
      const unlockRes = await wallet.signAndExecuteTransactionBlock({
        transactionBlock: txb.txBlock,
        requestType: "WaitForLocalExecution", // Changed from WaitForEffectsCert
        options: { showEffects: true },
      });

      console.log(`[Collateral] Unlock result:`, unlockRes);
      console.log(`[Collateral] Unlock digest:`, unlockRes.digest);

      // Check if we got a digest (transaction was accepted)
      if (!unlockRes.digest) {
        throw new Error(`Unlocking failed: No transaction digest returned`);
      }

      // Verify the transaction succeeded on chain
      try {
        await verifyTransactionSuccess(unlockRes.digest);
      } catch (err) {
        throw new Error(
          `Unlocking failed: ${
            err instanceof Error
              ? err.message
              : "Transaction verification failed"
          }`
        );
      }

      // Wait a longer moment for the chain state to update (increased to 5 seconds)
      console.log(
        `[Collateral] Unlocking successful, waiting 5 seconds before withdrawing...`
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    // Step 2: Withdraw collateral in a separate transaction
    // Create a fresh builder after unlock to ensure it reads the updated on-chain state
    console.log(
      `[Collateral] Step 2: Withdrawing ${baseUnits.toString()} ${symbol} from obligation ${obligationId}`
    );
    const withdrawBuilder = await scallop.createScallopBuilder();
    const withdrawTxb = withdrawBuilder.createTxBlock();
    withdrawTxb.setSender(sender);

    // No redeem call needed - unstake is enough

    // Removed all price update calls as they're unreliable and not strictly needed

    // Withdraw the collateral
    const coin = await withdrawTxb.takeCollateralQuick(baseUnits, symbol);

    // Send the coin to the user
    withdrawTxb.transferObjects([coin], sender);
    withdrawTxb.setGasBudget(40_000_000);

    console.log(`[Collateral] Executing withdrawal transaction`);
    const withdrawRes = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: withdrawTxb.txBlock,
      requestType: "WaitForLocalExecution", // Changed from WaitForEffectsCert
      options: { showEffects: true },
    });

    console.log(`[Collateral] Withdrawal result:`, withdrawRes);
    console.log(`[Collateral] Withdrawal digest:`, withdrawRes.digest);

    // Check if we got a digest (transaction was accepted)
    if (!withdrawRes.digest) {
      throw new Error(`Withdrawal failed: No transaction digest returned`);
    }

    // Verify the withdrawal transaction succeeded
    try {
      await verifyTransactionSuccess(withdrawRes.digest);
    } catch (err) {
      throw new Error(
        `Withdrawal failed: ${
          err instanceof Error ? err.message : "Transaction verification failed"
        }`
      );
    }

    return {
      success: true,
      digest: withdrawRes.digest,
      txLink: `${SUIVISION_URL}${withdrawRes.digest}`,
      amount,
      symbol: coinType.includes("sui")
        ? "SUI"
        : coinType.split("::").pop() || coinType,
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error(
      `[Collateral] Error in twoStepUnlockAndWithdrawCollateral:`,
      e
    );
    return {
      success: false,
      error: e.message ?? String(e),
      amount,
      symbol: coinType.includes("sui")
        ? "SUI"
        : coinType.split("::").pop() || coinType,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Atomic transaction to unlock and withdraw collateral.
 * Uses SDK helpers to unstake properly from boost-pool or borrow-incentive.
 */
export async function atomicUnlockAndWithdrawCollateral(
  wallet: any,
  coinType: string,
  amount: number,
  obligationId: string,
  isBoostLocked: boolean,
  isInBorrowIncentive: boolean,
  decimals = 9
): Promise<{
  success: boolean;
  digest?: string;
  txLink?: string;
  error?: string;
}> {
  try {
    const sender = await extractWalletAddress(wallet);
    if (!sender) throw new Error("Wallet not connected");

    console.log(
      `[Collateral] Atomic unlock and withdraw for ${amount} ${getCoinSymbol(
        coinType
      )} from obligation ${obligationId}`
    );
    console.log(
      `[Collateral] Obligation status: boost-locked=${isBoostLocked}, borrow-incentive=${isInBorrowIncentive}`
    );

    // ── convert amount ───────────────────────────────────────────────
    const baseUnits = BigInt(Math.floor(amount * 10 ** decimals)); // Changed back to BigInt
    const symbol = getCoinSymbol(coinType).toLowerCase(); // "sui" | "usdc" | "usdt"...

    // ── build tx ─────────────────────────────────────────────────────
    const scallopBuilder = await scallop.createScallopBuilder();
    const txb = scallopBuilder.createTxBlock();
    txb.setSender(sender);

    // 1) Handle different lock types FIRST
    if (isBoostLocked) {
      // For boost-locked obligations, use the SDK helper
      console.log(
        `[Collateral] Unstaking from Boost-Pool using unstakeObligationQuick`
      );
      await txb.unstakeObligationQuick(obligationId);

      // No redeem call needed - unstake is enough
    } else if (isInBorrowIncentive) {
      // For borrow-incentive locked obligations
      console.log(`[Collateral] Unstaking from Borrow-Incentive pool`);

      // Get the obligation key (should exist for borrow-incentive)
      const obligationKey = await getObligationKey(sender, obligationId);
      if (!obligationKey) {
        throw new Error(
          `Cannot find obligation key for borrow-incentive unlock. This is unexpected.`
        );
      }

      // Get the Scallop SDK's known addresses
      const addresses = scallopBuilder.address.getAll();
      const borrowIncentivePackage = addresses["borrowIncentive.id"];
      const borrowIncentiveConfig = addresses["borrowIncentive.config"];
      const borrowIncentivePools = addresses["borrowIncentive.incentivePools"];
      const borrowIncentiveAccounts =
        addresses["borrowIncentive.incentiveAccounts"];
      const vescaSubsTable = addresses["vesca.subsTable"];
      const vescaSubsWhitelist = addresses["vesca.subsWhitelist"];

      if (
        !borrowIncentivePackage ||
        !borrowIncentiveConfig ||
        !borrowIncentivePools ||
        !borrowIncentiveAccounts
      ) {
        throw new Error(
          "Required borrow-incentive objects not found in Scallop SDK configuration"
        );
      }

      // Call user::unstake_v2
      console.log(`[Collateral] Calling borrow_incentive::user::unstake_v2`);
      txb.moveCall({
        target: `${borrowIncentivePackage}::user::unstake_v2`,
        arguments: [
          txb.object(borrowIncentiveConfig),
          txb.object(borrowIncentivePools),
          txb.object(borrowIncentiveAccounts),
          txb.object(obligationKey),
          txb.object(obligationId),
          txb.object(vescaSubsTable || "0x0"), // Use 0x0 as fallback
          txb.object(vescaSubsWhitelist || "0x0"), // Use 0x0 as fallback
          txb.object(SUI_CLOCK_OBJECT.objectId),
        ],
        typeArguments: [],
      });
    }

    // 2) Removed all price update calls as they're unreliable and not strictly needed

    // 3) FINALLY withdraw collateral
    console.log(
      `[Collateral] Taking collateral: ${baseUnits.toString()} ${symbol}`
    );
    const coin = await txb.takeCollateralQuick(baseUnits, symbol);

    // Send coin to user
    console.log(`[Collateral] Transferring withdrawn coin to ${sender}`);
    txb.transferObjects([coin], sender);

    // Use higher gas budget for this complex transaction
    txb.setGasBudget(80_000_000);

    // ── sign & execute ───────────────────────────────────────────────
    console.log(`[Collateral] Signing and executing transaction`);
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: txb.txBlock,
      requestType: "WaitForLocalExecution", // Changed from WaitForEffectsCert
      options: { showEffects: true },
    });

    console.log("[Collateral] Transaction result:", res);
    console.log("[Collateral] Transaction digest:", res.digest);

    // Check if we got a digest (transaction was accepted)
    if (!res.digest) {
      throw new Error(`Transaction failed: No transaction digest returned`);
    }

    // Verify the transaction succeeded
    try {
      await verifyTransactionSuccess(res.digest);
    } catch (err) {
      return {
        success: false,
        digest: res.digest,
        error: `Transaction verification failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        amount,
        symbol: coinType.includes("sui")
          ? "SUI"
          : coinType.split("::").pop() || coinType,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      digest: res.digest,
      txLink: `${SUIVISION_URL}${res.digest}`,
      amount,
      symbol: coinType.includes("sui")
        ? "SUI"
        : coinType.split("::").pop() || coinType,
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error(
      `[Collateral] Error in atomicUnlockAndWithdrawCollateral:`,
      e
    );
    return {
      success: false,
      error: e.message ?? String(e),
      amount,
      symbol: coinType.includes("sui")
        ? "SUI"
        : coinType.split("::").pop() || coinType,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Unlock an obligation (unstake) and withdraw collateral.
 * Automatically chooses the best method based on obligation status.
 */
export async function unlockAndWithdrawCollateral(
  wallet: any,
  coinType: string,
  amount: number,
  obligationId: string,
  isBoostLocked: boolean,
  isInBorrowIncentive: boolean,
  decimals = 9,
  preferredMethod: "atomic" | "two-step" = "two-step" // Changed default to two-step as it's more reliable
): Promise<{
  success: boolean;
  digest?: string;
  txLink?: string;
  error?: string;
}> {
  // Handle any locked obligations based on the preferred method
  if (isBoostLocked || isInBorrowIncentive) {
    console.log(
      `[Collateral] Obligation ${obligationId} is locked (boost=${isBoostLocked}, incentive=${isInBorrowIncentive})`
    );

    if (preferredMethod === "two-step") {
      return twoStepUnlockAndWithdrawCollateral(
        wallet,
        coinType,
        amount,
        obligationId,
        isBoostLocked,
        isInBorrowIncentive,
        decimals
      );
    } else {
      return atomicUnlockAndWithdrawCollateral(
        wallet,
        coinType,
        amount,
        obligationId,
        isBoostLocked,
        isInBorrowIncentive,
        decimals
      );
    }
  }

  // For obligations that are not locked, we can use a simpler approach
  try {
    const sender = await extractWalletAddress(wallet);
    if (!sender) throw new Error("Wallet not connected");

    console.log(
      `[Collateral] Withdrawing collateral: ${amount} ${getCoinSymbol(
        coinType
      )} from obligation ${obligationId}`
    );

    // ── convert amount ───────────────────────────────────────────────
    const baseUnits = BigInt(Math.floor(amount * 10 ** decimals)); // Changed back to BigInt
    const symbol = getCoinSymbol(coinType).toLowerCase();

    // ── build tx ─────────────────────────────────────────────────────
    const builder = await scallop.createScallopBuilder();
    const txb = builder.createTxBlock();
    txb.setSender(sender);

    // Removed all price update calls as they're unreliable and not strictly needed

    // Withdraw collateral directly as the obligation is not locked
    console.log(
      `[Collateral] Taking collateral: ${baseUnits.toString()} ${symbol}`
    );
    const coin = await txb.takeCollateralQuick(baseUnits, symbol);

    // Send coin to user
    txb.transferObjects([coin], sender);
    txb.setGasBudget(40_000_000);

    // ── sign & execute ───────────────────────────────────────────────
    console.log(`[Collateral] Signing and executing transaction`);
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: txb.txBlock,
      requestType: "WaitForLocalExecution", // Changed from WaitForEffectsCert
      options: { showEffects: true },
    });

    console.log("[Collateral] Transaction result:", res);
    console.log("[Collateral] Transaction digest:", res.digest);

    // Check if we got a digest (transaction was accepted)
    if (!res.digest) {
      throw new Error(`Transaction failed: No transaction digest returned`);
    }

    // Verify the transaction succeeded
    try {
      await verifyTransactionSuccess(res.digest);
    } catch (err) {
      return {
        success: false,
        digest: res.digest,
        error: `Transaction verification failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
        amount,
        symbol: coinType.includes("sui")
          ? "SUI"
          : coinType.split("::").pop() || coinType,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      success: true,
      digest: res.digest,
      txLink: `${SUIVISION_URL}${res.digest}`,
      amount,
      symbol: coinType.includes("sui")
        ? "SUI"
        : coinType.split("::").pop() || coinType,
      timestamp: new Date().toISOString(),
    };
  } catch (e: any) {
    console.error(`[Collateral] Error in unlockAndWithdrawCollateral:`, e);
    return {
      success: false,
      error: e.message ?? String(e),
      amount,
      symbol: coinType.includes("sui")
        ? "SUI"
        : coinType.split("::").pop() || coinType,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check if a user has an obligation account
 * @param wallet The wallet object
 * @returns True if the user has an obligation account
 */
export const hasObligationAccount = async (wallet: any): Promise<boolean> => {
  try {
    const address = await extractWalletAddress(wallet);
    const obligations = await getObligationId(address);
    return !!obligations;
  } catch (error) {
    console.error("Error checking obligation account:", error);
    return false;
  }
};

// Export the collateral service functions
const scallopCollateralService = {
  createObligationAccount,
  addCollateral,
  unlockAndWithdrawCollateral,
  twoStepUnlockAndWithdrawCollateral,
  atomicUnlockAndWithdrawCollateral,
  getObligationId,
  getObligationKey,
  isObligationInBorrowIncentive,
  cacheObligationId,
  clearObligationIdCache,
  hasObligationAccount,
};

export default scallopCollateralService;
