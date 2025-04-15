import { fetchSupportedTokens as fetchSDKTokens } from "./sdkService";
import blockvisionService, { AccountCoin } from "./blockvisionService";
import { birdeyeService } from "./birdeyeService";
import tokenCacheService from "./tokenCacheService";

// ---------------------
// Token Interface
// ---------------------
export interface Token {
  symbol: string;
  address: string;
  name?: string;
  decimals: number;
  logo?: string;
  price?: number;
  balance?: string;
  balanceUsd?: string;
  volume24h?: number; // 24-hour trading volume
  marketCap?: number; // Market capitalization
}

// ---------------------
// Enrichment Functions
// ---------------------

/**
 * Enrich token metadata for tokens the user holds, using Birdeye for price and logo, with BlockVision data as fallback.
 * @param coins - Array of AccountCoin objects (from BlockVision) for the tokens held.
 * @returns Promise of a metadata map, keyed by lowercased token address.
 */
export async function enrichTokenMetadataFromBalances(
  coins: AccountCoin[]
): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};

  // Use a for...of loop so we can await inside it.
  for (const coin of coins) {
    const addrLower = coin.coinType.toLowerCase();
    let enriched: any = {};

    // Try to fetch data from Birdeye first
    try {
      const resp = await birdeyeService.getPriceVolumeSingle(coin.coinType);
      if (resp && resp.data) {
        const priceData = resp.data;
        enriched.price = parseFloat(
          priceData.price ??
            priceData.current_price ??
            priceData.priceUSD ??
            priceData.priceUsd ??
            "0"
        );
        if (priceData.symbol) enriched.symbol = priceData.symbol;
        if (priceData.name) enriched.name = priceData.name;
        if (priceData.logo) enriched.logo = priceData.logo;
        if (priceData.decimals !== undefined)
          enriched.decimals = priceData.decimals;
      }
    } catch (e) {
      console.error(`Birdeye price fetch failed for ${coin.coinType}:`, e);
    }

    // Fallback using BlockVision data if necessary
    enriched.symbol = enriched.symbol || coin.symbol || "Unknown";
    enriched.name = enriched.name || coin.name || "Unknown Token";
    enriched.logo = enriched.logo || coin.logo || "";
    enriched.decimals = enriched.decimals ?? coin.decimals ?? 9;
    enriched.price = enriched.price ?? parseFloat(coin.price || "0");

    // Cache static metadata locally
    tokenCacheService.cacheToken({
      address: addrLower,
      symbol: enriched.symbol,
      name: enriched.name,
      logo: enriched.logo,
      decimals: enriched.decimals,
    });
    metadataMap[addrLower] = enriched;
  }
  return metadataMap;
}

/**
 * Enrich token metadata for arbitrary token addresses (not necessarily in wallet), using Birdeye and BlockVision.
 * @param addresses - Array of token addresses for which to fetch metadata.
 * @returns Promise of a metadata map, keyed by lowercased token address.
 */
export async function enrichTokenMetadataByAddresses(
  addresses: string[]
): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};

  // Use a for...of loop to enable await calls inside the loop.
  for (const addr of addresses) {
    const addrLower = addr.toLowerCase();
    let enriched: any = {};

    // Try to get metadata from Birdeye
    try {
      const resp = await birdeyeService.getPriceVolumeSingle(addr);
      if (resp && resp.data) {
        const priceData = resp.data;
        enriched.price = parseFloat(
          priceData.price ??
            priceData.current_price ??
            priceData.priceUSD ??
            priceData.priceUsd ??
            "0"
        );
        if (priceData.symbol) enriched.symbol = priceData.symbol;
        if (priceData.name) enriched.name = priceData.name;
        if (priceData.logo) enriched.logo = priceData.logo;
        if (priceData.decimals !== undefined)
          enriched.decimals = priceData.decimals;
      }
    } catch (e) {
      console.error(`Birdeye price fetch failed for ${addr}:`, e);
    }

    // Use BlockVision to fill in any missing static metadata
    try {
      const resp = await blockvisionService.getCoinDetail(addr);
      if (resp && (resp.data || resp.result)) {
        const detail = resp.data || resp.result;
        enriched.symbol = enriched.symbol || detail.symbol || "Unknown";
        enriched.name = enriched.name || detail.name || "Unknown Token";
        enriched.logo = enriched.logo || detail.logo || "";
        enriched.decimals = enriched.decimals ?? detail.decimals ?? 9;
      }
    } catch (e) {
      console.error(`BlockVision metadata fetch failed for ${addr}:`, e);
    }

    // Ensure default values are set
    enriched.symbol = enriched.symbol || "Unknown";
    enriched.name = enriched.name || "Unknown Token";
    enriched.logo = enriched.logo || "";
    enriched.decimals = enriched.decimals ?? 9;
    enriched.price = enriched.price ?? 0;

    // Cache the static metadata locally
    tokenCacheService.cacheToken({
      address: addrLower,
      symbol: enriched.symbol,
      name: enriched.name,
      logo: enriched.logo,
      decimals: enriched.decimals,
    });
    metadataMap[addrLower] = enriched;
  }
  return metadataMap;
}

// ---------------------
// Token Fetching Functions
// ---------------------

/**
 * Fetch tokens from the SDK with error handling.
 * Returns an array of tokens sorted by trading volume (if available), limited to the top 50 tokens.
 */
export async function fetchTokens(): Promise<Token[]> {
  try {
    // Try to fetch tokens from the SDK
    const sdkTokens = await fetchSDKTokens();
    if (sdkTokens && sdkTokens.length > 0) {
      // Sort by trading volume if available
      const sortedTokens = sdkTokens.sort((a, b) => {
        if (a.volume24h && b.volume24h) {
          return b.volume24h - a.volume24h;
        }
        return 0;
      });
      // Return the top 50 tokens, or all if fewer than 50
      return sortedTokens.slice(0, 50);
    }
    throw new Error("No tokens returned from SDK");
  } catch (error) {
    console.error("Error fetching tokens:", error);
    // Return an empty array if SDK call fails
    return [];
  }
}

// ---------------------
// Backward Compatibility
// ---------------------

/**
 * Get user token balances - now handled directly in TokenSelector using Suiet hooks.
 * This function exists solely for backward compatibility.
 */
export async function getUserTokenBalances(
  address: string,
  tokens: Token[]
): Promise<Token[]> {
  return tokens;
}
