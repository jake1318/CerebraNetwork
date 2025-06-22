// src/services/bluefinService.ts
// Updated: 2025-05-14 23:52:19 UTC by jake1318

import { WalletContextState } from "@suiet/wallet-kit";
import { Transaction } from "@mysten/sui/transactions";
import type { PoolInfo } from "./coinGeckoService";

/* ------------------------------------------------------------------ */
/* existing code (deposit / withdraw helpers etc.) is UNCHANGED below */
/* ------------------------------------------------------------------ */

const API_URL = "/api/bluefin";

/* ---------- tiny helpers ------------------------------------------------ */

function isBluefinPool(_: string, dex?: string) {
  return dex?.toLowerCase() === "bluefin";
}

async function signExec(
  wallet: WalletContextState,
  endpoint: string,
  payload: Record<string, unknown>
) {
  // call backend ------------------------------------
  console.log(`Executing ${endpoint} with parameters:`, payload);
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const { success, txb64, error } = await res.json();
  if (!success) throw new Error(error || "Backend failed to build tx");

  console.log("Received serialized transaction from backend");

  // Deserialize the base64 transaction into a Transaction object
  const txBlock = Transaction.from(txb64);
  console.log("Deserialized transaction from base64");

  // Pass the Transaction object to the wallet kit
  return wallet.signAndExecuteTransactionBlock({
    transactionBlock: txBlock,
    options: { showEffects: true, showEvents: true },
  });
}

/* ---------- public API --------------------------------------------------- */

export async function getPositions(walletAddress: string) {
  if (!walletAddress) return [];
  try {
    const r = await fetch(`${API_URL}/positions/${walletAddress}`);
    const j = await r.json();
    if (!j.success) throw new Error(j.error);
    return j.data;
  } catch (e) {
    console.error("Failed to fetch Bluefin positions:", e);
    return [];
  }
}

/* All "action" helpers below are now one-liners that call signExec() ----  */

export async function deposit(
  wallet: WalletContextState,
  poolId: string,
  amountA: number,
  amountB: number,
  _poolInfo: PoolInfo // kept for signature-compatibility
) {
  if (!wallet.connected || !wallet.account)
    throw new Error("Wallet not connected");

  try {
    const result = await signExec(wallet, "/create-deposit-tx", {
      poolId,
      amountA,
      amountB,
      lowerTickFactor: 0.5,
      upperTickFactor: 2.0,
      walletAddress: wallet.account.address,
    });

    return { success: !!result.digest, digest: result.digest ?? "" };
  } catch (error) {
    console.error("Deposit error:", error);
    return { success: false, digest: "" };
  }
}

export async function removeLiquidity(
  wallet: WalletContextState,
  poolId: string,
  positionId: string,
  percent = 100
) {
  if (!wallet.connected || !wallet.account)
    throw new Error("Wallet not connected");

  try {
    const result = await signExec(wallet, "/create-remove-liquidity-tx", {
      poolId,
      positionId,
      percent,
      walletAddress: wallet.account.address,
    });

    return { success: !!result.digest, digest: result.digest ?? "" };
  } catch (error) {
    console.error("Remove liquidity error:", error);
    return { success: false, digest: "" };
  }
}

export async function collectFees(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
) {
  if (!wallet.connected || !wallet.account)
    throw new Error("Wallet not connected");

  try {
    const result = await signExec(wallet, "/create-collect-fees-tx", {
      poolId,
      positionId,
      walletAddress: wallet.account.address,
    });

    return { success: !!result.digest, digest: result.digest ?? "" };
  } catch (error) {
    console.error("Collect fees error:", error);
    return { success: false, digest: "" };
  }
}

export async function collectRewards(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
) {
  if (!wallet.connected || !wallet.account)
    throw new Error("Wallet not connected");

  try {
    const result = await signExec(wallet, "/create-collect-rewards-tx", {
      poolId,
      positionId,
      walletAddress: wallet.account.address,
    });

    return { success: !!result.digest, digest: result.digest ?? "" };
  } catch (error) {
    console.error("Collect rewards error:", error);
    return { success: false, digest: "" };
  }
}

export async function closePosition(
  wallet: WalletContextState,
  poolId: string,
  positionId: string
) {
  if (!wallet.connected || !wallet.account)
    throw new Error("Wallet not connected");

  try {
    const result = await signExec(wallet, "/create-close-position-tx", {
      poolId,
      positionId,
      walletAddress: wallet.account.address,
    });

    return { success: !!result.digest, digest: result.digest ?? "" };
  } catch (error) {
    console.error("Close position error:", error);
    return { success: false, digest: "" };
  }
}

/* ------------------------------------------------------------------ */
/* 👇 NEW: lightweight fetch so the UI can read tickSpacing / price   */
/* ------------------------------------------------------------------ */
export async function getPoolDetails(poolId: string) {
  try {
    const res = await fetch(`${API_URL}/pool/${poolId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error ?? "Pool fetch failed");
    return json.data; // ← identical shape to backend helper
  } catch (err) {
    console.error("Bluefin getPoolDetails failed:", err);
    return null; // caller should handle a null gracefully
  }
}

/* ------------------------------------------------------------------ */
/* export helpers that other code already imports                     */
/* ------------------------------------------------------------------ */
export { isBluefinPool };
