import axios from "axios";

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

export interface AccountCoin {
  coinType: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
  verified: boolean;
  logo: string;
  usdValue: string;
  objects: number;
  price: string;
  priceChangePercentage24H: string;
}

export const blockvisionService = {
  getCoinDetail: async (coinType: string) => {
    try {
      const response = await blockvisionApi.get("/v2/sui/coin/detail", {
        params: { coinType },
      });
      const { code, message, result } = response.data;
      if (code === 200 && result) {
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

  getAccountCoins: async (account: string) => {
    try {
      console.log(`Fetching account coins for: ${account}`);
      const response = await blockvisionApi.get("/v2/sui/account/coins", {
        params: { account },
      });
      const { code, message, result } = response.data;
      console.log(`BlockVision API response code: ${code}`);
      if (code === 200 && result && Array.isArray(result.coins)) {
        return { data: result.coins as AccountCoin[] };
      } else {
        throw new Error(
          "Blockvision getAccountCoins error: unexpected response shape"
        );
      }
    } catch (error) {
      console.error("Error fetching account coins:", error);
      throw error;
    }
  },

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

  getWalletValue: async (account: string) => {
    try {
      const { data: coins } = await blockvisionService.getAccountCoins(account);
      if (!coins || !Array.isArray(coins)) {
        throw new Error("Invalid response format from getAccountCoins");
      }
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
