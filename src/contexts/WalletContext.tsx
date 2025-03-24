// src/contexts/WalletContext.tsx

import React, { createContext, useContext, useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { CoinBalance } from "../types";

// Services
import blockvisionService from "../services/blockvisionService";
import { birdeyeService } from "../services/birdeyeService";

// Removed Coingecko pricing since we pull all metadata from Blockvision

// Mapping from coinType -> coingecko ID (unused now)
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

// Reverse mapping (unused)
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
  availableCoins: string[];
  tokenMetadata: Record<string, any>;
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

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { connected, account } = useWallet();

  const [balances, setBalances] = useState<CoinBalance[]>([]);
  const [totalUsdValue, setTotalUsdValue] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
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
      setAvailableCoins(["0x2::sui::SUI"]);
    }
  };

  // Function to fetch metadata for a list of coin types from Blockvision
  const fetchTokenMetadata = async (coinTypes: string[]) => {
    try {
      const newMetadata = { ...tokenMetadata };
      let hasChanges = false;

      for (const coinType of coinTypes) {
        // Only fetch if we don't already have metadata
        if (!newMetadata[coinType]) {
          const metadata = await blockvisionService.getCoinDetail(coinType);
          // Blockvision returns { code: 200, data: { symbol, name, decimals, logo, price, ...} }
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
      // 1) Get wallet coins from Blockvision using correct query parameter (account)
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
      }

      // 3) Convert aggregated balances into an array and gather coin types for metadata fetching
      const formattedBalances: CoinBalance[] = [];
      const coinTypesToFetchMetadata: string[] = [];
      for (const [coinType, data] of Object.entries(balancesByType)) {
        if (data.balance > BigInt(0)) {
          // Fallback metadata if Blockvision metadata is missing: derive symbol from coinType
          const fallbackMetadata = {
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

      // 4) Compute total USD value using Blockvision metadata price
      // If metadata for a coin hasn't been fetched yet, its price defaults to 0.
      let total = 0;
      for (const balance of formattedBalances) {
        const metadata = tokenMetadata[balance.coinType] || {};
        const price = Number(metadata.price) || 0;
        const numericBalance =
          Number(balance.balance) / Math.pow(10, balance.decimals);
        total += numericBalance * price;
      }

      // 5) Optionally, sort balances by highest USD value first
      formattedBalances.sort((a, b) => {
        const aMeta = tokenMetadata[a.coinType] || {};
        const bMeta = tokenMetadata[b.coinType] || {};
        const aPrice = Number(aMeta.price) || 0;
        const bPrice = Number(bMeta.price) || 0;
        const aValue = (Number(a.balance) / Math.pow(10, a.decimals)) * aPrice;
        const bValue = (Number(b.balance) / Math.pow(10, b.decimals)) * bPrice;
        return bValue - aValue;
      });

      setBalances(formattedBalances);
      setTotalUsdValue(total);

      // 6) Fetch metadata from Blockvision for all coin types present
      fetchTokenMetadata(coinTypesToFetchMetadata);
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setLoading(false);
    }
  };

  // On mount, fetch available tokens from Birdeye
  useEffect(() => {
    fetchAvailableCoins();
  }, []);

  // Whenever wallet connects, fetch balances periodically
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

  const value: WalletContextType = {
    walletState: { balances, totalUsdValue, loading },
    refreshBalances: fetchBalances,
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
