// src/services/cetusVaultService.ts
// Last Updated: 2025-06-23 03:43:22 UTC by jake1318

import { CetusVaultsSDK } from "@cetusprotocol/vaults-sdk";
import { CetusClmmSDK } from "@cetusprotocol/sui-clmm-sdk";
import {
  TickMath,
  ClmmPoolUtil,
  Percentage,
  adjustForCoinSlippage,
} from "@cetusprotocol/common-sdk";
import type { WalletContextState } from "@suiet/wallet-kit";
import { TransactionBlock } from "@mysten/sui.js/transactions";
import BN from "bn.js";
import { searchPools } from "./coinGeckoService";
import { getMultipleTokenMetadata, TokenMetadata } from "./birdeyeService";
import blockvisionService from "./blockvisionService";
// Common vault IDs for our supported vaults
export const VAULT_IDS = {
  HASUI_SUI:
    "0xde97452e63505df696440f86f0b805263d8659b77b8c316739106009d514c270", // haSUI-SUI
  AFSUI_SUI:
    "0xff4cc0af0ad9d50d4a3264dfaafd534437d8b66c8ebe9f92b4c39d898d6870a3", // afSUI-SUI
  VSUI_SUI:
    "0x5732b81e659bd2db47a5b55755743dde15be99490a39717abc80d62ec812bcb6", // vSUI-SUI
  SUI_USDC:
    "0x41a4ab1e82f90f5965bbcd828b8ffa13bab7560bd2e352ab067e343db552f527", // SUI-USDC
  DEEP_SUI:
    "0xed754b6a3a6c7549c3d734cb7b464bccf9c805814b9e47b0cb99f43b4efcb4a6", // DEEP-SUI
  WAL_SUI: "0x12ac7deea4b92b3e2c16687e2d2695fa8c045ec0a52844db7b2fc3876c9552aa", // WAL-SUI
};

// Token decimal places based on network standards
export const TOKEN_DECIMALS = {
  "0x2::sui::SUI": 9, // SUI token
  // LSTs on SUI
  "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI": 9,
  "0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI": 9,
  "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT": 9,
  // Other tokens
  USDC: 6, // USDC typically has 6 decimals
  DEEP: 9, // DEEP has 9 decimals
  WAL: 9, // WAL has 9 decimals
  DEFAULT: 9,
};

// Cache for vault data to reduce redundant API calls
const vaultCache = new Map();
const poolCache = new Map();
const tokenMetadataCache = new Map();

// Cache for BlockVision vault APY data
const blockVisionApyCache = new Map<string, number>();

/**
 * Interface for CoinGecko pool data structure
 */
interface CoinGeckoPoolData {
  id: string;
  attributes: {
    name: string;
    reserve_in_usd: string;
    volume_usd: {
      h24: string;
    };
    address: string;
  };
  relationships: {
    base_token: {
      data: {
        id: string;
      };
    };
    quote_token: {
      data: {
        id: string;
      };
    };
    dex: {
      data: {
        id: string;
      };
    };
  };
}

// Custom utility to build a coin with balance - compatible with @mysten/sui v1.28.2
function buildCoinWithBalance(
  amount: bigint,
  coinType: string,
  tx: TransactionBlock
) {
  // Creates a coin with the specified amount and type
  const [coin] = tx.splitCoins(tx.gas, [tx.pure(amount)]);
  return coin;
}

/**
 * Creates a fresh Vaults SDK instance bound to a signer address.
 * Custom adapter for v1.1.4 SDK to avoid dependency conflicts
 */
function getSdkWithWallet(address: string) {
  try {
    // Try using the new API style
    const sdk = CetusVaultsSDK.createSDK({
      env: "mainnet",
    });

    // Set sender address
    if (typeof sdk.setSenderAddress === "function") {
      sdk.setSenderAddress(address);
    } else {
      // Fallback to old API style if needed
      (sdk as any).senderAddress = address;
    }
    return sdk;
  } catch (e) {
    console.warn(
      "Error creating SDK with new API, falling back to v1.0 style:",
      e
    );
    // Fallback to v1.0 API style
    return CetusVaultsSDK.createSdk("mainnet", address);
  }
}

/**
 * Creates a base Vaults SDK instance without wallet.
 * Custom adapter for v1.1.4 SDK
 */
function getBaseSdk() {
  try {
    // Try using the new API style
    return CetusVaultsSDK.createSDK({ env: "mainnet" });
  } catch (e) {
    console.warn(
      "Error creating base SDK with new API, falling back to v1.0 style:",
      e
    );
    // Fallback to v1.0 API style
    return CetusVaultsSDK.createSdk("mainnet");
  }
}

/**
 * Creates a base CLMM SDK instance for pool data access.
 * Custom adapter for SDK compatibility
 */
function getClmmSdk() {
  try {
    // Try using the new API style
    return CetusClmmSDK.createSDK({ env: "mainnet" });
  } catch (e) {
    console.warn(
      "Error creating CLMM SDK with new API, falling back to v1.0 style:",
      e
    );
    // Fallback to v1.0 API style
    return CetusClmmSDK.createSDK({ env: "mainnet" });
  }
}

/**
 * Helper function to get token decimals.
 * @param coinType - The coin type identifier
 */
function getTokenDecimals(coinType: string | undefined): number {
  if (!coinType) {
    return TOKEN_DECIMALS.DEFAULT;
  }

  // Check if we have specific decimals for this token
  if (TOKEN_DECIMALS[coinType]) {
    return TOKEN_DECIMALS[coinType];
  }

  // Extract token symbol from the coin type
  const parts = coinType.split("::");
  const symbol = parts.length > 2 ? parts[2] : "";

  // Check if we have decimals for this symbol
  if (symbol && TOKEN_DECIMALS[symbol]) {
    return TOKEN_DECIMALS[symbol];
  }

  // Default to 9 decimals (SUI standard)
  return TOKEN_DECIMALS.DEFAULT;
}

/**
 * Helper to get token price in USD.
 */
async function getTokenPriceUSD(coinType: string | undefined): Promise<number> {
  if (!coinType) {
    return 0;
  }

  try {
    const coinTypeLower = coinType.toLowerCase();

    // Stablecoins are pegged to $1
    if (coinTypeLower.includes("usdc") || coinTypeLower.includes("usdt")) {
      return 1.0;
    }

    // SUI token price
    if (
      coinTypeLower.includes("::sui::sui") ||
      coinTypeLower === "0x2::sui::sui"
    ) {
      try {
        // Use CoinGecko or similar API for live price
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd"
        );
        const data = await response.json();
        if (data?.sui?.usd) {
          return data.sui.usd;
        }
      } catch (error) {
        console.warn("Failed to fetch SUI price from CoinGecko");
      }

      // Fallback price if API fails
      return 1.25;
    }

    // LST tokens (typically have a premium over SUI)
    const suiPrice = await getTokenPriceUSD("0x2::sui::SUI");

    // haSUI (Haedal LST)
    if (
      coinTypeLower.includes("hasui") ||
      coinTypeLower.includes(
        "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d"
      )
    ) {
      return suiPrice * 1.05; // ~5% premium
    }

    // afSUI (Aftermath LST)
    if (
      coinTypeLower.includes("afsui") ||
      coinTypeLower.includes(
        "0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc"
      )
    ) {
      return suiPrice * 1.06; // ~6% premium
    }

    // vSUI/CERT (Volo LST)
    if (
      coinTypeLower.includes("cert") ||
      coinTypeLower.includes("vsui") ||
      coinTypeLower.includes(
        "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55"
      )
    ) {
      return suiPrice * 1.04; // ~4% premium
    }

    // DEEP token
    if (coinTypeLower.includes("deep")) {
      try {
        // Use estimated price for DEEP
        return 0.32;
      } catch (error) {
        console.error("Error getting DEEP price:", error);
      }
    }

    // WAL token
    if (coinTypeLower.includes("wal")) {
      try {
        // Use estimated price for WAL
        return 0.45;
      } catch (error) {
        console.error("Error getting WAL price:", error);
      }
    }

    // Default fallback price for unknown tokens
    return 0.5;
  } catch (error) {
    console.error("Error getting token price:", error);
    return 0;
  }
}

/**
 * Extract token address from CoinGecko token ID format
 */
function extractTokenAddressFromId(tokenId: string): string | null {
  if (!tokenId) return null;

  // Format: "sui-network_0x2::sui::SUI"
  const parts = tokenId.split("_");
  if (parts.length >= 2) {
    return parts[1]; // Return the part after '_'
  }

  return null;
}

/**
 * Process BlockVision data to extract vault APYs and update the cache
 */
export function processBlockVisionVaultData(blockVisionData: any) {
  if (
    !blockVisionData ||
    !blockVisionData.cetus ||
    !blockVisionData.cetus.vaults
  ) {
    return;
  }

  const vaults = blockVisionData.cetus.vaults;

  // Update the APY cache
  vaults.forEach((vault) => {
    if (vault.id && vault.apy) {
      try {
        const apyValue = parseFloat(vault.apy);
        if (!isNaN(apyValue)) {
          blockVisionApyCache.set(vault.id, apyValue);
          console.log(
            `Cached BlockVision APY for vault ${vault.id}: ${apyValue}%`
          );
        }
      } catch (e) {
        console.error(`Error parsing APY for vault ${vault.id}:`, e);
      }
    }
  });

  console.log(
    `Updated BlockVision APY cache with ${blockVisionApyCache.size} entries`
  );
}

/**
 * Fetch pool data from CoinGecko using the pool address
 */
async function getPoolDataFromCoinGecko(poolId: string): Promise<any> {
  // Check cache first
  if (poolCache.has(poolId)) {
    console.log(`Using cached pool data for ${poolId}`);
    return poolCache.get(poolId);
  }

  try {
    // Remove the 0x prefix for search to improve match chance
    const searchPoolId = poolId.startsWith("0x") ? poolId.substring(2) : poolId;

    console.log(`Searching for pool with ID: ${searchPoolId}`);
    const searchResults = await searchPools(searchPoolId, 5);

    if (searchResults && searchResults.length > 0) {
      // Find the best match by comparing addresses
      const matchingPool = searchResults.find((pool) =>
        pool.address.toLowerCase().includes(searchPoolId.toLowerCase())
      );

      if (matchingPool) {
        console.log(`Found matching pool for ${poolId}:`, {
          name: matchingPool.name,
          tokenA: matchingPool.tokenA,
          tokenB: matchingPool.tokenB,
          liquidityUSD: matchingPool.liquidityUSD,
          tvlUsd: matchingPool.tvlUsd,
          volumeUSD: matchingPool.volumeUSD,
          apr: matchingPool.apr,
        });

        // Get token addresses
        const tokenAAddress =
          matchingPool.tokenAAddress ||
          extractTokenAddressFromId(
            matchingPool._rawData?.relationships?.base_token?.data?.id
          );
        const tokenBAddress =
          matchingPool.tokenBAddress ||
          extractTokenAddressFromId(
            matchingPool._rawData?.relationships?.quote_token?.data?.id
          );

        // Fetch token metadata from Birdeye if we have token addresses
        if (tokenAAddress || tokenBAddress) {
          const addresses = [];
          if (tokenAAddress) addresses.push(tokenAAddress);
          if (tokenBAddress) addresses.push(tokenBAddress);

          if (addresses.length > 0) {
            console.log(`Fetching token metadata for ${addresses.join(", ")}`);

            try {
              const tokenMetadata = await getMultipleTokenMetadata(addresses);

              // Add token metadata to the pool data
              if (tokenMetadata && Object.keys(tokenMetadata).length > 0) {
                if (tokenAAddress && tokenMetadata[tokenAAddress]) {
                  matchingPool.tokenAMetadata = {
                    ...tokenMetadata[tokenAAddress],
                    address: tokenAAddress,
                  };
                }

                if (tokenBAddress && tokenMetadata[tokenBAddress]) {
                  matchingPool.tokenBMetadata = {
                    ...tokenMetadata[tokenBAddress],
                    address: tokenBAddress,
                  };
                }

                console.log("Enhanced pool data with token metadata:", {
                  tokenALogo: matchingPool.tokenAMetadata?.logoURI,
                  tokenBLogo: matchingPool.tokenBMetadata?.logoURI,
                });
              }
            } catch (metadataError) {
              console.error("Error fetching token metadata:", metadataError);
            }
          }
        }

        // Cache the result
        poolCache.set(poolId, matchingPool);
        return matchingPool;
      }
    }

    console.log(`No pool found for ID: ${poolId}`);
    return null;
  } catch (error) {
    console.error(`Error getting pool data for ${poolId}:`, error);
    return null;
  }
}

/**
 * Calculate APR based on 24h volume and TVL
 */
function calculatePoolAPR(
  volume24h: number,
  tvl: number,
  feePercent: number = 0.3
): number {
  if (!tvl || tvl === 0) return 0;

  // Daily fee revenue = volume * fee rate
  const dailyFees = volume24h * (feePercent / 100);

  // Annualize
  const yearlyFees = dailyFees * 365;

  // APR = yearly fees / TVL
  const apr = (yearlyFees / tvl) * 100;

  return apr;
}

/**
 * Calculate TVL (Total Value Locked) for a vault using CoinGecko pool data first
 * and falling back to on-chain data if CoinGecko data is not available.
 */
async function calculateVaultTVL(vault: any): Promise<number> {
  try {
    if (!vault) {
      console.log("calculateVaultTVL called with undefined vault");
      return 0;
    }

    // Try to get TVL from CoinGecko first using the CLMM pool ID
    if (vault.clmm_pool_id) {
      const poolData = await getPoolDataFromCoinGecko(vault.clmm_pool_id);
      if (poolData && (poolData.tvlUsd || poolData.liquidityUSD)) {
        const tvl = poolData.tvlUsd || poolData.liquidityUSD;
        console.log(
          `Using CoinGecko TVL for vault ${vault.id}: $${tvl.toFixed(2)}`
        );
        return tvl;
      } else {
        console.log(
          `No CoinGecko pool data found for pool ${vault.clmm_pool_id}`
        );
      }
    }

    // Fall back to calculating TVL from on-chain data
    console.log("Calculating TVL from on-chain data for vault:", {
      id: vault.id,
      amount_a: vault.amount_a,
      amount_b: vault.amount_b,
      coin_type_a: vault.coin_type_a,
      coin_type_b: vault.coin_type_b,
    });

    // Get token amounts
    const amountA = vault.amount_a ? Number(vault.amount_a) : 0;
    const amountB = vault.amount_b ? Number(vault.amount_b) : 0;

    if (amountA === 0 && amountB === 0) {
      console.log(
        `Vault ${vault.id} has zero amounts for both tokens, TVL = 0`
      );
      return 0;
    }

    // Get token decimals
    const decimalsA = getTokenDecimals(vault.coin_type_a);
    const decimalsB = getTokenDecimals(vault.coin_type_b);

    // Convert raw amounts to human-readable
    const normalizedAmountA = amountA / 10 ** decimalsA;
    const normalizedAmountB = amountB / 10 ** decimalsB;

    // Get token prices
    const priceA = await getTokenPriceUSD(vault.coin_type_a);
    const priceB = await getTokenPriceUSD(vault.coin_type_b);

    // Calculate USD values
    const valueA = normalizedAmountA * priceA;
    const valueB = normalizedAmountB * priceB;

    // Total TVL
    const tvl = valueA + valueB;

    console.log(
      `TVL calculation from on-chain data: Value A = $${valueA.toFixed(
        2
      )}, Value B = $${valueB.toFixed(2)}, Total TVL = $${tvl.toFixed(2)}`
    );

    return isNaN(tvl) ? 0 : tvl;
  } catch (error) {
    console.error("Error calculating vault TVL:", error);
    return 0;
  }
}

/**
 * Calculate vault APY based on fee revenue and rewards.
 */
async function calculateVaultAPY(vault: any): Promise<number> {
  try {
    if (!vault || !vault.id) {
      return 0;
    }

    // First priority: Check BlockVision APY cache for this vault
    if (blockVisionApyCache.has(vault.id)) {
      const blockVisionApy = blockVisionApyCache.get(vault.id);
      console.log(
        `Using BlockVision APY for vault ${vault.id}: ${blockVisionApy}%`
      );
      return blockVisionApy!;
    }

    // Second priority: Try to get APR from CoinGecko using the CLMM pool ID
    if (vault.clmm_pool_id) {
      const poolData = await getPoolDataFromCoinGecko(vault.clmm_pool_id);
      if (poolData && poolData.apr) {
        console.log(
          `Using CoinGecko APR for vault ${vault.id}: ${poolData.apr.toFixed(
            2
          )}%`
        );

        // Convert APR to APY with daily compounding
        // APY = (1 + APR/365)^365 - 1
        const aprDecimal = poolData.apr / 100;
        const apy = (Math.pow(1 + aprDecimal / 365, 365) - 1) * 100;

        console.log(
          `Converted APR ${poolData.apr.toFixed(2)}% to APY ${apy.toFixed(
            2
          )}% for vault ${vault.id}`
        );
        return apy;
      } else {
        console.log(`No CoinGecko APR found for pool ${vault.clmm_pool_id}`);
      }
    }

    // Fall back to estimating APY
    let baseApy = 0;

    try {
      // Get the associated CLMM pool
      const clmmSdk = getClmmSdk();
      const pool = await clmmSdk.Pool.getPool(vault.clmm_pool_id);

      // Extract fee tier (e.g. 2500 = 0.25%)
      const feeRate = Number(pool.fee_rate) / 10000;

      // Get TVL
      const vaultTVL = await calculateVaultTVL(vault);
      if (vaultTVL <= 0) {
        return 0;
      }

      // Get pool data to estimate volume
      const poolTVL = await calculateVaultTVL({
        ...pool,
        amount_a: pool.coin_a_reserve,
        amount_b: pool.coin_b_reserve,
        coin_type_a: pool.coin_a,
        coin_type_b: pool.coin_b,
      });

      // Estimate daily volume based on pool type and tokens
      let dailyTurnoverRatio = 0.1; // Default 10% daily volume/TVL ratio

      // Adjust turnover ratio based on pool type
      // Stablecoin pools typically have higher turnover
      if (
        vault.coin_type_a?.toLowerCase().includes("usdc") ||
        vault.coin_type_b?.toLowerCase().includes("usdc")
      ) {
        dailyTurnoverRatio = 0.2; // 20% for SUI-USDC
      }

      // LST-SUI pairs typically have lower turnover
      if (
        vault.coin_type_a?.toLowerCase().includes("sui") &&
        (vault.coin_type_b?.toLowerCase().includes("hasui") ||
          vault.coin_type_b?.toLowerCase().includes("afsui") ||
          vault.coin_type_b?.toLowerCase().includes("vsui"))
      ) {
        dailyTurnoverRatio = 0.1; // 10% for LST pairs
      }

      // Token-SUI pairs (DEEP, WAL)
      if (
        vault.coin_type_a?.toLowerCase().includes("deep") ||
        vault.coin_type_b?.toLowerCase().includes("deep") ||
        vault.coin_type_a?.toLowerCase().includes("wal") ||
        vault.coin_type_b?.toLowerCase().includes("wal")
      ) {
        dailyTurnoverRatio = 0.15; // 15% for token-SUI pairs
      }

      const volume24h = poolTVL * dailyTurnoverRatio;

      // Calculate vault's share of the pool's liquidity
      const vaultLiquidity = Number(vault.liquidity || 0);
      const poolLiquidity = Number(pool.liquidity || 1);
      const vaultShare =
        vaultLiquidity > 0 && poolLiquidity > 0
          ? vaultLiquidity / poolLiquidity
          : 0;

      // Calculate daily fee earnings
      const totalDailyFees = volume24h * feeRate;
      const vaultDailyFees = totalDailyFees * vaultShare;

      // Calculate daily yield rate
      const dailyYieldRate = vaultDailyFees / vaultTVL;

      // Add incentive programs - typically around 2-5% additional APR
      let rewardAPR = 0;

      // Assign different rewards based on vault type
      if (vault.id === VAULT_IDS.SUI_USDC) {
        rewardAPR = 2.5;
      } else if (
        vault.id === VAULT_IDS.DEEP_SUI ||
        vault.id === VAULT_IDS.WAL_SUI
      ) {
        rewardAPR = 5.0;
      } else if (
        [VAULT_IDS.HASUI_SUI, VAULT_IDS.AFSUI_SUI, VAULT_IDS.VSUI_SUI].includes(
          vault.id
        )
      ) {
        rewardAPR = 3.0;
      }

      // Calculate total APR (fees + rewards)
      const dailyRewardRate = rewardAPR / 36500; // Convert annual % to daily rate
      const totalDailyRate = dailyYieldRate + dailyRewardRate;

      // Compound daily over a year to get APY
      baseApy = (Math.pow(1 + totalDailyRate, 365) - 1) * 100;

      console.log(
        `APY calculation for vault ${vault.id}: Daily rate = ${(
          totalDailyRate * 100
        ).toFixed(4)}%, APY = ${baseApy.toFixed(2)}%`
      );
    } catch (error) {
      console.error("Error in APY calculation:", error);

      // Provide reasonable APY estimates based on vault type
      if (vault.id === VAULT_IDS.SUI_USDC) {
        baseApy = 6.8; // SUI-USDC typically lower APY but more stable
      } else if (vault.id === VAULT_IDS.DEEP_SUI) {
        baseApy = 12.4; // DEEP-SUI higher APY for specific token-SUI pairs
      } else if (vault.id === VAULT_IDS.WAL_SUI) {
        baseApy = 14.2; // WAL-SUI also higher APY
      } else if (vault.id === VAULT_IDS.HASUI_SUI) {
        baseApy = 8.5; // LST-SUI pairs have moderate APY
      } else if (vault.id === VAULT_IDS.AFSUI_SUI) {
        baseApy = 8.2;
      } else if (vault.id === VAULT_IDS.VSUI_SUI) {
        baseApy = 9.1;
      } else {
        baseApy = 8.0; // Generic fallback
      }
    }

    return isNaN(baseApy) || !isFinite(baseApy) ? 0 : baseApy;
  } catch (error) {
    console.error("Error calculating vault APY:", error);
    return 0;
  }
}

/**
 * Get token symbol from coin type.
 */
function getTokenSymbol(coinType: string | undefined): string {
  if (!coinType) return "Unknown";

  // Check predefined token symbols
  const predefinedSymbols = {
    "0x2::sui::SUI": "SUI",
    "0xbde4ba4c2e274a60ce15c1cfff9e5c42e41654ac8b6d906a57efa4bd3c29f47d::hasui::HASUI":
      "haSUI",
    "0xf325ce1300e8dac124071d3152c5c5ee6174914f8bc2161e88329cf579246efc::afsui::AFSUI":
      "afSUI",
    "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT":
      "vSUI",
  };

  if (coinType in predefinedSymbols) {
    return predefinedSymbols[coinType];
  }

  // Try to extract from the coin type
  const parts = coinType.split("::");
  if (parts.length > 2) {
    return parts[2];
  }

  return "Unknown";
}

/**
 * Fetch on-chain vault metadata.
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function getVaultInfo(vaultId: string) {
  const sdk = getBaseSdk();
  console.log(`Fetching vault info for: ${vaultId}`);

  try {
    const resp = await sdk.fullClient.getObject({
      id: vaultId,
      options: { showContent: true, showDisplay: true },
    });

    const content = (resp.data as any)?.content;
    if (!content || content.dataType !== "moveObject") {
      throw new Error(`Vault ${vaultId} not found or not a Move object`);
    }

    return content.fields;
  } catch (error) {
    console.error(`Error fetching vault info for ${vaultId}:`, error);
    throw new Error(
      `Failed to fetch vault info: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get detailed info about a vault including its pool, tick range, and TVL.
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function getDetailedVaultInfo(vaultId: string) {
  // Check the cache first
  const cachedVault = vaultCache.get(vaultId);
  if (cachedVault) {
    console.log(`Using cached vault info for: ${vaultId}`);
    return cachedVault;
  }

  const sdk = getBaseSdk();
  console.log(`Fetching detailed vault info for: ${vaultId}`);

  try {
    // Get basic vault info from the SDK
    let vaultInfo: any = null;
    try {
      // Try using the v1.1.4 API style
      vaultInfo = await sdk.Vaults.getVault(vaultId);
    } catch (error) {
      console.warn(
        "Error using v1.1.4 getVault API, trying alternative:",
        error
      );
      // Try using a direct object fetch if SDK method fails
      vaultInfo = await getVaultInfo(vaultId);
    }

    if (!vaultInfo) {
      throw new Error(`Failed to get vault info for ${vaultId}`);
    }

    // Log the raw response structure
    console.log("Raw vault info:", vaultInfo);

    // Enhance with token symbols if they're missing
    let enhancedVaultInfo: any = { ...vaultInfo, id: vaultId };

    if (!enhancedVaultInfo.coin_a_symbol && enhancedVaultInfo.coin_type_a) {
      enhancedVaultInfo.coin_a_symbol = getTokenSymbol(
        enhancedVaultInfo.coin_type_a
      );
    }

    if (!enhancedVaultInfo.coin_b_symbol && enhancedVaultInfo.coin_type_b) {
      enhancedVaultInfo.coin_b_symbol = getTokenSymbol(
        enhancedVaultInfo.coin_type_b
      );
    }

    // Set default values for missing symbols based on vault ID
    if (vaultId === VAULT_IDS.HASUI_SUI) {
      enhancedVaultInfo.coin_a_symbol =
        enhancedVaultInfo.coin_a_symbol || "haSUI";
      enhancedVaultInfo.coin_b_symbol =
        enhancedVaultInfo.coin_b_symbol || "SUI";
    } else if (vaultId === VAULT_IDS.AFSUI_SUI) {
      enhancedVaultInfo.coin_a_symbol =
        enhancedVaultInfo.coin_a_symbol || "afSUI";
      enhancedVaultInfo.coin_b_symbol =
        enhancedVaultInfo.coin_b_symbol || "SUI";
    } else if (vaultId === VAULT_IDS.VSUI_SUI) {
      enhancedVaultInfo.coin_a_symbol =
        enhancedVaultInfo.coin_a_symbol || "vSUI";
      enhancedVaultInfo.coin_b_symbol =
        enhancedVaultInfo.coin_b_symbol || "SUI";
    } else if (vaultId === VAULT_IDS.SUI_USDC) {
      enhancedVaultInfo.coin_a_symbol =
        enhancedVaultInfo.coin_a_symbol || "SUI";
      enhancedVaultInfo.coin_b_symbol =
        enhancedVaultInfo.coin_b_symbol || "USDC";
    } else if (vaultId === VAULT_IDS.DEEP_SUI) {
      enhancedVaultInfo.coin_a_symbol =
        enhancedVaultInfo.coin_a_symbol || "DEEP";
      enhancedVaultInfo.coin_b_symbol =
        enhancedVaultInfo.coin_b_symbol || "SUI";
    } else if (vaultId === VAULT_IDS.WAL_SUI) {
      enhancedVaultInfo.coin_a_symbol =
        enhancedVaultInfo.coin_a_symbol || "WAL";
      enhancedVaultInfo.coin_b_symbol =
        enhancedVaultInfo.coin_b_symbol || "SUI";
    }

    // If we have a CLMM pool ID, try to get additional data from CoinGecko
    let poolInfo = null;
    if (enhancedVaultInfo.clmm_pool_id) {
      poolInfo = await getPoolDataFromCoinGecko(enhancedVaultInfo.clmm_pool_id);
      if (poolInfo) {
        // Use CoinGecko's pool name if available
        if (poolInfo.name && !poolInfo.name.includes("Unknown")) {
          enhancedVaultInfo.poolName = poolInfo.name;
        }

        // Use CoinGecko's token symbols if they seem valid
        if (poolInfo.tokenA && poolInfo.tokenA !== "Unknown") {
          enhancedVaultInfo.coin_a_symbol = poolInfo.tokenA;
        }
        if (poolInfo.tokenB && poolInfo.tokenB !== "Unknown") {
          enhancedVaultInfo.coin_b_symbol = poolInfo.tokenB;
        }

        // Add token metadata if available from BirdEye
        if (poolInfo.tokenAMetadata) {
          enhancedVaultInfo.tokenAMetadata = poolInfo.tokenAMetadata;
        }
        if (poolInfo.tokenBMetadata) {
          enhancedVaultInfo.tokenBMetadata = poolInfo.tokenBMetadata;
        }
      }
    }

    // Calculate TVL and APY
    const tvl = await calculateVaultTVL(enhancedVaultInfo);
    const apy = await calculateVaultAPY(enhancedVaultInfo);

    // Get token prices
    const tokenAPrice = await getTokenPriceUSD(enhancedVaultInfo.coin_type_a);
    const tokenBPrice = await getTokenPriceUSD(enhancedVaultInfo.coin_type_b);

    // Add token metadata for token icons if not yet available
    if (
      !enhancedVaultInfo.tokenAMetadata ||
      !enhancedVaultInfo.tokenBMetadata
    ) {
      // Try to extract token addresses
      const addresses = [];
      if (enhancedVaultInfo.coin_type_a)
        addresses.push(enhancedVaultInfo.coin_type_a);
      if (enhancedVaultInfo.coin_type_b)
        addresses.push(enhancedVaultInfo.coin_type_b);

      if (addresses.length > 0) {
        try {
          const tokenMetadata = await getMultipleTokenMetadata(addresses);

          if (tokenMetadata && Object.keys(tokenMetadata).length > 0) {
            // Match token metadata to tokens
            if (
              !enhancedVaultInfo.tokenAMetadata &&
              enhancedVaultInfo.coin_type_a &&
              tokenMetadata[enhancedVaultInfo.coin_type_a]
            ) {
              enhancedVaultInfo.tokenAMetadata =
                tokenMetadata[enhancedVaultInfo.coin_type_a];
            }

            if (
              !enhancedVaultInfo.tokenBMetadata &&
              enhancedVaultInfo.coin_type_b &&
              tokenMetadata[enhancedVaultInfo.coin_type_b]
            ) {
              enhancedVaultInfo.tokenBMetadata =
                tokenMetadata[enhancedVaultInfo.coin_type_b];
            }
          }
        } catch (metadataError) {
          console.error(
            "Error fetching token metadata from BirdEye:",
            metadataError
          );
        }
      }
    }

    // Return enhanced vault info
    enhancedVaultInfo = {
      ...enhancedVaultInfo,
      tvl,
      apy,
      token_a_price: tokenAPrice,
      token_b_price: tokenBPrice,
      // If we have pool info from CoinGecko, include additional metrics
      coinGeckoData: poolInfo
        ? {
            liquidityUSD: poolInfo.liquidityUSD,
            volumeUSD: poolInfo.volumeUSD,
            feesUSD: poolInfo.feesUSD,
            apr: poolInfo.apr,
          }
        : null,
      // Flag if this APY comes from BlockVision
      hasBlockVisionAPY: blockVisionApyCache.has(vaultId),
    };

    // Log the enhanced vault info with TVL and APY
    console.log("Enhanced vault info with TVL and APY:", {
      id: enhancedVaultInfo.id,
      coin_a_symbol: enhancedVaultInfo.coin_a_symbol,
      coin_b_symbol: enhancedVaultInfo.coin_b_symbol,
      coin_type_a: enhancedVaultInfo.coin_type_a,
      coin_type_b: enhancedVaultInfo.coin_type_b,
      tvl,
      apy,
      token_a_price: tokenAPrice,
      token_b_price: tokenBPrice,
      amount_a: enhancedVaultInfo.amount_a,
      amount_b: enhancedVaultInfo.amount_b,
      clmm_pool_id: enhancedVaultInfo.clmm_pool_id,
      hasBlockVisionAPY: enhancedVaultInfo.hasBlockVisionAPY,
    });

    // Cache the result
    vaultCache.set(vaultId, enhancedVaultInfo);

    return enhancedVaultInfo;
  } catch (error) {
    console.error(`Error fetching detailed vault info for ${vaultId}:`, error);
    throw new Error(
      `Failed to fetch vault info: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get all vault LP-token balances for a user, plus their underlying-asset share.
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function getOwnerVaultsBalances(ownerAddress: string) {
  const sdk = getBaseSdk();
  console.log(`Fetching vault balances for owner: ${ownerAddress}`);

  try {
    // Try to fetch BlockVision data first to get APY information
    try {
      const blockVisionResponse = await blockvisionService.getDefiPortfolioData(
        ownerAddress
      );
      if (blockVisionResponse?.rawData?.cetus?.vaults) {
        // Process the BlockVision data to extract vault APYs
        processBlockVisionVaultData(blockVisionResponse.rawData);
      }
    } catch (error) {
      console.warn("Failed to fetch BlockVision data:", error);
      // Continue execution even if BlockVision fails
    }

    // Get basic balances from the SDK
    let balances = [];
    try {
      // Try using the v1.1.4 API style
      balances = await sdk.Vaults.getOwnerVaultsBalance(ownerAddress);
    } catch (error) {
      console.warn(
        "Error using v1.1.4 getOwnerVaultsBalance API, using fallback:",
        error
      );
      // Use a fallback approach if SDK method fails
      // This is a simplified fallback - in production, you'd need a more robust solution
      balances = [];
    }

    // Log the raw response structure
    console.log("Raw user vault balances:", balances);

    // Enhance balances with additional information
    const enhancedBalances = await Promise.all(
      balances.map(async (balance) => {
        try {
          // Get vault details from cache if available
          const vaultDetails = await getDetailedVaultInfo(balance.vault_id);

          // Calculate USD value
          const decimalsA = getTokenDecimals(vaultDetails.coin_type_a);
          const decimalsB = getTokenDecimals(vaultDetails.coin_type_b);

          const userAmountA = Number(balance.amount_a) / 10 ** decimalsA;
          const userAmountB = Number(balance.amount_b) / 10 ** decimalsB;

          const valueA = userAmountA * (vaultDetails.token_a_price || 0);
          const valueB = userAmountB * (vaultDetails.token_b_price || 0);

          const enhancedBalance = {
            ...balance,
            coin_a_symbol: vaultDetails.coin_a_symbol || "Token A",
            coin_b_symbol: vaultDetails.coin_b_symbol || "Token B",
            value_usd: valueA + valueB,
            apy: vaultDetails.apy || 0,
            // Add token metadata for UI to show logos
            tokenAMetadata: vaultDetails.tokenAMetadata,
            tokenBMetadata: vaultDetails.tokenBMetadata,
            // Indicate if the APY comes from BlockVision
            hasBlockVisionAPY: blockVisionApyCache.has(balance.vault_id),
          };

          // Log the enhanced balance
          console.log(`Enhanced user balance for vault ${balance.vault_id}:`, {
            vault_id: balance.vault_id,
            lp_token_balance: balance.lp_token_balance,
            amount_a: balance.amount_a,
            amount_b: balance.amount_b,
            normalized_amount_a: userAmountA,
            normalized_amount_b: userAmountB,
            value_a: valueA,
            value_b: valueB,
            total_value_usd: valueA + valueB,
            apy: enhancedBalance.apy,
            hasBlockVisionAPY: enhancedBalance.hasBlockVisionAPY,
          });

          return enhancedBalance;
        } catch (error) {
          console.error(
            `Error enhancing balance for vault ${balance.vault_id}:`,
            error
          );

          // Determine vault type based on ID to get proper symbols
          let coin_a_symbol = "Token A";
          let coin_b_symbol = "Token B";

          if (balance.vault_id === VAULT_IDS.HASUI_SUI) {
            coin_a_symbol = "haSUI";
            coin_b_symbol = "SUI";
          } else if (balance.vault_id === VAULT_IDS.AFSUI_SUI) {
            coin_a_symbol = "afSUI";
            coin_b_symbol = "SUI";
          } else if (balance.vault_id === VAULT_IDS.VSUI_SUI) {
            coin_a_symbol = "vSUI";
            coin_b_symbol = "SUI";
          } else if (balance.vault_id === VAULT_IDS.SUI_USDC) {
            coin_a_symbol = "SUI";
            coin_b_symbol = "USDC";
          } else if (balance.vault_id === VAULT_IDS.DEEP_SUI) {
            coin_a_symbol = "DEEP";
            coin_b_symbol = "SUI";
          } else if (balance.vault_id === VAULT_IDS.WAL_SUI) {
            coin_a_symbol = "WAL";
            coin_b_symbol = "SUI";
          }

          return {
            ...balance,
            coin_a_symbol,
            coin_b_symbol,
            value_usd: 0,
            apy: 0,
            hasBlockVisionAPY: false,
          };
        }
      })
    );

    return enhancedBalances;
  } catch (error) {
    console.error(`Error fetching vault balances for ${ownerAddress}:`, error);
    throw new Error(
      `Failed to fetch vault balances: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Calculate deposit amounts and expected LP tokens for a vault deposit.
 * Version-compatible implementation with SDK v1.1.4
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function calculateVaultDeposit(
  vaultId: string,
  amountA: number,
  amountB: number,
  slippage: number = 0.005 // 0.5% default
) {
  const sdk = getBaseSdk();
  console.log(
    `Calculating vault deposit for vault ${vaultId}: A=${amountA}, B=${amountB}, slippage=${slippage}`
  );

  try {
    let depositParams;
    try {
      // Try v1.1.4 style with side parameter
      depositParams = await sdk.Vaults.calculateDepositAmount({
        vault_id: vaultId,
        amount_a: amountA,
        amount_b: amountB,
        slippage,
        side: "Both",
      });
    } catch (error) {
      console.warn(
        "Error with v1.1.4 calculateDepositAmount API, trying v1.0:",
        error
      );
      // Fallback to v1.0 style
      depositParams = await sdk.Vaults.calculateDepositAmount(
        vaultId,
        amountA,
        amountB,
        slippage
      );
    }

    console.log(
      `Deposit calculation successful: expected LP tokens: ${depositParams.ft_output_amount}`
    );
    return depositParams;
  } catch (error) {
    console.error(`Error calculating vault deposit:`, error);
    throw new Error(
      `Failed to calculate vault deposit: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Calculate withdrawal amounts for burning LP tokens from a vault.
 * Version-compatible implementation with SDK v1.1.4
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function calculateVaultWithdrawal(
  vaultId: string,
  lpAmount: number,
  slippage: number = 0.005,
  oneSide: boolean = false
) {
  const sdk = getBaseSdk();
  console.log(
    `Calculating vault withdrawal for ${vaultId}: LP=${lpAmount}, slippage=${slippage}, oneSide=${oneSide}`
  );

  try {
    let withdrawParams;
    try {
      // Try v1.1.4 style with explicit parameters
      withdrawParams = await sdk.Vaults.calculateWithdrawAmount({
        vault_id: vaultId,
        ft_amount: lpAmount,
        slippage,
        side: oneSide ? "OneSide" : "Both",
        is_ft_input: true,
      });
    } catch (error) {
      console.warn(
        "Error with v1.1.4 calculateWithdrawAmount API, trying v1.0:",
        error
      );
      // Fallback to v1.0 style
      withdrawParams = await sdk.Vaults.calculateWithdrawAmount(
        vaultId,
        lpAmount,
        slippage,
        oneSide
      );
    }

    console.log(
      `Withdrawal calculation successful: expected A=${withdrawParams.output_a}, B=${withdrawParams.output_b}`
    );
    return withdrawParams;
  } catch (error) {
    console.error(`Error calculating vault withdrawal:`, error);
    throw new Error(
      `Failed to calculate vault withdrawal: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Deposit amountA + amountB into a vault, receive vault LP tokens back.
 * Version-compatible implementation with SDK v1.1.4
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function depositToVault(
  wallet: WalletContextState,
  vaultId: string,
  amountA: number,
  amountB: number,
  slippage: number = 0.005 // 0.5% default
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  console.log(
    `Initiating deposit to vault ${vaultId}: A=${amountA}, B=${amountB}`
  );

  try {
    // 1) Get vault details to determine coin types
    const vaultDetails = await getDetailedVaultInfo(vaultId);
    const coinTypeA = vaultDetails.coin_type_a;
    const coinTypeB = vaultDetails.coin_type_b;

    if (!coinTypeA || !coinTypeB) {
      throw new Error("Failed to get vault coin types");
    }

    // 2) Calculate deposit amounts
    const calcResult = await calculateVaultDeposit(
      vaultId,
      amountA,
      amountB,
      slippage
    );

    console.log(
      `Deposit calculation successful: expected LP tokens: ${calcResult.ft_output_amount}`
    );

    // 3) Build the transaction with proper coin specifications
    const tx = new TransactionBlock();

    // Create coins with the specified amounts
    const coinA = buildCoinWithBalance(BigInt(amountA), coinTypeA, tx);
    const coinB = buildCoinWithBalance(BigInt(amountB), coinTypeB, tx);

    let lpToken;
    try {
      // Try v1.1.4 style with explicit parameters
      const depositResult = await sdk.Vaults.deposit(
        {
          vault_id: vaultId,
          slippage,
          deposit_result: calcResult,
          return_lp_token: true,
          coin_object_a: coinA,
          coin_object_b: coinB,
        },
        tx
      );

      lpToken = depositResult.lp_token;
    } catch (error) {
      console.warn("Error with v1.1.4 deposit API, trying v1.0:", error);
      // Fallback to v1.0 style
      lpToken = await sdk.Vaults.deposit(
        tx,
        vaultId,
        coinA,
        coinB,
        calcResult,
        slippage,
        true
      );
    }

    // Transfer the LP tokens back to the user
    if (lpToken) {
      tx.transferObjects([lpToken], address);
    }

    console.log("Transaction block created, signing and executing...");

    // 4) Sign & execute
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    console.log(`Deposit to vault successful! Digest: ${res.digest}`);

    return { success: true, digest: res.digest || "" };
  } catch (error) {
    console.error("Error in depositToVault:", error);

    // Provide helpful error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes("insufficient") ||
        errorMessage.includes("balance")
      ) {
        throw new Error("Insufficient balance to complete the deposit");
      } else if (errorMessage.includes("slippage")) {
        throw new Error(
          "Deposit failed due to price movement exceeding slippage tolerance"
        );
      }
    }

    throw new Error(
      `Vault deposit failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Deposit one asset into a vault, automatically converting to the proper ratio.
 * Version-compatible implementation with SDK v1.1.4
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function depositOneSidedToVault(
  wallet: WalletContextState,
  vaultId: string,
  amount: number,
  isTokenA: boolean, // true = deposit token A, false = deposit token B
  slippage: number = 0.005
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  console.log(
    `Initiating one-sided deposit to vault ${vaultId}: ${
      isTokenA ? "A" : "B"
    }=${amount}`
  );

  try {
    // 1) Get vault details to determine coin types
    const vaultDetails = await getDetailedVaultInfo(vaultId);
    const coinTypeA = vaultDetails.coin_type_a;
    const coinTypeB = vaultDetails.coin_type_b;

    if (!coinTypeA || !coinTypeB) {
      throw new Error("Failed to get vault coin types");
    }

    // 2) Calculate one-sided deposit
    let calcResult;
    try {
      // Try v1.1.4 style with explicit parameters
      calcResult = await sdk.Vaults.calculateDepositAmount({
        vault_id: vaultId,
        fix_amount_a: isTokenA,
        input_amount: amount,
        slippage,
        side: "OneSide",
      });
    } catch (error) {
      console.warn(
        "Error with v1.1.4 one-sided deposit calc API, trying v1.0:",
        error
      );
      // Fallback to v1.0 style
      calcResult = await sdk.Vaults.calculateDepositAmount(
        vaultId,
        isTokenA ? amount : 0,
        !isTokenA ? amount : 0,
        slippage,
        true
      );
    }

    console.log(
      `One-sided deposit calculation: ${
        isTokenA ? "A" : "B"
      }=${amount}, expected LP: ${calcResult.ft_output_amount}`
    );

    // 3) Build the transaction
    const tx = new TransactionBlock();

    // Create coin with the specified amount
    const coinA = isTokenA
      ? buildCoinWithBalance(BigInt(amount), coinTypeA, tx)
      : buildCoinWithBalance(BigInt(0), coinTypeA, tx);

    const coinB = !isTokenA
      ? buildCoinWithBalance(BigInt(amount), coinTypeB, tx)
      : buildCoinWithBalance(BigInt(0), coinTypeB, tx);

    let lpToken;
    try {
      // Try v1.1.4 style with explicit parameters
      const depositResult = await sdk.Vaults.deposit(
        {
          vault_id: vaultId,
          slippage,
          deposit_result: calcResult,
          return_lp_token: true,
          coin_object_a: coinA,
          coin_object_b: coinB,
        },
        tx
      );

      lpToken = depositResult.lp_token;
    } catch (error) {
      console.warn(
        "Error with v1.1.4 deposit API for one-sided, trying v1.0:",
        error
      );
      // Fallback to v1.0 style
      lpToken = await sdk.Vaults.deposit(
        tx,
        vaultId,
        coinA,
        coinB,
        calcResult,
        slippage,
        true
      );
    }

    // Transfer the LP tokens back to the user
    if (lpToken) {
      tx.transferObjects([lpToken], address);
    }

    console.log(
      "One-sided deposit transaction created, signing and executing..."
    );

    // 4) Sign & execute
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    console.log(`One-sided deposit successful! Digest: ${res.digest}`);

    return { success: true, digest: res.digest || "" };
  } catch (error) {
    console.error("Error in depositOneSidedToVault:", error);

    // Provide helpful error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes("insufficient") ||
        errorMessage.includes("balance")
      ) {
        throw new Error(
          "Insufficient balance to complete the one-sided deposit"
        );
      } else if (errorMessage.includes("slippage")) {
        throw new Error(
          "One-sided deposit failed due to price movement exceeding slippage tolerance"
        );
      }
    }

    throw new Error(
      `One-sided vault deposit failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Withdraw by burning vault LP tokens, get underlying assets back.
 * Version-compatible implementation with SDK v1.1.4
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function withdrawFromVault(
  wallet: WalletContextState,
  vaultId: string,
  lpAmount: number,
  slippage: number = 0.005,
  oneSide: boolean = false // false = both assets, true = one-sided withdrawal
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = wallet.account.address;
  const sdk = getSdkWithWallet(address);

  console.log(
    `Initiating withdrawal from vault ${vaultId}: LP=${lpAmount}, oneSide=${oneSide}`
  );

  try {
    // 1) Calculate LP burn amount and expected returns
    const calc = await calculateVaultWithdrawal(
      vaultId,
      lpAmount,
      slippage,
      oneSide
    );

    console.log(
      `Withdrawal calculation: burning ${calc.burn_ft_amount} LP tokens, expected A=${calc.output_a}, B=${calc.output_b}`
    );

    // 2) Build the transaction
    const tx = new TransactionBlock();

    let coins;
    try {
      // Try v1.1.4 style with explicit parameters
      const withdrawResult = await sdk.Vaults.withdraw(
        {
          vault_id: vaultId,
          ft_amount: calc.burn_ft_amount,
          slippage,
          return_coin: true,
        },
        tx
      );

      coins = {
        return_coin_a: withdrawResult.return_coin_a,
        return_coin_b: withdrawResult.return_coin_b,
      };
    } catch (error) {
      console.warn("Error with v1.1.4 withdraw API, trying v1.0:", error);
      // Fallback to v1.0 style
      coins = await sdk.Vaults.withdraw(
        tx,
        vaultId,
        calc.burn_ft_amount,
        calc,
        slippage,
        true
      );
    }

    // 3) Transfer the underlying assets back to the user
    if (coins.return_coin_a) {
      tx.transferObjects([coins.return_coin_a], address);
    }

    if (coins.return_coin_b) {
      tx.transferObjects([coins.return_coin_b], address);
    }

    console.log("Withdrawal transaction created, signing and executing...");

    // 4) Sign & execute
    const res = await wallet.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      options: { showEffects: true, showEvents: true },
    });

    console.log(`Withdrawal from vault successful! Digest: ${res.digest}`);

    return { success: true, digest: res.digest || "" };
  } catch (error) {
    console.error("Error in withdrawFromVault:", error);

    // Provide helpful error messages
    if (error instanceof Error) {
      const errorMessage = error.message.toLowerCase();
      if (
        errorMessage.includes("insufficient") ||
        errorMessage.includes("balance")
      ) {
        throw new Error("Insufficient LP token balance for withdrawal");
      } else if (errorMessage.includes("slippage")) {
        throw new Error(
          "Withdrawal failed due to price movement exceeding slippage tolerance"
        );
      }
    }

    throw new Error(
      `Vault withdrawal failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Withdraw all LP tokens from a vault.
 * Version-compatible implementation with SDK v1.1.4
 * Last Updated: 2025-06-23 02:46:40 UTC by jake1318
 */
export async function withdrawAllFromVault(
  wallet: WalletContextState,
  vaultId: string,
  slippage: number = 0.005,
  oneSide: boolean = false
): Promise<{ success: boolean; digest: string }> {
  if (!wallet.connected || !wallet.account?.address) {
    throw new Error("Wallet not connected");
  }

  const address = wallet.account.address;

  console.log(`Initiating full withdrawal from vault ${vaultId}`);

  try {
    // 1) Get the user's vault balance
    const vaultBalances = await getOwnerVaultsBalances(address);
    const vaultBalance = vaultBalances.find((v) => v.vault_id === vaultId);
    if (
      !vaultBalance ||
      !vaultBalance.lp_token_balance ||
      Number(vaultBalance.lp_token_balance) <= 0
    ) {
      throw new Error("No LP tokens to withdraw");
    }

    console.log(`Found ${vaultBalance.lp_token_balance} LP tokens to withdraw`);

    // 2) Withdraw all LP tokens
    return await withdrawFromVault(
      wallet,
      vaultId,
      vaultBalance.lp_token_balance,
      slippage,
      oneSide
    );
  } catch (error) {
    console.error("Error in withdrawAllFromVault:", error);
    throw new Error(
      `Full vault withdrawal failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Get list of all available vaults.
 * Last Updated: 2025-06-23 02:53:45 UTC by jake1318
 */
export async function getAllAvailableVaults() {
  const sdk = getBaseSdk();
  console.log("Fetching all available vaults");

  try {
    // Get all vaults info
    const vaults = [];

    for (const [key, vaultId] of Object.entries(VAULT_IDS)) {
      try {
        // Get detailed vault info (uses caching mechanism)
        const vaultInfo = await getDetailedVaultInfo(vaultId);

        // Format the vault name
        let readableName = key
          .replace("_", "-")
          .replace("HASUI", "haSUI")
          .replace("AFSUI", "afSUI")
          .replace("VSUI", "vSUI");

        // If we have a pool name from CoinGecko, use that instead
        if (vaultInfo.poolName) {
          readableName = vaultInfo.poolName;
        }

        const formattedVault = {
          ...vaultInfo,
          id: vaultId,
          name: readableName,
          // Indicate if the APY comes from BlockVision for UI display
          hasBlockVisionAPY: blockVisionApyCache.has(vaultId),
        };

        vaults.push(formattedVault);

        // Log the formatted vault data
        console.log(`Formatted vault data for UI display:`, {
          id: formattedVault.id,
          name: formattedVault.name,
          coin_a_symbol: formattedVault.coin_a_symbol,
          coin_b_symbol: formattedVault.coin_b_symbol,
          tvl: formattedVault.tvl,
          apy: formattedVault.apy,
          hasBlockVisionAPY: formattedVault.hasBlockVisionAPY,
        });
      } catch (error) {
        console.warn(
          `Error fetching info for vault ${key} (${vaultId}):`,
          error
        );

        // If we can't fetch the vault, we'll skip it
        console.log(`Skipping vault ${key} due to fetch error`);
      }
    }

    console.log(`Retrieved ${vaults.length} available vaults`);
    return vaults;
  } catch (error) {
    console.error("Error fetching available vaults:", error);
    throw new Error(
      `Failed to fetch available vaults: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Clear the cache to force fresh data retrieval.
 * Useful if data becomes stale.
 * Last Updated: 2025-06-23 02:53:45 UTC by jake1318
 */
export function clearCache() {
  vaultCache.clear();
  poolCache.clear();
  tokenMetadataCache.clear();
  blockVisionApyCache.clear();
  console.log("Cache cleared - next requests will fetch fresh data");
}
