import axios from "axios";
import blockvisionService from "./blockvisionService";

const BIRDEYE_API_BASE_URL = "https://public-api.birdeye.so";
const BIRDEYE_API_KEY =
  import.meta.env.VITE_BIRDEYE_API_KEY || "22430f5885a74d3b97e7cbd01c2140aa";

// Axios instance for BirdEye API
const birdeyeApi = axios.create({
  baseURL: BIRDEYE_API_BASE_URL,
  headers: {
    "X-API-KEY": BIRDEYE_API_KEY,
    "Content-Type": "application/json",
  },
});

// Response interceptor for logging BirdEye API errors
birdeyeApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("Birdeye API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Normalize history type for candlestick and line chart requests
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
  };
  return map[input.toLowerCase()] || "15m";
}

export const birdeyeService = {
  /**
   * Get price/volume data for a single token (includes token metadata).
   * Endpoint: GET /defi/price_volume/single
   */
  getPriceVolumeSingle: async (
    address: string,
    type: string = "24h",
    chain: string = "sui"
  ) => {
    try {
      // Axios will encode the address automatically in params
      const response = await birdeyeApi.get("/defi/price_volume/single", {
        headers: { "x-chain": chain },
        params: { address, type },
      });
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
   * Get trending tokens list (with logo, symbol, name, price, etc).
   * Endpoint: GET /defi/token_trending
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
   * Get a comprehensive token list with metadata (filtered by liquidity/volume).
   * Endpoint: GET /defi/tokenlist
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
   * Get OHLCV candlestick data for a token.
   * Endpoint: GET /defi/ohlcv
   */
  getCandlestickData: async (
    tokenAddress: string,
    type: string = "15m",
    currency: string = "usd",
    chain: string = "sui"
  ) => {
    try {
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
      console.error("Error fetching candlestick data:", error);
      throw error;
    }
  },

  /**
   * Get historical price data for a token (line chart).
   * Endpoint: GET /defi/history_price
   */
  getLineChartData: async (
    tokenAddress: string,
    type: string = "15m",
    chain: string = "sui"
  ) => {
    try {
      const normalizedType = normalizeHistoryType(type);
      const now = Math.floor(Date.now() / 1000);
      const durationMap: Record<string, number> = {
        "1m": 60 * 60,
        "5m": 60 * 60 * 3,
        "15m": 60 * 60 * 6,
        "30m": 60 * 60 * 12,
        "1h": 60 * 60 * 24,
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
      console.error("Error fetching historical price data:", error);
      throw error;
    }
  },

  /**
   * Get metadata (logo, symbol, name, decimals, price) for a single token.
   * Uses BirdEye's price_volume endpoint for the token.
   */
  getSingleTokenMetadata: async (address: string, chain: string = "sui") => {
    try {
      const response = await birdeyeApi.get("/defi/price_volume/single", {
        headers: { "x-chain": chain },
        params: { address, type: "24h" },
      });
      const { success, data } = response.data;
      if (success && data) {
        return { data };
      }
      return { data: null };
    } catch (error) {
      console.error("Error fetching token metadata:", error);
      throw error;
    }
  },

  /**
   * Get all tokens (with metadata and balances) held by a given wallet address.
   * Leverages Blockvision API to batch-fetch the wallet's token list.
   */
  getWalletTokenList: async (walletAddress: string) => {
    try {
      const resp = await blockvisionService.getAccountCoins(walletAddress);
      // Blockvision returns an array of coin objects in resp.data (or resp.result)
      const coins = resp.data || resp.result || [];
      return { data: coins };
    } catch (error) {
      console.error("Error fetching wallet tokens:", error);
      throw error;
    }
  },
};
