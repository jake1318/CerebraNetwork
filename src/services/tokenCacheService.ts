/**
 * Token Cache Service
 *
 * This service provides functionality for caching token information
 * (logos, tickers, addresses) in the browser's localStorage.
 * It helps display token information immediately while price data is being fetched.
 */

// Type definition for cached token data
export interface CachedTokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  lastUpdated: number; // timestamp when the cache was last updated
}

const CACHE_KEY_PREFIX = "cerebra_token_cache_";
const CACHE_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Save token data to the cache
 */
export const cacheToken = (token: Omit<CachedTokenData, "lastUpdated">) => {
  try {
    const cachedData: CachedTokenData = {
      ...token,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(
      `${CACHE_KEY_PREFIX}${token.address.toLowerCase()}`,
      JSON.stringify(cachedData)
    );
    return true;
  } catch (error) {
    console.error("Error caching token data:", error);
    return false;
  }
};

/**
 * Cache multiple tokens at once
 */
export const cacheTokens = (
  tokens: Array<Omit<CachedTokenData, "lastUpdated">>
) => {
  try {
    tokens.forEach((token) => cacheToken(token));
    return true;
  } catch (error) {
    console.error("Error caching tokens:", error);
    return false;
  }
};

/**
 * Get a token from cache by address
 */
export const getTokenFromCache = (address: string): CachedTokenData | null => {
  try {
    const cachedData = localStorage.getItem(
      `${CACHE_KEY_PREFIX}${address.toLowerCase()}`
    );
    if (!cachedData) return null;

    const parsedData: CachedTokenData = JSON.parse(cachedData);

    // Check if cache has expired
    if (Date.now() - parsedData.lastUpdated > CACHE_EXPIRY) {
      localStorage.removeItem(`${CACHE_KEY_PREFIX}${address.toLowerCase()}`);
      return null;
    }

    return parsedData;
  } catch (error) {
    console.error("Error retrieving token from cache:", error);
    return null;
  }
};

/**
 * Get all cached tokens
 */
export const getAllCachedTokens = (): CachedTokenData[] => {
  try {
    const tokens: CachedTokenData[] = [];
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        const cachedData = localStorage.getItem(key);
        if (cachedData) {
          const parsedData: CachedTokenData = JSON.parse(cachedData);

          // Check if cache has expired
          if (now - parsedData.lastUpdated <= CACHE_EXPIRY) {
            tokens.push(parsedData);
          } else {
            localStorage.removeItem(key);
          }
        }
      }
    }

    return tokens;
  } catch (error) {
    console.error("Error retrieving cached tokens:", error);
    return [];
  }
};

/**
 * Clear all cached tokens
 */
export const clearTokenCache = () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_KEY_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
    return true;
  } catch (error) {
    console.error("Error clearing token cache:", error);
    return false;
  }
};

export default {
  cacheToken,
  cacheTokens,
  getTokenFromCache,
  getAllCachedTokens,
  clearTokenCache,
};
