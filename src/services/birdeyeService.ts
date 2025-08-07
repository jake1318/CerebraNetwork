// src/services/birdeyeService.ts
// Last Updated: 2025-08-07 01:59:21 UTC by jake1318

import axios from "axios";

const DEFAULT_CHAIN = "sui";
// Updated to use port 5000 for the backend server
const LOCAL_API_BASE = "http://localhost:5000/api";
const BIRDEYE_API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY || "";
const BIRDEYE_BASE_URL = "https://public-api.birdeye.so/defi";
const MAX_REQUESTS_PER_SECOND = 45; // Using 45 out of 50 to leave some safety margin

// Track if local server is available (start with false, will try once)
let isLocalServerAvailable = false;
let hasCheckedLocalServer = false;

/**
 * Birdeye requires the 64‑byte canonical object address (0x + 64 hex chars).
 * This helper expands any short Sui address *inside* a type‑tag, e.g.
 *   0x2::sui::SUI  →  0x000…0002::sui::SUI
 *   0x2            →  0x000…0002
 */
export function canonicaliseSuiAddress(addr: string): string {
  if (!addr.startsWith("0x")) return addr; // nothing to do

  // split at the first "::"  (addr may just be the object address)
  const [head, ...rest] = addr.split("::");
  const raw = head.slice(2).toLowerCase(); // drop "0x"
  const full = "0x" + raw.padStart(64, "0");

  return rest.length ? [full, ...rest].join("::") : full;
}

/**
 * BirdEye needs the *object id* only (66‑char 0x… string).
 * stripTypeTag("0x2::sui::SUI") → "0x000…0002"
 */
export function stripTypeTag(addr: string): string {
  // grab the part *before* the first '::' and canonicalise it
  const [head] = addr.split("::");
  return canonicaliseSuiAddress(head);
}

export interface BirdeyeTrendingToken {
  address: string; // KEEP original case!
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
  price: number;
  price24hChangePercent?: number;
}

export interface BirdeyeListToken {
  address: string; // KEEP original case!
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
  v24hUSD: number;
  v24hChangePercent: number;
}

// Updated to include all possible volume field names
export interface PriceVolumeSingle {
  price?: number | string;
  volumeUSD?: number | string;
  volume24hUSD?: number | string;
  v24hUSD?: number | string;
  high24h?: number | string;
  low24h?: number | string;
  data?: {
    volumeUSD?: number | string;
    volume24hUSD?: number | string;
    volume?: number | string;
    high24h?: number | string;
    low24h?: number | string;
    price?: number | string;
  };
}

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  extensions?: {
    twitter?: string;
    website?: string;
    telegram?: string | null;
  };
  logo_uri?: string;
  logoUrl?: string;
  logoURI?: string;
  logo?: string;
}

/**
 * Token metadata cache to avoid redundant API calls
 */
const tokenMetadataCache: Record<string, TokenMetadata> = {};

/**
 * Simple rate limiter
 */
class RateLimiter {
  private queue: (() => Promise<void>)[] = [];
  private running = false;
  private requestTimestamps: number[] = [];
  private maxRequestsPerSecond: number;

  constructor(maxRequestsPerSecond: number) {
    this.maxRequestsPerSecond = maxRequestsPerSecond;
  }

  async schedule<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          await this.waitForRateLimit();
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running || this.queue.length === 0) return;

    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        await task();
      }
    }

    this.running = false;
  }

  private async waitForRateLimit() {
    const now = Date.now();

    // Remove timestamps older than 1 second
    this.requestTimestamps = this.requestTimestamps.filter(
      (timestamp) => now - timestamp < 1000
    );

    if (this.requestTimestamps.length >= this.maxRequestsPerSecond) {
      // Calculate how long we need to wait
      const oldestTimestamp = this.requestTimestamps[0];
      const waitTime = 1000 - (now - oldestTimestamp);

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    // Add current timestamp to the list
    this.requestTimestamps.push(Date.now());
  }
}

// Create a rate limiter instance with the new limit
const rateLimiter = new RateLimiter(MAX_REQUESTS_PER_SECOND);

// Function to check if local server is available
async function checkLocalServer() {
  if (hasCheckedLocalServer) {
    return isLocalServerAvailable;
  }

  try {
    console.log("Checking local server availability at", LOCAL_API_BASE);
    const response = await fetch(`${LOCAL_API_BASE}/test`, {
      signal: AbortSignal.timeout(2000), // 2 second timeout
    });
    isLocalServerAvailable = response.ok;
    console.log(
      `Local server ${isLocalServerAvailable ? "is" : "is NOT"} available`
    );
  } catch (e) {
    console.warn("Local server check failed:", e);
    isLocalServerAvailable = false;
    console.warn(
      "Local server not available, will use direct Birdeye API calls"
    );
  }

  hasCheckedLocalServer = true;
  return isLocalServerAvailable;
}

// Call this once when the module loads
checkLocalServer();

/**
 * Get token metadata from Birdeye API with rate limiting
 * Export this function so it can be imported by other services
 */
export async function getTokenMetadata(
  tokenAddress: string
): Promise<TokenMetadata | null> {
  // Check cache first
  if (tokenMetadataCache[tokenAddress]) {
    return tokenMetadataCache[tokenAddress];
  }

  return rateLimiter.schedule(async () => {
    try {
      // Encode the token address properly for the URL, using the canonicalized address
      const encodedAddress = encodeURIComponent(
        canonicaliseSuiAddress(tokenAddress)
      );

      let response;

      // Try using local server if available, otherwise use direct Birdeye API
      if (await checkLocalServer()) {
        try {
          response = await fetch(
            `${LOCAL_API_BASE}/token_metadata?address=${encodedAddress}`,
            {
              method: "GET",
              headers: {
                accept: "application/json",
                "x-chain": "sui",
              },
              // Short timeout to quickly detect if local server is unavailable
              signal: AbortSignal.timeout(3000),
            }
          );
        } catch (localError) {
          console.warn(
            "Local server request failed, falling back to direct API call"
          );
          // Fall back to direct API call
          response = await fetch(
            `${BIRDEYE_BASE_URL}/v3/token/meta-data/single?address=${encodedAddress}`,
            {
              method: "GET",
              headers: {
                accept: "application/json",
                "x-chain": "sui",
                "X-API-KEY": BIRDEYE_API_KEY,
              },
            }
          );
        }
      } else {
        // We already know local server is unavailable, go direct
        response = await fetch(
          `${BIRDEYE_BASE_URL}/v3/token/meta-data/single?address=${encodedAddress}`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              "x-chain": "sui",
              "X-API-KEY": BIRDEYE_API_KEY,
            },
          }
        );
      }

      if (!response.ok) {
        console.warn(
          `Birdeye API error for ${tokenAddress}: ${response.status}`
        );
        return null;
      }

      const responseData = await response.json();

      if (responseData.success && responseData.data) {
        // Process and standardize the metadata format
        const metadata: TokenMetadata = {
          address: responseData.data.address,
          name: responseData.data.name,
          symbol: responseData.data.symbol,
          decimals: responseData.data.decimals,
          extensions: responseData.data.extensions || {},
          // Copy the logo_uri to all logo properties
          logo_uri: responseData.data.logo_uri || "",
          logoUrl: responseData.data.logo_uri || "",
          logoURI: responseData.data.logo_uri || "",
          logo: responseData.data.logo_uri || "",
        };

        // Cache the result
        tokenMetadataCache[tokenAddress] = metadata;
        return metadata;
      }

      return null;
    } catch (error) {
      console.error(
        `Failed to fetch metadata for token ${tokenAddress}:`,
        error
      );
      return null;
    }
  });
}

/**
 * Get metadata for multiple tokens at once in batches
 * Export this function so it can be imported by other services
 */
export async function getMultipleTokenMetadata(
  tokenAddresses: string[]
): Promise<Record<string, TokenMetadata>> {
  console.log(
    `getMultipleTokenMetadata called with ${tokenAddresses.length} addresses`
  );
  const result: Record<string, TokenMetadata> = {};
  // Updated batch size to process more tokens concurrently
  const batchSize = 15; // Increased from 5 to 15 with the higher rate limit

  // Filter out tokens we already have in cache
  const uncachedAddresses = tokenAddresses.filter(
    (addr) => !tokenMetadataCache[addr]
  );

  if (uncachedAddresses.length === 0) {
    // All tokens are already in cache
    console.log("All tokens are already in cache");
    tokenAddresses.forEach((addr) => {
      if (tokenMetadataCache[addr]) {
        result[addr] = tokenMetadataCache[addr];
      }
    });
    return result;
  }

  console.log(
    `Fetching metadata for ${uncachedAddresses.length} tokens in batches of ${batchSize}`
  );

  // Process in batches
  for (let i = 0; i < uncachedAddresses.length; i += batchSize) {
    const batch = uncachedAddresses.slice(i, i + batchSize);

    // Show progress
    console.log(
      `Processing batch ${i / batchSize + 1}/${Math.ceil(
        uncachedAddresses.length / batchSize
      )}`
    );

    // Process batch with Promise.all
    const batchResults = await Promise.all(
      batch.map(async (address) => {
        const metadata = await getTokenMetadata(address);
        if (metadata) {
          result[address] = metadata;
        }
        return { address, metadata };
      })
    );

    // Log success/failure counts
    const success = batchResults.filter((r) => r.metadata !== null).length;
    console.log(`Batch completed: ${success}/${batch.length} successful`);
  }

  // Add cached tokens to the result
  tokenAddresses.forEach((addr) => {
    if (tokenMetadataCache[addr] && !result[addr]) {
      result[addr] = tokenMetadataCache[addr];
    }
  });

  console.log(
    `Final result has metadata for ${Object.keys(result).length} tokens`
  );
  // Log some sample results for debugging
  if (Object.keys(result).length > 0) {
    const sampleAddress = Object.keys(result)[0];
    console.log(`Sample metadata for ${sampleAddress}:`, result[sampleAddress]);
  }

  return result;
}

export const birdeyeService = {
  /**
   * GET /api/token_trending
   * Returns the top trending tokens (with their current price).
   */
  async getTrendingTokens(
    chain: string = DEFAULT_CHAIN,
    limit = 20,
    offset = 0
  ): Promise<BirdeyeTrendingToken[]> {
    try {
      // Check if we need to use direct API
      if (!(await checkLocalServer())) {
        // Use direct Birdeye API
        const resp = await axios.get(`${BIRDEYE_BASE_URL}/token_trending`, {
          headers: {
            "x-chain": chain,
            "X-API-KEY": BIRDEYE_API_KEY,
          },
          params: { sort_by: "rank", sort_type: "asc", limit, offset },
        });
        if (!resp.data.success || !resp.data.data?.tokens) return [];

        return resp.data.data.tokens.map((t: any) => ({
          address: t.address, // ← no .toLowerCase()
          symbol: t.symbol,
          name: t.name,
          logoURI: t.logoURI || t.logo_uri || "",
          decimals: t.decimals,
          price: Number(t.price),
          price24hChangePercent: t.price24hChangePercent,
        }));
      }

      // Use local server
      const resp = await axios.get(`${LOCAL_API_BASE}/token_trending`, {
        headers: { "x-chain": chain },
        params: { sort_by: "rank", sort_type: "asc", limit, offset },
      });
      if (!resp.data.success || !resp.data.data?.tokens) return [];

      return resp.data.data.tokens.map((t: any) => ({
        address: t.address, // ← no .toLowerCase()
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI || t.logo_uri || "",
        decimals: t.decimals,
        price: Number(t.price),
        price24hChangePercent: t.price24hChangePercent,
      }));
    } catch (err) {
      console.error("birdeyeService.getTrendingTokens:", err);
      return [];
    }
  },

  /**
   * GET /api/tokenlist
   * Returns the top tokens by 24h volume.
   * Note: this endpoint does not return a spot price—you can call getPriceVolumeSingle().
   */
  async getTokenList(
    chain: string = DEFAULT_CHAIN,
    limit = 50,
    offset = 0,
    min_liquidity = 100
  ): Promise<BirdeyeListToken[]> {
    try {
      // Check if we need to use direct API
      if (!(await checkLocalServer())) {
        // Use direct Birdeye API
        const resp = await axios.get(`${BIRDEYE_BASE_URL}/tokenlist`, {
          headers: {
            "x-chain": chain,
            "X-API-KEY": BIRDEYE_API_KEY,
          },
          params: {
            sort_by: "v24hUSD",
            sort_type: "desc",
            offset,
            limit,
            min_liquidity,
          },
        });
        if (!resp.data.success || !resp.data.data?.tokens) return [];

        return resp.data.data.tokens.map((t: any) => ({
          address: t.address, // ← no .toLowerCase()
          symbol: t.symbol,
          name: t.name,
          logoURI: t.logoURI || t.logo_uri || "",
          decimals: t.decimals,
          v24hUSD: Number(t.v24hUSD),
          v24hChangePercent: Number(t.v24hChangePercent),
        }));
      }

      // Use local server
      const resp = await axios.get(`${LOCAL_API_BASE}/tokenlist`, {
        headers: { "x-chain": chain },
        params: {
          sort_by: "v24hUSD",
          sort_type: "desc",
          offset,
          limit,
          min_liquidity,
        },
      });
      if (!resp.data.success || !resp.data.data?.tokens) return [];

      return resp.data.data.tokens.map((t: any) => ({
        address: t.address, // ← no .toLowerCase()
        symbol: t.symbol,
        name: t.name,
        logoURI: t.logoURI || t.logo_uri || "",
        decimals: t.decimals,
        v24hUSD: Number(t.v24hUSD),
        v24hChangePercent: Number(t.v24hChangePercent),
      }));
    } catch (err) {
      console.error("birdeyeService.getTokenList:", err);
      return [];
    }
  },

  /**
   * GET /api/price_volume/single
   * Fetches the current spot price (and volume) for a single token.
   */
  async getPriceVolumeSingle(
    address: string,
    type: string = "24h",
    chain: string = DEFAULT_CHAIN
  ): Promise<PriceVolumeSingle | null> {
    try {
      const apiUrl = (await checkLocalServer())
        ? `${LOCAL_API_BASE}/price_volume/single`
        : `${BIRDEYE_BASE_URL}/price_volume/single`;

      const headers = (await checkLocalServer())
        ? { "x-chain": chain }
        : { "x-chain": chain, "X-API-KEY": BIRDEYE_API_KEY };

      const resp = await axios.get(apiUrl, {
        headers: headers,
        params: { address: stripTypeTag(address), type },
      });

      // Enhanced logging to debug response format
      console.log(`getPriceVolumeSingle response for ${address}:`, resp.data);

      if (!resp.data.success) {
        console.warn(`API returned failure for ${address}:`, resp.data);
        return null;
      }

      // Return the whole data object to handle different response formats
      return resp.data.data as PriceVolumeSingle;
    } catch (err) {
      console.error("birdeyeService.getPriceVolumeSingle:", err);
      return null;
    }
  },

  /**
   * GET /api/history_price
   * Returns historical price points for charting.
   */
  async getLineChartData(
    address: string,
    type: string = "1d",
    chain: string = DEFAULT_CHAIN
  ): Promise<any[]> {
    const now = Math.floor(Date.now() / 1000);
    const spanMap: Record<string, number> = {
      "1m": 3600,
      "5m": 3600 * 3,
      "15m": 3600 * 6,
      "1h": 3600 * 24,
      "1d": 3600 * 24 * 7,
      "1w": 3600 * 24 * 30,
    };
    const time_from = now - (spanMap[type] || spanMap["1d"]);

    try {
      const apiUrl = (await checkLocalServer())
        ? `${LOCAL_API_BASE}/history_price`
        : `${BIRDEYE_BASE_URL}/history_price`;

      const headers = (await checkLocalServer())
        ? { "x-chain": chain }
        : { "x-chain": chain, "X-API-KEY": BIRDEYE_API_KEY };

      const resp = await axios.get(apiUrl, {
        headers: headers,
        params: {
          address: stripTypeTag(address),
          address_type: "token",
          type,
          time_from,
          time_to: now,
        },
      });
      if (!resp.data.success || !Array.isArray(resp.data.data)) return [];
      return resp.data.data;
    } catch (err) {
      console.error("birdeyeService.getLineChartData:", err);
      return [];
    }
  },

  /**
   * Get token metadata from Birdeye API
   * Method version that delegates to the standalone function
   */
  getTokenMetadata,

  /**
   * Get metadata for multiple tokens at once in batches
   * Method version that delegates to the standalone function
   */
  getMultipleTokenMetadata,
};
