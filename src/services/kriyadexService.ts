// Import necessary dependencies and types
import { PoolInfo } from "./coinGeckoService";
import { WalletContextState } from "@suiet/wallet-kit";
import { formatPoolId } from "../utils/formatters";
import * as coinGeckoService from "./coinGeckoService";

// API endpoints for Kriya DEX
const KRIYA_API_BASE_URL =
  "https://zunzoiv8l6.execute-api.ap-southeast-1.amazonaws.com";
const KRIYA_API_POOLS_URL =
  "https://zunzoiv8l6.execute-api.ap-southeast-1.amazonaws.com/prod/pools";
const KRIYA_API_POOLS_EXTENDED_URL =
  "https://zunzoiv8l6.execute-api.ap-southeast-1.amazonaws.com/prod/pools/extended";

// Known Kriya pool object IDs
// Marked with 'y' for CoinGecko-retrievable pools and 'n' for non-retrievable ones
const KNOWN_KRIYA_POOLS = [
  "0x5af4976b871fa1813362f352fa4cada3883a96191bb7212db1bd5d13685ae305", // SUI/USDC (0.07%) y
  "0x6d592184e5e29f640551e899f247799f78d1d13b033933cb70b28d8ba1532ffa", // SUI/USDC (0.30%) n
  "0xf385dee283495bb70500f5f8491047cd5a2ef1b7ff5f410e6dfe8a3c3ba58716", // SUI/vSUI y
  "0x43ca1a6de20d7feabcaa460ac3798a6fdc754d3a83b49dff93221612c1370dcc", // WETH/USDC y
  "0xc83d3c409375cb05fbe6a7f30a4f0da4aa75bda3352a08d2285216ef1a470267", // USDC/USDT n
  "0x8c14c10510b8dca446ff3189358ab8d99f5399ef78b3f762362766865f02af47", // BUCK/SUI n
  "0x897f66772935ef417426c2ca4d55a399972a7dea38585ea610d7a3f7481482b1", // SCB/USDC y
  "0xb9d3e8e7bc0f21dadea9328510223e11a9c4a669ca473c16a88f8c070bc47de8", // afSUI/SUI n
  "0x35c6abddbfa2661e9fa5cbba6aba3160936865a41c18ada09cf242b2ef4d4f3e", // BUCK/USDC n
  "0xfcda2777a074bfe161f86250de92bb82b0357799fb5686d46cb66f0c5116a2c3", // USDC(BNB)/SUI n
  "0x1d13dee36a2a7eaf51ccfee3cfdaeb4d0051014203c4389567e6f6b1ccf3ca4a", // WAL/SUI n
];

// CoinGecko-retrievable Kriya pools ("y")
const COINGECKO_KRIYA_POOLS = [
  "0x5af4976b871fa1813362f352fa4cada3883a96191bb7212db1bd5d13685ae305", // SUI/USDC (0.07%)
  "0xf385dee283495bb70500f5f8491047cd5a2ef1b7ff5f410e6dfe8a3c3ba58716", // SUI/vSUI
  "0x43ca1a6de20d7feabcaa460ac3798a6fdc754d3a83b49dff93221612c1370dcc", // WETH/USDC
  "0x897f66772935ef417426c2ca4d55a399972a7dea38585ea610d7a3f7481482b1", // SCB/USDC
];

/**
 * Check if a pool is a Kriya pool
 * @param poolId Pool object ID
 * @returns boolean
 */
export function isKriyaPool(poolId: string): boolean {
  // First check against known Kriya pools
  if (KNOWN_KRIYA_POOLS.includes(poolId)) {
    return true;
  }

  // Additional logic if needed for dynamic validation
  // For example, check pool structure or prefix

  return false;
}

/**
 * Check if a pool is specifically a SUI/USDC pool on Kriya
 * @param poolId Pool object ID
 * @param poolInfo Optional pool info object
 * @returns boolean
 */
export function isSuiUsdcPool(poolId: string, poolInfo?: any): boolean {
  // Check if it's one of the known SUI/USDC pools
  if (
    poolId ===
      "0x5af4976b871fa1813362f352fa4cada3883a96191bb7212db1bd5d13685ae305" ||
    poolId ===
      "0x6d592184e5e29f640551e899f247799f78d1d13b033933cb70b28d8ba1532ffa"
  ) {
    return true;
  }

  // If poolInfo is provided, check token symbols
  if (poolInfo) {
    const tokenASymbol = poolInfo.tokenA?.toLowerCase();
    const tokenBSymbol = poolInfo.tokenB?.toLowerCase();

    // Check if tokens are SUI and USDC (in either order)
    const hasSui = tokenASymbol === "sui" || tokenBSymbol === "sui";
    const hasUsdc =
      tokenASymbol?.includes("usdc") || tokenBSymbol?.includes("usdc");

    return hasSui && hasUsdc;
  }

  return false;
}

/**
 * Get pool data from Kriya API
 * @param poolId Pool object ID
 * @returns Pool data or null
 */
export async function getPool(poolId: string): Promise<any> {
  try {
    if (!isKriyaPool(poolId)) {
      throw new Error(`Pool ${poolId} is not a Kriya pool`);
    }

    const formattedPoolId = formatPoolId(poolId);
    const url = `${KRIYA_API_POOLS_EXTENDED_URL}/${formattedPoolId}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Kriya pool data: ${response.status}`);
    }

    const poolData = await response.json();
    return poolData;
  } catch (error) {
    console.error(`Failed to fetch Kriya pool ${poolId}:`, error);
    return null;
  }
}

/**
 * Deposit liquidity into a Kriya pool
 * @param wallet Connected wallet
 * @param poolId Pool object ID
 * @param amountA Amount of token A
 * @param amountB Amount of token B
 * @param poolInfo Pool information
 * @param tickLower Lower tick
 * @param tickUpper Upper tick
 * @param slippage Slippage tolerance
 * @returns Transaction result
 */
export async function deposit(
  wallet: WalletContextState,
  poolId: string,
  amountA: number,
  amountB: number,
  poolInfo: PoolInfo | null,
  tickLower: number,
  tickUpper: number,
  slippage: number
): Promise<any> {
  try {
    // Implementation for depositing into Kriya pool
    // This would typically involve preparing and sending a transaction
    console.log(
      `Depositing ${amountA} ${poolInfo?.tokenA} and ${amountB} ${poolInfo?.tokenB} into Kriya pool ${poolId}`
    );
    console.log(
      `Tick range: [${tickLower}, ${tickUpper}], Slippage: ${slippage}%`
    );

    // Placeholder for actual transaction logic
    // const txResult = await wallet.signAndExecuteTransaction({...});

    // Mock successful transaction for now
    return {
      success: true,
      digest: "mock_transaction_digest_" + Date.now(),
      tokenA: {
        symbol: poolInfo?.tokenA || "TokenA",
        amount: amountA,
      },
      tokenB: {
        symbol: poolInfo?.tokenB || "TokenB",
        amount: amountB,
      },
      timestamp: Date.now(),
      poolId,
    };
  } catch (error) {
    console.error("Error depositing into Kriya pool:", error);
    throw error;
  }
}

/**
 * Remove liquidity from a Kriya pool
 * @param wallet Connected wallet
 * @param positionId Position NFT object ID
 * @param poolId Pool object ID
 * @returns Transaction result
 */
export async function removeLiquidity(
  wallet: WalletContextState,
  positionId: string,
  poolId: string
): Promise<any> {
  try {
    // Implementation for removing liquidity from Kriya pool
    console.log(
      `Removing liquidity from position ${positionId} in Kriya pool ${poolId}`
    );

    // Placeholder for actual transaction logic
    // const txResult = await wallet.signAndExecuteTransaction({...});

    // Mock successful transaction for now
    return {
      success: true,
      digest: "mock_transaction_digest_" + Date.now(),
      positionId,
      poolId,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error("Error removing liquidity from Kriya pool:", error);
    throw error;
  }
}

/**
 * Get ALL pool IDs (object IDs) from Kriya API
 * @returns Array of pool object IDs
 */
export async function getAllKriyaPoolIds(): Promise<string[]> {
  try {
    const res = await fetch(KRIYA_API_POOLS_URL);
    if (!res.ok)
      throw new Error(`Failed to fetch Kriya pool ids: ${res.status}`);
    return await res.json();
  } catch (error) {
    console.error("Error fetching Kriya pool IDs:", error);
    // Fallback to known pools if API fails
    return KNOWN_KRIYA_POOLS;
  }
}

/**
 * Get extended info for all Kriya pools
 * @returns Array of pool data objects
 */
export async function getAllKriyaPoolsExtended(): Promise<any[]> {
  try {
    const poolIds = await getAllKriyaPoolIds();
    const allPoolInfo: any[] = [];

    // Fetch in chunks of 20 to prevent overwhelming the API
    for (let i = 0; i < poolIds.length; i += 20) {
      const chunk = poolIds.slice(i, i + 20);
      console.log(
        `Fetching Kriya pool data chunk ${i / 20 + 1}/${Math.ceil(
          poolIds.length / 20
        )}`
      );

      const chunkData = await Promise.all(
        chunk.map((id) =>
          fetch(`${KRIYA_API_POOLS_EXTENDED_URL}/${formatPoolId(id)}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch((err) => {
              console.error(`Failed to fetch data for pool ${id}:`, err);
              return null;
            })
        )
      );

      allPoolInfo.push(...chunkData.filter(Boolean));
    }

    return allPoolInfo;
  } catch (error) {
    console.error("Error fetching extended Kriya pool data:", error);
    return [];
  }
}

/**
 * Transform Kriya API pool data into PoolInfo format
 * @param raw Raw pool data from Kriya API
 * @returns Formatted PoolInfo object
 */
export function mapKriyaExtendedPoolToPoolInfo(raw: any): PoolInfo {
  try {
    const tokenA =
      raw.tokenX?.symbol ||
      raw.tokenXType?.split("::").pop()?.replace(/"/g, "") ||
      raw.tokenXType;
    const tokenB =
      raw.tokenY?.symbol ||
      raw.tokenYType?.split("::").pop()?.replace(/"/g, "") ||
      raw.tokenYType;
    const tokenAAddress = raw.tokenXType;
    const tokenBAddress = raw.tokenYType;

    // Format fee tier for display
    let feeTierDisplay = "";
    if (raw.feeTier) {
      // Convert fee tier to percentage (e.g., 30 -> 0.3%)
      const feePercentage = parseFloat(raw.feeTier) / 100;
      feeTierDisplay = `[${feePercentage.toFixed(2)}%]`;
    }

    return {
      address: raw.poolId,
      name: `${tokenA}/${tokenB} ${feeTierDisplay}`.trim(),
      tokenA,
      tokenB,
      tokenAAddress,
      tokenBAddress,
      tokenALogo: raw.tokenX?.logo || undefined,
      tokenBLogo: raw.tokenY?.logo || undefined,
      tokenAMetadata: {
        symbol: tokenA,
        name: tokenA,
        address: tokenAAddress,
        logo_uri: raw.tokenX?.logo || undefined,
      },
      tokenBMetadata: {
        symbol: tokenB,
        name: tokenB,
        address: tokenBAddress,
        logo_uri: raw.tokenY?.logo || undefined,
      },
      dex: "kriya-dex",
      fee: raw.feeTier ? parseFloat(raw.feeTier) / 10000 : 0.003, // Default to 0.3% if not specified
      liquidityUSD: parseFloat(raw.tvlUSD || raw.reserveUSD || "0"),
      volumeUSD: parseFloat(raw.volumeUSD || "0"),
      feesUSD: parseFloat(raw.feesUSD || "0"),
      apr: parseFloat(raw.apr || "0"),
      rewardSymbols: raw.rewards?.map((r: any) => r.symbol) || [],
      totalLiquidity: raw.tvlUSD?.toString() || undefined,
      tvlUsd: parseFloat(raw.tvlUSD || "0"),
      _rawData: raw,
    };
  } catch (error) {
    console.error("Error mapping Kriya pool data:", error, raw);
    // Return minimal pool info to avoid breaking the UI
    return {
      address: raw.poolId || "unknown",
      name: "Unknown Pool",
      tokenA: "Unknown",
      tokenB: "Unknown",
      tokenAAddress: "",
      tokenBAddress: "",
      dex: "kriya-dex",
      liquidityUSD: 0,
      volumeUSD: 0,
      _rawData: raw,
    };
  }
}

/**
 * Get Kriya pools with fallback for non-CoinGecko pools
 * This implements the optimized approach suggested by the user
 * @returns Array of PoolInfo objects
 */
export async function getKriyaPoolsWithFallback(): Promise<PoolInfo[]> {
  console.log("Fetching Kriya pools with CoinGecko data + fallbacks");

  // 1. First try to get CoinGecko-retrievable pools by address
  const coinGeckoPools: PoolInfo[] = [];
  const notFound: string[] = [];

  for (const poolId of KNOWN_KRIYA_POOLS) {
    try {
      const searchResult = await coinGeckoService.searchPools(poolId, 1);
      if (
        searchResult &&
        searchResult.length > 0 &&
        searchResult[0].address.toLowerCase() === poolId.toLowerCase()
      ) {
        console.log(`Found pool ${poolId} in CoinGecko`);
        coinGeckoPools.push(searchResult[0]);
      } else {
        console.log(`Pool ${poolId} not found in CoinGecko, will use fallback`);
        notFound.push(poolId);
      }
    } catch (error) {
      console.error(`Error searching for pool ${poolId} in CoinGecko:`, error);
      notFound.push(poolId);
    }
  }

  console.log(
    `Found ${coinGeckoPools.length} pools in CoinGecko, ${notFound.length} need fallbacks`
  );

  // 2. For pools not found in CoinGecko, try to get data from Kriya API
  const fallbackPools: PoolInfo[] = [];

  if (notFound.length > 0) {
    try {
      // Try to get data from Kriya API for all not found pools
      const kriyaApiData = await Promise.all(
        notFound.map((poolId) =>
          getPool(poolId)
            .then((data) =>
              data ? mapKriyaExtendedPoolToPoolInfo(data) : null
            )
            .catch(() => null)
        )
      );

      // Add valid results to fallback pools
      const validKriyaData = kriyaApiData.filter(Boolean);
      fallbackPools.push(...validKriyaData);

      console.log(`Got ${validKriyaData.length} pools from Kriya API`);

      // For any remaining pools with no API data, create stubs
      const apiFoundIds = new Set(
        validKriyaData.map((p) => p.address.toLowerCase())
      );
      const stillMissing = notFound.filter(
        (id) => !apiFoundIds.has(id.toLowerCase())
      );

      if (stillMissing.length > 0) {
        console.log(
          `Creating ${stillMissing.length} stub pools for missing Kriya pools`
        );

        // Create stub entries
        const stubPools = stillMissing.map((id) => ({
          address: id,
          name: `Kriya Pool ${id.slice(0, 8)}...`,
          tokenA: "Unknown",
          tokenB: "Unknown",
          dex: "kriya-dex",
          liquidityUSD: 0,
          volumeUSD: 0,
          feesUSD: 0,
          apr: 0,
          rewardSymbols: [],
        }));

        fallbackPools.push(...stubPools);
      }
    } catch (error) {
      console.error("Error fetching fallback data from Kriya API:", error);

      // Create stub entries for all not found pools if API fails
      const stubPools = notFound.map((id) => ({
        address: id,
        name: `Kriya Pool ${id.slice(0, 8)}...`,
        tokenA: "Unknown",
        tokenB: "Unknown",
        dex: "kriya-dex",
        liquidityUSD: 0,
        volumeUSD: 0,
        feesUSD: 0,
        apr: 0,
        rewardSymbols: [],
      }));

      fallbackPools.push(...stubPools);
    }
  }

  // 3. Combine CoinGecko pools and fallbacks
  const allPools = [...coinGeckoPools, ...fallbackPools];
  console.log(
    `Returning total of ${allPools.length} Kriya pools (${coinGeckoPools.length} from CoinGecko, ${fallbackPools.length} fallbacks)`
  );

  return allPools;
}

/**
 * Get all Kriya pools in PoolInfo format
 * @returns Array of PoolInfo objects
 */
export async function getAllKriyaPoolInfo(): Promise<PoolInfo[]> {
  // Use our optimized approach that combines CoinGecko data with fallbacks
  return getKriyaPoolsWithFallback();
}

/**
 * Merge CoinGecko pools with Kriya pools, avoiding duplicates
 * @param coinGeckoPools Pools from CoinGecko
 * @returns Merged array of PoolInfo objects
 */
export async function getMergedPoolsWithKriya(
  coinGeckoPools: PoolInfo[]
): Promise<PoolInfo[]> {
  try {
    // Get all Kriya pools with proper fallbacks for non-CoinGecko pools
    const kriyaPools = await getKriyaPoolsWithFallback();

    // Create a set of existing addresses (case-insensitive)
    const existing = new Set(
      coinGeckoPools.map((p) => p.address.toLowerCase())
    );
    const merged = [...coinGeckoPools];

    let newPoolsAdded = 0;
    kriyaPools.forEach((k) => {
      if (!existing.has(k.address.toLowerCase())) {
        merged.push(k);
        newPoolsAdded++;
      }
    });

    console.log(
      `Added ${newPoolsAdded} new Kriya pools not found in CoinGecko data`
    );
    return merged;
  } catch (error) {
    console.error("Failed to merge pools with Kriya:", error);
    return coinGeckoPools; // Return original pools if merge fails
  }
}

/**
 * Get recommended tick range for a pool
 * @param poolId Pool object ID
 * @param poolInfo Optional pool info object
 * @returns Recommended tick range
 */
export function getRecommendedTicks(
  poolId: string,
  poolInfo?: PoolInfo | null
): { tickLower: number; tickUpper: number } {
  // Specific recommendations for known pools
  if (isSuiUsdcPool(poolId, poolInfo)) {
    // For SUI/USDC, use a medium range around current price
    return { tickLower: -10000, tickUpper: 10000 };
  }

  // Default tick range for other pools
  return { tickLower: -20000, tickUpper: 20000 };
}

/**
 * Get price range from ticks
 * @param tickLower Lower tick
 * @param tickUpper Upper tick
 * @param isSuiUsdcPool Whether the pool is SUI/USDC
 * @returns Price range
 */
export function getPriceRangeFromTicks(
  tickLower: number,
  tickUpper: number,
  isSuiUsdcPool: boolean = false
): { minPrice: number; maxPrice: number } {
  const minPrice = Math.pow(1.0001, tickLower);
  const maxPrice = Math.pow(1.0001, tickUpper);

  return { minPrice, maxPrice };
}

/**
 * Get full range ticks for a pool
 * @param feeTier Fee tier string (e.g., "0.3%")
 * @param isSuiUsdcPool Whether the pool is SUI/USDC
 * @returns Full range ticks
 */
export function getFullRangeTicksForPool(
  feeTier: string,
  isSuiUsdcPool: boolean = false
): { tickLower: number; tickUpper: number } {
  // Default full range (min/max ticks)
  const defaultFullRange = { tickLower: -887220, tickUpper: 887220 };

  // Special case for SUI/USDC pool with different fee tiers
  if (isSuiUsdcPool) {
    if (feeTier === "0.01%") {
      return { tickLower: -800000, tickUpper: 800000 };
    } else if (feeTier === "0.05%") {
      return { tickLower: -850000, tickUpper: 850000 };
    } else if (feeTier === "0.3%") {
      return { tickLower: -887220, tickUpper: 887220 };
    }
  }

  return defaultFullRange;
}

// Export default object with all functions
export default {
  isKriyaPool,
  isSuiUsdcPool,
  getPool,
  deposit,
  removeLiquidity,
  getAllKriyaPoolIds,
  getAllKriyaPoolsExtended,
  mapKriyaExtendedPoolToPoolInfo,
  getAllKriyaPoolInfo,
  getKriyaPoolsWithFallback,
  getMergedPoolsWithKriya,
  getRecommendedTicks,
  getPriceRangeFromTicks,
  getFullRangeTicksForPool,
};
