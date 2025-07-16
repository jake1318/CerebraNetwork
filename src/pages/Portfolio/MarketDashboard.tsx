// src/pages/Portfolio/MarketDashboard.tsx
// Last Updated: 2025-07-15 17:41:57 UTC by jake1318

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FaSort,
  FaSortUp,
  FaSortDown,
  FaSearch,
  FaInfoCircle,
  FaSync,
  FaCaretUp,
  FaCaretDown,
  FaChartBar,
  FaExclamationTriangle,
} from "react-icons/fa";

// Import services for direct API access
import {
  birdeyeService,
  BirdeyeListToken,
} from "../../services/birdeyeService";
import {
  blockvisionService,
  CoinMarketData,
} from "../../services/blockvisionService";

import "./MarketDashboard.scss";

// Define SUI address constants to use consistently across the codebase
const FULL_SUI_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const SHORT_SUI_ADDRESS = "0x2::sui::SUI";

// Token interface to represent the combined data from both APIs
interface TokenData {
  rank: number;
  address: string;
  name: string;
  symbol: string;
  logoURI: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  fdv: number;
  circulatingSupply: number;
  totalSupply: number;
  // Add a status field to track token loading state
  status: "loading" | "loaded" | "error";
}

// Enum for sorting columns
enum SortColumn {
  Rank = "rank",
  Name = "name",
  Price = "price",
  PriceChange = "priceChange24h",
  Volume = "volume24h",
  MarketCap = "marketCap",
  Liquidity = "liquidity",
  FDV = "fdv",
  CirculatingSupply = "circulatingSupply",
  TotalSupply = "totalSupply",
}

// Sort direction type
type SortDirection = "asc" | "desc";

// Helper function to normalize addresses (especially SUI)
const normalizeAddress = (address: string): string => {
  if (!address) return address;

  // If this is the abbreviated SUI address, replace with full version
  if (address === SHORT_SUI_ADDRESS) {
    return FULL_SUI_ADDRESS;
  }
  return address;
};

// Helper function to safely parse numeric values
function safeParseFloat(value: any): number {
  if (value === undefined || value === null) return 0;

  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

// Helper function to format numbers with appropriate suffixes
function formatNumber(num: number, digits: number = 2): string {
  if (num === null || isNaN(num)) return "N/A";

  if (num < 1000) {
    return num.toFixed(digits);
  } else if (num < 1000000) {
    return (num / 1000).toFixed(digits) + "K";
  } else if (num < 1000000000) {
    return (num / 1000000).toFixed(digits) + "M";
  } else {
    return (num / 1000000000).toFixed(digits) + "B";
  }
}

// Helper function to format prices with proper decimals
function formatPrice(price: number): string {
  if (price === null || isNaN(price)) return "N/A";

  if (price < 0.0001) {
    return "$" + price.toFixed(8);
  } else if (price < 0.01) {
    return "$" + price.toFixed(6);
  } else if (price < 1) {
    return "$" + price.toFixed(4);
  } else if (price < 10) {
    return "$" + price.toFixed(3);
  } else {
    return "$" + price.toFixed(2);
  }
}

// Helper function to format dollar values
function formatDollarValue(value: number): string {
  if (value === null || isNaN(value)) return "N/A";

  return "$" + formatNumber(value);
}

// Helper function to format percentage
function formatPercentage(value: number): string {
  if (value === null || isNaN(value)) return "N/A";

  return value.toFixed(2) + "%";
}

// Search function to filter tokens
function filterTokens(tokens: TokenData[], searchTerm: string): TokenData[] {
  if (!searchTerm) return tokens;

  const term = searchTerm.toLowerCase();
  return tokens.filter(
    (token) =>
      token.name.toLowerCase().includes(term) ||
      token.symbol.toLowerCase().includes(term) ||
      token.address.toLowerCase().includes(term)
  );
}

// Specific address for haSui token
const HASUI_ADDRESS =
  "0x5855451d273efbc5cd8cda16c10378aaf82d2ae4a1b2192e07beccc680e66c0::hasui::HASUI";

/* ------------------------------------------------------------------ */
/*  Re‑usable skeleton row (shows 8 columns + logo placeholder)       */
/* ------------------------------------------------------------------ */
const SkeletonRow: React.FC = () => (
  <tr className="skeleton-row">
    <td className="rank-col">
      <div className="sk-box short" />
    </td>
    <td className="name-col">
      <div className="sk-logo" />
      <div className="sk-box medium" />
    </td>
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i}>
        <div className="sk-box long" />
      </td>
    ))}
  </tr>
);

// Loading state row to use when just a specific token's data is loading
const LoadingRow: React.FC<{ token: TokenData }> = ({ token }) => (
  <tr key={token.address}>
    <td className="rank-col">{token.rank}</td>
    <td className="name-col">
      <img
        src={token.logoURI || "/assets/images/unknown-token.png"}
        alt={token.symbol}
        className="token-logo"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          if (token.symbol === "HASUI" || token.address === HASUI_ADDRESS) {
            target.src = "/haSui.webp";
          } else {
            target.src = "/assets/images/unknown-token.png";
          }
        }}
      />
      <div className="token-info">
        <div className="token-name">{token.name}</div>
        <div className="token-symbol">{token.symbol}</div>
      </div>
    </td>
    <td className="price-col">
      <div className="sk-box medium" />
    </td>
    <td className="change-col">
      <div className="sk-box medium" />
    </td>
    <td className="volume-col">
      <div className="sk-box medium" />
    </td>
    <td className="market-cap-col">
      <div className="sk-box medium" />
    </td>
    <td className="liquidity-col">
      <div className="sk-box medium" />
    </td>
    <td className="fdv-col">
      <div className="sk-box medium" />
    </td>
    <td className="supply-col">
      <div className="sk-box medium" />
    </td>
    <td className="supply-col">
      <div className="sk-box medium" />
    </td>
  </tr>
);

// Number of tokens to load initially for better initial performance
const INITIAL_LOAD_COUNT = 20;

// Main component for the Market Dashboard
function MarketDashboard() {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<TokenData[]>([]);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<SortColumn>(
    SortColumn.MarketCap
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Track how many tokens have been loaded with market data
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_LOAD_COUNT);

  // Ref to track if component is mounted
  const isMounted = useRef<boolean>(true);

  // Ref to the table container for intersection observer
  const tableEndRef = useRef<HTMLDivElement>(null);

  // Ref to prevent overlapping refreshes (mutex)
  const inFlight = useRef<boolean>(false);

  // Initial load of token list from Birdeye
  const loadTokenList = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);
    setInitialLoading(true);

    try {
      console.log("Fetching token list from Birdeye API...");
      const birdeyeTokens = await birdeyeService.getTokenList(
        "sui",
        50,
        0,
        500_000
      );

      // Initialize tokens with loading state
      const initialTokens: TokenData[] = birdeyeTokens.map((t, i) => {
        // Check for haSui and use local logo
        let logoURI = t.logoURI;
        if (t.symbol === "HASUI" || t.address === HASUI_ADDRESS) {
          logoURI = "/haSui.webp";
          console.log("Using local logo for haSui token");
        }

        // Normalize SUI address
        const address = normalizeAddress(t.address);

        return {
          rank: i + 1,
          address: address,
          name: t.name ?? "Unknown",
          symbol: t.symbol ?? "UNKNOWN",
          logoURI: logoURI ?? "",
          price: t.price || 0,
          priceChange24h: 0,
          volume24h: t.v24hUSD || 0,
          marketCap: 0,
          liquidity: t.liquidity || 0,
          fdv: 0,
          circulatingSupply: 0,
          totalSupply: 0,
          status: "loading",
        };
      });

      // Sort by market cap (using Birdeye's data initially)
      initialTokens.sort((a, b) => b.marketCap - a.marketCap);
      initialTokens.forEach((t, idx) => (t.rank = idx + 1));

      setTokens(initialTokens);
      setFilteredTokens(initialTokens);

      // Load the first batch of token data immediately
      const initialBatch = initialTokens
        .slice(0, INITIAL_LOAD_COUNT)
        .map((t) => t.address);
      await loadTokensData(initialBatch);

      setInitialLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());

      // Load the rest of the tokens in the background
      const remainingBatch = initialTokens
        .slice(INITIAL_LOAD_COUNT)
        .map((t) => t.address);
      loadTokensData(remainingBatch);
    } catch (e: any) {
      console.error("Failed to load token list:", e);
      setError(e.message ?? "Failed to load token list");
      setInitialLoading(false);
    } finally {
      setRefreshing(false);
      inFlight.current = false;
    }
  }, []);

  // Function to load tokens market data using our service
  const loadTokensData = useCallback(async (tokenIds: string[]) => {
    if (!tokenIds.length) return;

    try {
      console.log(`Fetching market data for ${tokenIds.length} tokens...`);

      // Use the hybrid approach for fetching market data
      const marketData = await blockvisionService.getCoinMarketDataHybrid(
        tokenIds,
        2
      );

      // Update the tokens with the fetched market data
      setTokens((prev) => {
        const updatedTokens = [...prev];

        tokenIds.forEach((id) => {
          const normalizedId = normalizeAddress(id);
          const tokenIndex = updatedTokens.findIndex(
            (t) => t.address === normalizedId || t.address === id
          );
          if (tokenIndex === -1) return;

          const data = marketData[normalizedId] || marketData[id];
          if (!data) {
            // Mark as error if no data was found
            updatedTokens[tokenIndex].status = "error";
            return;
          }

          const token = updatedTokens[tokenIndex];
          token.price = safeParseFloat(data.priceInUsd);
          token.priceChange24h = safeParseFloat(
            data.market?.hour24?.priceChange ?? 0
          );
          token.volume24h = safeParseFloat(data.volume24H);
          token.marketCap = safeParseFloat(data.marketCap);
          token.liquidity = safeParseFloat(data.liquidityInUsd);
          token.fdv = safeParseFloat(data.fdvInUsd);
          token.circulatingSupply = safeParseFloat(data.circulating);
          token.totalSupply = safeParseFloat(data.supply);
          token.status = "loaded";
        });

        // Resort by market cap after updating
        const sorted = [...updatedTokens].sort(
          (a, b) => b.marketCap - a.marketCap
        );
        sorted.forEach((t, idx) => (t.rank = idx + 1));

        // Count how many tokens have loaded data
        const loaded = sorted.filter((t) => t.status === "loaded").length;
        setLoadedCount(loaded);

        return sorted;
      });

      console.log(`Updated market data for ${tokenIds.length} tokens`);
    } catch (e: any) {
      console.error("Failed to load market data:", e);
      // Don't set global error for background loads, just mark the tokens as error
      setTokens((prev) => {
        const updatedTokens = [...prev];
        tokenIds.forEach((id) => {
          const normalizedId = normalizeAddress(id);
          const tokenIndex = updatedTokens.findIndex(
            (t) => t.address === normalizedId || t.address === id
          );
          if (tokenIndex !== -1) {
            updatedTokens[tokenIndex].status = "error";
          }
        });
        return updatedTokens;
      });
    }
  }, []);

  // Initial data load
  useEffect(() => {
    loadTokenList();

    // Clean up effect
    return () => {
      isMounted.current = false;
    };
  }, [loadTokenList]);

  // Set up intersection observer for infinite scrolling
  useEffect(() => {
    if (!tableEndRef.current || initialLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && visibleCount < filteredTokens.length) {
          // Load more rows when the user scrolls to the bottom
          setVisibleCount((prev) => Math.min(prev + 10, filteredTokens.length));
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(tableEndRef.current);
    return () => observer.disconnect();
  }, [initialLoading, visibleCount, filteredTokens.length]);

  // Filter tokens on search
  useEffect(() => {
    setFilteredTokens(filterTokens(tokens, searchTerm));
    // Reset visible count when search changes
    setVisibleCount(INITIAL_LOAD_COUNT);
  }, [tokens, searchTerm]);

  // Handle sort column change
  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      // Set new column and default to descending
      setSortColumn(column);
      setSortDirection("desc");
    }

    // Sort the tokens
    const sorted = [...filteredTokens].sort((a, b) => {
      const aValue = a[column];
      const bValue = b[column];

      if (column === "name" || column === "symbol") {
        // Sort strings
        return sortDirection === "asc"
          ? String(aValue).localeCompare(String(bValue))
          : String(bValue).localeCompare(String(aValue));
      } else {
        // Sort numbers
        return sortDirection === "asc"
          ? Number(aValue) - Number(bValue)
          : Number(bValue) - Number(aValue);
      }
    });

    setFilteredTokens(sorted);
  };

  // Get sort icon
  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) {
      return <FaSort className="sort-icon" />;
    } else {
      return sortDirection === "asc" ? (
        <FaSortUp className="sort-icon active" />
      ) : (
        <FaSortDown className="sort-icon active" />
      );
    }
  };

  // Calculate market summary stats based on loaded tokens only
  const loadedTokens = tokens.filter((t) => t.status === "loaded");
  const marketStats = {
    totalMarketCap: loadedTokens.reduce(
      (sum, token) => sum + token.marketCap,
      0
    ),
    totalVolume24h: loadedTokens.reduce(
      (sum, token) => sum + token.volume24h,
      0
    ),
    totalTokens: tokens.length,
    loadedTokens: loadedCount,
    averagePriceChange:
      loadedTokens.length > 0
        ? loadedTokens.reduce((sum, token) => sum + token.priceChange24h, 0) /
          loadedTokens.length
        : 0,
  };

  // Handle refresh click
  const handleRefresh = () => {
    if (!refreshing) {
      loadTokenList();
    }
  };

  // Helper to get appropriate token logo
  const getTokenLogo = (token: TokenData) => {
    if (token.symbol === "HASUI" || token.address === HASUI_ADDRESS) {
      return "/haSui.webp";
    }
    return token.logoURI;
  };

  // Visible tokens for lazy loading
  const visibleTokens = filteredTokens.slice(0, visibleCount);

  return (
    <div className="market-dashboard">
      <div className="container">
        <h1>Market Dashboard</h1>

        {/* Market summary panel with enhanced UI */}
        <div className="market-summary">
          <div className="summary-stat">
            <div className="stat-label">Market Cap</div>
            <div
              className={`stat-value ${
                marketStats.totalMarketCap > 0 ? "positive" : ""
              }`}
            >
              {initialLoading ? (
                <span className="sk-box long" style={{ height: "18px" }} />
              ) : (
                formatDollarValue(marketStats.totalMarketCap)
              )}
            </div>
          </div>
          <div className="summary-stat">
            <div className="stat-label">24h Volume</div>
            <div className="stat-value">
              {initialLoading ? (
                <span className="sk-box long" style={{ height: "18px" }} />
              ) : (
                formatDollarValue(marketStats.totalVolume24h)
              )}
            </div>
          </div>
          <div className="summary-stat">
            <div className="stat-label">Tokens</div>
            <div className="stat-value">
              {initialLoading ? (
                <span className="sk-box long" style={{ height: "18px" }} />
              ) : (
                // Replace "40/40 loaded" with "The Sui 40"
                "The Sui 40"
              )}
            </div>
          </div>
          <div className="summary-stat">
            <div className="stat-label">Avg Price Change (24h)</div>
            <div
              className={`stat-value ${
                marketStats.averagePriceChange >= 0 ? "positive" : "negative"
              }`}
            >
              {initialLoading ? (
                <span className="sk-box long" style={{ height: "18px" }} />
              ) : (
                `${
                  marketStats.averagePriceChange >= 0 ? "+" : ""
                }${formatPercentage(marketStats.averagePriceChange)}`
              )}
            </div>
          </div>
        </div>

        {/* Controls section with enhanced UI */}
        <div className="controls">
          <div className="search-container">
            <FaSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search by name, symbol or address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
          <div className="controls-right">
            <button
              className={`refresh-button ${refreshing ? "refreshing" : ""}`}
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <FaSync className={`refresh-icon ${refreshing ? "spin" : ""}`} />
              {refreshing ? "REFRESHING..." : "REFRESH"}
            </button>
            {!initialLoading && (
              <span className="last-updated">
                Updated {lastUpdated || "Never"}
              </span>
            )}
          </div>
        </div>

        {/* Error display with enhanced UI */}
        {error && (
          <div className="error-message">
            <FaExclamationTriangle /> {error}
            <button onClick={handleRefresh}>Try Again</button>
          </div>
        )}

        {/* Table component with enhanced UI */}
        <div className="table-container">
          <table className="token-table">
            <thead>
              <tr>
                <th
                  onClick={() => handleSort(SortColumn.Rank)}
                  className="rank-col"
                >
                  # {getSortIcon(SortColumn.Rank)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.Name)}
                  className="name-col"
                >
                  Name {getSortIcon(SortColumn.Name)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.Price)}
                  className="price-col"
                >
                  Price {getSortIcon(SortColumn.Price)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.PriceChange)}
                  className="change-col"
                >
                  24h Change {getSortIcon(SortColumn.PriceChange)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.Volume)}
                  className="volume-col"
                >
                  24h Volume {getSortIcon(SortColumn.Volume)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.MarketCap)}
                  className="market-cap-col"
                >
                  Market Cap {getSortIcon(SortColumn.MarketCap)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.Liquidity)}
                  className="liquidity-col"
                >
                  Liquidity {getSortIcon(SortColumn.Liquidity)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.FDV)}
                  className="fdv-col"
                >
                  FDV {getSortIcon(SortColumn.FDV)}
                  <span className="info-tooltip">
                    <FaInfoCircle />
                    <span className="tooltip-text">
                      Fully Diluted Valuation = Price × Total Supply
                    </span>
                  </span>
                </th>
                <th
                  onClick={() => handleSort(SortColumn.CirculatingSupply)}
                  className="supply-col"
                >
                  Circ. Supply {getSortIcon(SortColumn.CirculatingSupply)}
                </th>
                <th
                  onClick={() => handleSort(SortColumn.TotalSupply)}
                  className="supply-col"
                >
                  Total Supply {getSortIcon(SortColumn.TotalSupply)}
                </th>
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                /* ⇢  Show 8 shimmering rows while we're initially loading  */
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filteredTokens.length === 0 ? (
                <tr>
                  <td colSpan={10} className="no-results">
                    No tokens match your search criteria
                  </td>
                </tr>
              ) : (
                visibleTokens.map((token) => {
                  // If token data is still loading, show loading row
                  if (token.status === "loading") {
                    return <LoadingRow key={token.address} token={token} />;
                  }

                  // Otherwise show the token data
                  return (
                    <tr key={token.address}>
                      <td className="rank-col">{token.rank}</td>
                      <td className="name-col">
                        <img
                          src={getTokenLogo(token)}
                          alt={token.symbol}
                          className="token-logo"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            console.log(
                              `Failed to load logo for ${token.symbol}, using fallback`
                            );
                            // Try a second time with haSui local logo if applicable
                            if (
                              token.symbol === "HASUI" ||
                              token.address === HASUI_ADDRESS
                            ) {
                              target.src = "/haSui.webp";
                            } else {
                              target.src = "/assets/images/unknown-token.png";
                            }
                          }}
                        />
                        <div className="token-info">
                          <div className="token-name">{token.name}</div>
                          <div className="token-symbol">{token.symbol}</div>
                        </div>
                      </td>
                      <td className="price-col">{formatPrice(token.price)}</td>
                      <td
                        className={`change-col ${
                          token.priceChange24h >= 0 ? "positive" : "negative"
                        }`}
                      >
                        {token.priceChange24h >= 0 ? (
                          <FaCaretUp />
                        ) : (
                          <FaCaretDown />
                        )}
                        {formatPercentage(Math.abs(token.priceChange24h))}
                      </td>
                      <td className="volume-col">
                        {formatDollarValue(token.volume24h)}
                      </td>
                      <td className="market-cap-col">
                        {formatDollarValue(token.marketCap)}
                      </td>
                      <td className="liquidity-col">
                        {formatDollarValue(token.liquidity)}
                      </td>
                      <td className="fdv-col">
                        {token.fdv ? formatDollarValue(token.fdv) : "N/A"}
                      </td>
                      <td className="supply-col">
                        {token.circulatingSupply
                          ? formatNumber(token.circulatingSupply)
                          : "N/A"}
                      </td>
                      <td className="supply-col">
                        {token.totalSupply
                          ? formatNumber(token.totalSupply)
                          : "N/A"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {/* Invisible div for intersection observer to detect scroll */}
          <div ref={tableEndRef} style={{ height: "1px" }} />

          {/* Loading indicator for lazy loading */}
          {!initialLoading && visibleCount < filteredTokens.length && (
            <div className="loading-more">Loading more tokens...</div>
          )}
        </div>

        {/* Footer with info */}
        <div className="dashboard-footer">
          <div className="data-attribution">
            <div className="attribution-item">
              <FaChartBar className="attribution-icon" />
              Data from Birdeye and BlockVision APIs
            </div>
            <div className="update-frequency">
              <FaSync className="update-icon" />
              Data refreshed manually. Click Refresh for latest data.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MarketDashboard;
