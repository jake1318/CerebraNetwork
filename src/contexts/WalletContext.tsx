import React, { createContext, useContext, useEffect, useState } from "react";
import { useWallet } from "@suiet/wallet-kit";
import blockvisionService, {
  AccountCoin,
} from "../services/blockvisionService";
import tokenCacheService from "../services/tokenCacheService";

interface CoinBalance {
  coinType: string;
  symbol: string;
  name: string;
  balance: bigint;
  decimals: number;
  price: number;
  usdValue: number;
}

interface WalletContextType {
  walletState: {
    balances: CoinBalance[];
    totalUsdValue: number | null;
    loading: boolean;
  };
  refreshBalances: () => void;
  availableCoins: string[];
  tokenMetadata: Record<
    string,
    {
      symbol: string;
      name: string;
      logo: string;
      decimals: number;
      price: number;
    }
  >;
  formatBalance: (
    balance: bigint,
    decimals: number,
    displayDecimals?: number
  ) => string;
  formatUsd: (amount: number) => string;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const useWalletContext = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be within WalletProvider");
  return ctx;
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { connected, account } = useWallet();

  const [balances, setBalances] = useState<CoinBalance[]>([]);
  const [totalUsdValue, setTotalUsdValue] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [availableCoins, setAvailableCoins] = useState<string[]>([]);
  const [tokenMetadata, setTokenMetadata] = useState<
    Record<
      string,
      {
        symbol: string;
        name: string;
        logo: string;
        decimals: number;
        price: number;
      }
    >
  >({});

  //
  // >>> FIXED: define formatBalance here so it's in scope
  //
  const formatBalance = (
    balance: bigint,
    decimals: number,
    displayDecimals: number = 5
  ): string => {
    const asNumber = Number(balance) / 10 ** decimals;
    if (asNumber > 0 && asNumber < 0.00001) {
      return asNumber.toExponential(2);
    }
    return asNumber.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: displayDecimals,
    });
  };

  const formatUsd = (amount: number): string =>
    amount.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const fetchAvailableCoins = async () => {
    // (no changes here)
  };

  const fetchBalances = async () => {
    if (!connected || !account) {
      setBalances([]);
      setTotalUsdValue(null);
      return;
    }
    setLoading(true);
    try {
      // 1) fetch from BlockVision
      const { data: coins } = await blockvisionService.getAccountCoins(
        account.address
      );
      // 2) cache raw metadata
      coins.forEach((c) =>
        tokenCacheService.cacheToken({
          address: c.coinType.toLowerCase(),
          symbol: c.symbol,
          name: c.name,
          logo: c.logo,
          decimals: c.decimals,
        })
      );
      // 3) build formatted balances
      const formatted: CoinBalance[] = coins.map((c) => ({
        coinType: c.coinType,
        symbol: c.symbol || c.coinType.split("::").pop()!,
        name: c.name || "Unknown",
        balance: BigInt(c.balance),
        decimals: c.decimals,
        price: parseFloat(c.price || "0"),
        usdValue: parseFloat(c.usdValue || "0"),
      }));
      const total = formatted.reduce((sum, b) => sum + b.usdValue, 0);
      formatted.sort((a, b) => b.usdValue - a.usdValue);

      setBalances(formatted);
      setTotalUsdValue(total);

      // 4) IMMEDIATELY seed tokenMetadata from BlockVision’s response
      setTokenMetadata((prev) => {
        const next = { ...prev };
        coins.forEach((c) => {
          next[c.coinType] = {
            symbol: c.symbol,
            name: c.name,
            logo: c.logo,
            decimals: c.decimals,
            price: parseFloat(c.price || "0"),
          };
        });
        return next;
      });
    } catch (err) {
      console.error("Error fetching balances:", err);
    } finally {
      setLoading(false);
    }
  };

  // on connect or account change
  useEffect(() => {
    if (connected && account) fetchBalances();
    else {
      setBalances([]);
      setTotalUsdValue(null);
    }
  }, [connected, account]);

  // once on mount
  useEffect(() => {
    fetchAvailableCoins();
  }, []);

  return (
    <WalletContext.Provider
      value={{
        walletState: { balances, totalUsdValue, loading },
        refreshBalances: fetchBalances,
        availableCoins,
        tokenMetadata,
        formatBalance,
        formatUsd,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
