import React, { createContext, useContext, useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import axios from "axios";
import { CoinBalance } from "../types";

// Constants
const SUI_MAINNET_RPC_URL = "https://fullnode.mainnet.sui.io";
const PRICE_API =
  "https://api.coingecko.com/api/v3/simple/price?ids=sui,ethereum,bitcoin,usd-coin,tether&vs_currencies=usd";

// Commonly used coin types on Sui Mainnet
const KNOWN_COINS: Record<
  string,
  { symbol: string; name: string; decimals: number }
> = {
  "0x2::sui::SUI": { symbol: "SUI", name: "Sui", decimals: 9 },
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN":
    {
      symbol: "USDC",
      name: "USD Coin",
      decimals: 6,
    },
  "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN":
    {
      symbol: "USDT",
      name: "Tether USD",
      decimals: 6,
    },
  "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN":
    {
      symbol: "WETH",
      name: "Wrapped ETH",
      decimals: 8,
    },
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN":
    {
      symbol: "WBTC",
      name: "Wrapped BTC",
      decimals: 8,
    },
};

// Used to map coin types to token IDs for CoinGecko API
const COIN_TYPE_TO_ID = {
  "0x2::sui::SUI": "sui",
  "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN":
    "usd-coin",
  "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN":
    "tether",
  "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN":
    "ethereum",
  "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN":
    "bitcoin",
};

// Reverse map from ID to coin type
const ID_TO_COIN_TYPE: Record<string, string> = {};
Object.entries(COIN_TYPE_TO_ID).forEach(([coinType, id]) => {
  ID_TO_COIN_TYPE[id] = coinType;
});

interface WalletContextType {
  walletState: {
    balances: CoinBalance[];
    totalUsdValue: number | null;
    loading: boolean;
  };
  refreshBalances: () => void;
  coinPrices: Record<string, number>;
  availableCoins: string[];
  formatBalance: (
    balance: bigint,
    decimals: number,
    displayDecimals?: number
  ) => string;
  formatUsd: (amount: number) => string;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
};

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

// Temporary default coins for development/testing
const getDefaultCoins = (address: string) => [
  {
    type: "0x2::sui::SUI",
    balance: "1000000000", // 1 SUI
    owner: { AddressOwner: address },
  },
  {
    type: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    balance: "5000000", // 5 USDC
    owner: { AddressOwner: address },
  },
];

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { connected, account, getCoins } = useWallet();

  const [balances, setBalances] = useState<CoinBalance[]>([]);
  const [totalUsdValue, setTotalUsdValue] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [coinPrices, setCoinPrices] = useState<Record<string, number>>({});
  const [availableCoins, setAvailableCoins] = useState<string[]>([]);

  // Format balance with up to 5 decimal places by default
  const formatBalance = (
    balance: bigint,
    decimals: number,
    displayDecimals: number = 5
  ): string => {
    const balanceNumber = Number(balance) / Math.pow(10, decimals);
    if (balanceNumber > 0 && balanceNumber < 0.00001) {
      return balanceNumber.toExponential(2);
    }
    return balanceNumber.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: displayDecimals,
    });
  };

  // Format USD value with 2 decimal places and a $ symbol
  const formatUsd = (amount: number): string => {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Fetch coin prices from CoinGecko
  const fetchCoinPrices = async () => {
    try {
      const response = await axios.get(PRICE_API);
      const data = response.data;
      const prices: Record<string, number> = {};
      Object.entries(data).forEach(([id, priceData]: [string, any]) => {
        const coinType = ID_TO_COIN_TYPE[id];
        if (coinType && priceData.usd) {
          prices[coinType] = priceData.usd;
        }
      });
      if (Object.keys(prices).length > 0) {
        setCoinPrices(prices);
        return prices;
      }
      return {};
    } catch (error) {
      console.error("Error fetching coin prices:", error);
      return {};
    }
  };

  // Fetch available coins (supported coin types) from the backend
  const fetchAvailableCoins = async () => {
    try {
      const response = await axios.get(`${API_URL}/supportedCoins`);
      let coins: string[] = response.data.supportedCoins;
      // Ensure SUI is always available
      if (!coins.includes("0x2::sui::SUI")) {
        coins.push("0x2::sui::SUI");
      }
      setAvailableCoins(coins);
    } catch (error) {
      console.error("Error fetching available coins:", error);
    }
  };

  const fetchBalances = async () => {
    if (!connected || !account) {
      setBalances([]);
      setTotalUsdValue(null);
      return;
    }

    setLoading(true);
    try {
      let coins: any[] = [];

      try {
        if (typeof getCoins === "function") {
          coins = await getCoins();
        } else if (
          window.suiet &&
          typeof window.suiet.getCoins === "function"
        ) {
          coins = await window.suiet.getCoins();
        }
      } catch (err) {
        console.error("Error getting coins from wallet:", err);
      }

      if (!coins || !Array.isArray(coins) || coins.length === 0) {
        if (account) {
          coins = getDefaultCoins(account.address);
        }
      }

      const balancesByType: Record<
        string,
        { balance: bigint; metadata?: any }
      > = {};

      for (const coin of coins) {
        if (!coin || (!coin.type && !coin.coinType)) continue;
        const coinType = coin.type || coin.coinType;
        const balance = BigInt(coin.balance || coin.value || 0);
        if (!balancesByType[coinType]) {
          balancesByType[coinType] = { balance: BigInt(0), metadata: null };
        }
        balancesByType[coinType].balance += balance;
        if (!balancesByType[coinType].metadata && KNOWN_COINS[coinType]) {
          balancesByType[coinType].metadata = KNOWN_COINS[coinType];
        }
      }

      const formattedBalances: CoinBalance[] = [];
      for (const [coinType, data] of Object.entries(balancesByType)) {
        if (data.balance > BigInt(0)) {
          const metadata = data.metadata ||
            KNOWN_COINS[coinType] || {
              symbol: coinType.split("::").pop() || "UNKNOWN",
              name: "Unknown Coin",
              decimals: 9,
            };
          formattedBalances.push({
            coinType,
            symbol: metadata.symbol,
            name: metadata.name,
            balance: data.balance,
            decimals: metadata.decimals,
          });
        }
      }

      const prices =
        Object.keys(coinPrices).length > 0
          ? coinPrices
          : await fetchCoinPrices();
      let total = 0;
      for (const balance of formattedBalances) {
        const price = prices[balance.coinType] || 0;
        const balanceWithDecimals =
          Number(balance.balance) / Math.pow(10, balance.decimals);
        total += balanceWithDecimals * price;
      }
      formattedBalances.sort((a, b) => {
        const aPrice = prices[a.coinType] || 0;
        const bPrice = prices[b.coinType] || 0;
        const aValue = (Number(a.balance) / Math.pow(10, a.decimals)) * aPrice;
        const bValue = (Number(b.balance) / Math.pow(10, b.decimals)) * bPrice;
        return bValue - aValue;
      });

      setBalances(formattedBalances);
      setTotalUsdValue(total);
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoinPrices();
    fetchAvailableCoins();
    const priceInterval = setInterval(fetchCoinPrices, 5 * 60 * 1000);
    return () => clearInterval(priceInterval);
  }, []);

  useEffect(() => {
    if (connected && account) {
      fetchBalances();
      const balanceInterval = setInterval(fetchBalances, 60 * 1000);
      return () => clearInterval(balanceInterval);
    } else {
      setBalances([]);
      setTotalUsdValue(null);
    }
  }, [connected, account]);

  const value = {
    walletState: { balances, totalUsdValue, loading },
    refreshBalances: fetchBalances,
    coinPrices,
    availableCoins,
    formatBalance,
    formatUsd,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export default WalletContext;
