import { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import { blockvisionService } from "../../services/birdeyeService";
import { useBirdeye } from "../../contexts/BirdeyeContext"; // Add this import
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

  // Keep wallet tokens in local state as they're user-specific
  const [walletTokens, setWalletTokens] = useState<TokenData[]>([]);
  const [isLoadingWallet, setIsLoadingWallet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "portfolio" | "trending">(
    "all"
  );

  useEffect(() => {
    if (isOpen) {
      // Refresh context data when modal opens
      refreshTrendingTokens();
      refreshTokenList();
      // Only fetch wallet tokens
      fetchWalletTokens();
    }
  }, [isOpen, account?.address]);

  // Modified to only fetch wallet tokens
  const fetchWalletTokens = async () => {
    if (!account?.address) return;

    setIsLoadingWallet(true);
    try {
      // Helper to extract an array from various response shapes
      const extractArray = (data: any): any[] => {
        if (!data) return [];
        if (data.data && Array.isArray(data.data)) return data.data;
        if (Array.isArray(data)) return data;
        if (data.tokens && Array.isArray(data.tokens)) return data.tokens;
        return [];
      };

      // Fetch wallet tokens via Blockvision if connected
      const walletData = await blockvisionService.getAccountCoins(
        account.address
      );
      const walletArr = extractArray(walletData);
      const walletList = walletArr
        .filter((token: any) => !excludeAddresses.includes(token.coinType))
        .map((token: any) => ({
          address: token.coinType, // using coinType as token identifier
          symbol: token.symbol || token.coinType.split("::").pop() || "Unknown",
          name: token.name || "Unknown Token",
          logo: token.logo || "",
          decimals: token.decimals || 9,
          price: token.price || 0,
          balance:
            parseFloat(token.balance) / Math.pow(10, token.decimals || 9),
          change24h: token.priceChange24h || 0,
        }));
      setWalletTokens(walletList);
    } catch (error) {
      console.error("Error fetching wallet tokens:", error);
    } finally {
      setIsLoadingWallet(false);
    }
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
      list = walletTokens;
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

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Check loading state from both context and local state
  const isLoading = isLoadingTrending || isLoadingTokenList || isLoadingWallet;

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
                    {formatCurrency(token.price)}
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
