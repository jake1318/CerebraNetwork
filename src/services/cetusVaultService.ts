// src/services/cetusVaultService.ts
// Last Updated: 2025-07-05 23:07:22 UTC by jake1318

import {
  CetusVaultsSDK,
  VaultsUtils,
  InputType, // enum is exported by the SDK itself
} from "@cetusprotocol/vaults-sdk";
import { CetusClmmSDK } from "@cetusprotocol/sui-clmm-sdk"; // Main SDK import
import { TransactionBlock } from "@mysten/sui.js/transactions";
import BN from "bn.js";
import Decimal from "decimal.js"; // For precise math calculations
import { coinInfoCache } from "./cetusService";
import type { WalletContextState } from "@suiet/wallet-kit";
import blockvisionService from "./blockvisionService";
import { birdeyeService } from "./birdeyeService"; // Named import
import { ConfigProvider } from "antd";
import { getHaedalVaults } from "./haedalVaultService";

// Define an interface for the enhanced vault
interface EnhancedVault {
  id: string;
  pool_id: string;
  name: string;
  coin_a_symbol: string;
  coin_b_symbol: string;
  tokenAMetadata: any;
  tokenBMetadata: any;
  liquidity: string;
  total_supply: string;
  tvl: number;
  apy: number;
  hasBlockVisionAPY: boolean;
  lp_token_type: string;
  position: any;
  raw: any;
  protocol: string;
  token_a_price?: number;
  token_b_price?: number;
}

// Suppress v5-for-19 banner
ConfigProvider.config({ theme: { inherit: false } });

// Initialize CLMM SDK with the new method for SDK v2
const clmmSdk = CetusClmmSDK.createSDK({
  env: "mainnet",
  fullRpcUrl: "https://sui-mainnet-rpc.nodereal.io", // Use a reliable RPC endpoint
});

// --- constants -------------------------------------------------------------
const VAULT_DECIMALS = 9;
const DEFAULT_TOKEN_DECIMALS = 9;

/**
 * The balance helper was renamed in vaults‑sdk 1.1.x.
 * This shim tries all known spellings before falling back to a manual RPC.
 */
async function safeGetOwnerCoinBalances(owner: string, coinType: string) {
  // 1 – new helper on Coins namespace
  if ((vaultsSdk as any).Coins?.getOwnerCoinBalances instanceof Function) {
    return (vaultsSdk as any).Coins.getOwnerCoinBalances({ owner, coinType });
  }

  // 2 – old method on the SDK root (≤ 1.0.11)
  if (typeof (vaultsSdk as any).getOwnerCoinBalances === "function") {
    return (vaultsSdk as any).getOwnerCoinBalances(owner, coinType);
  }

  // 3 – quick manual fallback (RPC with sui_getBalance)
  const provider = (vaultsSdk as any).rpcProvider;
  if (provider?.fetchBalance) {
    const { totalBalance, decimals } = await provider.fetchBalance(
      owner,
      coinType
    );
    return { totalBalance, decimals };
  }

  // total failure – return zero so UI does not crash
  console.warn(
    "Could not locate any getOwnerCoinBalances implementation – returning 0"
  );
  return { totalBalance: "0", decimals: 0 };
}

// ------------------------------------------------------------------
// Exact matches for tokens whose on‑chain module names do not match
// the ticker we want to display.
// ------------------------------------------------------------------
const COIN_SYMBOL_OVERRIDES: Record<string, string> = {
  "0x549e8b69270defbfafd4f94e17ec44cdbdd99820b33bda2278dea3b9a32d3f55::cert::CERT":
    "VSUI",
  // add more overrides here as they pop up ...
};

// Cache for BlockVision APY/TVL data
const blockVisionCache = new Map<string, { apy: number; tvl_usd: number }>();

// Cache for SUI price to reduce API calls
let cachedSuiPrice: number | null = null;
let suiPriceTimestamp = 0;
const SUI_PRICE_TTL = 5 * 60 * 1000; // 5 minutes

// List of known Cetus vault IDs on mainnet (as of mid-2025)
// This serves as a fallback if the SDK's getVaultList() doesn't work
const KNOWN_VAULT_IDS = [
  // Note: We're keeping the Haedal vault ID in this list for backward compatibility
  // but it will be properly tagged as 'haedal' when it's fetched through getHaedalVaults()
  "0xde97452e63505df696440f86f0b805263d8659b77b8c316739106009d514c270", // haSUI – SUI
  "0x5732b81e659bd2db47a5b55755743dde15be99490a39717abc80d62ec812bcb6", // vSUI – SUI
  "0x41a4ab1e82f90f5965bbcd828b8ffa13bab7560bd2e352ab067e343db552f527", // SUI – USDC
  "0xbbd2d4850e4f238d39c3aa24957d2dfbb5787fa43d6c7de306bf15abe27f29f2", // CETUS – SUI
  "0xed754b6a3a6c7549c3d734cb7b464bccf9c805814b9e47b0cb99f43b4efcb4a6", // DEEP – SUI
  "0xff4cc0af0ad9d50d4a3264dfaafd534437d8b66c8ebe9f92b4c39d898d6870a3", // afSUI – SUI
  "0x083981a898882322f1ac035e9b56ea11474866bb4c97a1883e9b789bedca4412", // WAL – SUI
  "0xbd6252e0d56ae5eaabf055fd6c518ee5f66c1114287ca957cc698a17c3d25b16", // LBTC – SUI
];

// ───────────────────────────────────────────────────────────────────────────────
//  Debug helper – fetch every KNOWN_VAULT_ID with sdk.Vaults.getVault()
//  and dump the raw JSON to the browser / Node console.
//  Call dumpKnownVaultsRaw() once from anywhere – e.g. in a useEffect()
//  or just from the DevTools console after the bundle loads.
// ───────────────────────────────────────────────────────────────────────────────
export async function dumpKnownVaultsRaw() {
  console.log("⏬  Dumping raw vault data for", KNOWN_VAULT_IDS.length, "IDs…");

  for (const id of KNOWN_VAULT_IDS) {
    try {
      const raw = await vaultsSdk.Vaults.getVault(id);
      console.log(`\n═══════════════════════════════════════════════`);
      console.log(`🆔  ${id}`);
      console.log(JSON.stringify(raw, null, 2)); // pretty‑print
    } catch (err) {
      console.error(`⚠️  getVault failed for ${id}:`, err);
    }
  }

  console.log("✅  Finished vault dump");
}

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
  _cachedVaults = null;
  // also wipe stale per‑coin symbols
  Object.keys(coinInfoCache).forEach((k) => delete coinInfoCache[k]);
  // reset SUI price cache
  cachedSuiPrice = null;
}

// In-memory cache for vaults data
let _cachedVaults = null;

/**
 * Helper function to get coin types from a vault object, supporting both SDK schemas
 */
function getVaultCoinTypes(vault) {
  const coinTypeA =
    vault?.pool_config?.coinTypeA ||
    vault?.position?.coin_type_a ||
    vault?.coin_type_a ||
    "";

  const coinTypeB =
    vault?.pool_config?.coinTypeB ||
    vault?.position?.coin_type_b ||
    vault?.coin_type_b ||
    "";

  return { coinTypeA, coinTypeB };
}

/**
 * Helper function to derive a symbol from a coin type
 */
function deriveSymbol(coinType: string): string {
  /* 1️⃣  EXPLORE THE COIN TYPE FIRST – ignore   *
   *      whatever might already be cached.      */
  if (COIN_SYMBOL_OVERRIDES[coinType]) return COIN_SYMBOL_OVERRIDES[coinType];

  // 3) heuristics (existing if/else cascade)
  const lower = coinType.toLowerCase();
  const tail = coinType.split("::").pop()?.toUpperCase() || "";

  // specific wrapped‑SUI flavours first
  if (lower.includes("afsui")) return "afSUI";
  if (lower.includes("hasui")) return "haSUI";
  if (lower.includes("vsui")) return "vSUI";

  // other hard‑coded symbols
  if (lower.includes("usdc")) return "USDC";
  if (lower.includes("cetus")) return "CETUS";
  if (lower.includes("wal")) return "WAL";
  if (lower.includes("lbtc")) return "LBTC";
  if (lower.includes("deep")) return "DEEP";

  // exact core SUI coin
  if (/::sui::sui$/i.test(lower)) return "SUI";

  // 2) cached metadata - as fallback
  if (coinInfoCache[coinType]?.symbol) return coinInfoCache[coinType].symbol;

  return tail;
}

/**
 * Get the current SUI price with caching
 */
async function getSuiPrice(): Promise<number> {
  // Return cached price if it's fresh
  const now = Date.now();
  if (cachedSuiPrice && now - suiPriceTimestamp < SUI_PRICE_TTL) {
    return cachedSuiPrice;
  }

  // Otherwise fetch new price
  try {
    // Use getPriceVolumeSingle from birdeyeService since getPrice isn't available
    const suiAddress =
      "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
    const pv = await birdeyeService.getPriceVolumeSingle(suiAddress);

    // Extract price from the response, handling different formats
    const price =
      (pv?.price as number) ??
      (pv?.data?.price as number) ??
      (pv?.data as any)?.price ??
      0;

    if (price && price > 0) {
      cachedSuiPrice = Number(price);
      suiPriceTimestamp = now;
      return cachedSuiPrice;
    }
  } catch (err) {
    console.warn("Failed to fetch SUI price:", err);
  }

  // Default fallback price if fetch fails
  return cachedSuiPrice || 1.0;
}

/**
 * Estimate TVL for SUI wrapper vaults
 * This is a simplified approach that assumes a 50-50 balance and uses total_supply
 */
async function estimateSimpleTvl(vault: EnhancedVault): Promise<EnhancedVault> {
  try {
    if (!vault.total_supply || !vault.liquidity) {
      console.log(`Skipping TVL estimation for ${vault.id}: missing data`);
      return vault;
    }

    // Check if vault has SUI as one of its tokens
    const hasSui =
      vault.coin_a_symbol.toUpperCase().includes("SUI") ||
      vault.coin_b_symbol.toUpperCase().includes("SUI");

    if (!hasSui) {
      console.log(
        `Skipping TVL estimation for ${vault.id}: not a SUI wrapper vault`
      );
      return vault;
    }

    // Get the SUI price
    const suiPrice = await getSuiPrice();
    console.log(`Current SUI price: $${suiPrice}`);

    // Estimate TVL by assuming the liquidity is roughly balanced between both tokens
    // and converting that to USD value. Since SUI wrappers trade close to 1:1 with SUI,
    // we can estimate TVL by treating all liquidity as SUI for pricing purposes.

    // Liquidity is in base units, so we need to convert to human units first
    const totalLiquidityInSui = new Decimal(vault.liquidity)
      .div(1e9)
      .toNumber();

    // For SUI wrapper vaults, both tokens are approximately the same value
    // So a reasonable estimate is the total liquidity in SUI equivalent × SUI price
    const estimatedTvl = totalLiquidityInSui * suiPrice * 0.7; // Conservative estimate

    vault.tvl = estimatedTvl;
    console.log(`Estimated TVL for ${vault.id}: $${estimatedTvl.toFixed(2)}`);

    return vault;
  } catch (err) {
    console.warn(`TVL estimation failed for ${vault.id}:`, err);
    return vault;
  }
}

// --- Vaults data retrieval functions --------------------------------------

/**
 * Get all available vaults with enhanced metadata
 */
export async function getAllAvailableVaults() {
  if (_cachedVaults) {
    return _cachedVaults;
  }

  try {
    // SDK ≥ 1.1.4 is already ready; no need to call init anymore
    // if (typeof (vaultsSdk as any).init === 'function') {
    //   await (vaultsSdk as any).init();
    // }

    // Attempt to get vaults from SDK - handle both SDK versions
    let vaults: any[] = [];

    try {
      // Preferred approach: use the paginated helper if available
      if (typeof vaultsSdk.Vaults.getVaultsWithPage === "function") {
        const result = await vaultsSdk.Vaults.getVaultsWithPage("all", true);

        // Safety check for result format
        if (result && Array.isArray(result.data)) {
          vaults = result.data;
          console.log(`SDK getVaultsWithPage returned ${vaults.length} vaults`);
        } else {
          console.warn("getVaultsWithPage returned unexpected format:", result);
        }
      } else {
        // Fall back to getVaultList for older SDK versions
        const raw = await vaultsSdk.Vaults.getVaultList();

        if (Array.isArray(raw)) {
          // SDK < 1.1.4 style
          vaults = raw;
          console.log(
            `SDK getVaultList returned ${vaults.length} vaults (array format)`
          );
        } else if (raw && Array.isArray((raw as any).data)) {
          // SDK ≥ 1.1.4 paginated style
          vaults = (raw as any).data;
          console.log(
            `SDK getVaultList returned ${vaults.length} vaults (paginated format)`
          );
        } else {
          console.warn("getVaultList returned unexpected value:", raw);
        }
      }

      // Runtime check to ensure vaults is an array before proceeding
      if (!Array.isArray(vaults)) {
        console.error(
          "Vault list is not an array after all attempts - SDK response format may have changed"
        );
        vaults = [];
      }

      // If still no vaults, fall back to known IDs
      if (vaults.length === 0) {
        console.log(
          "SDK returned empty vault list, falling back to known vault IDs"
        );
        vaults = await getVaultsFromKnownIds();
      }
    } catch (err) {
      console.warn("Error getting vault list from SDK:", err);
      console.log("Falling back to known vault IDs");
      vaults = await getVaultsFromKnownIds();
    }

    // Dump the raw response for debugging
    console.log("[RAW VAULTS]", JSON.stringify(vaults, null, 2));

    console.log(`Processing ${vaults.length} vaults with metadata`);

    // Verify vaults is an array before trying to map
    if (!Array.isArray(vaults)) {
      throw new Error(
        "Vault list is not an array - SDK response format changed"
      );
    }

    // Process vaults with metadata
    const enhancedVaults = await Promise.all(
      vaults.map(async (vault) => {
        try {
          /* -----------------------------------------------------------------
           * SDK ≥ 1.1.x does NOT return pool_config.  The coin types now
           * live under vault.position.{coin_type_a, coin_type_b}
           * ----------------------------------------------------------------- */
          const coinTypeA =
            vault?.pool_config?.coinTypeA || // ← old field (if ever)
            vault?.position?.coin_type_a || // ← new field (preferred)
            vault?.coin_type_a || // ← future‑proof
            "";

          const coinTypeB =
            vault?.pool_config?.coinTypeB ||
            vault?.position?.coin_type_b ||
            vault?.coin_type_b ||
            "";

          if (!coinTypeA || !coinTypeB) {
            console.warn(
              `[VAULT] ${
                vault.id || vault.vault_id
              } has no coin types; skipping`,
              vault
            );
            return null;
          }

          /* getPool() was removed from the vault SDK.  If you really need CLMM
           * pool detail use clmmSdk.Pool.getPool(), but it is optional for the
           * table so we skip it here. */

          // Derive symbols using our helper function
          const coin_a_symbol = deriveSymbol(coinTypeA);
          const coin_b_symbol = deriveSymbol(coinTypeB);

          let tokenAMetadata = coinInfoCache[coinTypeA];
          let tokenBMetadata = coinInfoCache[coinTypeB];

          // Cetus SDK changed the field name a few times – try the known options
          let tvl =
            vault.tvl_usd ?? // SDK ≥ 1.1
            vault.net_assets ?? // SDK ≤ 1.0
            null;

          // last‑ditch: derive from liquidity if both coin prices are known
          if (
            tvl == null &&
            vault.liquidity &&
            vault.token_a_price != null &&
            vault.token_b_price != null
          ) {
            // very rough: total dollar value of the two legs
            const leg = Number(vault.liquidity) / 1e9; // 9 dec default
            tvl = leg * (vault.token_a_price + vault.token_b_price);
          }

          // Update cache if we got new metadata
          if (coin_a_symbol && !tokenAMetadata) {
            coinInfoCache[coinTypeA] = {
              symbol: coin_a_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
              address: coinTypeA,
            };
          }

          if (coin_b_symbol && !tokenBMetadata) {
            coinInfoCache[coinTypeB] = {
              symbol: coin_b_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
              address: coinTypeB,
            };
          }

          // Try to get BlockVision APY data for this vault
          let apy = parseFloat(vault.projected_apy || "0");
          let hasBlockVisionAPY = false;

          // Use BlockVision data if available
          const vaultId = vault.id || vault.vault_id;
          if (blockVisionCache.has(vaultId)) {
            apy = blockVisionCache.get(vaultId).apy; // verified APY
            tvl = blockVisionCache.get(vaultId).tvl_usd ?? tvl;
            hasBlockVisionAPY = true;
          }

          // Construct enhanced vault object - use both id and vault_id for compatibility
          const poolId = vault.pool_id || "";

          // Default to 'cetus' protocol unless otherwise specified
          const protocol = vault.protocol || "cetus";

          const enhancedVault = {
            id: vaultId,
            pool_id: poolId,
            name: `${coin_a_symbol}/${coin_b_symbol} Vault`,
            coin_a_symbol,
            coin_b_symbol,
            tokenAMetadata: coinInfoCache[coinTypeA] || {
              symbol: coin_a_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
              address: coinTypeA,
            },
            tokenBMetadata: coinInfoCache[coinTypeB] || {
              symbol: coin_b_symbol,
              decimals: DEFAULT_TOKEN_DECIMALS,
              address: coinTypeB,
            },
            liquidity: vault.liquidity || "0",
            total_supply: vault.total_supply || "0",
            tvl: tvl ?? 0, // Use nullish coalescing to default to 0
            apy: apy || 0, // Default to 0 if no APY available
            hasBlockVisionAPY,
            lp_token_type: vault.lp_token_type,
            position: vault.position, // Keep position data for TVL calculation
            raw: vault, // Keep raw data for reference
            protocol, // Tag the vault with its protocol
            token_a_price: vault.token_a_price, // Store price if available
            token_b_price: vault.token_b_price, // Store price if available
          };

          // For any vault with SUI or its wrappers, calculate TVL if it's not already set
          const hasSui =
            coin_a_symbol.toUpperCase().includes("SUI") ||
            coin_b_symbol.toUpperCase().includes("SUI");

          if (
            (hasSui || tvl == null) &&
            enhancedVault.liquidity &&
            enhancedVault.total_supply
          ) {
            // Enrich with calculated TVL
            await estimateSimpleTvl(enhancedVault);
          }

          // --- DEBUG ----------------------------------------------------------
          console.log("[VAULT]", enhancedVault.id, enhancedVault);
          // --------------------------------------------------------------------

          return enhancedVault;
        } catch (err) {
          console.warn(
            `Error enhancing vault data for ${
              vault?.id || vault?.vault_id || "unknown"
            }:`,
            err
          );

          // Return a minimal object if there was an error
          const vault_id = vault?.id || vault?.vault_id || "unknown";
          return {
            id: vault_id,
            pool_id: vault?.pool_id || "unknown",
            name: `Vault ${vault_id.substring(0, 8)}...`,
            coin_a_symbol: "Token A",
            coin_b_symbol: "Token B",
            apy: parseFloat(vault?.projected_apy || "0"),
            tvl: 0,
            liquidity: vault?.liquidity || "0",
            total_supply: vault?.total_supply || "0",
            hasBlockVisionAPY: false,
            lp_token_type: vault?.lp_token_type || "",
            tokenAMetadata: {
              symbol: "Token A",
              decimals: DEFAULT_TOKEN_DECIMALS,
            },
            tokenBMetadata: {
              symbol: "Token B",
              decimals: DEFAULT_TOKEN_DECIMALS,
            },
            protocol: vault.protocol || "cetus",
          };
        }
      })
    );

    // Filter out any null values from the processing
    const filteredVaults = enhancedVaults.filter(Boolean);

    // --- Merge Haedal vaults ---------------------------------------------------
    const haedalVaults = await getHaedalVaults();
    const merged = [
      ...filteredVaults.map((v) => ({ ...v, protocol: v.protocol || "cetus" })), // tag existing
      ...haedalVaults, // already tagged
    ];

    console.log(
      `Returning ${merged.length} enhanced vault objects (${filteredVaults.length} Cetus + ${haedalVaults.length} Haedal)`
    );

    // Add a debug line to check TVL values
    merged.forEach((v) => console.log(v.name, v.tvl));

    // Cache the results
    _cachedVaults = merged;
    return merged;
  } catch (err) {
    console.error("Failed to fetch vaults:", err);
    return []; // Return empty array to avoid UI errors
  }
}

/**
 * Fallback function to get vaults by their known IDs
 */
async function getVaultsFromKnownIds() {
  const vaults = [];

  for (const vaultId of KNOWN_VAULT_IDS) {
    try {
      console.log(`Fetching vault data for ${vaultId}`);
      const vault = await vaultsSdk.Vaults.getVault(vaultId);
      if (vault) {
        vaults.push(vault);
      }
    } catch (err) {
      console.warn(`Failed to fetch vault ${vaultId}:`, err);
      // Continue with next vault
    }
  }

  console.log(`Retrieved ${vaults.length} vaults from known IDs`);
  return vaults;
}

/**
 * Get balances for all vaults owned by the specified address
 */
export async function getOwnerVaultsBalances(ownerAddress: string) {
  try {
    vaultsSdk.setSenderAddress(ownerAddress); // Make sure sender is set before querying balances

    // Get all vaults first to have the reference data
    const allVaults = await getAllAvailableVaults();

    // Guard against unexpected input
    if (!Array.isArray(allVaults)) {
      console.error("Expected allVaults to be an array but got:", allVaults);
      return [];
    }

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

        // Cache BlockVision APY/TVL data for later use
        blockVisionData.forEach((vault) => {
          if (vault.id && (vault.apy || vault.valueUSD)) {
            blockVisionCache.set(vault.id, {
              apy: parseFloat(vault.apy || "0"),
              tvl_usd: parseFloat(
                vault.tvl_usd || vault.tvlUSD || vault.valueUSD || "0"
              ),
            });
            console.log(
              `Cached Cetus vault APY for ${vault.id}: ${vault.apy}%`
            );
          }
        });
      }
    } catch (error) {
      console.warn("Failed to load BlockVision data:", error);
      // Continue without BlockVision data
    }

    // Get all vault balances
    const balances = [];

    // First check all vaults in the map
    for (const vault of allVaults) {
      // Skip invalid vaults
      if (!vault || !vault.id || !vault.lp_token_type) {
        console.warn("Skipping invalid vault:", vault);
        continue;
      }

      // Check if the user has a balance in this vault
      try {
        // Use safe helper instead of direct method
        const lpTokenBalance = await safeGetOwnerCoinBalances(
          ownerAddress,
          vault.lp_token_type
        );

        // Skip if balance is zero
        if (!lpTokenBalance || lpTokenBalance.totalBalance === "0") {
          continue;
        }

        // Get detailed position information including values
        let lpValue = null;
        try {
          lpValue = await calculateLpValue(
            vault.id,
            lpTokenBalance.totalBalance
          );
        } catch (error) {
          console.warn(
            `Failed to calculate LP value for vault ${vault.id}:`,
            error
          );
        }

        // Find matching BlockVision data if available
        const blockVisionVault = blockVisionData?.find(
          (bv) => bv.id === vault.id
        );

        // Combine the data
        const vaultBalance = {
          vault_id: vault.id,
          pool_id: vault.pool_id,
          lp_token_balance: lpTokenBalance.totalBalance,
          amount_a: lpValue?.amount_a || "0",
          amount_b: lpValue?.amount_b || "0",
          coin_a_symbol: vault.coin_a_symbol,
          coin_b_symbol: vault.coin_b_symbol,
          tokenAMetadata: vault.tokenAMetadata,
          tokenBMetadata: vault.tokenBMetadata,
          liquidity: vault.liquidity || "0",
          total_supply: vault.total_supply || "0",
          value_usd: blockVisionVault?.valueUSD || 0,
          apy: blockVisionVault ? parseFloat(blockVisionVault.apy) : vault.apy,
          hasBlockVisionAPY: !!blockVisionVault,
          protocol: vault.protocol || "cetus", // Preserve protocol info
        };

        balances.push(vaultBalance);
        console.log("[VAULT BALANCE]", vault.id, vaultBalance);
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
    // First try the standard SDK method
    if (typeof vaultsSdk?.Vaults?.calculateLpValue === "function") {
      return await vaultsSdk.Vaults.calculateLpValue({
        vault_id: vaultId,
        lp_amount: lpAmount,
      });
    }

    // If the SDK method is not available, use our fallback approach
    console.warn(
      `vaultsSdk.Vaults.calculateLpValue not available for vault ${vaultId}`
    );
    return null;
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

    // Use safe helper instead of direct method
    const balance = await safeGetOwnerCoinBalances(userAddress, lpTokenType);

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

    // Use helper to get coin types from either schema
    const { coinTypeA, coinTypeB } = getVaultCoinTypes(vault);

    return {
      coinTypeA,
      coinTypeB,
      lpTokenType: vault.lp_token_type,
    };
  } catch (err) {
    console.error(`Failed to get coin info for vault ${vaultId}:`, err);
    throw err;
  }
}

/**
 * Helper to convert amount from human-readable to base units
 */
function toDecimalsAmount(amount: number | string, decimals: number): string {
  const decimalMultiplier = Math.pow(10, decimals);
  return Math.floor(Number(amount) * decimalMultiplier).toString();
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
 * Enhanced to use the SDK's calculateDepositAmounts for accurate deposit estimates
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

    // Get token decimals using the helper function for coin types
    const { coinTypeA, coinTypeB } = getVaultCoinTypes(vault);

    // Check that we have valid coin types
    if (!coinTypeA || !coinTypeB) {
      throw new Error("Could not determine coin types for this vault");
    }

    const decimalsA =
      coinInfoCache[coinTypeA]?.decimals || DEFAULT_TOKEN_DECIMALS;
    const decimalsB =
      coinInfoCache[coinTypeB]?.decimals || DEFAULT_TOKEN_DECIMALS;

    // Determine deposit type
    let side = InputType.Both;
    let isCoinAInput = amountA > 0;

    // Convert inputs to base units for SDK calls
    const baseAmountA =
      amountA > 0 ? toDecimalsAmount(amountA, decimalsA) : "0";
    const baseAmountB =
      amountB > 0 ? toDecimalsAmount(amountB, decimalsB) : "0";

    if (amountA > 0 && amountB === 0) {
      side = InputType.OneSide;
      isCoinAInput = true;
    } else if (amountA === 0 && amountB > 0) {
      side = InputType.OneSide;
      isCoinAInput = false;
    }

    // 1. First calculate the optimal deposit amounts using SDK
    console.log("Calculating optimal deposit amounts...");
    let depositParams, result;

    if (side === InputType.OneSide) {
      // One-sided deposit
      depositParams = {
        vault_id: vaultId,
        coin_amount: isCoinAInput ? baseAmountA : baseAmountB,
        is_coin_a: isCoinAInput,
        slippage: slippage,
        side: InputType.OneSide,
      };

      // Get deposit estimate for one-sided deposit
      result = await vaultsSdk.Vaults.calculateDepositAmounts(depositParams);
      console.log("One-sided deposit calculation result:", result);
    } else {
      // Both tokens deposit
      depositParams = {
        vault_id: vaultId,
        coin_a_amount: baseAmountA,
        coin_b_amount: baseAmountB,
        slippage: slippage,
        side: InputType.Both,
      };

      // Get deposit estimate for both tokens
      result = await vaultsSdk.Vaults.calculateDepositAmounts(depositParams);
      console.log("Both-token deposit calculation result:", result);
    }

    // 2. Now execute the deposit with the calculated optimal amounts
    const finalDepositParams = {
      vault_id: vaultId,
      slippage: slippage,
      side: side,
      return_lp_token: true, // Ensure we get the LP token back
    };

    if (side === InputType.OneSide) {
      finalDepositParams.coin_amount =
        result.amount || (isCoinAInput ? baseAmountA : baseAmountB);
      finalDepositParams.is_coin_a = isCoinAInput;
    } else {
      finalDepositParams.coin_a_amount = result.amount_a || baseAmountA;
      finalDepositParams.coin_b_amount = result.amount_b || baseAmountB;
    }

    // Execute the deposit transaction with optimized amounts
    const { lp_token } = await vaultsSdk.Vaults.deposit(finalDepositParams, tx);

    // Transfer the LP token to the user's wallet
    if (lp_token) {
      tx.transferObjects([lp_token], wallet.account.address);
    }
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
 * Withdraw from a vault with enhanced V2 SDK support
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
    // Get the vault to verify it exists and get LP token type
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    // Get user's total LP balance for this vault
    const userLPBalance = await safeGetOwnerCoinBalances(
      wallet.account.address,
      vault.lp_token_type
    );

    // Convert LP amount to base units
    const lpAmountBaseUnits = toDecimalsAmount(lpAmount, VAULT_DECIMALS);

    // Make sure withdrawal amount is not larger than user's balance
    if (
      parseFloat(lpAmountBaseUnits) > parseFloat(userLPBalance.totalBalance)
    ) {
      throw new Error("Withdrawal amount exceeds your balance");
    }

    // 1. Calculate optimal withdraw amounts using SDK
    console.log("Calculating withdraw amounts...");

    const withdrawCalcParams = {
      vault_id: vaultId,
      input_amount: lpAmountBaseUnits,
      slippage: slippage,
      is_ft_input: true, // We're providing LP tokens as input
      side: oneSided ? InputType.OneSide : InputType.Both,
      fix_amount_a: oneSided ? receiveCoinA : true, // Only relevant for one-sided withdrawals
      max_ft_amount: userLPBalance.totalBalance, // Total LP balance (optional for reference)
    };

    const withdrawCalcResult = await vaultsSdk.Vaults.calculateWithdrawAmount(
      withdrawCalcParams
    );
    console.log("Withdraw calculation result:", withdrawCalcResult);

    // 2. Execute the withdrawal with calculated parameters
    const withdrawParams = {
      vault_id: vaultId,
      slippage: slippage,
      ft_amount: withdrawCalcResult.burn_ft_amount || lpAmountBaseUnits, // Use SDK's calculated burn amount
      return_coin: true,
      side: oneSided ? InputType.OneSide : InputType.Both,
      is_ft_input: true,
    };

    if (oneSided) {
      withdrawParams.is_a_out = receiveCoinA; // Which token to receive in one-sided withdrawals
    }

    const { return_coin_a, return_coin_b } = await vaultsSdk.Vaults.withdraw(
      withdrawParams,
      tx
    );

    // Transfer returned coins to user's wallet
    if (return_coin_a) {
      tx.transferObjects([return_coin_a], wallet.account.address);
    }
    if (return_coin_b) {
      tx.transferObjects([return_coin_b], wallet.account.address);
    }
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
    // Use safe helper instead of direct method
    const balanceInfo = await safeGetOwnerCoinBalances(
      wallet.account.address,
      lpTokenType
    );

    const lpBalance =
      parseFloat(balanceInfo.totalBalance) / Math.pow(10, VAULT_DECIMALS);
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
 * Calculate deposit estimate with enhanced accuracy
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

    // Get token decimals using helper function for either schema
    const { coinTypeA, coinTypeB } = getVaultCoinTypes(vault);

    if (!coinTypeA || !coinTypeB) {
      throw new Error("Could not determine coin types for this vault");
    }

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
      slippage: 0.01, // Default slippage for calculations
    };

    // Calculate deposit estimate
    const estimate = await vaultsSdk.Vaults.calculateDepositAmounts(params);

    // Enhance the estimate with expected LP amount if it's not already provided
    if (!estimate.lp_amount && (estimate.amount_a || estimate.amount_b)) {
      try {
        // If the SDK doesn't provide expected LP amount directly,
        // we can calculate it using the pool's current state
        const lpValue = await vaultsSdk.Vaults.calculateLpValue({
          vault_id: vaultId,
          amount_a: estimate.amount_a || "0",
          amount_b: estimate.amount_b || "0",
        });

        estimate.expected_lp = lpValue.lp_amount;
      } catch (err) {
        console.warn("Failed to calculate expected LP amount:", err);
      }
    }

    return estimate;
  } catch (err) {
    console.error("Failed to calculate vault deposit:", err);
    throw new Error(
      "Could not calculate deposit estimate: " + (err.message || err)
    );
  }
}

/**
 * Calculate withdrawal estimate
 */
export async function calculateVaultWithdraw(
  vaultId: string,
  lpAmount: number,
  oneSided: boolean = false,
  receiveCoinA: boolean = true,
  slippage: number = 0.01
) {
  if (!vaultsSdk.senderAddress) {
    throw new Error("Wallet not connected");
  }

  try {
    // Get user's total LP balance for reference
    const vault = await vaultsSdk.Vaults.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault ${vaultId} not found`);
    }

    const userBalance = await safeGetOwnerCoinBalances(
      vaultsSdk.senderAddress,
      vault.lp_token_type
    );

    // Convert LP amount to base units
    const lpAmountBaseUnits = toDecimalsAmount(lpAmount, VAULT_DECIMALS);

    // Build calculation parameters
    const params = {
      vault_id: vaultId,
      input_amount: lpAmountBaseUnits,
      slippage: slippage,
      is_ft_input: true,
      side: oneSided ? InputType.OneSide : InputType.Both,
      fix_amount_a: oneSided ? receiveCoinA : true, // Only matters for one-sided
      max_ft_amount: userBalance.totalBalance, // Total user LP balance for reference
    };

    // Calculate withdrawal amounts
    const estimate = await vaultsSdk.Vaults.calculateWithdrawAmount(params);
    return {
      ...estimate,
      // Add human-readable values for UI
      amount_a_human: estimate.amount_a
        ? humaniseAmount(
            estimate.amount_a,
            coinInfoCache[vault.coin_type_a]?.decimals || DEFAULT_TOKEN_DECIMALS
          )
        : 0,
      amount_b_human: estimate.amount_b
        ? humaniseAmount(
            estimate.amount_b,
            coinInfoCache[vault.coin_type_b]?.decimals || DEFAULT_TOKEN_DECIMALS
          )
        : 0,
      burn_ft_amount_human: estimate.burn_ft_amount
        ? humaniseAmount(estimate.burn_ft_amount, VAULT_DECIMALS)
        : 0,
    };
  } catch (err) {
    console.error("Failed to calculate vault withdrawal:", err);
    throw new Error(
      "Could not calculate withdrawal estimate: " + (err.message || err)
    );
  }
}

/* -----------------------------------------------------------------
 * Helper functions for displaying amounts
 * ----------------------------------------------------------------- */

export function humaniseAmount(raw: string, decimals = 9) {
  return Number(raw) / 10 ** decimals;
}

export function formatUSD(value: number, places = 2) {
  return (
    "$" +
    value.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: places,
    })
  );
}

/* -----------------------------------------------------------------
 * Back‑compat shim – remove once callers are updated
 * ----------------------------------------------------------------- */

/** Helper: iterate over every vault and call getUserVaultBalance() */
async function getUserVaultBalanceForAll(owner: string) {
  const vaults = await getAllAvailableVaults();

  if (!Array.isArray(vaults)) {
    console.error("getUserVaultBalanceForAll: vaults is not an array");
    return [];
  }

  return Promise.all(
    vaults.map(async (v) => ({
      vault_id: v.id,
      ...(await getUserVaultBalance(v.id, owner)),
      symbolA: v.coin_a_symbol,
      symbolB: v.coin_b_symbol,
    }))
  );
}

// TEMP backward-compat export
export { getAllAvailableVaults as getAllVaults };
