// src/contexts/WalletContext.tsx

import React, { createContext, useContext, useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { CoinBalance } from "../types";
import blockvisionService, {
  AccountCoin,
} from "../services/blockvisionService";
import tokenCacheService from "../services/tokenCacheService";
import {
  enrichTokenMetadataFromBalances,
  enrichTokenMetadataByAddresses,
} from "../services/tokenService";

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
  fetchTokenMetadata: (
    coinTypes: string[],
    coinsData?: AccountCoin[]
  ) => Promise<void>;
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

  // ---------------------
  // Formatting Helpers
  // ---------------------
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

  const formatUsd = (amount: number): string => {
    return amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // ---------------------
  // Metadata Enrichment
  // ---------------------
  const fetchTokenMetadata = async (
    coinTypes: string[],
    coinsData?: AccountCoin[]
  ): Promise<void> => {
    try {
      const newMetadata = { ...tokenMetadata };
      let fetchedMeta: Record<string, any>;

      if (coinsData && coinsData.length) {
        // Use BlockVision‐driven enrichment for wallet balances
        fetchedMeta = await enrichTokenMetadataFromBalances(coinsData);
      } else {
        // Fallback for arbitrary addresses
        fetchedMeta = await enrichTokenMetadataByAddresses(coinTypes);
      }

      for (const [addr, data] of Object.entries(fetchedMeta)) {
        newMetadata[addr] = { ...(newMetadata[addr] || {}), ...data };
      }
      if (Object.keys(fetchedMeta).length > 0) {
        setTokenMetadata(newMetadata);
      }
    } catch (error) {
      console.error("Error fetching token metadata:", error);
    }
  };

  // ---------------------
  // Fetch Balances
  // ---------------------
  const fetchBalances = async () => {
    if (!connected || !account) {
      setBalances([]);
      setTotalUsdValue(null);
      return;
    }
    setLoading(true);

    // Load cached visuals (omitted here if unchanged)...

    try {
      const { data: coins } = await blockvisionService.getAccountCoins(
        account.address
      );

      // Cache raw metadata immediately
      coins.forEach((coin) =>
        tokenCacheService.cacheToken({
          address: coin.coinType,
          symbol: coin.symbol,
          name: coin.name,
          logo: coin.logo,
          decimals: coin.decimals,
        })
      );

      // Format for UI
      const formattedBalances: CoinBalance[] = coins.map((coin) => ({
        coinType: coin.coinType,
        symbol: coin.symbol || coin.coinType.split("::").pop() || "UNKNOWN",
        name: coin.name || "Unknown Coin",
        balance: BigInt(coin.balance),
        decimals: coin.decimals,
        price: parseFloat(coin.price),
        usdValue: parseFloat(coin.usdValue),
      }));

      const total = coins.reduce(
        (sum, c) => sum + parseFloat(c.usdValue || "0"),
        0
      );
      formattedBalances.sort((a, b) => b.usdValue - a.usdValue);

      setBalances(formattedBalances);
      setTotalUsdValue(total);

      // Enrich metadata (purely via BlockVision)
      const coinTypes = coins.map((c) => c.coinType);
      await fetchTokenMetadata(coinTypes, coins);
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setLoading(false);
    }
  };

  // ---------------------
  // Fetch Available Coins
  // ---------------------
  const fetchAvailableCoins = async () => {
    // your existing logic to populate availableCoins...
  };

  useEffect(() => {
    fetchAvailableCoins();
  }, []);

  useEffect(() => {
    if (connected && account) {
      fetchBalances();
    } else {
      setBalances([]);
      setTotalUsdValue(null);
    }
  }, [connected, account]);

  // ---------------------
  // Context Value
  // ---------------------
  const value: WalletContextType = {
    walletState: { balances, totalUsdValue, loading },
    refreshBalances: fetchBalances,
    availableCoins,
    tokenMetadata,
    formatBalance,
    formatUsd,
    fetchTokenMetadata,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
};

export default WalletContext;
