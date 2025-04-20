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
  volume24h?: number;
  marketCap?: number;
}

// Helper to sanitize logo URLs
export function sanitizeLogoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("ipfs://")) {
    return url.replace(/^ipfs:\/\//, "https://cloudflare-ipfs.com/ipfs/");
  }
  if (url.includes("ipfs.io")) {
    url = url.replace("http://", "https://");
    return url.replace("https://ipfs.io", "https://cloudflare-ipfs.com");
  }
  if (url.startsWith("http://")) {
    return "https://" + url.slice(7);
  }
  return url;
}

/**
 * Simple concurrency limiter:
 * Processes items in the array using the provided async function,
 * but limits the number of simultaneous calls.
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  return new Promise((resolve, reject) => {
    let active = 0;
    function next() {
      if (index === items.length && active === 0) {
        return resolve(results);
      }
      while (active < concurrency && index < items.length) {
        active++;
        const currentIndex = index;
        fn(items[index])
          .then((result) => {
            results[currentIndex] = result;
            active--;
            next();
          })
          .catch(reject);
        index++;
      }
    }
    next();
  });
}

// ---------------------
// Enrichment Functions
// ---------------------

/**
 * Enrich token metadata for a user’s wallet balances.
 * Uses BlockVision’s `getAccountCoins` response for all fields:
 * symbol, name, logo, decimals, price.
 * No Birdeye calls here — BlockVision already returns everything.
 */
export async function enrichTokenMetadataFromBalances(
  coins: AccountCoin[]
): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};
  await processWithConcurrency(coins, 15, async (coin) => {
    const addrLower = coin.coinType.toLowerCase();
    const enriched = {
      symbol: coin.symbol || "Unknown",
      name: coin.name || "Unknown Token",
      logo: sanitizeLogoUrl(coin.logo || ""),
      decimals: coin.decimals ?? 9,
      price: parseFloat(coin.price || "0").toFixed(7),
    };
    // Cache the metadata for quick subsequent loads
    tokenCacheService.cacheToken({
      address: addrLower,
      symbol: enriched.symbol,
      name: enriched.name,
      logo: enriched.logo,
      decimals: enriched.decimals,
    });
    metadataMap[addrLower] = enriched;
  });
  return metadataMap;
}

/**
 * Enrich token metadata by arbitrary addresses (non-wallet or fallback),
 * via Birdeye price/volume API + BlockVision coin detail as needed.
 */
export async function enrichTokenMetadataByAddresses(
  addresses: string[]
): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};
  await processWithConcurrency(addresses, 15, async (addr) => {
    const addrLower = addr.toLowerCase();
    let enriched: any = {};

    // 1) Try Birdeye price/volume endpoint
    try {
      const resp = await birdeyeService.getPriceVolumeSingle(addr);
      if (resp?.data) {
        const p = resp.data;
        enriched.price = parseFloat(
          p.price ?? p.current_price ?? p.priceUSD ?? p.priceUsd ?? "0"
        );
        if (p.symbol) enriched.symbol = p.symbol;
        if (p.name) enriched.name = p.name;
        if (p.logo) enriched.logo = sanitizeLogoUrl(p.logo);
        if (p.decimals !== undefined) {
          enriched.decimals = p.decimals;
        }
      }
    } catch (e) {
      console.error(`Birdeye fetch failed for ${addr}:`, e);
    }

    // 2) Fallback to BlockVision coin detail
    try {
      const resp = await blockvisionService.getCoinDetail(addr);
      const detail = resp.data || resp.result;
      enriched.symbol = enriched.symbol || detail.symbol;
      enriched.name = enriched.name || detail.name;
      enriched.logo = enriched.logo || sanitizeLogoUrl(detail.logo || "");
      enriched.decimals = enriched.decimals ?? detail.decimals;
    } catch {
      // swallow any errors
    }

    // 3) Final defaults
    enriched.symbol = enriched.symbol || "Unknown";
    enriched.name = enriched.name || "Unknown Token";
    enriched.logo = enriched.logo || "";
    enriched.decimals = enriched.decimals ?? 9;
    enriched.price = enriched.price ?? 0;
    if (typeof enriched.price === "number") {
      enriched.price = enriched.price.toFixed(7);
    }

    tokenCacheService.cacheToken({
      address: addrLower,
      symbol: enriched.symbol,
      name: enriched.name,
      logo: enriched.logo,
      decimals: enriched.decimals,
    });
    metadataMap[addrLower] = enriched;
  });
  return metadataMap;
}

// SDK-based fetch for top tokens (unchanged)
export async function fetchTokens(): Promise<Token[]> {
  try {
    const sdkTokens = await fetchSDKTokens();
    if (sdkTokens && sdkTokens.length > 0) {
      const sortedTokens = sdkTokens.sort((a, b) => {
        if (a.volume24h && b.volume24h) {
          return b.volume24h - a.volume24h;
        }
        return 0;
      });
      return sortedTokens.slice(0, 50);
    }
    throw new Error("No tokens returned from SDK");
  } catch (error) {
    console.error("Error fetching tokens:", error);
    return [];
  }
}

// Placeholder: original getUserTokenBalances remains a no-op
export async function getUserTokenBalances(
  address: string,
  tokens: Token[]
): Promise<Token[]> {
  return tokens;
}
