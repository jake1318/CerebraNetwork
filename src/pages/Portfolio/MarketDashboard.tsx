// src/pages/Portfolio/MarketDashboard.tsx
// Last Updated: 2025-07-12 05:22:11 UTC by jake1318

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
  FaExclamationTriangle
} from "react-icons/fa";

// Import services for direct API access
import { birdeyeService, BirdeyeListToken } from "../../services/birdeyeService";
import { blockvisionService, CoinMarketData } from "../../services/blockvisionService";

import "./MarketDashboard.scss";

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

// Helper function to safely parse numeric values
function safeParseFloat(value: any): number {
  if (value === undefined || value === null) return 0;
  
  if (typeof value === 'number') return value;
  
  if (typeof value === 'string') {
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
const HASUI_ADDRESS = "0x5855451d273efbc5cd8cda16c10378aaf82d2ae4a1b2192e07beccc680e66c0::hasui::HASUI";

/* ------------------------------------------------------------------ */
/*  Re‑usable skeleton row (shows 8 columns + logo placeholder)       */
/* ------------------------------------------------------------------ */
const SkeletonRow: React.FC = () => (
  <tr className="skeleton-row">
    <td className="rank-col"><div className="sk-box short" /></td>
    <td className="name-col">
      <div className="sk-logo" />
      <div className="sk-box medium" />
    </td>
    {Array.from({ length: 8 }).map((_, i) => (
      <td key={i}><div className="sk-box long" /></td>
    ))}
  </tr>
);

// Main component for the Market Dashboard
function MarketDashboard() {
  const [tokens, setTokens] = useState<TokenData[]>([]);
  const [filteredTokens, setFilteredTokens] = useState<TokenData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [sortColumn, setSortColumn] = useState<SortColumn>(
    SortColumn.MarketCap
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // Ref to track if component is mounted
  const isMounted = useRef<boolean>(true);
  
  // Ref to prevent overlapping refreshes (mutex)
  const inFlight = useRef<boolean>(false);

  // Function to load tokens data using our service directly
  const loadTokensData = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRefreshing(true);

    try {
      console.log("Fetching token market data...");
      
      /* 1 ─ Birdeye list */
      console.log("Fetching token list from Birdeye API...");
      const birdeyeTokens = await birdeyeService.getTokenList("sui", 50, 0, 500_000);
      const tokenIds = birdeyeTokens.map(t => t.address);
      
      console.log(`Successfully fetched ${birdeyeTokens.length} tokens from Birdeye`);

      /* 2 ─ BlockVision (all tokens with concurrency) */
      console.log(`Fetching BlockVision market/pro (${tokenIds.length} tokens with 8-way concurrency)...`);
      // pro plan – fetch all tokens (≈50) with 8‑way concurrency
      const bv = await blockvisionService.getCoinMarketDataBatch(tokenIds, 8);

      /* 3 ─ merge */
      const rows: TokenData[] = birdeyeTokens.map((t, i) => {
        const m   = bv[t.address];             // undefined if not fetched
        const px  = safeParseFloat(m?.priceInUsd ?? t.price);
        const circ= safeParseFloat(m?.circulating);
        const mc  = m ? safeParseFloat(m.marketCap) : px * circ;
        
        // Check for haSui and use local logo
        let logoURI = t.logoURI;
        if (t.symbol === "HASUI" || t.address === HASUI_ADDRESS) {
          logoURI = "/haSui.webp"; // Use our local logo
          console.log("Using local logo for haSui token");
        }

        return {
          rank: i + 1,
          address: t.address,
          name: t.name ?? "Unknown",
          symbol: t.symbol ?? "UNKNOWN",
          logoURI: logoURI ?? "",
          price: px,
          priceChange24h: safeParseFloat(m?.market?.hour24?.priceChange ?? 0),
          volume24h: safeParseFloat(m?.volume24H ?? t.v24hUSD),
          marketCap: mc,
          liquidity: safeParseFloat(m?.liquidityInUsd ?? t.liquidity),
          fdv: safeParseFloat(m?.fdvInUsd),
          circulatingSupply: circ,
          totalSupply: safeParseFloat(m?.supply),
        };
      });

      rows.sort((a, b) => b.marketCap - a.marketCap);
      rows.forEach((r, idx) => (r.rank = idx + 1));
      
      console.log(`Merged ${rows.length} tokens – dashboard ready`);

      setTokens(rows);
      setFilteredTokens(rows);
      setLastUpdated(new Date().toLocaleTimeString());
      setError(null);
    } catch (e: any) {
      console.error("Failed to load market data:", e);
      setError(e.message ?? "Failed to load market data");
    } finally {
      setRefreshing(false);
      inFlight.current = false;
    }
  }, []);

  // Initial data load
  useEffect(() => {
    setLoading(true);
    loadTokensData().finally(() => setLoading(false));

    // Clean up effect
    return () => {
      isMounted.current = false;
    };
  }, [loadTokensData]);

  // Filter tokens on search
  useEffect(() => {
    setFilteredTokens(filterTokens(tokens, searchTerm));
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
  
  // Calculate market summary stats
  const marketStats = {
    totalMarketCap: filteredTokens.reduce((sum, token) => sum + token.marketCap, 0),
    totalVolume24h: filteredTokens.reduce((sum, token) => sum + token.volume24h, 0),
    totalTokens: filteredTokens.length,
    averagePriceChange: filteredTokens.length > 0 
      ? filteredTokens.reduce((sum, token) => sum + token.priceChange24h, 0) / filteredTokens.length
      : 0
  };
  
  // Handle refresh click
  const handleRefresh = () => {
    if (!refreshing) {
      loadTokensData();
    }
  };

  // Helper to get appropriate token logo
  const getTokenLogo = (token: TokenData) => {
    if (token.symbol === "HASUI" || token.address === HASUI_ADDRESS) {
      return "/haSui.webp";
    }
    return token.logoURI;
  };

  return (
    <div className="market-dashboard">
      {/* Market summary panel with shimmering placeholders when loading */}
      <div className="market-summary">
        <div className="summary-stat">
          <div className="stat-label">Market Cap</div>
          <div className="stat-value">
            {loading
              ? <span className="sk-box long" style={{height: '18px'}}/>
              : formatDollarValue(marketStats.totalMarketCap)}
          </div>
        </div>
        <div className="summary-stat">
          <div className="stat-label">24h Volume</div>
          <div className="stat-value">
            {loading
              ? <span className="sk-box long" style={{height: '18px'}}/>
              : formatDollarValue(marketStats.totalVolume24h)}
          </div>
        </div>
        <div className="summary-stat">
          <div className="stat-label">Tokens</div>
          <div className="stat-value">
            {loading
              ? <span className="sk-box long" style={{height: '18px'}}/>
              : marketStats.totalTokens}
          </div>
        </div>
        <div className="summary-stat">
          <div className="stat-label">Avg Price Change (24h)</div>
          <div className={`stat-value ${marketStats.averagePriceChange >= 0 ? 'positive' : 'negative'}`}>
            {loading
              ? <span className="sk-box long" style={{height: '18px'}}/>
              : `${marketStats.averagePriceChange >= 0 ? '+' : ''}${formatPercentage(marketStats.averagePriceChange)}`}
          </div>
        </div>
      </div>
      
      {/* Controls section */}
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
        <div className="refresh-container">
          <button 
            className={`refresh-button ${refreshing ? 'refreshing' : ''}`}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <FaSync className={`refresh-icon ${refreshing ? 'spin' : ''}`} />
            Refresh
          </button>
          <div className="last-updated">
            Last updated: {lastUpdated || 'Never'}
          </div>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="error-message">
          <FaExclamationTriangle /> {error}
        </div>
      )}
      
      {/* Table component with skeleton loader */}
      <div className="table-container">
        <table className="market-table">
          <thead>
            <tr>
              <th onClick={() => handleSort(SortColumn.Rank)} className="rank-col">
                # {getSortIcon(SortColumn.Rank)}
              </th>
              <th onClick={() => handleSort(SortColumn.Name)} className="name-col">
                Name {getSortIcon(SortColumn.Name)}
              </th>
              <th onClick={() => handleSort(SortColumn.Price)} className="price-col">
                Price {getSortIcon(SortColumn.Price)}
              </th>
              <th onClick={() => handleSort(SortColumn.PriceChange)} className="change-col">
                24h Change {getSortIcon(SortColumn.PriceChange)}
              </th>
              <th onClick={() => handleSort(SortColumn.Volume)} className="volume-col">
                24h Volume {getSortIcon(SortColumn.Volume)}
              </th>
              <th onClick={() => handleSort(SortColumn.MarketCap)} className="market-cap-col">
                Market Cap {getSortIcon(SortColumn.MarketCap)}
              </th>
              <th onClick={() => handleSort(SortColumn.Liquidity)} className="liquidity-col">
                Liquidity {getSortIcon(SortColumn.Liquidity)}
              </th>
              <th onClick={() => handleSort(SortColumn.FDV)} className="fdv-col">
                FDV {getSortIcon(SortColumn.FDV)}
                <span className="info-tooltip">
                  <FaInfoCircle />
                  <span className="tooltip-text">Fully Diluted Valuation = Price × Total Supply</span>
                </span>
              </th>
              <th onClick={() => handleSort(SortColumn.CirculatingSupply)} className="supply-col">
                Circ. Supply {getSortIcon(SortColumn.CirculatingSupply)}
              </th>
              <th onClick={() => handleSort(SortColumn.TotalSupply)} className="supply-col">
                Total Supply {getSortIcon(SortColumn.TotalSupply)}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? /* ⇢  Show 8 shimmering rows while we're fetching  */
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              : filteredTokens.length === 0
                  ? (
                    <tr>
                      <td colSpan={10} className="no-results">
                        No tokens match your search criteria
                      </td>
                    </tr>
                  )
                  : filteredTokens.map((token) => (
                    <tr key={token.address}>
                      <td className="rank-col">{token.rank}</td>
                      <td className="name-col">
                        <img
                          src={getTokenLogo(token)}
                          alt={token.symbol}
                          className="token-logo"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            console.log(`Failed to load logo for ${token.symbol}, using fallback`);
                            // Try a second time with haSui local logo if applicable
                            if (token.symbol === "HASUI" || token.address === HASUI_ADDRESS) {
                              target.src = "/haSui.webp";
                            } else {
                              target.src = '/assets/images/unknown-token.png';
                            }
                          }}
                        />
                        <div className="token-info">
                          <div className="token-name">{token.name}</div>
                          <div className="token-symbol">{token.symbol}</div>
                        </div>
                      </td>
                      <td className="price-col">{formatPrice(token.price)}</td>
                      <td className={`change-col ${token.priceChange24h >= 0 ? 'positive' : 'negative'}`}>
                        {token.priceChange24h >= 0 ? <FaCaretUp /> : <FaCaretDown />}
                        {formatPercentage(Math.abs(token.priceChange24h))}
                      </td>
                      <td className="volume-col">{formatDollarValue(token.volume24h)}</td>
                      <td className="market-cap-col">{formatDollarValue(token.marketCap)}</td>
                      <td className="liquidity-col">{formatDollarValue(token.liquidity)}</td>
                      <td className="fdv-col">
                        {token.fdv ? formatDollarValue(token.fdv) : "N/A"}
                      </td>
                      <td className="supply-col">
                        {token.circulatingSupply ? formatNumber(token.circulatingSupply) : "N/A"}
                      </td>
                      <td className="supply-col">
                        {token.totalSupply ? formatNumber(token.totalSupply) : "N/A"}
                      </td>
                    </tr>
                  ))}
          </tbody>
        </table>
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
  );
}

export default MarketDashboard;