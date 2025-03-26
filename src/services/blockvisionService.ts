// src/services/blockvisionService.ts
import axios from "axios";

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

// Interceptor for logging errors
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

export const blockvisionService = {
  /**
   * Retrieve coin detail (metadata) for a given coinType.
   * Endpoint: GET /v2/sui/coin/detail
   *
   * Returns { data: { ...coin fields... } }
   */
  getCoinDetail: async (coinType: string) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/coin/detail", {
        params: { coinType },
      });
      // shape: { code: 200, message: 'OK', result: {...} }
      const { code, message, result } = response.data;
      if (code === 200 && result) {
        // Return an object with 'data' so Dex.tsx can do if(resp && resp.data).
        return { data: result };
      } else {
        throw new Error(
          `Blockvision getCoinDetail error: code=${code}, msg=${message}`
        );
      }
    } catch (error) {
      console.error(`Error fetching coin detail for ${coinType}:`, error);
      throw error;
    }
  },

  /**
   * Get coins/balances for a given Sui address.
   * Endpoint: GET /v2/sui/account/coins
   */
  getAccountCoins: async (account: string) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/account/coins", {
        params: { account },
      });
      // shape: { code: <number>, message: <string>, result: [...] }
      const { code, message, result } = response.data;
      if (code === 200 && result) {
        return { data: result };
      } else {
        throw new Error(
          `Blockvision getAccountCoins error: code=${code}, msg=${message}`
        );
      }
    } catch (error) {
      console.error("Error fetching account coins:", error);
      throw error;
    }
  },

  /**
   * Get account activities for a given address & optional packageIds.
   * Endpoint: GET /v2/sui/account/activities
   */
  getAccountActivities: async (address: string, packageIds: string[] = []) => {
    try {
      const packageIdsParam = packageIds.length ? packageIds.join(",") : "";
      const response = await blockvisionApi.get("/v2/sui/account/activities", {
        params: { address, packageIds: packageIdsParam },
      });
      const { code, message, result } = response.data;
      if (code === 200 && result) {
        return { data: result };
      } else {
        throw new Error(
          `Blockvision getAccountActivities error: code=${code}, msg=${message}`
        );
      }
    } catch (error) {
      console.error("Error fetching account activities:", error);
      throw error;
    }
  },
};

export default blockvisionService;
