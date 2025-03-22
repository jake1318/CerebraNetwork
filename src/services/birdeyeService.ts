import axios from "axios";

// ===========================
// Birdeye API Configuration
// ===========================
const BIRDEYE_API_BASE_URL = "https://public-api.birdeye.so";
const BIRDEYE_API_KEY = import.meta.env.VITE_BIRDEYE_API_KEY || "";

// Create axios instance for Birdeye
const birdeyeApi = axios.create({
  baseURL: BIRDEYE_API_BASE_URL,
  headers: {
    "X-API-KEY": BIRDEYE_API_KEY,
    "Content-Type": "application/json",
  },
});

// Birdeye error handling middleware
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
  import.meta.env.VITE_BLOCKVISION_API_KEY || "2ugIlviim3ywrgFI0BMniB9wdzU"; // Replace with your key if needed

// Create axios instance for Blockvision
const blockvisionApi = axios.create({
  baseURL: BLOCKVISION_API_BASE_URL,
  headers: {
    accept: "application/json",
    "x-api-key": BLOCKVISION_API_KEY,
  },
});

// Blockvision error handling middleware
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
// Birdeye Service Functions
// ===========================
export const birdeyeService = {
  /**
   * Get wallet token list.
   * Endpoint: GET /v1/wallet/token_list.
   */
  getWalletTokenList: async (address: string, chain: string = "sui") => {
    try {
      const response = await birdeyeApi.get("/v1/wallet/token_list", {
        headers: { "x-chain": chain },
        params: { address },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching wallet token list:", error);
      throw error;
    }
  },

  /**
   * Get wallet token balance.
   * Endpoint: GET /v1/wallet/token_balance.
   * Note: token address is passed as token_address.
   */
  getWalletTokenBalance: async (
    address: string,
    tokenAddress: string,
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get("/v1/wallet/token_balance", {
        headers: { "x-chain": chain },
        params: { address, token_address: tokenAddress },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching wallet token balance:", error);
      throw error;
    }
  },

  /**
   * Get trending tokens.
   * Endpoint: GET /defi/token_trending.
   * Query defaults: sort_by=rank, sort_type=asc, offset=0, limit=20.
   */
  getTrendingTokens: async (
    chain: string = "sui",
    limit: number = 20,
    offset: number = 0
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/token_trending", {
        headers: { "x-chain": chain },
        params: {
          sort_by: "rank",
          sort_type: "asc",
          offset,
          limit,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
      throw error;
    }
  },

  /**
   * Get token metadata for multiple tokens using the V3 Token List endpoint.
   * Endpoint: GET /defi/v3/token/list.
   * Pass any additional query parameters via queryParams.
   */
  getTokenMetadataBatch: async (
    queryParams: Record<string, any>,
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/v3/token/list", {
        headers: { "x-chain": chain },
        params: queryParams,
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching token metadata batch:", error);
      throw error;
    }
  },

  /**
   * Get token metadata for a single token.
   * Endpoint: GET /defi/v3/token/meta-data/single.
   * Query parameter: address=<TOKEN_ADDRESS>.
   */
  getSingleTokenMetadata: async (
    tokenAddress: string,
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/v3/token/meta-data/single", {
        headers: { "x-chain": chain },
        params: { address: tokenAddress },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching single token metadata:", error);
      throw error;
    }
  },

  /**
   * Get token market data for a single token.
   * Endpoint: GET /defi/v3/token/market-data.
   * Query parameter: address=<TOKEN_ADDRESS>.
   */
  getSingleTokenMarketData: async (
    tokenAddress: string,
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get("/defi/v3/token/market-data", {
        headers: { "x-chain": chain },
        params: { address: tokenAddress },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching single token market data:", error);
      throw error;
    }
  },

  /**
   * Get full token list (V1).
   * Endpoint: GET /defi/tokenlist.
   * Query: sort_by=v24hUSD, sort_type=desc, offset=0, limit=50, min_liquidity=100.
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
   * Get OHLCV data for chart.
   * Endpoint: GET /defi/ohlcv.
   * Sample query: address=<TOKEN_ADDRESS>&type=15m&currency=usd.
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
        params: {
          address: tokenAddress,
          type,
          currency,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching chart data:", error);
      throw error;
    }
  },
};

// ===========================
// Blockvision Service Functions
// ===========================
export const blockvisionService = {
  /**
   * Retrieve account activities (wallet balances) from Blockvision.
   * Endpoint: GET /v2/sui/account/activities.
   * Requires query parameters: address and packageIds.
   */
  getAccountActivities: async (
    address: string,
    packageIds: string // comma-separated list
  ) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/account/activities", {
        params: { address, packageIds },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching account activities:", error);
      throw error;
    }
  },

  /**
   * Retrieve coin detail (coin metadata) from Blockvision.
   * Endpoint: GET /v2/sui/coin/detail.
   * Query parameter: coinType.
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

export { birdeyeService, blockvisionService };
