import React, { createContext, useContext, useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import axios from "axios";
import { CoinBalance } from "../types";

// Services
import blockvisionService from "../services/blockvisionService";
import { birdeyeService } from "../services/birdeyeService";

// SUI mainnet nodes and fallback price API
const SUI_MAINNET_RPC_URL = "https://fullnode.mainnet.sui.io";
const PRICE_API =
  "https://api.coingecko.com/api/v3/simple/price?ids=sui,ethereum,bitcoin,usd-coin,tether&vs_currencies=usd";

// Known coins config
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

// Mapping from coinType -> coingecko ID, used for price lookups
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

// Reverse mapping: coingecko ID -> coinType
const ID_TO_COIN_TYPE: Record<string, string> = {};
Object.entries(COIN_TYPE_TO_ID).forEach(([coinType, id]) => {
  ID_TO_COIN_TYPE[id] = coinType;
});

// The context interface
interface WalletContextType {
  walletState: {
    balances: CoinBalance[];
    totalUsdValue: number | null;
    loading: boolean;
  };
  refreshBalances: () => void;
  coinPrices: Record<string, number>;
  availableCoins: string[];
  tokenMetadata: Record<string, any>;
  formatBalance: (
    balance: bigint,
    decimals: number,
    displayDecimals?: number
  ) => string;
  formatUsd: (amount: number) => string;
}

// Create context
const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWalletContext = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
};

// The main provider
export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { connected, account } = useWallet();

  const [balances, setBalances] = useState<CoinBalance[]>([]);
  const [totalUsdValue, setTotalUsdValue] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [coinPrices, setCoinPrices] = useState<Record<string, number>>({});
  const [availableCoins, setAvailableCoins] = useState<string[]>([]);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});

  // Format a big integer balance for UI
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

  // Format a USD value for UI
  const formatUsd = (amount: number): string => {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Fetch coin prices from coingecko
  const fetchCoinPrices = async () => {
    try {
      const response = await axios.get(PRICE_API);
      const data = response.data;
      const prices: Record<string, number> = {};

      // data structure is: { sui: {usd: number}, bitcoin: {usd: number}, ...}
      Object.entries(data).forEach(([id, priceData]: [string, any]) => {
        const coinType = ID_TO_COIN_TYPE[id];
        if (coinType && priceData.usd) {
          prices[coinType] = priceData.usd;
        }
      });

      setCoinPrices(prices);
      return prices;
    } catch (error) {
      console.error("Error fetching coin prices:", error);
      return {};
    }
  };

  // Fetch available tokens from Birdeye
  const fetchAvailableCoins = async () => {
    try {
      const tokenListData = await birdeyeService.getTokenList();
      let coins: string[] = [];

      if (
        tokenListData &&
        tokenListData.data &&
        Array.isArray(tokenListData.data)
      ) {
        coins = tokenListData.data.map((token: any) => token.address);
      }

      // Ensure SUI is always in the list
      if (!coins.includes("0x2::sui::SUI")) {
        coins.push("0x2::sui::SUI");
      }

      setAvailableCoins(coins);
    } catch (error) {
      console.error("Error fetching available coins from Birdeye:", error);
      // Fallback: only SUI if error
      setAvailableCoins(["0x2::sui::SUI"]);
    }
  };

  // Function to fetch metadata for a list of coin types
  const fetchTokenMetadata = async (coinTypes: string[]) => {
    try {
      const newMetadata = { ...tokenMetadata };
      let hasChanges = false;

      for (const coinType of coinTypes) {
        // Only fetch if we don't already have metadata
        if (!newMetadata[coinType]) {
          const metadata = await blockvisionService.getCoinDetail(coinType);
          // Blockvision returns { code: 200, data: { symbol, name, decimals, ...} }
          if (metadata && metadata.data) {
            newMetadata[coinType] = metadata.data;
            hasChanges = true;
          }
        }
      }

      if (hasChanges) {
        setTokenMetadata(newMetadata);
      }
    } catch (error) {
      console.error("Error fetching token metadata:", error);
    }
  };

  // Fetch balances primarily from Blockvision
  const fetchBalances = async () => {
    if (!connected || !account) {
      setBalances([]);
      setTotalUsdValue(null);
      return;
    }

    setLoading(true);
    try {
      // 1) Get wallet coins from Blockvision
      const blockvisionData = await blockvisionService.getAccountCoins(
        account.address
      );

      let coins: any[] = [];
      if (
        blockvisionData &&
        blockvisionData.data &&
        Array.isArray(blockvisionData.data)
      ) {
        coins = blockvisionData.data.map((coin: any) => ({
          type: coin.coinType,
          balance: coin.balance,
          decimals: coin.decimals || 9,
          symbol: coin.symbol || coin.coinType.split("::").pop() || "UNKNOWN",
          name: coin.name || "Unknown Coin",
        }));
      }

      // 2) Aggregate by coinType
      const balancesByType: Record<
        string,
        { balance: bigint; metadata?: any }
      > = {};

      for (const coin of coins) {
        const coinType = coin.type || coin.coinType;
        if (!coinType) continue;

        const bigBalance = BigInt(coin.balance || 0);
        if (!balancesByType[coinType]) {
          balancesByType[coinType] = { balance: BigInt(0), metadata: null };
        }
        balancesByType[coinType].balance += bigBalance;

        // If known coin, store KNOWN_COINS as metadata
        if (!balancesByType[coinType].metadata && KNOWN_COINS[coinType]) {
          balancesByType[coinType].metadata = KNOWN_COINS[coinType];
        }
      }

      // 3) Convert to array of CoinBalance
      const formattedBalances: CoinBalance[] = [];
      const coinTypesToFetchMetadata: string[] = [];

      for (const [coinType, data] of Object.entries(balancesByType)) {
        if (data.balance > BigInt(0)) {
          // Use known coin metadata or fallback
          const fallbackMetadata = KNOWN_COINS[coinType] || {
            symbol: coinType.split("::").pop() || "UNKNOWN",
            name: "Unknown Coin",
            decimals: 9,
          };

          const metadata = data.metadata || fallbackMetadata;
          formattedBalances.push({
            coinType,
            symbol: metadata.symbol,
            name: metadata.name,
            balance: data.balance,
            decimals: metadata.decimals,
          });

          coinTypesToFetchMetadata.push(coinType);
        }
      }

      // 4) Fetch coin prices if not already loaded
      const prices =
        Object.keys(coinPrices).length > 0
          ? coinPrices
          : await fetchCoinPrices();

      // 5) Compute total USD value
      let total = 0;
      for (const balance of formattedBalances) {
        const price = prices[balance.coinType] || 0;
        const numericBalance =
          Number(balance.balance) / Math.pow(10, balance.decimals);
        total += numericBalance * price;
      }

      // 6) Sort balances by highest USD value first
      formattedBalances.sort((a, b) => {
        const aPrice = prices[a.coinType] || 0;
        const bPrice = prices[b.coinType] || 0;
        const aValue = (Number(a.balance) / Math.pow(10, a.decimals)) * aPrice;
        const bValue = (Number(b.balance) / Math.pow(10, b.decimals)) * bPrice;
        return bValue - aValue;
      });

      setBalances(formattedBalances);
      setTotalUsdValue(total);

      // 7) Fetch metadata from Blockvision if not known
      fetchTokenMetadata(coinTypesToFetchMetadata);
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setLoading(false);
    }
  };

  // On mount, fetch coin prices & token list
  useEffect(() => {
    fetchCoinPrices();
    fetchAvailableCoins();

    const priceInterval = setInterval(fetchCoinPrices, 5 * 60 * 1000);
    return () => clearInterval(priceInterval);
  }, []);

  // Whenever wallet connects, fetch balances
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

  // Provide context
  const value: WalletContextType = {
    walletState: { balances, totalUsdValue, loading },
    refreshBalances: fetchBalances,
    coinPrices,
    availableCoins,
    tokenMetadata,
    formatBalance,
    formatUsd,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export default WalletContext;
