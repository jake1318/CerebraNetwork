// src/components/TokenSelector/TokenSelector.tsx

import { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { useWalletContext } from "../../contexts/WalletContext";
import { useBirdeye } from "../../contexts/BirdeyeContext";
import "./TokenSelector.scss";

interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance?: number; // user’s balance, if in portfolio
  // Removed change24h as per requirement
  isTrending?: boolean; // indicates trending token
}

// Example pinned tokens – adjust as desired.
const PINNED_TOKENS: TokenData[] = [
  {
    address: "0x2::sui::SUI",
    symbol: "SUI",
    name: "Sui",
    logo: "https://assets.coingecko.com/coins/images/24405/large/sui.jpeg",
    decimals: 9,
    price: 0,
  },
  {
    address:
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    symbol: "USDC",
    name: "USD Coin",
    logo: "https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png",
    decimals: 6,
    price: 0,
  },
  // Add more pinned tokens if desired
];

interface TokenSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: TokenData) => void;
  excludeAddresses?: string[];
}

const TokenSelector = ({
  isOpen,
  onClose,
  onSelect,
  excludeAddresses = [],
}: TokenSelectorProps) => {
  const { account } = useWallet();

  // Pull data from BirdeyeContext
  const {
    trendingTokens,
    tokenList,
    isLoadingTrending,
    isLoadingTokenList,
    refreshTrendingTokens,
    refreshTokenList,
  } = useBirdeye();

  // Pull data from WalletContext (note: coinPrices removed)
  const { walletState, tokenMetadata, formatUsd, refreshBalances } =
    useWalletContext();

  const [searchQuery, setSearchQuery] = useState("");
  // activeTab still exists; if "all" we'll show the merged list,
  // if "portfolio" then only wallet tokens, if "trending" then only trending tokens.
  const [activeTab, setActiveTab] = useState<"all" | "portfolio" | "trending">(
    "all"
  );

  // Merge tokens from three sources:
  // 1. Wallet tokens (from walletState)
  // 2. Trending tokens (from BirdeyeContext)
  // 3. The full token list (from BirdeyeContext + pinned tokens)
  const getMergedTokens = (): TokenData[] => {
    // 1. Get wallet tokens
    const walletTokens =
      walletState.balances && walletState.balances.length > 0
        ? walletState.balances.map((bal) => {
            const metadata = tokenMetadata[bal.coinType] || {};
            const price = Number(metadata.price) || 0;
            const balanceValue =
              Number(bal.balance) / Math.pow(10, bal.decimals);
            return {
              address: bal.coinType,
              symbol: bal.symbol || metadata.symbol || "UNKNOWN",
              name: bal.name || metadata.name || "Unknown Token",
              logo: metadata.logo || "",
              decimals: bal.decimals,
              price,
              balance: balanceValue,
            } as TokenData;
          })
        : [];

    // 2. Get trending tokens from BirdeyeContext, filter out excluded addresses
    const trending = trendingTokens.filter(
      (t: TokenData) => !excludeAddresses.includes(t.address)
    );

    // 3. Get full token list (combine pinned tokens with tokenList from Birdeye)
    const fullList = () => {
      const validTokenList = tokenList.filter(
        (t: TokenData) => !excludeAddresses.includes(t.address)
      );
      const existingAddr = new Set(
        validTokenList.map((t: TokenData) => t.address.toLowerCase())
      );
      const filteredPinned = PINNED_TOKENS.filter(
        (pt) => !existingAddr.has(pt.address.toLowerCase())
      );
      return [...filteredPinned, ...validTokenList];
    };

    const allTokens = fullList();

    // 4. Merge with priority: walletTokens first, then trending, then remaining full tokens.
    const merged: TokenData[] = [];
    const added = new Set<string>();

    // Wallet tokens first
    walletTokens.forEach((token) => {
      merged.push(token);
      added.add(token.address.toLowerCase());
    });

    // Trending tokens next (if not already in wallet tokens)
    trending.forEach((token) => {
      if (!added.has(token.address.toLowerCase())) {
        merged.push(token);
        added.add(token.address.toLowerCase());
      }
    });

    // Then add the rest from full token list
    allTokens.forEach((token) => {
      if (!added.has(token.address.toLowerCase())) {
        merged.push(token);
        added.add(token.address.toLowerCase());
      }
    });

    return merged;
  };

  // Choose token list based on active tab
  const filteredTokens = () => {
    const query = searchQuery.toLowerCase().trim();
    let list: TokenData[] = [];
    if (activeTab === "portfolio") {
      // Only wallet tokens
      list =
        walletState.balances && walletState.balances.length > 0
          ? walletState.balances.map((bal) => {
              const metadata = tokenMetadata[bal.coinType] || {};
              const price = Number(metadata.price) || 0;
              const balanceValue =
                Number(bal.balance) / Math.pow(10, bal.decimals);
              return {
                address: bal.coinType,
                symbol: bal.symbol || metadata.symbol || "UNKNOWN",
                name: bal.name || metadata.name || "Unknown Token",
                logo: metadata.logo || "",
                decimals: bal.decimals,
                price,
                balance: balanceValue,
              } as TokenData;
            })
          : [];
    } else if (activeTab === "trending") {
      list = trendingTokens;
    } else {
      // "all" tab: use merged token list
      list = getMergedTokens();
    }

    if (query) {
      return list.filter(
        (token) =>
          token.symbol.toLowerCase().includes(query) ||
          token.name.toLowerCase().includes(query) ||
          token.address.toLowerCase().includes(query)
      );
    }
    return list;
  };

  // Overall loading state from contexts
  const isLoading =
    isLoadingTrending || isLoadingTokenList || walletState.loading;

  useEffect(() => {
    if (isOpen) {
      refreshTrendingTokens();
      refreshTokenList();
      refreshBalances();
    }
  }, [isOpen, account?.address]);

  if (!isOpen) return null;

  return (
    <div className="token-selector-modal">
      <div className="token-selector-content">
        <div className="token-selector-header">
          <h2>Select Token</h2>
          <button className="close-button" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="token-search">
          <input
            type="text"
            placeholder="Search by name or address"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="token-tabs">
          <button
            className={activeTab === "all" ? "active" : ""}
            onClick={() => setActiveTab("all")}
          >
            All Tokens
          </button>
          {account && (
            <button
              className={activeTab === "portfolio" ? "active" : ""}
              onClick={() => setActiveTab("portfolio")}
            >
              Your Tokens
            </button>
          )}
          <button
            className={activeTab === "trending" ? "active" : ""}
            onClick={() => setActiveTab("trending")}
          >
            Trending
          </button>
        </div>

        <div className="token-list">
          {isLoading ? (
            <div className="loading">Loading tokens...</div>
          ) : filteredTokens().length === 0 ? (
            <div className="no-tokens">No tokens found</div>
          ) : (
            filteredTokens().map((token) => (
              <div
                key={token.address}
                className="token-item"
                onClick={() => onSelect(token)}
              >
                <div className="token-info">
                  {token.logo && (
                    <img
                      src={token.logo}
                      alt={token.symbol}
                      className="token-logo"
                    />
                  )}
                  <div className="token-details">
                    <div className="token-symbol">
                      {token.symbol}
                      {token.isTrending && (
                        <span className="trending-badge">🔥</span>
                      )}
                    </div>
                    <div className="token-name">{token.name}</div>
                  </div>
                </div>
                <div className="token-data">
                  {token.balance !== undefined && (
                    <div className="token-balance">
                      {token.balance.toLocaleString(undefined, {
                        maximumFractionDigits: 6,
                      })}
                    </div>
                  )}
                  <div className="token-price">{formatUsd(token.price)}</div>
                  <div className="token-address">
                    {token.address.slice(0, 9)}…
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TokenSelector;
