// src/services/cetusVaultService.ts
// Last Updated: 2025-07-04 06:23:18 UTC by jake1318

import {
  CetusVaultsSDK,
  VaultsUtils,
  InputType, // enum is exported by the SDK itself
} from "@cetusprotocol/vaults-sdk";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import BN from "bn.js";
import { coinInfoCache } from "./cetusService";
import type { WalletContextState } from "@suiet/wallet-kit";
import blockvisionService from "./blockvisionService";

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
  // Reset any cached data
  _cachedVaults = null;
}

// In-memory cache for vaults data
let _cachedVaults = null;

// --- Vaults data retrieval functions --------------------------------------

/**
 * Get all available vaults with enhanced metadata
 */
export async function getAllAvailableVaults() {
  if (_cachedVaults) {
    return _cachedVaults;
  }

  try {
    // Wait for SDK to be ready
    if (!vaultsSdk.initiated) {
      await vaultsSdk.init();
    }

    const vaults = await vaultsSdk.Vaults.getVaultList();
    console.log(`Found ${vaults.length} vaults`);

    // Process vaults with metadata
    const enhancedVaults = await Promise.all(
      vaults.map(async (vault) => {
        try {
          // Get token symbols and metadata
          const coinTypeA = vault.pool_config.coinTypeA;
          const coinTypeB = vault.pool_config.coinTypeB;

          let tokenAMetadata = coinInfoCache[coinTypeA];
          let tokenBMetadata = coinInfoCache[coinTypeB];

          // Get pool data for additional info
          const pool = await vaultsSdk.Vaults.getPool(vault.pool_id);

          let coin_a_symbol = pool?.coin_a_symbol;
          let coin_b_symbol = pool?.coin_b_symbol;
          let tvl = null;

          // Determine symbols if not found yet
          if (!coin_a_symbol) {
            if (tokenAMetadata?.symbol) {
              coin_a_symbol = tokenAMetadata.symbol;
            } else {
              const parts = coinTypeA.split("::");
              coin_a_symbol = parts[parts.length - 1].toUpperCase();
            }
          }

          if (!coin_b_symbol) {
            if (tokenBMetadata?.symbol) {
              coin_b_symbol = tokenBMetadata.symbol;
            } else {
              const parts = coinTypeB.split("::");
              coin_b_symbol = parts[parts.length - 1].toUpperCase();
            }
          }

          // Try to get TVL - vault's liquidity converted to USD
          if (vault.liquidity && pool) {
            // If we have price data, calculate TVL
            // This is a simplified approach - for real apps, use proper price feeds
            const token_a_price = 0; // You'd get this from a price feed
            const token_b_price = 0; // You'd get this from a price feed

            tvl = 0; // Placeholder - in reality calculate based on prices and liquidity
          }

          // Update cache if we got new metadata
          if (coin_a_symbol && !tokenAMetadata) {
            coinInfoCache[coinTypeA] = {
              symbol: coin_a_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
            };
          }

          if (coin_b_symbol && !tokenBMetadata) {
            coinInfoCache[coinTypeB] = {
              symbol: coin_b_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
            };
          }

          // Try to get BlockVision APY data for this vault
          let apy = parseFloat(vault.projected_apy || "0");
          let hasBlockVisionAPY = false;

          // Construct enhanced vault object
          return {
            id: vault.vault_id,
            pool_id: vault.pool_id,
            name: `${coin_a_symbol}/${coin_b_symbol} Vault`,
            coin_a_symbol,
            coin_b_symbol,
            tokenAMetadata: coinInfoCache[coinTypeA] || {
              symbol: coin_a_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
            },
            tokenBMetadata: coinInfoCache[coinTypeB] || {
              symbol: coin_b_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
            },
            liquidity: vault.liquidity,
            tvl: tvl || 0, // Default to 0 if can't calculate
            apy: apy || 0, // Default to 0 if no APY available
            hasBlockVisionAPY,
            lp_token_type: vault.lp_token_type,
          };
        } catch (err) {
          console.warn(
            `Error enhancing vault data for ${vault.vault_id}:`,
            err
          );

          // Return a minimal object if there was an error
          return {
            id: vault.vault_id,
            pool_id: vault.pool_id,
            name: `Vault ${vault.vault_id.substring(0, 8)}...`,
            coin_a_symbol: "Token A",
            coin_b_symbol: "Token B",
            apy: parseFloat(vault.projected_apy || "0"),
            tvl: 0,
            hasBlockVisionAPY: false,
            lp_token_type: vault.lp_token_type,
          };
        }
      })
    );

    // Cache the results
    _cachedVaults = enhancedVaults;
    return enhancedVaults;
  } catch (err) {
    console.error("Failed to fetch vaults:", err);
    throw new Error("Failed to fetch available vaults");
  }
}

/**
 * Get balances for all vaults owned by the specified address
 */
export async function getOwnerVaultsBalances(ownerAddress: string) {
  try {
    // Get all vaults first to have the reference data
    const allVaults = await getAllAvailableVaults();
    const vaultMap = new Map();
    allVaults.forEach((v) => vaultMap.set(v.id, v));

    // Get BlockVision data if available for more accurate APY/TVL info
    let blockVisionData = null;
    try {
      const blockVisionResponse = await blockvisionService.getDefiPortfolioData(
        ownerAddress
      );
      if (blockVisionResponse?.rawData?.cetus?.vaults) {
        blockVisionData = blockVisionResponse.rawData.cetus.vaults;
      }
    } catch (error) {
      console.warn("Failed to load BlockVision data:", error);
      // Continue without BlockVision data
    }

    // Get all vault balances
    const balances = [];

    // First check all vaults in the map
    for (const vault of allVaults) {
      // Check if the user has a balance in this vault
      try {
        const lpTokenBalance = await vaultsSdk.getOwnerCoinBalances(
          ownerAddress,
          vault.lp_token_type
        );

        // Skip if balance is zero
        if (lpTokenBalance.totalBalance === "0") {
          continue;
        }

        // Get detailed position information including values
        const lpValue = await calculateLpValue(
          vault.id,
          lpTokenBalance.totalBalance
        );

        // Find matching BlockVision data if available
        const blockVisionVault = blockVisionData?.find(
          (bv) => bv.id === vault.id
        );

        // Combine the data
        balances.push({
          vault_id: vault.id,
          pool_id: vault.pool_id,
          lp_token_balance: lpTokenBalance.totalBalance,
          amount_a: lpValue?.amount_a || "0",
          amount_b: lpValue?.amount_b || "0",
          coin_a_symbol: vault.coin_a_symbol,
          coin_b_symbol: vault.coin_b_symbol,
          tokenAMetadata: vault.tokenAMetadata,
          tokenBMetadata: vault.tokenBMetadata,
          value_usd: blockVisionVault?.valueUSD || 0,
          apy: blockVisionVault ? parseFloat(blockVisionVault.apy) : vault.apy,
          hasBlockVisionAPY: !!blockVisionVault,
        });
      } catch (err) {
        console.warn(`Error fetching balance for vault ${vault.id}:`, err);
        // Continue with next vault
      }
    }

    return balances;
  } catch (err) {
    console.error("Failed to fetch owner vault balances:", err);
    return [];
  }
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
    return null;
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

/**
 * Get vault coin info
 */
export async function getVaultCoinInfo(vaultId: string) {
  try {
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    return {
      coinTypeA: vault.pool_config.coinTypeA,
      coinTypeB: vault.pool_config.coinTypeB,
      lpTokenType: vault.lp_token_type,
    };
  } catch (err) {
    console.error(`Failed to get coin info for vault ${vaultId}:`, err);
    throw err;
  }
}

// --- Transaction building functions ---------------------------------------

/**
 * Deposit one-sided to vault
 */
export async function depositOneSidedToVault(
  wallet: WalletContextState,
  vaultId: string,
  amount: number,
  isCoinA: boolean,
  slippage: number = 0.01
) {
  return depositToVault(
    wallet,
    vaultId,
    isCoinA ? amount : 0,
    isCoinA ? 0 : amount,
    slippage
  );
}

/**
 * Deposit to a vault (both tokens or one-sided)
 */
export async function depositToVault(
  wallet: WalletContextState,
  vaultId: string,
  amountA: number,
  amountB: number,
  slippage: number = 0.01
) {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  // Set sender address for this operation
  vaultsSdk.setSenderAddress(wallet.account.address);

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

  // Execute the transaction
  try {
    console.log("Sending vault deposit transaction...");

    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    // Check transaction success
    if (result.effects?.status?.status !== "success") {
      const errorMsg = result.effects?.status?.error;
      throw new Error(`Deposit failed: ${errorMsg || "unknown error"}`);
    }

    console.log("Deposit successful, digest:", result.digest);
    return {
      success: true,
      digest: result.digest || "",
    };
  } catch (error) {
    console.error("Deposit transaction failed:", error);
    throw new Error(
      `Deposit transaction failed: ${error.message || "unknown error"}`
    );
  }
}

/**
 * Withdraw from a vault
 */
export async function withdrawFromVault(
  wallet: WalletContextState,
  vaultId: string,
  lpAmount: number,
  slippage: number = 0.01,
  oneSided: boolean = false,
  receiveCoinA: boolean = true
) {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  // Set sender address for this operation
  vaultsSdk.setSenderAddress(wallet.account.address);

  const tx = new TransactionBlock();

  try {
    // Determine withdrawal parameters
    const params = {
      vault_id: vaultId,
      slippage: slippage,
      ft_amount: lpAmount.toString(),
      return_coin: true,
      side: oneSided ? InputType.OneSide : InputType.Both,
      is_ft_input: true,
    };

    if (oneSided) {
      // One-sided withdrawal
      // Get user's LP balance
      const userLPBalance = await vaultsSdk.getOwnerCoinBalances(
        wallet.account.address,
        (
          await vaultsSdk.Vaults.getVault(vaultId)
        ).lp_token_type
      );

      params.is_a_out = receiveCoinA;
      params.max_ft_amount = userLPBalance.totalBalance.toString();
    }

    const { return_coin_a, return_coin_b } = await vaultsSdk.Vaults.withdraw(
      params,
      tx
    );

    if (return_coin_a)
      tx.transferObjects([return_coin_a], wallet.account.address);
    if (return_coin_b)
      tx.transferObjects([return_coin_b], wallet.account.address);
  } catch (err) {
    console.error("Vault withdrawal build failed:", err);
    throw new Error("Vault withdrawal failed. " + (err.message || err));
  }

  // Execute the transaction
  try {
    console.log("Sending vault withdrawal transaction...");

    const result = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    // Check transaction success
    if (result.effects?.status?.status !== "success") {
      const errorMsg = result.effects?.status?.error;
      throw new Error(`Withdrawal failed: ${errorMsg || "unknown error"}`);
    }

    console.log("Withdrawal successful, digest:", result.digest);
    return {
      success: true,
      digest: result.digest || "",
    };
  } catch (error) {
    console.error("Withdrawal transaction failed:", error);
    throw new Error(
      `Withdrawal transaction failed: ${error.message || "unknown error"}`
    );
  }
}

/**
 * Withdraw all liquidity from a vault
 */
export async function withdrawAllFromVault(
  wallet: WalletContextState,
  vaultId: string,
  slippage: number = 0.01,
  oneSided: boolean = false,
  receiveCoinA: boolean = false
) {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  try {
    // Get the vault
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    // Get user's LP balance
    const lpTokenType = vault.lp_token_type;
    const balanceInfo = await vaultsSdk.getOwnerCoinBalances(
      wallet.account.address,
      lpTokenType
    );

    const lpBalance = parseFloat(balanceInfo.totalBalance);
    if (lpBalance <= 0) {
      throw new Error("No liquidity to withdraw");
    }

    // Use the withdrawFromVault function with the user's full balance
    return withdrawFromVault(
      wallet,
      vaultId,
      lpBalance,
      slippage,
      oneSided,
      receiveCoinA
    );
  } catch (err) {
    console.error("Failed to withdraw all from vault:", err);
    throw new Error(`Failed to withdraw all liquidity: ${err.message || err}`);
  }
}

/**
 * Calculate deposit estimate
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

/* -----------------------------------------------------------------
 * Back‑compat shim – remove once callers are updated
 * ----------------------------------------------------------------- */

/** Helper: iterate over every vault and call getUserVaultBalance() */
async function getUserVaultBalanceForAll(owner: string) {
  const vaults = await getAllAvailableVaults();
  return Promise.all(
    vaults.map(async (v) => ({
      vault_id: v.id,
      ...(await getUserVaultBalance(v.id, owner)),
      symbolA: v.coin_a_symbol,
      symbolB: v.coin_b_symbol,
    }))
  );
}
