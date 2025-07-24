// src/scallop/ScallopWithdrawService.ts
// Last Updated: 2025-07-24 07:06:26 UTC by jake1318

/* eslint-disable @typescript-eslint/no-unused-vars */
import scallopCollateralService from "./ScallopCollateralService";
import { extractWalletAddress, getSymbolFromCoinType } from "./ScallopService";

/**
 * Withdraw collateral from a Scallop obligation
 * This delegates to the battle-tested code in ScallopCollateralService
 *
 * @param wallet The wallet adapter
 * @param obligationId The obligation to withdraw from
 * @param coinType The type of coin to withdraw (e.g., "0x2::sui::SUI")
 * @param amountHuman The amount to withdraw in human-readable format
 * @param decimals Optional decimal places (defaults based on coin type)
 * @returns Transaction result with success status and details
 */
export async function withdrawCollateralQuick(
  wallet: any,
  obligationId: string,
  coinType: string,
  amountHuman: number,
  decimals?: number
) {
  // 1️⃣ Who owns the obligation?
  const sender = await extractWalletAddress(wallet);

  // 2️⃣ Ask CollateralService whether the obligation is locked in either pool
  const [isBoostLocked, isInBorrowIncentive] = await Promise.all([
    scallopCollateralService.getObligationKey(sender, obligationId).then(
      (k) => !k // "no key" → boost pool
    ),
    scallopCollateralService.isObligationInBorrowIncentive(
      sender,
      obligationId
    ),
  ]);

  // 3️⃣ Delegate the heavy lifting
  return scallopCollateralService.unlockAndWithdrawCollateral(
    wallet,
    coinType,
    amountHuman,
    obligationId,
    isBoostLocked,
    isInBorrowIncentive,
    decimals ?? (getSymbolFromCoinType(coinType) === "SUI" ? 9 : 6)
  );
}

/** Alias kept so old imports still work */
export const unlockAndWithdrawCollateral = withdrawCollateralQuick;

export default { withdrawCollateralQuick, unlockAndWithdrawCollateral };
