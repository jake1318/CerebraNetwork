// src/services/birdeyeService.ts
import axios from "axios";

// ===========================
// Birdeye API Configuration
// ===========================
const BIRDEYE_API_BASE_URL = "https://public-api.birdeye.so";
const BIRDEYE_API_KEY =
  import.meta.env.VITE_BIRDEYE_API_KEY || "22430f5885a74d3b97e7cbd01c2140aa";

const birdeyeApi = axios.create({
  baseURL: BIRDEYE_API_BASE_URL,
  headers: {
    "X-API-KEY": BIRDEYE_API_KEY,
    "Content-Type": "application/json",
  },
});

// Birdeye error interceptor
birdeyeApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("Birdeye API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

/**
 * Map user-friendly timeframe (like '1h', '1d', '1w')
 * to Birdeye official format ('1H', '1D', '1W', etc.).
 * Fallback to '15m' if unrecognized.
 */
function normalizeHistoryType(input: string): string {
  const map: Record<string, string> = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "2h": "2H",
    "4h": "4H",
    "6h": "6H",
    "8h": "8H",
    "12h": "12H",
    "1d": "1D",
    "3d": "3D",
    "1w": "1W",
    // optionally map '1mth' => '1M' if you want a month timeframe
  };
  return map[input.toLowerCase()] || "15m";
}

export const birdeyeService = {
  /**
   * Get price/volume data for a single token.
   * Endpoint: GET /defi/price_volume/single
   */
  getPriceVolumeSingle: async (
    address: string,
    type: string = "24h",
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/price_volume/single", {
        headers: { "x-chain": chain },
        params: { address, type },
      });
      // shape: { success: boolean, data: {...} }
      const { success, data } = response.data;
      if (success && data) {
        return { data };
      }
      return { data: null };
    } catch (error) {
      console.error("Error fetching price/volume for token:", error);
      throw error;
    }
  },

  /**
   * Get trending tokens: GET /defi/token_trending
   */
  getTrendingTokens: async (
    chain: string = "sui",
    limit: number = 20,
    offset: number = 0
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/token_trending", {
        headers: { "x-chain": chain },
        params: { sort_by: "rank", sort_type: "asc", offset, limit },
      });
      const { success, data } = response.data;
      if (success && data) {
        return { data };
      }
      return { data: null };
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
      throw error;
    }
  },

  /**
   * Get full token list: GET /defi/tokenlist
   */
  getTokenList: async (chain: string = "sui") => {
    try {
      const response = await birdeyeApi.get("/defi/tokenlist", {
        headers: { "x-chain": chain },
        params: {
          sort_by: "v24hUSD",
          sort_type: "desc",
          offset: 0,
          limit: 50,
          min_liquidity: 100,
        },
      });
      const { success, data } = response.data;
      if (success && data) {
        return { data };
      }
      return { data: null };
    } catch (error) {
      console.error("Error fetching token list:", error);
      throw error;
    }
  },

  /**
   * Get OHLCV (candlestick) chart data: GET /defi/ohlcv
   */
  getCandlestickData: async (
    tokenAddress: string,
    type: string = "15m",
    currency: string = "usd",
    chain: string = "sui"
  ) => {
    try {
      // Normalize the 'type' to uppercase Birdeye format
      const normalizedType = normalizeHistoryType(type);

      const response = await birdeyeApi.get("/defi/ohlcv", {
        headers: { "x-chain": chain },
        params: { address: tokenAddress, type: normalizedType, currency },
      });
      const { success, data } = response.data;
      if (success && data) {
        return { data };
      }
      return { data: null };
    } catch (error) {
      console.error("Error fetching candlestick chart data:", error);
      throw error;
    }
  },

  /**
   * Get historical line chart data: GET /defi/history_price
   */
  getLineChartData: async (
    tokenAddress: string,
    type: string = "15m",
    chain: string = "sui"
  ) => {
    try {
      // Normalize the user-friendly timeframe (e.g. '1h' -> '1H')
      const normalizedType = normalizeHistoryType(type);

      // Keep your existing logic for calculating time_from
      const now = Math.floor(Date.now() / 1000);
      const durationMap: Record<string, number> = {
        "1m": 60 * 60,
        "5m": 60 * 60 * 3,
        "15m": 60 * 60 * 6,
        "30m": 60 * 60 * 12,
        "1h": 60 * 60 * 24, // note: your code uses '1h' key
        "4h": 60 * 60 * 24 * 2,
        "1d": 60 * 60 * 24 * 7,
        "1w": 60 * 60 * 24 * 30,
      };
      const secondsAgo = durationMap[type] || 60 * 60 * 24;
      const time_from = now - secondsAgo;

      const response = await birdeyeApi.get("/defi/history_price", {
        headers: { "x-chain": chain },
        params: {
          address: tokenAddress,
          address_type: "token",
          type: normalizedType,
          time_from,
          time_to: now,
        },
      });

      const { success, data } = response.data;
      if (success && data) {
        return { data };
      }
      return { data: null };
    } catch (error) {
      console.error("Error fetching line chart data:", error);
      throw error;
    }
  },
};
