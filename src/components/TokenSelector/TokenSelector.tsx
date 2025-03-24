import { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { useWalletContext } from "../../contexts/WalletContext"; // Add this import
import { useBirdeye } from "../../contexts/BirdeyeContext";
import "./TokenSelector.scss";

interface TokenData {
  address: string;
  symbol: string;
  name: string;
  logo: string;
  decimals: number;
  price: number;
  balance?: number;
  change24h?: number;
  isTrending?: boolean;
}

// Pinned tokens list remains the same
const PINNED_TOKENS: TokenData[] = [
  // ... your existing pinned tokens
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
  // Use context data instead of duplicate state
  const {
    trendingTokens,
    tokenList,
    isLoadingTrending,
    isLoadingTokenList,
    refreshTrendingTokens,
    refreshTokenList,
  } = useBirdeye();

  // Use the wallet context
  const {
    walletState,
    coinPrices,
    tokenMetadata,
    formatBalance,
    formatUsd,
    refreshBalances,
  } = useWalletContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "portfolio" | "trending">(
    "all"
  );

  useEffect(() => {
    if (isOpen) {
      // Refresh context data when modal opens
      refreshTrendingTokens();
      refreshTokenList();
      // Refresh wallet balances when modal opens
      refreshBalances();
    }
  }, [isOpen, account?.address]);

  // Convert wallet balances to TokenData format for the UI
  const getWalletTokens = (): TokenData[] => {
    if (!walletState.balances || walletState.balances.length === 0) {
      return [];
    }

    return walletState.balances
      .filter((balance) => !excludeAddresses.includes(balance.coinType))
      .map((balance) => {
        // Get metadata from our tokenMetadata state
        const metadata = tokenMetadata[balance.coinType] || {};

        // Calculate USD value using coin prices
        const price = coinPrices[balance.coinType] || 0;
        const balanceValue =
          Number(balance.balance) / Math.pow(10, balance.decimals);

        return {
          address: balance.coinType,
          symbol:
            balance.symbol ||
            metadata.symbol ||
            balance.coinType.split("::").pop() ||
            "Unknown",
          name: balance.name || metadata.name || "Unknown Token",
          logo: metadata.logo || "", // Logo from metadata
          decimals: balance.decimals,
          price: price,
          balance: balanceValue,
          change24h: metadata.priceChange24h || 0,
          // Add any other properties from metadata that you need
        };
      });
  };

  // For "all" tab, combine the pinned tokens with the context token list
  const getAllTokens = () => {
    // Filter out tokens that are in the exclude list
    const filteredTokenList = tokenList.filter(
      (token) => !excludeAddresses.includes(token.address)
    );

    // Create a lookup of public token addresses
    const existing = new Set(
      filteredTokenList.map((t: TokenData) => t.address.toLowerCase())
    );

    // Filter pinned tokens to only those not in the public list
    const filteredPinned = PINNED_TOKENS.filter(
      (t) => !existing.has(t.address.toLowerCase())
    );

    // Return the combined list (pinned tokens come first)
    return [...filteredPinned, ...filteredTokenList];
  };

  const filteredTokens = () => {
    const query = searchQuery.toLowerCase().trim();
    let list: TokenData[] = [];

    if (activeTab === "portfolio") {
      list = getWalletTokens(); // Use the function to get wallet tokens
    } else if (activeTab === "trending") {
      list = trendingTokens;
    } else if (activeTab === "all") {
      list = getAllTokens();
    }

    return query
      ? list.filter(
          (token) =>
            token.symbol.toLowerCase().includes(query) ||
            token.name.toLowerCase().includes(query) ||
            token.address.toLowerCase().includes(query)
        )
      : list;
  };

  // Check loading state from context
  const isLoading =
    isLoadingTrending || isLoadingTokenList || walletState.loading;

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
                  <div className="token-price">
                    {formatUsd(token.price)}
                    {token.change24h !== undefined && (
                      <span
                        className={`price-change ${
                          token.change24h >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {token.change24h >= 0 ? "▲" : "▼"}{" "}
                        {Math.abs(token.change24h).toFixed(2)}%
                      </span>
                    )}
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
