// src/scallop/ScallopWithdrawService.ts
// Updated: 2025-07-22 20:08:38 UTC by jake1318

import {
  extractWalletAddress,
  getCoinSymbol,
  normalizeCoinType,
  parseMoveCallError,
  SUIVISION_URL,
  scallop,
  client,
} from "./ScallopService";
import scallopBorrowService from "./ScallopBorrowService";

/**
 * Withdraw collateral from a Scallop obligation - handles locked obligations
 * Uses a two-step process: first unstake, then withdraw
 *
 * @param wallet - The wallet to use for the transaction
 * @param obligationId - The ID of the obligation to withdraw from
 * @param coinType - The type of coin to withdraw (e.g. "0x2::sui::SUI")
 * @param amountHuman - The amount to withdraw in human-readable format
 * @param decimals - Optional decimal places (defaults to 9 for SUI, 6 for others)
 * @returns Transaction result
 */
export async function withdrawCollateralQuick(
  wallet: any,
  obligationId: string,
  coinType: string,
  amountHuman: number,
  decimals?: number
) {
  try {
    // ----------------------------------
    // 1. Initialization and input checks
    // ----------------------------------
    // Initialize SDK if needed
    if (!scallop.client) await scallop.init();

    // Get the wallet address
    const sender = await extractWalletAddress(wallet);
    if (!sender) {
      throw new Error("Wallet not connected");
    }
    console.log(`[Withdraw] Using wallet address: ${sender}`);

    // Normalize the coin type and get the symbol
    coinType = normalizeCoinType(coinType);
    const symbol = getCoinSymbol(coinType).toLowerCase();
    const dec = decimals ?? (symbol === "sui" ? 9 : 6);

    // Apply a small buffer to avoid "too small" errors
    let amount = BigInt(Math.floor(amountHuman * 10 ** dec));
    if (amountHuman > 0) {
      const bufferPercent = amountHuman < 1 ? 0.0001 : 0.001;
      const bufferAmount = amountHuman * bufferPercent;
      if (bufferAmount >= 0.000001) {
        const adjustedAmount = amountHuman - bufferAmount;
        amount = BigInt(Math.floor(adjustedAmount * 10 ** dec));
        console.log(
          `[Withdraw] Applied ${
            bufferPercent * 100
          }% buffer: ${amountHuman} -> ${adjustedAmount}`
        );
      }
    }

    console.log("[Withdraw]", {
      obligationId,
      symbol,
      amountHuman,
      amount: amount.toString(),
      sender,
    });

    // ----------------------------------
    // 2. Verify obligation exists and get lock status
    // ----------------------------------
    console.log(`[Withdraw] Verifying obligation ${obligationId}...`);
    const userObligations = await scallopBorrowService.getUserObligations(
      sender
    );

    // Find the exact obligation by ID
    const obligation = userObligations.find(
      (ob) => ob.obligationId === obligationId
    );

    if (!obligation) {
      throw new Error(
        `Obligation ${obligationId} not found for user ${sender}`
      );
    }

    // Get lock status and other obligation details
    const hasBoostStake =
      obligation.hasBoostStake || obligation.lockType === "boost";
    const hasBorrowIncentiveStake =
      obligation.hasBorrowIncentiveStake ||
      obligation.lockType === "borrow-incentive";
    const isLocked =
      hasBoostStake || hasBorrowIncentiveStake || obligation.isLocked;

    console.log(`[Withdraw] Found obligation with details:`, {
      obligationId: obligation.obligationId,
      hasBoostStake,
      hasBorrowIncentiveStake,
      lockType: obligation.lockType,
      isLocked,
      collaterals: obligation.collaterals?.length || 0,
      collateralTypes: obligation.collaterals?.map((c) => c.symbol) || [],
      totalCollateralUSD: obligation.totalCollateralUSD,
    });

    // ----------------------------------
    // 3. FIRST STEP: If locked, create and execute a separate unstake transaction
    // ----------------------------------
    if (isLocked) {
      console.log(
        `[Withdraw] Obligation is locked. Creating separate unstake transaction first...`
      );

      try {
        // Create a separate transaction just for unstaking
        const unstakeBuilder = await scallop.createScallopBuilder();
        const unstakeTxb = unstakeBuilder.createTxBlock();
        unstakeTxb.setSender(sender);

        // Try to add unstake operation - try both methods
        if (hasBorrowIncentiveStake) {
          console.log(
            `[Withdraw] Adding unstakeObligation for borrow-incentive...`
          );
          try {
            unstakeTxb.unstakeObligation(obligationId);
          } catch (unstakeErr) {
            console.warn(
              `[Withdraw] Direct unstakeObligation failed: ${unstakeErr}`
            );

            // Try using SDK's moveCall directly if the helper method failed
            try {
              console.log(
                `[Withdraw] Trying to use moveCall directly for unstaking...`
              );
              // Add the unstake operation using direct moveCall (if supported by SDK)
              if (
                unstakeTxb.txBlock &&
                typeof unstakeTxb.txBlock.moveCall === "function"
              ) {
                unstakeTxb.txBlock.moveCall({
                  target: `${scallop.client.packageId}::incentive::unstake_obligation`,
                  arguments: [
                    unstakeTxb.txBlock.object(scallop.client.incentivePoolId),
                    unstakeTxb.txBlock.object(obligationId),
                  ],
                });
              }
            } catch (moveCallErr) {
              console.warn(`[Withdraw] Direct moveCall failed: ${moveCallErr}`);
            }
          }
        }

        // Only execute unstake if we have operations
        if (unstakeTxb.txBlock.blockData.transactions.length > 0) {
          // Set gas budget
          unstakeTxb.txBlock.setGasBudget(50_000_000);

          // Execute the unstake transaction
          console.log(`[Withdraw] Executing unstake transaction...`);
          const unstakeRes = await wallet.signAndExecuteTransactionBlock({
            transactionBlock: unstakeTxb.txBlock,
            requestType: "WaitForLocalExecution",
            options: { showEffects: true },
          });

          console.log(
            `[Withdraw] Unstake transaction completed with digest: ${unstakeRes.digest}`
          );

          // Wait for the unstake transaction to be processed
          console.log(
            `[Withdraw] Waiting 2.5 seconds for unstake to be processed...`
          );
          await new Promise((resolve) => setTimeout(resolve, 2500));
        } else {
          console.log(
            `[Withdraw] No unstake operations added - skipping unstake transaction`
          );
        }
      } catch (unstakeErr) {
        console.warn(
          `[Withdraw] Unstake transaction failed (continuing with withdrawal): ${unstakeErr}`
        );
      }
    }

    // ----------------------------------
    // 4. SECOND STEP: Create withdrawal transaction using client.withdrawCollateral
    // ----------------------------------
    console.log(
      `[Withdraw] Creating withdrawal transaction using client.withdrawCollateral...`
    );

    try {
      // Convert the amount to a number as required by the client API
      const amountNum = Number(amount);

      console.log(`[Withdraw] Calling client.withdrawCollateral with:`, {
        symbol,
        amountNum,
        transferToSender: true,
        obligationId,
      });

      // Call the client's withdrawCollateral method directly
      const result = await scallop.client.withdrawCollateral(
        symbol,
        amountNum,
        true, // transfer to sender
        obligationId
      );

      console.log(
        `[Withdraw] Withdrawal completed with digest: ${result.digest}`
      );

      return {
        success: true,
        digest: result.digest,
        txLink: `${SUIVISION_URL}${result.digest}`,
        amount: amountHuman,
        symbol: symbol.toUpperCase(),
        timestamp: new Date().toISOString(),
      };
    } catch (withdrawErr) {
      console.error(`[Withdraw] Error in withdrawal: ${withdrawErr}`);
      throw withdrawErr;
    }
  } catch (err: any) {
    console.error(`[Withdraw] Error:`, err);
    return {
      success: false,
      error: parseMoveCallError(err) || (err.message ?? String(err)),
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Legacy function for API compatibility - uses the new implementation internally
 */
export async function unlockAndWithdrawCollateral(
  wallet: any,
  obligationId: string,
  coinType: string,
  amountHuman: number,
  decimals?: number
) {
  return withdrawCollateralQuick(
    wallet,
    obligationId,
    coinType,
    amountHuman,
    decimals
  );
}

export default { withdrawCollateralQuick, unlockAndWithdrawCollateral };
