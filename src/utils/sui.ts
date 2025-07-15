// src/utils/sui.ts
// Last Updated: 2025-07-15 17:18:45 UTC by jake1318

import { fromB64 } from "@mysten/sui.js/utils";

/**
 * Utility function to sign and execute transaction blocks received as base64 strings
 * Converts base64 strings to Uint8Array before sending to wallet
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
    // Convert the base64 string to Uint8Array, which is what the wallet SDK expects
    const bytes = fromB64(base64);

    // Pass the bytes directly to the wallet
    return wallet.signAndExecuteTransactionBlock({
      transactionBlock: bytes,
      options: options || { showEffects: true },
    });
  } catch (error) {
    console.error("Error executing transaction:", error);
    throw error;
  }
}
