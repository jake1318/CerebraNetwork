import { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import {
  birdeyeService,
  blockvisionService,
} from "../../services/birdeyeService";
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
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [trendingTokens, setTrendingTokens] = useState<TokenData[]>([]);
  const [userTokens, setUserTokens] = useState<TokenData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "portfolio" | "trending">(
    "all"
  );

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, account?.address]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Helper to extract an array from various response shapes.
      const extractArray = (data: any): any[] => {
        if (!data) return [];
        if (data.data && Array.isArray(data.data)) {
          return data.data;
        } else if (Array.isArray(data)) {
          return data;
        } else if (data.tokens && Array.isArray(data.tokens)) {
          return data.tokens;
        }
        return [];
      };

      // Fetch trending tokens via Birdeye.
      const trendingData = await birdeyeService.getTrendingTokens();
      const trendingArray = extractArray(trendingData);
      const trending = trendingArray.map((token: any) => ({
        address: token.address,
        symbol: token.symbol || "Unknown",
        name: token.name || "Unknown Token",
        logo: token.logo || "",
        decimals: token.decimals || 9,
        price: token.price || 0,
        change24h: token.priceChange24h || 0,
        isTrending: true,
      }));
      setTrendingTokens(trending);

      // Fetch full token list via Birdeye.
      const tokenListData = await birdeyeService.getTokenList();
      const tokenListArray = extractArray(tokenListData);
      const tokenList = tokenListArray
        .filter((token: any) => !excludeAddresses.includes(token.address))
        .map((token: any) => ({
          address: token.address,
          symbol: token.symbol || "Unknown",
          name: token.name || "Unknown Token",
          logo: token.logo || "",
          decimals: token.decimals || 9,
          price: token.price || 0,
          change24h: token.priceChange24h || 0,
        }));
      setTokens(tokenList);

      // Fetch user's wallet tokens using Blockvision.
      if (account?.address) {
        const userTokenData = await blockvisionService.getAccountCoins(
          account.address
        );
        const userTokenArray = extractArray(userTokenData);
        const userTokensMapped = userTokenArray
          .filter((token: any) => !excludeAddresses.includes(token.coinType))
          .map((token: any) => ({
            address: token.coinType, // using coinType as identifier
            symbol:
              token.symbol || token.coinType.split("::").pop() || "Unknown",
            name: token.name || "Unknown Token",
            logo: token.logo || "",
            decimals: token.decimals || 9,
            price: token.price || 0,
            balance:
              parseFloat(token.balance) / Math.pow(10, token.decimals || 9),
            change24h: token.priceChange24h || 0,
          }));
        setUserTokens(userTokensMapped);
      }
    } catch (error) {
      console.error("Error fetching token data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTokens = () => {
    const query = searchQuery.toLowerCase().trim();
    let tokenList: TokenData[] = [];
    if (activeTab === "all") {
      tokenList = tokens;
    } else if (activeTab === "portfolio") {
      tokenList = userTokens;
    } else if (activeTab === "trending") {
      tokenList = trendingTokens;
    }
    return query
      ? tokenList.filter(
          (token) =>
            token.symbol.toLowerCase().includes(query) ||
            token.name.toLowerCase().includes(query) ||
            token.address.toLowerCase().includes(query)
        )
      : tokenList;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

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
