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

/**
 * Rate limiter for Birdeye API calls.
 * This function ensures that no more than 15 requests are made per second.
 */
let birdeyeCallTimestamps: number[] = [];

async function rateLimitBirdeye<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  // Remove timestamps older than 1 second.
  birdeyeCallTimestamps = birdeyeCallTimestamps.filter((ts) => now - ts < 1000);
  if (birdeyeCallTimestamps.length >= 15) {
    // Wait until a slot is free. Calculate the delay from the oldest timestamp.
    const delayTime = 1000 - (now - birdeyeCallTimestamps[0]);
    await new Promise((resolve) => setTimeout(resolve, delayTime));
    return rateLimitBirdeye(fn); // Retry after waiting.
  }
  // Slot available—record this call.
  birdeyeCallTimestamps.push(Date.now());
  return fn();
}

// ---------------------
// Enrichment Functions
// ---------------------

export async function enrichTokenMetadataFromBalances(
  coins: AccountCoin[]
): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};

  // Process coins with limited concurrency (15 requests at a time)
  await processWithConcurrency(coins, 15, async (coin) => {
    const addrLower = coin.coinType.toLowerCase();
    let enriched: any = {};
    try {
      const resp = await rateLimitBirdeye(() =>
        birdeyeService.getPriceVolumeSingle(coin.coinType)
      );
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
        if (priceData.logo) enriched.logo = sanitizeLogoUrl(priceData.logo);
        if (priceData.decimals !== undefined)
          enriched.decimals = priceData.decimals;
      }
    } catch (e) {
      console.error(`Birdeye price fetch failed for ${coin.coinType}:`, e);
    }
    enriched.symbol = enriched.symbol || coin.symbol || "Unknown";
    enriched.name = enriched.name || coin.name || "Unknown Token";
    enriched.logo = enriched.logo || sanitizeLogoUrl(coin.logo || "");
    enriched.decimals = enriched.decimals ?? coin.decimals ?? 9;
    enriched.price =
      enriched.price ?? parseFloat(coin.price ? coin.price : "0");
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

export async function enrichTokenMetadataByAddresses(
  addresses: string[]
): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};

  await processWithConcurrency(addresses, 15, async (addr) => {
    const addrLower = addr.toLowerCase();
    let enriched: any = {};
    try {
      const resp = await rateLimitBirdeye(() =>
        birdeyeService.getPriceVolumeSingle(addr)
      );
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
        if (priceData.logo) enriched.logo = sanitizeLogoUrl(priceData.logo);
        if (priceData.decimals !== undefined)
          enriched.decimals = priceData.decimals;
      }
    } catch (e) {
      console.error(`Birdeye price fetch failed for ${addr}:`, e);
    }
    try {
      const resp = await blockvisionService.getCoinDetail(addr);
      if (resp && (resp.data || resp.result)) {
        const detail = resp.data || resp.result;
        enriched.symbol = enriched.symbol || detail.symbol || "Unknown";
        enriched.name = enriched.name || detail.name || "Unknown Token";
        enriched.logo =
          enriched.logo || sanitizeLogoUrl(detail.logo || "") || "";
        enriched.decimals = enriched.decimals ?? detail.decimals ?? 9;
      }
    } catch (e) {
      console.error(`BlockVision metadata fetch failed for ${addr}:`, e);
    }
    enriched.symbol = enriched.symbol || "Unknown";
    enriched.name = enriched.name || "Unknown Token";
    enriched.logo = enriched.logo || "";
    enriched.decimals = enriched.decimals ?? 9;
    enriched.price = enriched.price ?? 0;
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

export async function getUserTokenBalances(
  address: string,
  tokens: Token[]
): Promise<Token[]> {
  return tokens;
}
