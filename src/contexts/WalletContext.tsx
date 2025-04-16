import React, { createContext, useContext, useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { CoinBalance } from "../types";
import blockvisionService, {
  AccountCoin,
} from "../services/blockvisionService";
import { birdeyeService } from "../services/birdeyeService";
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
      const cachedTokens = tokenCacheService.getAllCachedTokens();
      const cachedAddresses = cachedTokens.map((token) => token.address);
      setAvailableCoins(cachedAddresses);

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

  const fetchTokenMetadata = async (
    coinTypes: string[],
    coinsData?: AccountCoin[]
  ): Promise<void> => {
    try {
      const newMetadata = { ...tokenMetadata };
      let fetchedMeta: Record<string, any>;
      if (coinsData && coinsData.length) {
        fetchedMeta = await enrichTokenMetadataFromBalances(coinsData);
      } else {
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

  // Fetch balances only once on wallet connect (removed recurring setInterval)
  const fetchBalances = async () => {
    if (!connected || !account) {
      setBalances([]);
      setTotalUsdValue(null);
      return;
    }
    setLoading(true);

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
        };
      }
    });
    if (Object.keys(cachedMetadata).length > 0) {
      setTokenMetadata((prevMetadata) => {
        const merged = { ...prevMetadata };
        for (const [addr, data] of Object.entries(cachedMetadata)) {
          if (!merged[addr]) {
            merged[addr] = data;
          } else {
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
      console.log("Fetching account coins from BlockVision API");
      const response = await blockvisionService.getAccountCoins(
        account.address
      );
      let coins: AccountCoin[] = [];
      if (response && response.data && Array.isArray(response.data)) {
        console.log(`Found ${response.data.length} coins in wallet`);
        coins = response.data;
        coins.forEach((coin) => {
          tokenCacheService.cacheToken({
            address: coin.coinType,
            symbol: coin.symbol,
            name: coin.name,
            logo: coin.logo,
            decimals: coin.decimals,
          });
        });
      } else {
        console.warn(
          "Unexpected response format from BlockVision API:",
          response
        );
      }

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
        (sum, coin) => sum + parseFloat(coin.usdValue || "0"),
        0
      );
      formattedBalances.sort((a, b) => (b.usdValue || 0) - (a.usdValue || 0));

      setBalances(formattedBalances);
      setTotalUsdValue(total);

      const coinTypes = coins.map((c) => c.coinType);
      // Ensure that token metadata is fetched only after coin addresses are available.
      await fetchTokenMetadata(coinTypes, coins);
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
