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

// Birdeye error interceptor for logging
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

// Create axios instance for Blockvision
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
// Birdeye Service Functions (Supported endpoints)
// ===========================
export const birdeyeService = {
  /**
   * Get trending tokens (Birdeye).
   * Endpoint: GET /defi/token_trending (supports x-chain header).
   */
  getTrendingTokens: async (
    chain: string = "sui",
    limit: number = 20,
    offset: number = 0
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/token_trending", {
        headers: { "x-chain": chain }, // specify Sui chain&#8203;:contentReference[oaicite:4]{index=4}
        params: { sort_by: "rank", sort_type: "asc", offset, limit },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
      throw error;
    }
  },

  /**
   * Get full token list (Birdeye).
   * Endpoint: GET /defi/tokenlist (e.g. top tokens by volume/liquidity).
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
   * Get OHLCV price chart data for a token (Birdeye).
   * Endpoint: GET /defi/ohlcv (requires token address, interval type, currency).
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

  // ... (Other Birdeye V3 endpoints like getTokenMetadataBatch, getSingleTokenMetadata, etc. remain unchanged)

  // NOTE: Deprecated wallet methods removed:
  // getWalletTokenList and getWalletTokenBalance have been removed in favor of Blockvision APIs.
};

// ===========================
// Blockvision Service Functions (for Sui wallet data)
// ===========================
export const blockvisionService = {
  /**
   * Get all coins and balances for a Sui address.
   * Endpoint: GET /v2/sui/account/coins (Blockvision)&#8203;:contentReference[oaicite:5]{index=5}.
   * @param account Sui address (0x...) to fetch coin holdings for.
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
   * Get metadata and market details for a specific coin type.
   * Endpoint: GET /v2/sui/coin/detail (Blockvision)&#8203;:contentReference[oaicite:6]{index=6}.
   * @param coinType The coin type (address::module::struct) to get details for.
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

// (Removed duplicate export statement; the services are already exported as consts above)
