// src/services/cetusVaultsProcessor.ts
// Last Updated: 2025-06-27 00:29:11 UTC by jake1318

import { getCoinInfo } from "./cetusService";
import { getVaultCoinInfo } from "./cetusVaultService";

// Process and merge pools with vaults data for UI
export function processPoolsWithVaults(pools, allVaults) {
  // Create a lookup by pool ID for vaults
  const vaultMap = new Map();
  allVaults.forEach((v) => vaultMap.set(v.clmm_pool_id, v));

  return pools.map((pool) => {
    const vault = vaultMap.get(pool.poolAddress);

    // Merge vault data if exists for this pool
    if (vault) {
      // Ensure symbols present
      const symbolA = pool.symbolA || vault.symbolA || "";
      const symbolB = pool.symbolB || vault.symbolB || "";

      // Compute APR if needed
      const vaultApr = vault.apr_percent || vault.apy_percent || null;

      return {
        ...pool,
        symbolA,
        symbolB,
        hasVault: true,
        vaultId: vault.vault_id,
        vaultApy: vaultApr,
        vaultLowerTick: vault.tick_lower_index,
        vaultUpperTick: vault.tick_upper_index,
      };
    } else {
      return {
        ...pool,
        hasVault: false,
      };
    }
  });
}

// Process user's vault positions
export function processUserVaultPositions(vaultPositions, allVaults) {
  return vaultPositions.map((vp) => {
    const vaultConfig = allVaults.find((v) => v.vault_id === vp.vault_id);

    const symbolA = vp.symbolA || vaultConfig?.symbolA || "";
    const symbolB = vp.symbolB || vaultConfig?.symbolB || "";

    // Calculate user's share percentage
    let sharePercent = 0;
    if (
      vaultConfig &&
      vaultConfig.liquidity &&
      Number(vaultConfig.liquidity) > 0
    ) {
      sharePercent =
        (Number(vp.lp_token_balance) / Number(vaultConfig.liquidity)) * 100;
    }

    return {
      ...vp,
      symbolA,
      symbolB,
      sharePercent: sharePercent.toFixed(2) + "%",
    };
  });
}
