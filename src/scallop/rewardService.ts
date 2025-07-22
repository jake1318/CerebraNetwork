// src/scallop/rewardService.ts
// Last updated: 2025-07-19 06:26:42 UTC by jake1318

import { extractWalletAddress } from "./ScallopService";
import { claimScallopRewards } from "./ScallopIncentiveService";
import * as scallopBorrowService from "./ScallopBorrowService";

// Define claim result type
export interface ClaimResult {
  success: boolean;
  digest?: string;
  txLink?: string;
  error?: string;
}

/**
 * Claims all pending rewards for a user across all obligations
 *
 * @param wallet The user's wallet
 * @returns Result of the claim operation
 */
export async function claimAllRewards(wallet: any): Promise<ClaimResult> {
  try {
    const sender = await extractWalletAddress(wallet);
    if (!sender) {
      return { success: false, error: "Wallet not connected" };
    }

    // Get all user obligations to find one with borrowing activity (which has rewards)
    console.log("[claimAllRewards] Fetching user obligations");
    const userObligations = await scallopBorrowService.getUserObligations(
      sender
    );

    if (userObligations.length === 0) {
      return {
        success: false,
        error: "No obligations found for claiming rewards",
      };
    }

    // Find an obligation that has borrowing activity (likely to have rewards)
    // Ideally we'd check for pending rewards but the API doesn't expose this directly
    const targetObligation =
      userObligations.find(
        (obl) => obl.borrows.length > 0 || obl.hasBorrowIncentiveStake
      ) || userObligations[0]; // Default to first obligation if none with borrows found

    console.log(
      `[claimAllRewards] Using obligation ${targetObligation.obligationId} to claim rewards`
    );

    // Claim rewards for the selected obligation
    const result = await claimScallopRewards(
      wallet,
      targetObligation.obligationId
    );

    return result;
  } catch (error) {
    console.error("[claimAllRewards] Error:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
