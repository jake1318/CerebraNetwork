// src/services/tokenService.ts
// Last Updated: 2025-05-17 00:15:43 UTC by jake1318

import { fetchSupportedTokens as fetchSDKTokens } from "./sdkService";
import blockvisionService, { AccountCoin } from "./blockvisionService";
import { birdeyeService } from "./birdeyeService";
import tokenCacheService from "./tokenCacheService";

// Updated rate limit constants to match our higher Birdeye API capacity
const BIRDEYE_REQUESTS_PER_SECOND = 45; // Using 45 out of 50 to leave safety margin
const MAX_CONCURRENCY = 25; // Increased from 15 to take advantage of higher rate limits
const CONCURRENCY_DELAY_MS = Math.floor(1000 / BIRDEYE_REQUESTS_PER_SECOND); // ~22ms between requests

// CoinGecko API configuration
const COINGECKO_API_KEY = 'CG-RsxinQSgFE2ti5oXgH9CUZgp';
const COINGECKO_API_BASE = 'https://pro-api.coingecko.com/api/v3';
const COINGECKO_NETWORK = 'sui-network';

// Direct token mapping for known tokens - using symbol as key for flexibility
export const TOKEN_LOGO_MAPPING: Record<string, string> = {
  // From your debug logs, these are specific tokens we know about
  'SUI': 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpg?1696523592',
  'CETUS': 'https://coin-images.coingecko.com/coins/images/30256/large/cetus.png?1696529165',
  'SLOVE': 'https://coin-images.coingecko.com/coins/images/54967/small/logo_square_color.png?1696518079',
  'BLUB': 'https://coin-images.coingecko.com/coins/images/39356/small/Frame_38.png?1696510897',
  'CHIRP': 'https://coin-images.coingecko.com/coins/images/52894/small/Chirp_Icon_Round.png?1696516546',
  'USDC': 'https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png',
  'USDT': 'https://assets.coingecko.com/coins/images/325/thumb/Tether.png',
  'GLUB': 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpg?1696523592', // Default to SUI if not found
  'MOON': 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpg?1696523592', // Default to SUI if not found
  'DEEP': 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpg?1696523592', // Default to SUI if not found
  'HIPPO': 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpg?1696523592', // Default to SUI if not found
  'LOFI': 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpg?1696523592', // Default to SUI if not found
};

// Known address to symbol mapping for frequently used tokens
const ADDRESS_TO_SYMBOL: Record<string, string> = {
  '0x6864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS': 'CETUS',
  '0x7b8e23cba2b2cb221c22460d6edac8f5f882f0fc97198c88fc993a68aa4566db::slove::SLOVE': 'SLOVE',
  '0x2::sui::SUI': 'SUI',
};

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

// Cache for token logo fallbacks to reduce API calls
const tokenLogoCache: Record<string, string> = {};

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
 * Advanced concurrency limiter:
 * Processes items in batches with configurable concurrency and rate limiting
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
  delayMs = 0
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  // Process items in batches
  while (index < items.length) {
    // Take the next batch of items
    const batch = items.slice(index, index + concurrency);
    index += concurrency;

    // Process batch with delays between requests to avoid rate limiting
    const batchPromises = batch.map(async (item, i) => {
      if (i > 0 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, i * delayMs));
      }
      return fn(item);
    });

    // Wait for all batch items to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches if we have more to process
    if (index < items.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Get a known logo URL based on token symbol or address
 * This is our first line of defense for token logos
 */
export function getKnownLogoBySymbol(symbolOrAddress: string): string | null {
  if (!symbolOrAddress) return null;
  
  // Try getting the symbol from address if this looks like an address
  let symbol = symbolOrAddress;
  if (symbolOrAddress.startsWith('0x') || symbolOrAddress.includes('::')) {
    // It's an address, try to look up the symbol
    const knownSymbol = ADDRESS_TO_SYMBOL[symbolOrAddress];
    if (knownSymbol) {
      symbol = knownSymbol;
      console.log(`Resolved address ${symbolOrAddress} to symbol ${symbol}`);
    }
  }
  
  // Normalize the symbol for lookup
  const normalizedSymbol = symbol.toUpperCase();
  
  if (TOKEN_LOGO_MAPPING[normalizedSymbol]) {
    console.log(`Found hardcoded logo for ${symbol}: ${TOKEN_LOGO_MAPPING[normalizedSymbol]}`);
    return TOKEN_LOGO_MAPPING[normalizedSymbol];
  }
  
  return null;
}

/**
 * Fetch token data from CoinGecko's onchain API
 * This provides high-quality logos and additional token information
 */
export async function fetchCoinGeckoTokenData(tokenAddress: string): Promise<any> {
  if (!tokenAddress) return null;
  
  try {
    // Try by symbol first if this address has a known symbol
    const knownSymbol = ADDRESS_TO_SYMBOL[tokenAddress];
    if (knownSymbol && TOKEN_LOGO_MAPPING[knownSymbol.toUpperCase()]) {
      console.log(`Using predefined logo for ${tokenAddress} via symbol ${knownSymbol}`);
      return {
        symbol: knownSymbol,
        name: knownSymbol,
        image_url: TOKEN_LOGO_MAPPING[knownSymbol.toUpperCase()],
        decimals: 9 // Default decimals
      };
    }
    
    const encodedAddress = encodeURIComponent(tokenAddress);
    const url = `${COINGECKO_API_BASE}/onchain/networks/${COINGECKO_NETWORK}/tokens/${encodedAddress}`;
    
    const options = {
      method: 'GET',
      headers: {
        'accept': 'application/json', 
        'x-cg-pro-api-key': COINGECKO_API_KEY
      }
    };

    console.log(`Fetching CoinGecko data for ${tokenAddress}`);
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`CoinGecko data received for ${tokenAddress}`);
    
    if (data && data.data && data.data.attributes) {
      return data.data.attributes;
    }
    
    return null;
  } catch (error) {
    console.warn(`Failed to fetch token data from CoinGecko for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Fetch a token logo using multiple fallbacks:
 * 1. First try the token symbol mapping
 * 2. Try CoinGecko API if we haven't tried it yet
 * 3. Fall back to BirdEye if CoinGecko doesn't have data
 */
export async function fetchTokenLogoFallback(
  tokenAddress: string, 
  tokenSymbol?: string
): Promise<string | null> {
  // Skip if no address 
  if (!tokenAddress) return null;
  
  // Check cache first
  if (tokenLogoCache[tokenAddress]) {
    return tokenLogoCache[tokenAddress];
  }
  
  // Try hardcoded symbols first if we have a symbol
  if (tokenSymbol) {
    const knownLogo = getKnownLogoBySymbol(tokenSymbol);
    if (knownLogo) {
      tokenLogoCache[tokenAddress] = knownLogo;
      return knownLogo;
    }
  }
  
  // Try by address if it maps to a known symbol
  const knownLogo = getKnownLogoBySymbol(tokenAddress);
  if (knownLogo) {
    tokenLogoCache[tokenAddress] = knownLogo;
    return knownLogo;
  }
  
  // Try CoinGecko
  try {
    console.log(`Trying CoinGecko API for logo: ${tokenAddress}`);
    const cgData = await fetchCoinGeckoTokenData(tokenAddress);
    
    if (cgData?.image_url) {
      const logoUrl = cgData.image_url;
      console.log(`Found CoinGecko logo for ${tokenAddress}: ${logoUrl}`);
      tokenLogoCache[tokenAddress] = logoUrl;
      
      // If we now have a symbol and it's not in our mapping, add it
      if (tokenSymbol && !TOKEN_LOGO_MAPPING[tokenSymbol.toUpperCase()]) {
        TOKEN_LOGO_MAPPING[tokenSymbol.toUpperCase()] = logoUrl;
        console.log(`Added dynamic mapping for ${tokenSymbol}: ${logoUrl}`);
      }
      
      // Also add/update the address to symbol mapping
      if (cgData.symbol && tokenAddress) {
        ADDRESS_TO_SYMBOL[tokenAddress] = cgData.symbol;
      }
      
      return logoUrl;
    }
  } catch (error) {
    console.warn(`CoinGecko logo fetch failed for ${tokenAddress}:`, error);
  }
  
  // Fall back to BirdEye if CoinGecko didn't work
  try {
    console.log(`Trying BirdEye API fallback for logo: ${tokenAddress}`);
    const metadata = await birdeyeService.getTokenMetadata(tokenAddress);
    
    if (metadata?.logo_uri) {
      const sanitizedUrl = sanitizeLogoUrl(metadata.logo_uri);
      console.log(`Found BirdEye logo for ${tokenAddress}: ${sanitizedUrl}`);
      // Cache the result for future use
      tokenLogoCache[tokenAddress] = sanitizedUrl;
      
      // Add to our dynamic mapping if we have a symbol
      if (tokenSymbol && !TOKEN_LOGO_MAPPING[tokenSymbol.toUpperCase()]) {
        TOKEN_LOGO_MAPPING[tokenSymbol.toUpperCase()] = sanitizedUrl;
        console.log(`Added dynamic mapping for ${tokenSymbol} from BirdEye: ${sanitizedUrl}`);
      }
      
      // Also add/update the address to symbol mapping
      if (metadata.symbol && tokenAddress) {
        ADDRESS_TO_SYMBOL[tokenAddress] = metadata.symbol;
      }
      
      return sanitizedUrl;
    }
  } catch (error) {
    console.warn(`Failed to fetch logo fallback from BirdEye for ${tokenAddress}:`, error);
  }
  
  return null;
}

// ---------------------
// Enrichment Functions
// ---------------------

/**
 * Enrich token metadata for a user's wallet balances.
 * Uses BlockVision's `getAccountCoins` response for all fields:
 * symbol, name, logo, decimals, price.
 * No Birdeye calls here — BlockVision already returns everything.
 */
export async function enrichTokenMetadataFromBalances(
  coins: AccountCoin[]
): Promise<Record<string, any>> {
  const metadataMap: Record<string, any> = {};
  // Increased concurrency to match our higher rate limits
  const enriched = await processWithConcurrency(
    coins,
    MAX_CONCURRENCY,
    async (coin) => {
      const addrLower = coin.coinType.toLowerCase();
      const enriched = {
        symbol: coin.symbol || "Unknown",
        name: coin.name || "Unknown Token",
        logo: sanitizeLogoUrl(coin.logo || ""),
        decimals: coin.decimals ?? 9,
        price: parseFloat(coin.price || "0").toFixed(7),
      };
      
      // First try our hardcoded mapping based on symbol
      const knownLogo = getKnownLogoBySymbol(coin.symbol || "");
      if (knownLogo) {
        enriched.logo = knownLogo;
        console.log(`Using known logo for ${coin.symbol}: ${knownLogo}`);
      }
      // Otherwise try to get a better logo from our fallback providers
      else if (!enriched.logo) {
        try {
          const betterLogo = await fetchTokenLogoFallback(addrLower, coin.symbol);
          if (betterLogo) {
            enriched.logo = betterLogo;
          }
        } catch (e) {
          // Ignore errors in logo enrichment
        }
      }
      
      // Cache the metadata for quick subsequent loads
      tokenCacheService.cacheToken({
        address: addrLower,
        symbol: enriched.symbol,
        name: enriched.name,
        logo: enriched.logo,
        decimals: enriched.decimals,
      });
      return { address: addrLower, data: enriched };
    }
  );

  // Convert to map format
  enriched.forEach((item) => {
    metadataMap[item.address] = item.data;
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

  // First check cache and filter out already cached tokens
  const uncachedAddresses: string[] = [];
  for (const addr of addresses) {
    const addrLower = addr.toLowerCase();
    const cached = tokenCacheService.getToken(addrLower);
    if (cached) {
      // Use cached data but don't include price (we'll fetch fresh prices)
      metadataMap[addrLower] = {
        symbol: cached.symbol || "Unknown",
        name: cached.name || "Unknown Token",
        logo: cached.logo || "",
        decimals: cached.decimals ?? 9,
        price: "0", // Will be updated with fresh price data
      };
    } else {
      uncachedAddresses.push(addr);
    }
  }

  // Process uncached tokens with higher concurrency and controlled delays
  const enriched = await processWithConcurrency(
    uncachedAddresses,
    MAX_CONCURRENCY,
    async (addr) => {
      const addrLower = addr.toLowerCase();
      let enriched: any = {};
      let tokenSymbolForMapping = "";
      let skipRemainingSteps = false;

      // 1) Check if this address has a known token symbol and logo first
      const knownSymbolFromAddr = ADDRESS_TO_SYMBOL[addr];
      if (knownSymbolFromAddr) {
        const knownLogo = TOKEN_LOGO_MAPPING[knownSymbolFromAddr.toUpperCase()];
        if (knownLogo) {
          enriched.symbol = knownSymbolFromAddr;
          enriched.logo = knownLogo;
          tokenSymbolForMapping = knownSymbolFromAddr;
          console.log(`Found known logo for ${addr} via symbol ${knownSymbolFromAddr}: ${knownLogo}`);
        }
      }

      // 2) Try Birdeye price/volume endpoint first (just for initial metadata)
      try {
        const resp = await birdeyeService.getPriceVolumeSingle(addr);
        if (resp?.data) {
          const p = resp.data;
          enriched.price = parseFloat(
            p.price ?? p.current_price ?? p.priceUSD ?? p.priceUsd ?? "0"
          );
          if (p.symbol) {
            enriched.symbol = p.symbol;
            tokenSymbolForMapping = p.symbol; // Store for logo lookup
            // Update our address to symbol mapping
            ADDRESS_TO_SYMBOL[addr] = p.symbol;
          }
          if (p.name) enriched.name = p.name;
          if (p.logo && (!enriched.logo || enriched.logo === "")) {
            enriched.logo = sanitizeLogoUrl(p.logo);
          }
          if (p.decimals !== undefined) {
            enriched.decimals = p.decimals;
          }
          if (p.volumeUSD || p.v24hUSD || p.volume24hUSD) {
            enriched.volume24h = parseFloat(
              p.volumeUSD ?? p.v24hUSD ?? p.volume24hUSD ?? "0"
            );
          }
        }
      } catch (e) {
        console.error(`Birdeye fetch failed for ${addr}:`, e);
      }

      // 3) Try known logo by symbol if we have one and don't have a logo yet
      if (tokenSymbolForMapping && (!enriched.logo || enriched.logo === "")) {
        const knownLogo = getKnownLogoBySymbol(tokenSymbolForMapping);
        if (knownLogo) {
          enriched.logo = knownLogo;
          console.log(`Using known logo for ${tokenSymbolForMapping}: ${knownLogo}`);
        }
      }

      // 4) Try CoinGecko for additional data and better logo
      if (!skipRemainingSteps) {
        try {
          const cgData = await fetchCoinGeckoTokenData(addr);
          if (cgData) {
            // Only overwrite fields if CoinGecko returned them
            if (cgData.price_usd) {
              enriched.price = parseFloat(cgData.price_usd || "0");
            }
            if (cgData.symbol) {
              enriched.symbol = cgData.symbol;
              tokenSymbolForMapping = cgData.symbol; // Update for logo lookup
              // Update our address to symbol mapping
              ADDRESS_TO_SYMBOL[addr] = cgData.symbol;
            }
            if (cgData.name) {
              enriched.name = cgData.name;
            }
            if (cgData.image_url && (!enriched.logo || enriched.logo === "")) {
              enriched.logo = cgData.image_url;
              console.log(`Using CoinGecko logo for ${addr}: ${enriched.logo}`);
              
              // Add to our mapping if we have a symbol
              if (tokenSymbolForMapping && !TOKEN_LOGO_MAPPING[tokenSymbolForMapping.toUpperCase()]) {
                TOKEN_LOGO_MAPPING[tokenSymbolForMapping.toUpperCase()] = enriched.logo;
                console.log(`Added dynamic mapping for ${tokenSymbolForMapping}: ${enriched.logo}`);
              }
            }
            if (cgData.decimals !== undefined) {
              enriched.decimals = cgData.decimals;
            }
            if (cgData.volume_usd?.h24) {
              enriched.volume24h = parseFloat(cgData.volume_usd.h24 || "0");
            }
            if (cgData.market_cap_usd) {
              enriched.marketCap = parseFloat(cgData.market_cap_usd || "0");
            }
          }
        } catch (e) {
          console.warn(`CoinGecko fetch failed for ${addr}:`, e);
        }
      }

      // 5) Try BirdEye token metadata endpoint if logo is still missing
      if (!enriched.logo || enriched.logo === "") {
        try {
          const logoUrl = await fetchTokenLogoFallback(addr, tokenSymbolForMapping);
          if (logoUrl) {
            enriched.logo = logoUrl;
            console.log(`Retrieved logo for ${addr} from fallback: ${logoUrl}`);
          }
        } catch (e) {
          console.warn(`Failed to get logo from fallback for ${addr}`, e);
        }
      }

      // 6) Fallback to BlockVision coin detail if we're still missing essential data
      if (!enriched.symbol || !enriched.name || !enriched.logo || enriched.logo === "") {
        try {
          const resp = await blockvisionService.getCoinDetail(addr);
          const detail = resp.data || resp.result;
          
          if (!enriched.symbol && detail.symbol) {
            enriched.symbol = detail.symbol;
            tokenSymbolForMapping = detail.symbol; // Update for logo lookup
            // Update our address to symbol mapping
            ADDRESS_TO_SYMBOL[addr] = detail.symbol;
          }
          
          if (!enriched.name && detail.name) {
            enriched.name = detail.name;
          }
          
          if ((!enriched.logo || enriched.logo === "") && detail.logo) {
            enriched.logo = sanitizeLogoUrl(detail.logo || "");
          }
          
          if (enriched.decimals === undefined && detail.decimals !== undefined) {
            enriched.decimals = detail.decimals;
          }
          
          // Try the logo mapping one more time now that we might have a symbol
          if ((!enriched.logo || enriched.logo === "") && tokenSymbolForMapping) {
            const knownLogo = getKnownLogoBySymbol(tokenSymbolForMapping);
            if (knownLogo) {
              enriched.logo = knownLogo;
              console.log(`Using known logo for ${tokenSymbolForMapping} after BlockVision: ${knownLogo}`);
            }
          }
        } catch {
          // swallow any errors
        }
      }

      // 7) Final defaults
      enriched.symbol = enriched.symbol || "Unknown";
      enriched.name = enriched.name || "Unknown Token";
      enriched.logo = enriched.logo || "";
      enriched.decimals = enriched.decimals ?? 9;
      enriched.price = enriched.price ?? 0;
      if (typeof enriched.price === "number") {
        enriched.price = enriched.price.toFixed(7);
      }

      // Cache this token's data
      tokenCacheService.cacheToken({
        address: addrLower,
        symbol: enriched.symbol,
        name: enriched.name,
        logo: enriched.logo,
        decimals: enriched.decimals,
      });
      
      // If we have both an address and symbol, update our mappings
      if (addr && enriched.symbol && enriched.logo) {
        // Update address to symbol mapping
        ADDRESS_TO_SYMBOL[addr] = enriched.symbol;
        // Update symbol to logo mapping
        if (!TOKEN_LOGO_MAPPING[enriched.symbol.toUpperCase()]) {
          TOKEN_LOGO_MAPPING[enriched.symbol.toUpperCase()] = enriched.logo;
        }
      }

      return { address: addrLower, data: enriched };
    },
    CONCURRENCY_DELAY_MS // Add ~22ms delay between requests to stay within rate limits
  );

  // Convert to map format
  enriched.forEach((item) => {
    metadataMap[item.address] = item.data;
  });

  // Get fresh prices for all tokens in a batch (including previously cached ones)
  // This is more efficient than making separate API calls during individual processing
  try {
    // Batch price requests - we can now do larger batches with the increased rate limit
    const batchSize = 25; // Increased from default smaller batches
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      const pricePromises = batch.map(async (addr, index) => {
        // Stagger requests slightly to avoid overwhelming the API
        if (index > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, CONCURRENCY_DELAY_MS)
          );
        }

        try {
          const addrLower = addr.toLowerCase();
          const resp = await birdeyeService.getPriceVolumeSingle(addr);
          if (resp?.data) {
            const price = parseFloat(
              resp.data.price ??
                resp.data.current_price ??
                resp.data.priceUSD ??
                resp.data.priceUsd ??
                "0"
            );

            // Update the price in our metadataMap if the token exists
            if (metadataMap[addrLower]) {
              metadataMap[addrLower].price = price.toFixed(7);
            }

            // Also update volume if available
            if (
              metadataMap[addrLower] &&
              (resp.data.volumeUSD ||
                resp.data.v24hUSD ||
                resp.data.volume24hUSD)
            ) {
              metadataMap[addrLower].volume24h = parseFloat(
                resp.data.volumeUSD ??
                  resp.data.v24hUSD ??
                  resp.data.volume24hUSD ??
                  "0"
              );
            }
          }
        } catch (e) {
          // Ignore individual price fetch errors
        }

        return addr;
      });

      // Wait for all price requests in this batch to complete
      await Promise.all(pricePromises);

      // Small delay between batches
      if (i + batchSize < addresses.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  } catch (e) {
    console.error("Error during batch price update:", e);
  }

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