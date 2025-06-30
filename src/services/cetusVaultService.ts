// src/services/cetusVaultService.ts
// Last Updated: 2025-06-27 05:28:15 UTC by jake1318

import {
  CetusVaultsSDK,
  VaultsUtils,
  InputType, // enum is exported by the SDK itself
} from "@cetusprotocol/vaults-sdk";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import BN from "bn.js";
import { coinInfoCache } from "./cetusService";

// --- constants -------------------------------------------------------------
const VAULT_DECIMALS = 9;
const DEFAULT_TOKEN_DECIMALS = 9;

// --- SDK initialisation ----------------------------------------------------
export const vaultsSdk = CetusVaultsSDK.createSDK({ env: "mainnet" });

/** Set the connected wallet as sender for every vault call */
export function setVaultsSender(address: string) {
  vaultsSdk.setSenderAddress(address);
}

// Provide the older function name for backward compatibility if needed
export const setVaultSdkSender = setVaultsSender;

/**
 * Clear cache to ensure fresh data
 */
export function clearCache() {
  console.log("Clearing vault data cache");
  // Any internal caching that needs to be reset
}

// --- Wrapper functions for backward compatibility -------------------------

/**
 * Deposit one-sided to vault (wrapper for backward compatibility)
 */
export async function depositOneSidedToVault(
  vaultId: string,
  amount: number,
  isCoinA: boolean,
  slippage: number = 0.01
) {
  return depositToVault(
    vaultId,
    isCoinA ? amount : 0,
    isCoinA ? 0 : amount,
    slippage
  );
}

/**
 * Deposit two-sided to vault (wrapper for backward compatibility)
 */
export async function depositTwoSidedToVault(
  vaultId: string,
  amountA: number,
  amountB: number,
  slippage: number = 0.01
) {
  return depositToVault(vaultId, amountA, amountB, slippage);
}

/**
 * Withdraw one-sided from vault (wrapper for backward compatibility)
 */
export async function withdrawOneSidedFromVault(
  vaultId: string,
  lpAmount: bigint,
  receiveCoinA: boolean,
  slippage: number = 0.01
) {
  return withdrawFromVault(
    vaultId,
    lpAmount,
    /* oneSide = */ true,
    receiveCoinA,
    slippage
  );
}

/**
 * Withdraw two-sided from vault (wrapper for backward compatibility)
 */
export async function withdrawTwoSidedFromVault(
  vaultId: string,
  lpAmount: bigint,
  slippage: number = 0.01
) {
  return withdrawFromVault(
    vaultId,
    lpAmount,
    /* oneSide = */ false,
    /* receiveCoinA */ false,
    slippage
  );
}

/**
 * Withdraw all liquidity from a vault (wrapper for backward compatibility)
 */
export async function withdrawAllFromVault(
  vaultId: string,
  receiveCoinA: boolean = false,
  oneSided: boolean = false,
  slippage: number = 0.01
) {
  if (!vaultsSdk.senderAddress) throw new Error("Wallet not connected");

  try {
    // Get the vault
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    // Get user's LP balance
    const lpTokenType = vault.lp_token_type;
    const balanceInfo = await vaultsSdk.getOwnerCoinBalances(
      vaultsSdk.senderAddress,
      lpTokenType
    );

    const lpBalance = BigInt(balanceInfo.totalBalance);
    if (lpBalance <= BigInt(0)) {
      throw new Error("No liquidity to withdraw");
    }

    // Use the withdrawFromVault function with the user's full balance
    return withdrawFromVault(
      vaultId,
      lpBalance,
      oneSided,
      receiveCoinA,
      slippage
    );
  } catch (err) {
    console.error("Failed to withdraw all from vault:", err);
    throw new Error(`Failed to withdraw all liquidity: ${err.message || err}`);
  }
}

/**
 * Get all available vaults (wrapper for backward compatibility)
 */
export async function getAllAvailableVaults() {
  return getAllVaults();
}

/**
 * Calculate estimates for a vault deposit
 */
export async function calculateVaultDeposit(
  vaultId: string,
  amount: number,
  isCoinA: boolean,
  oneSided: boolean = false
) {
  if (!vaultsSdk.senderAddress) {
    throw new Error("Wallet not connected");
  }

  try {
    // Get the vault
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    // Get token decimals (use cached values if available)
    const coinTypeA = vault.pool_config.coinTypeA;
    const coinTypeB = vault.pool_config.coinTypeB;
    const decimalsA =
      coinInfoCache[coinTypeA]?.decimals || DEFAULT_TOKEN_DECIMALS;
    const decimalsB =
      coinInfoCache[coinTypeB]?.decimals || DEFAULT_TOKEN_DECIMALS;

    // Convert amount to smallest units based on the appropriate token's decimals
    const decimalMultiplier = Math.pow(10, isCoinA ? decimalsA : decimalsB);
    const baseAmount = Math.floor(amount * decimalMultiplier);

    // Build the deposit params
    const params = {
      vault_id: vaultId,
      coin_amount: baseAmount.toString(),
      is_coin_a: isCoinA,
      side: oneSided ? InputType.OneSide : InputType.Both,
    };

    // Calculate deposit estimate
    const estimate = await vaultsSdk.Vaults.calculateDepositAmounts(params);
    return estimate;
  } catch (err) {
    console.error("Failed to calculate vault deposit:", err);
    throw new Error(
      "Could not calculate deposit estimate: " + (err.message || err)
    );
  }
}

/**
 * Deposit to a vault
 */
export async function depositToVault(
  vaultId: string,
  amountA: number,
  amountB: number,
  slippage: number = 0.01
) {
  if (!vaultsSdk.senderAddress) {
    throw new Error("Wallet not connected");
  }

  const tx = new TransactionBlock();

  try {
    // Get the vault
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    // Get token decimals
    const coinTypeA = vault.pool_config.coinTypeA;
    const coinTypeB = vault.pool_config.coinTypeB;
    const decimalsA =
      coinInfoCache[coinTypeA]?.decimals || DEFAULT_TOKEN_DECIMALS;
    const decimalsB =
      coinInfoCache[coinTypeB]?.decimals || DEFAULT_TOKEN_DECIMALS;

    // Convert amounts to base units
    const baseAmountA =
      amountA > 0 ? Math.floor(amountA * Math.pow(10, decimalsA)) : 0;
    const baseAmountB =
      amountB > 0 ? Math.floor(amountB * Math.pow(10, decimalsB)) : 0;

    // Determine deposit type
    let side = InputType.Both;
    let isCoinAInput = baseAmountA > 0;

    if (baseAmountA > 0 && baseAmountB === 0) {
      side = InputType.OneSide;
      isCoinAInput = true;
    } else if (baseAmountA === 0 && baseAmountB > 0) {
      side = InputType.OneSide;
      isCoinAInput = false;
    }

    // Build deposit parameters
    const params = {
      vault_id: vaultId,
      slippage: slippage,
      side: side,
    };

    if (side === InputType.OneSide) {
      params.coin_amount = isCoinAInput
        ? baseAmountA.toString()
        : baseAmountB.toString();
      params.is_coin_a = isCoinAInput;
    } else {
      params.coin_a_amount = baseAmountA.toString();
      params.coin_b_amount = baseAmountB.toString();
    }

    // Create deposit transaction
    await vaultsSdk.Vaults.deposit(params, tx);
  } catch (err) {
    console.error("Vault deposit build failed:", err);
    throw new Error(
      "Vault deposit transaction failed to build. " + (err.message || err)
    );
  }

  const txnBlock = await tx.build();
  return txnBlock;
}

/**
 * Withdraw from a vault
 */
export async function withdrawFromVault(
  vaultId: string,
  lpAmount: bigint,
  oneSide: boolean,
  receiveCoinA: boolean,
  slippage = 0.01
) {
  if (!vaultsSdk.senderAddress) throw new Error("Wallet not connected");

  const tx = new TransactionBlock();

  try {
    // Determine withdrawal parameters
    const params = {
      vault_id: vaultId,
      slippage: slippage,
      ft_amount: lpAmount.toString(),
      return_coin: true,
    };

    if (oneSide) {
      // One-sided withdrawal
      params.side = InputType.OneSide;

      // Get user's LP balance
      const userLPBalance = await vaultsSdk.getOwnerCoinBalances(
        vaultsSdk.senderAddress,
        (
          await vaultsSdk.Vaults.getVault(vaultId)
        ).lp_token_type
      );

      params.is_ft_input = true;
      params.is_a_out = receiveCoinA;
      params.max_ft_amount = userLPBalance.totalBalance.toString();
    } else {
      params.side = InputType.Both;
      params.is_ft_input = true;
      params.max_ft_amount = "";
    }

    const { return_coin_a, return_coin_b } = await vaultsSdk.Vaults.withdraw(
      params,
      tx
    );

    if (return_coin_a)
      tx.transferObjects([return_coin_a], vaultsSdk.senderAddress);
    if (return_coin_b)
      tx.transferObjects([return_coin_b], vaultsSdk.senderAddress);
  } catch (err) {
    console.error("Vault withdrawal build failed:", err);
    throw new Error("Vault withdrawal failed. " + (err.message || err));
  }

  const txnBlock = await tx.build();
  return txnBlock;
}

/**
 * Get all vaults
 */
export async function getAllVaults() {
  try {
    // Wait for SDK to be ready
    if (!vaultsSdk.initiated) {
      await vaultsSdk.init();
    }

    const vaults = await vaultsSdk.Vaults.getVaultList();

    // Enhance with token info
    return Promise.all(
      vaults.map(async (vault) => {
        // Get token symbols if not already cached
        const coinTypeA = vault.pool_config.coinTypeA;
        const coinTypeB = vault.pool_config.coinTypeB;

        let symbolA = coinInfoCache[coinTypeA]?.symbol;
        let symbolB = coinInfoCache[coinTypeB]?.symbol;

        if (!symbolA || !symbolB) {
          try {
            // Try to get metadata from pool config
            const poolObject = await vaultsSdk.Vaults.getPool(vault.pool_id);
            if (poolObject) {
              if (!symbolA && poolObject.coin_a_symbol) {
                symbolA = poolObject.coin_a_symbol;
                if (!coinInfoCache[coinTypeA])
                  coinInfoCache[coinTypeA] = {
                    symbol: symbolA,
                    decimals: DEFAULT_TOKEN_DECIMALS,
                  };
              }

              if (!symbolB && poolObject.coin_b_symbol) {
                symbolB = poolObject.coin_b_symbol;
                if (!coinInfoCache[coinTypeB])
                  coinInfoCache[coinTypeB] = {
                    symbol: symbolB,
                    decimals: DEFAULT_TOKEN_DECIMALS,
                  };
              }
            }
          } catch (err) {
            console.warn("Failed to get pool symbols for vault", err);
          }
        }

        // If still missing, derive from type
        if (!symbolA) {
          const parts = coinTypeA.split("::");
          symbolA = parts[parts.length - 1].toUpperCase();
          if (!coinInfoCache[coinTypeA])
            coinInfoCache[coinTypeA] = {
              symbol: symbolA,
              decimals: DEFAULT_TOKEN_DECIMALS,
            };
        }

        if (!symbolB) {
          const parts = coinTypeB.split("::");
          symbolB = parts[parts.length - 1].toUpperCase();
          if (!coinInfoCache[coinTypeB])
            coinInfoCache[coinTypeB] = {
              symbol: symbolB,
              decimals: DEFAULT_TOKEN_DECIMALS,
            };
        }

        return {
          ...vault,
          symbolA,
          symbolB,
          decimalsA:
            coinInfoCache[coinTypeA]?.decimals || DEFAULT_TOKEN_DECIMALS,
          decimalsB:
            coinInfoCache[coinTypeB]?.decimals || DEFAULT_TOKEN_DECIMALS,
          apy: vault.projected_apy || 0,
        };
      })
    );
  } catch (err) {
    console.error("Failed to fetch vaults:", err);
    return [];
  }
}

/* -----------------------------------------------------------------
 * Back‑compat shim – remove once callers are updated
 * ----------------------------------------------------------------- */

/** Returns an array of all vault positions for the owner */
export async function getOwnerVaultsBalances(ownerAddress: string) {
  // re‑use the helper we already have
  return getUserVaultBalanceForAll(ownerAddress);
}

/** Helper: iterate over every vault and call getUserVaultBalance() */
async function getUserVaultBalanceForAll(owner: string) {
  const vaults = await getAllVaults();
  return Promise.all(
    vaults.map(async (v) => ({
      vault_id: v.vault_id,
      ...(await getUserVaultBalance(v.vault_id, owner)),
      symbolA: v.symbolA,
      symbolB: v.symbolB,
    }))
  );
}

/**
 * Calculate LP value
 */
export async function calculateLpValue(vaultId: string, lpAmount: string) {
  try {
    const result = await vaultsSdk.Vaults.calculateLpValue({
      vault_id: vaultId,
      lp_amount: lpAmount,
    });

    return result;
  } catch (err) {
    console.error("Failed to calculate LP value:", err);
    throw new Error("Could not calculate LP value. " + (err.message || err));
  }
}

/**
 * Get a specific vault's balance for a user
 */
export async function getUserVaultBalance(
  vaultId: string,
  userAddress: string
) {
  try {
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    const lpTokenType = vault.lp_token_type;
    const balance = await vaultsSdk.getOwnerCoinBalances(
      userAddress,
      lpTokenType
    );

    return {
      balance: balance.totalBalance,
      decimals: VAULT_DECIMALS,
    };
  } catch (err) {
    console.error(`Failed to get user balance for vault ${vaultId}:`, err);
    return { balance: "0", decimals: VAULT_DECIMALS };
  }
}
