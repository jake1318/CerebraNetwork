// src/services/cetusVaultsProcessor.ts
// Last Updated: 2025-05-22 06:18:05 UTC by jake1318

import { getAllAvailableVaults } from "./cetusVaultService";

// Interface for vault data returned from BlockVision API
export interface BlockVisionVaultData {
  id: string;
  name: string;
  apy: string;
  coinA: {
    symbol: string;
    name: string;
    decimals: number;
    iconUrl?: string;
  };
  coinB: {
    symbol: string;
    name: string;
    decimals: number;
    iconUrl?: string;
  };
  coinAAmount: string;
  coinBAmount: string;
  coinTypeA: string;
  coinTypeB: string;
}

// Interface for processed vault data with additional details
export interface EnrichedVaultData {
  id: string;
  name: string;
  apy: number;
  tvl?: number;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAmount: string;
  tokenBAmount: string;
  tokenAType: string;
  tokenBType: string;
  tokenALogo?: string;
  tokenBLogo?: string;
  tokenADecimals: number;
  tokenBDecimals: number;
  userValueUsd?: number;
  userHasPosition: boolean;
}

// Cache for vault APY data
const vaultApyCache = new Map<string, number>();

/**
 * Process vault data from BlockVision API
 */
export async function processCetusVaults(
  vaultsData: BlockVisionVaultData[]
): Promise<EnrichedVaultData[]> {
  console.log(`Processing ${vaultsData.length} Cetus vaults from BlockVision`);

  const result: EnrichedVaultData[] = [];

  // Store APYs in cache for later use
  vaultsData.forEach((vault) => {
    const apyValue = parseFloat(vault.apy);
    if (!isNaN(apyValue)) {
      vaultApyCache.set(vault.id, apyValue);
      console.log(`Cached APY for vault ${vault.id}: ${apyValue}%`);
    }
  });

  // Process each vault
  for (const vault of vaultsData) {
    // Convert APY string to number
    const apy = parseFloat(vault.apy);

    const enrichedVault: EnrichedVaultData = {
      id: vault.id,
      name: vault.name,
      apy: isNaN(apy) ? 0 : apy,
      tokenASymbol: vault.coinA?.symbol || "Unknown",
      tokenBSymbol: vault.coinB?.symbol || "Unknown",
      tokenAAmount: vault.coinAAmount || "0",
      tokenBAmount: vault.coinBAmount || "0",
      tokenAType: vault.coinTypeA,
      tokenBType: vault.coinTypeB,
      tokenALogo: vault.coinA?.iconUrl,
      tokenBLogo: vault.coinB?.iconUrl,
      tokenADecimals: vault.coinA?.decimals || 9,
      tokenBDecimals: vault.coinB?.decimals || 9,
      userHasPosition: true, // This data comes from user positions, so they have a position
    };

    result.push(enrichedVault);
  }

  return result;
}

/**
 * Get the APY for a specific vault ID from cache
 */
export function getVaultApy(vaultId: string): number | undefined {
  return vaultApyCache.get(vaultId);
}

/**
 * Update our vault service data with APYs from BlockVision
 */
export async function updateVaultApysFromBlockVision(
  blockVisionVaults: BlockVisionVaultData[]
): Promise<void> {
  // Get all available vaults from our service
  try {
    // Store APYs in cache for later use by the vault service
    blockVisionVaults.forEach((vault) => {
      const apyValue = parseFloat(vault.apy);
      if (!isNaN(apyValue)) {
        vaultApyCache.set(vault.id, apyValue);
        console.log(
          `Storing BlockVision APY for vault ${vault.id}: ${apyValue}%`
        );
      }
    });
  } catch (error) {
    console.error("Error updating vault APYs from BlockVision:", error);
  }
}

/**
 * Clear the vault APY cache
 */
export function clearVaultApyCache(): void {
  vaultApyCache.clear();
  console.log("Vault APY cache cleared");
}

/**
 * Get cached APY values for all vaults
 */
export function getVaultApyCache(): Map<string, number> {
  return vaultApyCache;
}
