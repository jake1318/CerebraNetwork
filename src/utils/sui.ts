// src/utils/sui.ts
// Updated: 2025-07-16 23:05:08 UTC by jake1318

import { fromB64 } from "@mysten/sui.js/utils";
import { TransactionBlock } from "@mysten/sui.js/transactions";

/**
 * Utility function to sign and execute transaction blocks received as base64 strings
 * Creates a new TransactionBlock from the base64 data for Suiet wallet compatibility
 *
 * @param wallet The wallet instance from useWallet()
 * @param base64 The base64-encoded transaction bytes
 * @param options Optional transaction execution options
 * @returns Promise with the transaction execution result
 */
export async function signAndExecuteBase64(
  wallet: any, // Using any to avoid importing useWallet return type
  base64: string,
  options?: {
    showEffects?: boolean;
    showEvents?: boolean;
    showObjectChanges?: boolean;
    showInput?: boolean;
    requestType?: "WaitForEffectsCert" | "WaitForLocalExecution";
  }
) {
  if (!base64) {
    throw new Error("Invalid transaction bytes: empty string provided");
  }

  try {
    // IMPORTANT: For Suiet wallet compatibility, we need to create a TransactionBlock
    // from the base64 string rather than passing raw bytes
    const txBlock = TransactionBlock.from(base64);

    // Pass the TransactionBlock instance to the wallet
    return wallet.signAndExecuteTransactionBlock({
      transactionBlock: txBlock,
      options: options || { showEffects: true },
    });
  } catch (error) {
    console.error("Error executing transaction:", error);
    throw error;
  }
}
