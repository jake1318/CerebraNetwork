// src/scallop/ScallopIncentiveService.ts
// Last updated: 2025-07-19 06:49:52 UTC by jake1318

import { extractWalletAddress, SUIVISION_URL } from "./ScallopService";
import { scallop } from "./ScallopService"; // Import from local service file
import * as scallopBorrowService from "./ScallopBorrowService";
import { TransactionBlock } from "@mysten/sui.js/transactions";

// Define the constants directly
const SCALLOP_PACKAGE_ID =
  "0x69a9f7b93a44f5337274027d76771560db35dbffd93e1af9b4a3f752badb9561";
const SCALLOP_MARKET_MANAGER =
  "0x200a694ebdadb198e4ca8a07cd6d0aaa42ba09b6fc99457766a2cefc01933722";
const SCALLOP_INCENTIVE_MANAGER =
  "0x7e0aef2a8c9119e0e5b14e956f0e5d25ff3af4f98671b655fb1102e9423fb00e";
const SCALLOP_INCENTIVE_POOL =
  "0xcddaa56b35e975ce3b7e89baa321a22f8276dde2e3487ceb2b3c1b6d494514e9";
const SUI_SYSTEM_STATE =
  "0x0000000000000000000000000000000000000000000000000000000000000006";

/**
 * Ensures the Scallop client is initialized
 */
async function ensureClient() {
  if (!scallop.client) {
    console.log("[ensureClient] Initializing Scallop client...");
    await scallop.init();
  }
}

/**
 * Unlock an obligation from borrow incentive program
 * @param wallet Connected wallet
 * @param obligationId ID of the obligation to unlock
 * @returns Transaction result
 */
export async function unlockObligation(
  wallet: any,
  obligationId: string,
  lockType: "boost" | "borrow-incentive" | null = null
) {
  try {
    console.log(`[unlockObligation] Starting for obligation ${obligationId}`);

    // Get wallet address
    const sender = await extractWalletAddress(wallet);
    if (!sender) throw new Error("Wallet not connected");

    // Verify the obligation exists for this user
    const userObligations = await scallopBorrowService.getUserObligations(
      sender
    );
    const matchingObligation = userObligations.find(
      (ob) => ob.obligationId === obligationId
    );

    if (!matchingObligation) {
      console.error(
        `[unlockObligation] Obligation ${obligationId} not found in user obligations`
      );
      throw new Error(
        "Obligation not found for this wallet address - cannot unlock"
      );
    }

    await ensureClient(); // Initialize the client

    // Use the client API directly for unlocking with the updated method signature
    // This uses the unstakeObligation method which handles unstaking from borrow incentive
    const transactionBlock = await scallop.client.unstakeObligation({
      obligationId,
    });

    // Execute transaction through wallet
    console.log("[unlockObligation] Sending transaction...");
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log("[unlockObligation] Transaction submitted:", result);

    // Return success response
    return {
      success: true,
      digest: result.digest,
      txLink: `${SUIVISION_URL}${result.digest}`,
    };
  } catch (err) {
    console.error("[unlockObligation] Failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Repay an unlocked obligation using the simpler repayQuick approach
 * @param wallet Connected wallet
 * @param obligationId ID of the obligation
 * @param asset Asset symbol (usdc, sui, usdt) - use raw type, not wrapped
 * @param amount Amount to repay in base units (bigint)
 * @returns Transaction result
 */
export async function repayUnlockedObligation(
  wallet: any,
  obligationId: string,
  asset: "usdc" | "sui" | "usdt",
  amount: bigint
) {
  try {
    console.log(
      `[repayUnlockedObligation] Starting for obligation ${obligationId}`
    );
    console.log(`[repayUnlockedObligation] Repaying ${amount} ${asset}`);

    // Get wallet address
    const sender = await extractWalletAddress(wallet);
    if (!sender) throw new Error("Wallet not connected");

    // Verify the obligation exists for this user
    const userObligations = await scallopBorrowService.getUserObligations(
      sender
    );
    const matchingObligation = userObligations.find(
      (ob) => ob.obligationId === obligationId
    );

    if (!matchingObligation) {
      console.error(
        `[repayUnlockedObligation] Obligation ${obligationId} not found in user obligations`
      );
      throw new Error(
        "Obligation not found for this wallet address - cannot repay"
      );
    }

    console.log(
      `[repayUnlockedObligation] Verified obligation exists for sender: ${sender.slice(
        0,
        8
      )}...`
    );

    // Initialize Scallop client
    await ensureClient();

    // Create a ScallopBuilder - this is the correct approach for Scallop SDK v2.2.0
    console.log("[repayUnlockedObligation] Creating ScallopBuilder");
    const scallopBuilder = await scallop.createScallopBuilder();

    // Create transaction block
    console.log("[repayUnlockedObligation] Creating transaction block");
    const scallopTxBlock = scallopBuilder.createTxBlock();

    // Set sender (required for repayQuick)
    scallopTxBlock.setSender(sender);

    // Use repayQuick with the simpler parameter format
    console.log(
      `[repayUnlockedObligation] Adding repayQuick operation for ${amount} ${asset}`
    );
    await scallopTxBlock.repayQuick(amount, asset, obligationId);

    // Set gas budget
    scallopTxBlock.setGasBudget(50_000_000);

    // Execute transaction through wallet
    console.log("[repayUnlockedObligation] Sending transaction...");
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: scallopTxBlock.txBlock,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    console.log("[repayUnlockedObligation] Transaction submitted:", result);

    // Return success response
    return {
      success: true,
      digest: result.digest,
      txLink: `${SUIVISION_URL}${result.digest}`,
    };
  } catch (err) {
    console.error("[repayUnlockedObligation] Failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Repay maximum debt for an unlocked obligation - uses exact amount calculation
 * @param wallet Connected wallet
 * @param obligationId ID of the obligation
 * @param asset Asset symbol (usdc, sui, usdt) - use raw type, not wrapped
 * @param currentDebt Current debt amount in human-readable form
 * @param decimals The number of decimals for the asset
 * @returns Transaction result
 */
export async function repayMaximumDebt(
  wallet: any,
  obligationId: string,
  asset: "usdc" | "sui" | "usdt",
  currentDebt: number,
  decimals: number
) {
  try {
    console.log(`[repayMaximumDebt] Starting for obligation ${obligationId}`);
    console.log(
      `[repayMaximumDebt] Repaying maximum debt: ${currentDebt} ${asset}`
    );

    // Calculate exact base units for the current debt
    // Add a small buffer (1%) to account for accrued interest
    const baseUnits = BigInt(
      Math.ceil(currentDebt * 1.01 * Math.pow(10, decimals))
    );

    console.log(
      `[repayMaximumDebt] Calculated base units with buffer: ${baseUnits}`
    );

    // Call standard repay with the exact amount
    return await repayUnlockedObligation(
      wallet,
      obligationId,
      asset,
      baseUnits
    );
  } catch (err) {
    console.error("[repayMaximumDebt] Failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if an obligation is locked in the borrow incentive program and then repay
 * Will unlock the obligation first if locked, otherwise directly repay
 * @param wallet Connected wallet
 * @param obligationId ID of the obligation
 * @param asset Asset symbol (usdc, sui, usdt) - use raw type, not wrapped
 * @param amount Amount to repay in base units (bigint)
 * @param repayMaximum Whether to repay the full debt
 * @returns Transaction result
 */
export async function unlockAndRepay(
  wallet: any,
  obligationId: string,
  asset: "usdc" | "sui" | "usdt",
  amount: bigint,
  repayMaximum: boolean = false
) {
  try {
    console.log(`[unlockAndRepay] Starting for obligation ${obligationId}`);

    // Get wallet address
    const sender = await extractWalletAddress(wallet);
    if (!sender) throw new Error("Wallet not connected");

    // Verify the obligation exists for this user
    const userObligations = await scallopBorrowService.getUserObligations(
      sender
    );
    const matchingObligation = userObligations.find(
      (ob) => ob.obligationId === obligationId
    );

    if (!matchingObligation) {
      console.error(
        `[unlockAndRepay] Obligation ${obligationId} not found in user obligations`
      );
      throw new Error(
        "Obligation not found for this wallet address - cannot unlock and repay"
      );
    }

    console.log(
      `[unlockAndRepay] Verified obligation exists for sender: ${sender.slice(
        0,
        8
      )}...`
    );

    // Check if obligation is locked directly from the matching obligation data
    const isLocked = matchingObligation.isLocked || false;

    // If not locked, we can directly repay without unlocking
    if (!isLocked) {
      console.log(
        "[unlockAndRepay] Obligation is not locked, proceeding with direct repayment"
      );

      // Directly call repayUnlockedObligation if not locked
      if (repayMaximum) {
        // Get the borrowedAsset data
        const borrowedAsset = matchingObligation.borrows.find(
          (b) => b.symbol.toLowerCase() === asset.toUpperCase()
        );
        if (!borrowedAsset) {
          throw new Error(`No debt found for ${asset}`);
        }

        const decimals = asset === "sui" ? 9 : 6; // SUI has 9 decimals, USDC/USDT have 6
        return await repayMaximumDebt(
          wallet,
          obligationId,
          asset,
          borrowedAsset.amount,
          decimals
        );
      } else {
        return await repayUnlockedObligation(
          wallet,
          obligationId,
          asset,
          amount
        );
      }
    }

    // If locked, we need to unlock first then repay
    await ensureClient(); // Initialize the client

    // 1. Execute unlock first
    console.log("[unlockAndRepay] Obligation is locked, unlocking first...");
    const unlockResult = await unlockObligation(wallet, obligationId);

    if (!unlockResult.success) {
      return unlockResult; // Return the error if unlock fails
    }

    // 2. After successful unlock, repay the debt
    console.log(
      "[unlockAndRepay] Obligation unlocked successfully, proceeding with repayment..."
    );

    // If repaying maximum, we need to get the debt details again after unlock
    if (repayMaximum) {
      // For maximum repayment, use the data from the original obligation (doesn't change from unlock)
      const borrowedAsset = matchingObligation.borrows.find(
        (b) => b.symbol.toLowerCase() === asset.toUpperCase()
      );

      if (!borrowedAsset) {
        console.error(`[unlockAndRepay] No debt found for ${asset}`);
        return {
          success: false,
          error: `No debt found for ${asset}`,
        };
      }

      const decimals = asset === "sui" ? 9 : 6; // SUI has 9 decimals, USDC/USDT have 6

      // Use repayMaximumDebt to calculate the correct amount with buffer
      return await repayMaximumDebt(
        wallet,
        obligationId,
        asset,
        borrowedAsset.amount,
        decimals
      );
    } else {
      // For specific amount repayment
      return await repayUnlockedObligation(wallet, obligationId, asset, amount);
    }
  } catch (err) {
    console.error("[unlockAndRepay] failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Check if an obligation is locked and needs to be unlocked before repaying
 * @param obligationId Obligation ID to check
 * @param address User wallet address
 * @returns True if obligation is locked and needs unstaking
 */
export async function isObligationLocked(
  obligationId: string,
  address: string
): Promise<boolean> {
  try {
    // Get obligation details
    const { success, obligation } =
      await scallopBorrowService.getObligationDetails(obligationId, address);

    if (!success || !obligation) {
      console.error("[isObligationLocked] Failed to get obligation details");
      return false; // Default to false if we can't determine
    }

    return obligation.isLocked === true;
  } catch (err) {
    console.error("[isObligationLocked] Error checking lock status:", err);
    return false; // Default to false on error
  }
}

/**
 * Utility function to verify if an obligation ID belongs to a user
 * @param obligationId The obligation ID to check
 * @param address User's wallet address
 * @returns True if the obligation belongs to the user
 */
export async function verifyObligationOwnership(
  obligationId: string,
  address: string
): Promise<boolean> {
  try {
    // Use the existing ScallopBorrowService function instead of calling scallop.client directly
    const userObligations = await scallopBorrowService.getUserObligations(
      address
    );
    const matchingObligation = userObligations.find(
      (ob) => ob.obligationId === obligationId
    );

    return !!matchingObligation;
  } catch (err) {
    console.error("[verifyObligationOwnership] Error:", err);
    return false;
  }
}

/**
 * Claims rewards for a user's lending and borrowing activity
 *
 * @param wallet - User's wallet
 * @param obligationId - ID of the obligation to claim rewards for
 * @returns Transaction result
 */
export async function claimScallopRewards(wallet: any, obligationId: string) {
  try {
    console.log(
      `[claimScallopRewards] Claiming rewards for obligation ${obligationId}`
    );

    // Get wallet address
    const sender = await extractWalletAddress(wallet);
    if (!sender) throw new Error("Wallet not connected");

    // Verify the obligation exists for this user
    const userObligations = await scallopBorrowService.getUserObligations(
      sender
    );
    const matchingObligation = userObligations.find(
      (ob) => ob.obligationId === obligationId
    );

    if (!matchingObligation) {
      console.error(
        `[claimScallopRewards] Obligation ${obligationId} not found in user obligations`
      );
      throw new Error(
        "Obligation not found for this wallet address - cannot claim rewards"
      );
    }

    await ensureClient(); // Initialize the client

    const tx = new TransactionBlock();

    // Construct the claim rewards transaction
    tx.moveCall({
      target: `${SCALLOP_PACKAGE_ID}::incentive::claim_obligation_incentives_with_types`,
      arguments: [
        tx.object(SCALLOP_INCENTIVE_MANAGER),
        tx.object(SCALLOP_MARKET_MANAGER),
        tx.object(obligationId),
        tx.object(SCALLOP_INCENTIVE_POOL),
        tx.pure([]), // Empty vector for coin types, will claim all rewards
        tx.object(SUI_SYSTEM_STATE), // SUI system state object
      ],
      typeArguments: [],
    });

    // Execute transaction through wallet
    console.log("[claimScallopRewards] Sending transaction...");
    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    console.log("[claimScallopRewards] Transaction submitted:", result);

    // Return success response
    return {
      success: true,
      digest: result.digest,
      txLink: `${SUIVISION_URL}${result.digest}`,
    };
  } catch (err) {
    console.error("[claimScallopRewards] Failed:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// For backward compatibility - clients can still use the old function name
export const repayObligation = repayUnlockedObligation;
export const unlockAndRepayObligation = unlockAndRepay;
