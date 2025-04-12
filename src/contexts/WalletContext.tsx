import React, { createContext, useContext, useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { CoinBalance } from "../types";
import blockvisionService from "../services/blockvisionService";
import { birdeyeService } from "../services/birdeyeService";
import tokenCacheService from "../services/tokenCacheService";

// We have removed the hard-coded coin mappings since metadata comes from Blockvision.

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
  fetchTokenMetadata: (coinTypes: string[]) => Promise<void>;
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

  const fetchAvailableCoins = async () => {
    try {
      // First get cached coins so there's something to display immediately
      const cachedTokens = tokenCacheService.getAllCachedTokens();
      const cachedAddresses = cachedTokens.map((token) => token.address);
      setAvailableCoins(cachedAddresses);

      // Then fetch from API
      const tokenListData = await birdeyeService.getTokenList();
      let coins: string[] = [];
      if (
        tokenListData &&
        tokenListData.data &&
        Array.isArray(tokenListData.data)
      ) {
        coins = tokenListData.data.map((token: any) => token.address);
      }
      if (!coins.includes("0x2::sui::SUI")) {
        coins.push("0x2::sui::SUI");
      }
      setAvailableCoins(coins);
    } catch (error) {
      console.error("Error fetching available coins from Birdeye:", error);

      // Fall back to cached data if API call fails
      const cachedTokens = tokenCacheService.getAllCachedTokens();
      const cachedAddresses = cachedTokens.map((token) => token.address);

      if (cachedAddresses.length === 0) {
        setAvailableCoins(["0x2::sui::SUI"]);
      } else {
        if (!cachedAddresses.includes("0x2::sui::SUI")) {
          cachedAddresses.push("0x2::sui::SUI");
        }
        setAvailableCoins(cachedAddresses);
      }
    }
  };

  const fetchTokenMetadata = async (coinTypes: string[]) => {
    try {
      const newMetadata = { ...tokenMetadata };
      let hasChanges = false;

      // First check if we have cached visual data
      for (const coinType of coinTypes) {
        const lower = coinType.toLowerCase();
        const cachedToken = tokenCacheService.getTokenFromCache(lower);

        if (cachedToken) {
          // If current metadata doesn't exist or doesn't have visual elements,
          // add visual elements from cache
          if (!newMetadata[lower] || !newMetadata[lower].logo) {
            if (!newMetadata[lower]) {
              newMetadata[lower] = {};
            }

            // Add visual data from cache
            newMetadata[lower].symbol =
              newMetadata[lower].symbol || cachedToken.symbol;
            newMetadata[lower].name =
              newMetadata[lower].name || cachedToken.name;
            newMetadata[lower].logo =
              newMetadata[lower].logo || cachedToken.logo;
            newMetadata[lower].decimals =
              newMetadata[lower].decimals || cachedToken.decimals;

            hasChanges = true;
          }
        }
      }

      // Then update with fresh data including prices
      for (const coinType of coinTypes) {
        const lower = coinType.toLowerCase();
        const metadata = await blockvisionService.getCoinDetail(coinType);

        if (metadata && (metadata.data || metadata.result)) {
          const metadataResult = metadata.data || metadata.result;
          newMetadata[lower] = metadataResult;

          // Cache the visual elements
          tokenCacheService.cacheToken({
            address: lower,
            symbol: metadataResult.symbol || "Unknown",
            name: metadataResult.name || "Unknown Token",
            logo: metadataResult.logo || "",
            decimals: metadataResult.decimals || 9,
          });

          hasChanges = true;
        }
      }

      if (hasChanges) {
        setTokenMetadata(newMetadata);
      }
    } catch (error) {
      console.error("Error fetching token metadata:", error);
    }
  };

  const fetchBalances = async () => {
    if (!connected || !account) {
      setBalances([]);
      setTotalUsdValue(null);
      return;
    }
    setLoading(true);

    // Get cached metadata to display visual elements immediately
    const cachedData = tokenCacheService.getAllCachedTokens();
    const cachedMetadata: Record<string, any> = {};

    cachedData.forEach((token) => {
      const lower = token.address.toLowerCase();

      if (!tokenMetadata[lower] || !tokenMetadata[lower].logo) {
        cachedMetadata[lower] = {
          symbol: token.symbol,
          name: token.name,
          logo: token.logo,
          decimals: token.decimals,
          // Don't set price from cache
        };
      }
    });

    if (Object.keys(cachedMetadata).length > 0) {
      setTokenMetadata((prevMetadata) => {
        const merged = { ...prevMetadata };

        // Merge cached visual data with existing metadata
        // preserving prices from prevMetadata
        for (const [addr, data] of Object.entries(cachedMetadata)) {
          if (!merged[addr]) {
            merged[addr] = data;
          } else {
            // Keep existing price but use cached visuals if needed
            merged[addr].symbol = merged[addr].symbol || data.symbol;
            merged[addr].name = merged[addr].name || data.name;
            merged[addr].logo = merged[addr].logo || data.logo;
            merged[addr].decimals = merged[addr].decimals || data.decimals;
          }
        }

        return merged;
      });
    }

    try {
      const blockvisionData = await blockvisionService.getAccountCoins(
        account.address
      );
      let coins: any[] = [];
      if (
        blockvisionData &&
        blockvisionData.result &&
        Array.isArray(blockvisionData.result.coins)
      ) {
        coins = blockvisionData.result.coins.map((coin: any) => ({
          type: coin.coinType,
          balance: coin.balance,
          decimals: coin.decimals || 9,
          symbol: coin.symbol || coin.coinType.split("::").pop() || "UNKNOWN",
          name: coin.name || "Unknown Coin",
          logo: coin.logo || "",
        }));

        // Cache visual data
        coins.forEach((coin) => {
          tokenCacheService.cacheToken({
            address: coin.type,
            symbol: coin.symbol,
            name: coin.name,
            logo: coin.logo,
            decimals: coin.decimals,
          });
        });
      }

      const balancesByType: Record<
        string,
        { balance: bigint; metadata?: any }
      > = {};
      for (const coin of coins) {
        const coinType = (coin.type || coin.coinType).toLowerCase();
        if (!coinType) continue;
        const bigBalance = BigInt(coin.balance || 0);
        if (!balancesByType[coinType]) {
          balancesByType[coinType] = { balance: BigInt(0), metadata: null };
        }
        balancesByType[coinType].balance += bigBalance;
      }

      const formattedBalances: CoinBalance[] = [];
      const coinTypesToFetchMetadata: string[] = [];

      for (const [coinType, data] of Object.entries(balancesByType)) {
        if (data.balance > BigInt(0)) {
          formattedBalances.push({
            coinType,
            symbol: "UNKNOWN",
            name: "Unknown Coin",
            balance: data.balance,
            decimals: 9,
          });
          coinTypesToFetchMetadata.push(coinType);
        }
      }

      let total = 0;
      for (const balance of formattedBalances) {
        const lower = balance.coinType.toLowerCase();
        const metadata = tokenMetadata[lower] || {};
        const price = Number(metadata.price) || 0;
        const numericBalance =
          Number(balance.balance) / Math.pow(10, balance.decimals);
        total += numericBalance * price;
      }

      formattedBalances.sort((a, b) => {
        const aMeta = tokenMetadata[a.coinType.toLowerCase()] || {};
        const bMeta = tokenMetadata[b.coinType.toLowerCase()] || {};
        const aPrice = Number(aMeta.price) || 0;
        const bPrice = Number(bMeta.price) || 0;
        const aValue = (Number(a.balance) / Math.pow(10, a.decimals)) * aPrice;
        const bValue = (Number(b.balance) / Math.pow(10, b.decimals)) * bPrice;
        return bValue - aValue;
      });

      setBalances(formattedBalances);
      setTotalUsdValue(total);
      await fetchTokenMetadata(coinTypesToFetchMetadata);
    } catch (error) {
      console.error("Error fetching balances:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableCoins();
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
