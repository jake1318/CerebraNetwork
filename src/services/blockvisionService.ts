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

// Define interface for Account Coin data returned by Blockvision API
export interface AccountCoin {
  coinType: string; // The unique cointype of a coin with '0x' as prefix
  name: string; // The name from metadata of the coin
  symbol: string; // The symbol from metadata of the coin
  decimals: number; // The decimals from metadata of the coin
  balance: string; // The amount of the respective coin held by provided account
  verified: boolean; // Whether the coin has been verified on SuiVision
  logo: string; // The logo url from metadata of the coin
  usdValue: string; // The USD value of the coin
  objects: number; // The number of objects for each respective coin
  price: string; // The current price of a coin in USD
  priceChangePercentage24H: string; // Percentage change in price over the last 24 hours
}

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
   *
   * @param {string} account - A 32 Byte address with '0x' as prefix
   * @returns {Promise<{ data: AccountCoin[] }>} Array of coins with balances and metadata
   */
  getAccountCoins: async (account: string) => {
    try {
      console.log(`Fetching account coins for: ${account}`);
      const response = await blockvisionApi.get("/v2/sui/account/coins", {
        params: { account },
      });
      // shape: { code: <number>, message: <string>, result: [...] }
      const { code, message, result } = response.data;

      console.log(`BlockVision API response code: ${code}`);

      if (code === 200 && result) {
        // Return the array of account coins with proper typing
        return { data: result as AccountCoin[] };
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

  /**
   * Calculate total wallet value in USD
   * Helper function that uses getAccountCoins and sums up the usdValue
   *
   * @param {string} account - A Sui wallet address
   * @returns {Promise<{ totalUsdValue: string, coins: AccountCoin[] }>}
   */
  getWalletValue: async (account: string) => {
    try {
      const { data: coins } = await blockvisionService.getAccountCoins(account);

      if (!coins || !Array.isArray(coins)) {
        throw new Error("Invalid response format from getAccountCoins");
      }

      // Calculate total USD value of all coins
      const totalUsdValue = coins
        .reduce((sum, coin) => {
          const usdValue = parseFloat(coin.usdValue || "0");
          return sum + usdValue;
        }, 0)
        .toFixed(2);

      return {
        totalUsdValue,
        coins,
      };
    } catch (error) {
      console.error("Error calculating wallet value:", error);
      throw error;
    }
  },
};

export default blockvisionService;
