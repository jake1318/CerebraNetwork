import axios from "axios";

// API configuration
const BIRDEYE_API_BASE_URL = "https://public-api.birdeye.so";
const API_KEY = process.env.VITE_BIRDEYE_API_KEY || "";

// Create axios instance with common config
const birdeyeApi = axios.create({
  baseURL: BIRDEYE_API_BASE_URL,
  headers: {
    "X-API-KEY": API_KEY,
    "Content-Type": "application/json",
  },
});

// Error handling middleware
birdeyeApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("Birdeye API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// API endpoints
export const birdeyeService = {
  // Get wallet token list
  getWalletTokenList: async (address: string, chain: string = "sui") => {
    try {
      const response = await birdeyeApi.get(`/v1/wallet/token/list`, {
        params: { address, chain },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching wallet token list:", error);
      throw error;
    }
  },

  // Get wallet token balance
  getWalletTokenBalance: async (
    address: string,
    tokenAddress: string,
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get(`/v1/wallet/token/balance`, {
        params: { address, tokenAddress, chain },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching wallet token balance:", error);
      throw error;
    }
  },

  // Get trending tokens
  getTrendingTokens: async (chain: string = "sui", limit: number = 10) => {
    try {
      const response = await birdeyeApi.get(`/defi/token/trending`, {
        params: { chain, limit },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching trending tokens:", error);
      throw error;
    }
  },

  // Get token metadata for multiple tokens
  getTokenMetadata: async (tokenAddresses: string[], chain: string = "sui") => {
    try {
      const addresses = tokenAddresses.join(",");
      const response = await birdeyeApi.get(`/defi/token-list-data`, {
        params: { addresses, chain },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching token metadata:", error);
      throw error;
    }
  },

  // Get token metadata for a single token
  getSingleTokenMetadata: async (
    tokenAddress: string,
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get(`/defi/v3/token/meta/data/single`, {
        params: { tokenAddress, chain },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching single token metadata:", error);
      throw error;
    }
  },

  // Get full token list
  getTokenList: async (chain: string = "sui") => {
    try {
      const response = await birdeyeApi.get(`/defi/tokenlist`, {
        params: { chain },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching token list:", error);
      throw error;
    }
  },

  // Get OHLCV data for chart
  getChartData: async (
    tokenAddress: string,
    resolution: string = "1D",
    count: number = 100,
    chain: string = "sui"
  ) => {
    try {
      const response = await birdeyeApi.get(`/defi/ohlcv`, {
        params: {
          address: tokenAddress,
          resolution,
          count,
          chain,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching chart data:", error);
      throw error;
    }
  },
};

export default birdeyeService;
