import axios from "axios";

// ===========================
// Birdeye API Configuration
// ===========================
const BIRDEYE_API_BASE_URL = "https://public-api.birdeye.so";
const BIRDEYE_API_KEY =
  import.meta.env.VITE_BIRDEYE_API_KEY || "22430f5885a74d3b97e7cbd01c2140aa";

// Create axios instance for Birdeye
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

// ===========================
// Blockvision API Configuration
// ===========================
const BLOCKVISION_API_BASE_URL = "https://api.blockvision.org";
const BLOCKVISION_API_KEY =
  import.meta.env.VITE_BLOCKVISION_API_KEY || "2ugIlviim3ywrgFI0BMniB9wdzU";

const blockvisionApi = axios.create({
  baseURL: BLOCKVISION_API_BASE_URL,
  headers: {
    accept: "application/json",
    "x-api-key": BLOCKVISION_API_KEY,
  },
});

// Blockvision error interceptor
blockvisionApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error(
      "Blockvision API Error:",
      error.response?.data || error.message
    );
    return Promise.reject(error);
  }
);

// ===========================
// Birdeye Service Functions (Supported Endpoints)
// ===========================
export const birdeyeService = {
  /**
   * Get trending tokens.
   * Endpoint: GET /defi/token_trending.
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
      return response.data;
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
      throw error;
    }
  },

  /**
   * Get full token list.
   * Endpoint: GET /defi/tokenlist.
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
      return response.data;
    } catch (error) {
      console.error("Error fetching token list:", error);
      throw error;
    }
  },

  /**
   * Get OHLCV chart data.
   * Endpoint: GET /defi/ohlcv.
   */
  getChartData: async (
    tokenAddress: string,
    type: string = "15m",
    currency: string = "usd",
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/ohlcv", {
        headers: { "x-chain": chain },
        params: { address: tokenAddress, type, currency },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching chart data:", error);
      throw error;
    }
  },

  /**
   * Get OHLCV candlestick chart data.
   * Endpoint: GET /defi/ohlcv
   * Used by chart.tsx for candlestick chart.
   */
  getCandlestickData: async (
    tokenAddress: string,
    type: string = "15m",
    currency: string = "usd",
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/ohlcv", {
        headers: { "x-chain": chain },
        params: { address: tokenAddress, type, currency },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching candlestick chart data:", error);
      throw error;
    }
  },

  /**
   * Get historical line chart data.
   * Endpoint: GET /defi/history_price
   * Used by chart.tsx for line chart.
   */
  getLineChartData: async (
    tokenAddress: string,
    type: string = "15m",
    chain: string = "sui"
  ) => {
    try {
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
          type,
          time_from,
          time_to: now,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching line chart data:", error);
      throw error;
    }
  },
};

// ===========================
// Blockvision Service Functions (For Wallet Data)
// ===========================
export const blockvisionService = {
  /**
   * Get coins and balances for a given Sui address.
   * Endpoint: GET /v2/sui/account/coins.
   */
  getAccountCoins: async (account: string) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/account/coins", {
        params: { account },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching account coins:", error);
      throw error;
    }
  },

  /**
   * Retrieve coin detail (metadata) for a given coin type.
   * Endpoint: GET /v2/sui/coin/detail.
   */
  getCoinDetail: async (coinType: string) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/coin/detail", {
        params: { coinType },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching coin detail:", error);
      throw error;
    }
  },
};
