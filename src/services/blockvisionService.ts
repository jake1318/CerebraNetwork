// src/services/blockvisionService.ts

const API_KEY = "2ugIlviim3ywrgFI0BMniB9wdzU";

export const blockvisionService = {
  getAccountCoins: async (address: string) => {
    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": API_KEY,
      },
    };

    try {
      // Updated query parameter from "address" to "account"
      const response = await fetch(
        `https://api.blockvision.org/v2/sui/account/coins?account=${address}`,
        options
      );
      return await response.json();
    } catch (error) {
      console.error("Error fetching account coins:", error);
      throw error;
    }
  },

  getCoinDetail: async (coinType: string) => {
    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": API_KEY,
      },
    };

    try {
      const response = await fetch(
        `https://api.blockvision.org/v2/sui/coin/detail?coinType=${encodeURIComponent(
          coinType
        )}`,
        options
      );
      return await response.json();
    } catch (error) {
      console.error(`Error fetching coin detail for ${coinType}:`, error);
      throw error;
    }
  },

  getAccountActivities: async (address: string, packageIds: string[] = []) => {
    const options = {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": API_KEY,
      },
    };

    try {
      const packageIdsParam =
        packageIds.length > 0 ? `&packageIds=${packageIds.join("%2C")}` : "";

      const response = await fetch(
        `https://api.blockvision.org/v2/sui/account/activities?address=${address}${packageIdsParam}`,
        options
      );
      return await response.json();
    } catch (error) {
      console.error("Error fetching account activities:", error);
      throw error;
    }
  },
};

export default blockvisionService;
