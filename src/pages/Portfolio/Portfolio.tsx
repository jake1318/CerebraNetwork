// src/pages/Portfolio.tsx
// Last Updated: 2025-05-22 18:27:46 UTC by jake1318

// NOTE: This component requires the react-icons package:
// npm install react-icons --save
// or: yarn add react-icons

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { FaCaretUp, FaCaretDown, FaChevronDown } from "react-icons/fa";

import "./Portfolio.scss";
import blockvisionService from "../../services/blockvisionService";
import * as birdeyeService from "../../services/birdeyeService";

// Import components
import ProtocolBadge from "../PoolsPage/ProtocolBadge";

// Map of token addresses for well-known tokens (Sui mainnet)
const TOKEN_ADDRESSES: Record<string, string> = {
  SUI: "0x2::sui::SUI",
  USDC: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
  USDT: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
  WAL: "0x1e8b532cca6569cab9f9b9ebc73f8c13885012ade714729aa3b450e0339ac766::coin::COIN",
  HASUI:
    "0x680eb4a8e1074d7e15186c40dcf8d3b749f1ddba4c60478c367fc9c24a5a5a29::hasui::HASUI",
};

// Hardcoded token logos for fallbacks
const HARDCODED_LOGOS: Record<string, string> = {
  CETUS:
    "https://coin-images.coingecko.com/coins/images/30256/large/cetus.png?1696529165",
  USDC: "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
  USDT: "https://assets.coingecko.com/coins/images/325/thumb/Tether.png",
  WAL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS/logo.png",
  HASUI: "https://archive.cetus.zone/assets/image/sui/hasui.png",
  "HA-SUI": "https://archive.cetus.zone/assets/image/sui/hasui.png",
  SLOVE:
    "https://coin-images.coingecko.com/coins/images/54967/small/logo_square_color.png",
  BLUB: "https://coin-images.coingecko.com/coins/images/39356/small/Frame_38.png",
  CHIRP:
    "https://coin-images.coingecko.com/coins/images/52894/small/Chirp_Icon_Round.png",
  WUSDC:
    "https://assets.coingecko.com/coins/images/6319/thumb/USD_Coin_icon.png",
};

// Token metadata cache to prevent repeated API calls
const tokenMetadataCache: Record<string, any> = {};

// List of token aliases to normalize symbols
const TOKEN_ALIASES: Record<string, string> = {
  $SUI: "SUI",
  $USDC: "USDC",
  WUSDC: "USDC",
  "HA-SUI": "HASUI",
};

// Helper function to format large token balances
function formatTokenBalance(
  balance: string | number,
  decimals: number = 9
): string {
  if (!balance) return "0";

  // Convert to number and apply decimals
  let numBalance: number;
  if (typeof balance === "string") {
    // Check if this is a raw integer representation of token amount
    if (balance.indexOf(".") === -1) {
      numBalance = parseFloat(balance) / Math.pow(10, decimals);
    } else {
      // Already in decimal form
      numBalance = parseFloat(balance);
    }
  } else {
    numBalance = balance / Math.pow(10, decimals);
  }

  // Format based on size
  if (numBalance >= 1000000000) {
    return (numBalance / 1000000000).toFixed(2) + "B";
  } else if (numBalance >= 1000000) {
    return (numBalance / 1000000).toFixed(2) + "M";
  } else if (numBalance >= 1000) {
    return (numBalance / 1000).toFixed(2) + "K";
  } else if (numBalance >= 1) {
    return numBalance.toFixed(2);
  } else if (numBalance > 0) {
    // Show more decimal places for small amounts
    return numBalance.toFixed(4);
  } else {
    return "0";
  }
}

// Mock data for portfolio history chart
const generateMockPortfolioHistory = (currentValue: number) => {
  const dates = [];
  const values = [];
  const today = new Date();

  // Generate data for the past 30 days
  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(today.getDate() - i);
    dates.push(date.toISOString().split("T")[0]);

    // Generate a somewhat realistic value progression leading to current value
    // Start at 80-120% of current value and create some variance
    const startFactor = 0.8 + Math.random() * 0.4; // 80-120% of current
    const randomFactor = 1 + (Math.random() * 0.1 - 0.05); // +/- 5%
    const dayProgress = i / 30;
    const baseValue = startFactor * currentValue;
    const progressValue =
      baseValue + (currentValue - baseValue) * (1 - dayProgress);
    values.push(Math.round(progressValue * randomFactor * 100) / 100);
  }

  return { dates, values };
};

// Clean symbol name for consistent lookup
function normalizeSymbol(symbol: string): string {
  if (!symbol) return "";

  // Remove $ prefix if present
  const cleaned = symbol.trim().toUpperCase();

  // Check aliases first
  if (TOKEN_ALIASES[cleaned]) {
    return TOKEN_ALIASES[cleaned];
  }

  return cleaned;
}

// Utility to sanitize logo URLs
function sanitizeLogoUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("ipfs://")) {
    return url.replace(/^ipfs:\/\//, "https://cloudflare-ipfs.com/ipfs/");
  }
  if (url.includes("ipfs.io")) {
    url = url.replace("http://", "https://");
    return url.replace("https://ipfs.io", "https://cloudflare-ipfs.com");
  }
  if (url.startsWith("http://")) {
    return "https://" + url.slice(7);
  }
  return url;
}

// Enhanced token icon component with fallbacks
function EnhancedTokenIcon({
  symbol,
  logoUrl,
  address,
  size = "sm",
  metadata,
}: {
  symbol: string;
  logoUrl?: string;
  address?: string;
  size?: "sm" | "md" | "lg";
  metadata?: any;
}) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const safeSymbol = symbol || "?";
  const normalizedSymbol = normalizeSymbol(safeSymbol);

  // Decide which logo URL to use with priority order
  useEffect(() => {
    const getLogoUrl = async () => {
      // 1. First try metadata from props if available
      if (
        metadata?.logo_uri ||
        metadata?.logoUrl ||
        metadata?.logoURI ||
        metadata?.logo
      ) {
        const metadataLogo =
          metadata.logo_uri ||
          metadata.logoUrl ||
          metadata.logoURI ||
          metadata.logo;
        setCurrentUrl(sanitizeLogoUrl(metadataLogo));
        return;
      }

      // 2. Try logoUrl passed directly as prop
      if (logoUrl) {
        setCurrentUrl(sanitizeLogoUrl(logoUrl));
        return;
      }

      // 3. Check hardcoded logos for known tokens
      if (HARDCODED_LOGOS[normalizedSymbol]) {
        setCurrentUrl(HARDCODED_LOGOS[normalizedSymbol]);
        return;
      }

      // 4. If we have an address, try to fetch from BirdEye API
      if (address) {
        try {
          // Check cache first
          if (tokenMetadataCache[address]) {
            const cachedMetadata = tokenMetadataCache[address];
            const cachedLogo =
              cachedMetadata.logo_uri ||
              cachedMetadata.logoUrl ||
              cachedMetadata.logoURI ||
              cachedMetadata.logo;
            if (cachedLogo) {
              setCurrentUrl(sanitizeLogoUrl(cachedLogo));
              return;
            }
          }

          // Fetch from API if not in cache
          const tokenMetadata = await birdeyeService.getTokenMetadata(address);
          if (tokenMetadata) {
            tokenMetadataCache[address] = tokenMetadata;
            const apiLogo =
              tokenMetadata.logo_uri ||
              tokenMetadata.logoUrl ||
              tokenMetadata.logoURI ||
              tokenMetadata.logo;
            if (apiLogo) {
              setCurrentUrl(sanitizeLogoUrl(apiLogo));
              return;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch metadata for ${address}:`, err);
        }
      }

      // 5. Try to fetch by symbol if no address
      if (!address && symbol) {
        const mappedAddress = TOKEN_ADDRESSES[normalizedSymbol];
        if (mappedAddress) {
          try {
            // Check cache first for mapped address
            if (tokenMetadataCache[mappedAddress]) {
              const cachedMetadata = tokenMetadataCache[mappedAddress];
              const cachedLogo =
                cachedMetadata.logo_uri ||
                cachedMetadata.logoUrl ||
                cachedMetadata.logoURI ||
                cachedMetadata.logo;
              if (cachedLogo) {
                setCurrentUrl(sanitizeLogoUrl(cachedLogo));
                return;
              }
            }

            // Fetch from API if not in cache
            const tokenMetadata = await birdeyeService.getTokenMetadata(
              mappedAddress
            );
            if (tokenMetadata) {
              tokenMetadataCache[mappedAddress] = tokenMetadata;
              const apiLogo =
                tokenMetadata.logo_uri ||
                tokenMetadata.logoUrl ||
                tokenMetadata.logoURI ||
                tokenMetadata.logo;
              if (apiLogo) {
                setCurrentUrl(sanitizeLogoUrl(apiLogo));
                return;
              }
            }
          } catch (err) {
            console.warn(`Failed to fetch metadata for ${mappedAddress}:`, err);
          }
        }
      }

      // 6. If all else fails, use null to show fallback letter
      setCurrentUrl(null);
    };

    getLogoUrl();
  }, [symbol, logoUrl, address, metadata, normalizedSymbol]);

  // Handle image load error
  const handleError = () => {
    console.warn(`Failed to load logo for ${symbol}: ${currentUrl}`);
    setImgFailed(true);
  };

  // Style classes based on props
  const sizeClass = `token-icon-${size}`;

  // Special class for certain tokens
  let tokenClass = "";
  if (normalizedSymbol === "SUI") {
    tokenClass = "sui-token";
  } else if (normalizedSymbol === "WAL") {
    tokenClass = "wal-token";
  } else if (normalizedSymbol === "HASUI") {
    tokenClass = "hasui-token";
  } else if (normalizedSymbol === "USDC" || normalizedSymbol === "WUSDC") {
    tokenClass = "usdc-token";
  } else if (normalizedSymbol === "CETUS") {
    tokenClass = "cetus-token";
  }

  return (
    <div
      className={`token-icon ${sizeClass} ${
        !currentUrl || imgFailed ? "token-fallback" : ""
      } ${tokenClass}`}
    >
      {currentUrl && !imgFailed ? (
        <img src={currentUrl} alt={safeSymbol} onError={handleError} />
      ) : (
        <div className="token-fallback-letter">
          {safeSymbol.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

// Modified PoolPair component for the portfolio
function PoolPair({
  tokenASymbol,
  tokenBSymbol,
  tokenAAddress,
  tokenBAddress,
  tokenAMetadata,
  tokenBMetadata,
}: {
  tokenALogo?: string;
  tokenBLogo?: string;
  tokenASymbol: string;
  tokenBSymbol: string;
  tokenAAddress?: string;
  tokenBAddress?: string;
  protocol?: string;
  poolName?: string;
  isVault?: boolean;
  tokenAMetadata?: any;
  tokenBMetadata?: any;
}) {
  // Ensure symbols always have a value
  const safeTokenASymbol = tokenASymbol || "?";
  const safeTokenBSymbol = tokenBSymbol || "?";

  // For single token cases
  const isSingleToken = !tokenBSymbol;

  return (
    <div className="portfolio-pair">
      <div className="token-icons">
        <EnhancedTokenIcon
          symbol={safeTokenASymbol}
          address={tokenAAddress}
          size="sm"
          metadata={tokenAMetadata}
        />
        {!isSingleToken && (
          <EnhancedTokenIcon
            symbol={safeTokenBSymbol}
            address={tokenBAddress}
            size="sm"
            metadata={tokenBMetadata}
          />
        )}
      </div>
      <div className="pair-name">
        {safeTokenASymbol}
        {!isSingleToken && `/${safeTokenBSymbol}`}
      </div>
    </div>
  );
}

// Wallet dropdown component
function WalletTokensDropdown({
  walletTokens,
  getTokenMetadataByAddress,
}: {
  walletTokens: any[];
  getTokenMetadataByAddress: (address: string) => any;
}) {
  const [isOpen, setIsOpen] = useState(true); // Start open by default
  const [showAll, setShowAll] = useState(false);

  // Sort tokens by value from highest to lowest
  const sortedTokens = [...walletTokens]
    .filter((token) => parseFloat(token.usdValue || "0") > 0)
    .sort(
      (a, b) => parseFloat(b.usdValue || "0") - parseFloat(a.usdValue || "0")
    );

  // Get the top 5 tokens
  const topTokens = sortedTokens.slice(0, 5);

  // Calculate total wallet value
  const totalValue = sortedTokens.reduce(
    (sum, token) => sum + parseFloat(token.usdValue || "0"),
    0
  );

  return (
    <div className="wallet-dropdown">
      <div className="wallet-header" onClick={() => setIsOpen(!isOpen)}>
        <div className="wallet-title">
          <div className="wallet-icon">💰</div>
          <div className="wallet-label">
            <div className="wallet-name">Wallet Assets</div>
            <div className="wallet-value">${totalValue.toFixed(2)}</div>
          </div>
        </div>
        <div className={`dropdown-arrow ${isOpen ? "open" : ""}`}>
          <FaChevronDown />
        </div>
      </div>

      {isOpen && (
        <div className="wallet-content">
          <div className="wallet-tokens">
            {(showAll ? sortedTokens : topTokens).map((token, idx) => (
              <div className="wallet-token-item" key={`wallet-token-${idx}`}>
                <div className="token-info">
                  <EnhancedTokenIcon
                    symbol={token.symbol}
                    address={token.coinType}
                    size="sm"
                    metadata={getTokenMetadataByAddress(token.coinType)}
                  />
                  <span className="token-symbol">{token.symbol}</span>
                </div>
                <div className="token-details">
                  {/* Display the balance with proper formatting based on decimals */}
                  <div className="token-balance">
                    {formatTokenBalance(token.balance, token.decimals)}
                  </div>
                  <div className="token-value">
                    ${parseFloat(token.usdValue || "0").toFixed(2)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {sortedTokens.length > 5 && (
            <button
              className="view-all-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowAll(!showAll);
              }}
            >
              {showAll
                ? "Show Less"
                : `View All Assets (${sortedTokens.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Portfolio() {
  const wallet = useWallet();
  const { connected, account } = wallet;
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [portfolioHistory, setPortfolioHistory] = useState<{
    dates: string[];
    values: number[];
  }>({ dates: [], values: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tokenMetadata, setTokenMetadata] = useState<Record<string, any>>({});
  const [portfolioChange24h, setPortfolioChange24h] = useState<{
    value: number;
    percent: number;
  }>({ value: 0, percent: 0 });

  // Function to fetch metadata for a list of token addresses individually
  const fetchTokenMetadata = useCallback(async (tokenAddresses: string[]) => {
    const result: Record<string, any> = {};
    const addressesToFetch = tokenAddresses.filter(
      (addr) => addr && !tokenMetadataCache[addr]
    );

    // If there's nothing to fetch, return the cached data
    if (addressesToFetch.length === 0) {
      tokenAddresses.forEach((addr) => {
        if (addr && tokenMetadataCache[addr]) {
          result[addr] = tokenMetadataCache[addr];
        }
      });
      return result;
    }

    try {
      // Fetch metadata for all addresses at once
      const fetchedMetadata = await birdeyeService.getMultipleTokenMetadata(
        addressesToFetch
      );

      // Add to result and update cache
      Object.entries(fetchedMetadata).forEach(([addr, data]) => {
        tokenMetadataCache[addr] = data;
        result[addr] = data;
      });

      // Add any cached entries not in fetched results
      tokenAddresses.forEach((addr) => {
        if (addr && tokenMetadataCache[addr] && !result[addr]) {
          result[addr] = tokenMetadataCache[addr];
        }
      });

      return result;
    } catch (err) {
      console.error("Error fetching token metadata:", err);

      // Return cached data for any addresses we have
      tokenAddresses.forEach((addr) => {
        if (addr && tokenMetadataCache[addr]) {
          result[addr] = tokenMetadataCache[addr];
        }
      });

      return result;
    }
  }, []);

  const getAddressBySymbol = useCallback(
    (symbol: string): string | undefined => {
      if (!symbol) return undefined;
      const upperSymbol = normalizeSymbol(symbol);
      return TOKEN_ADDRESSES[upperSymbol];
    },
    []
  );

  const loadPortfolioData = useCallback(async () => {
    if (!connected || !account?.address) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("Loading portfolio data for:", account.address);

      // Get positions from BlockVision API
      const allPoolGroups = await blockvisionService.getDefiPortfolio(
        account.address,
        undefined, // No specific protocol
        false // Exclude wallet assets
      );

      // Get wallet assets using getAccountCoins
      const walletTokensResponse = await blockvisionService.getAccountCoins(
        account.address
      );
      const walletTokens = walletTokensResponse.data || [];

      // Collect all token addresses for metadata fetching
      const tokenAddresses = new Set<string>();

      allPoolGroups.forEach((pool) => {
        if (pool.tokenA) tokenAddresses.add(pool.tokenA);
        if (pool.tokenB) tokenAddresses.add(pool.tokenB);

        // Try to use mapped addresses for symbols if direct addresses not available
        if (!pool.tokenA && pool.tokenASymbol) {
          const mappedAddress = getAddressBySymbol(pool.tokenASymbol);
          if (mappedAddress) tokenAddresses.add(mappedAddress);
        }

        if (!pool.tokenB && pool.tokenBSymbol) {
          const mappedAddress = getAddressBySymbol(pool.tokenBSymbol);
          if (mappedAddress) tokenAddresses.add(mappedAddress);
        }
      });

      walletTokens.forEach((token) => {
        if (token.coinType) tokenAddresses.add(token.coinType);
      });

      // Fetch token metadata
      const metadata = await fetchTokenMetadata(Array.from(tokenAddresses));
      setTokenMetadata(metadata);

      // Calculate portfolio totals
      const positionValue = allPoolGroups.reduce(
        (sum, p) => sum + p.totalValueUsd,
        0
      );
      const walletValue = walletTokens.reduce(
        (sum, t) => parseFloat(t.usdValue || "0") + sum,
        0
      );
      const totalValue = positionValue + walletValue;

      // Set portfolio data
      setPortfolioData({
        positions: allPoolGroups,
        walletTokens,
        positionValue,
        walletValue,
        totalValue,
      });

      // Generate mock portfolio history for chart
      const history = generateMockPortfolioHistory(totalValue);
      setPortfolioHistory(history);

      // Calculate 24h change (mock data for now)
      // In a real implementation, we'd compare with actual yesterday's value
      const yesterdayValue = history.values[history.values.length - 2];
      const todayValue = history.values[history.values.length - 1];
      const changeValue = todayValue - yesterdayValue;
      const changePercent =
        yesterdayValue > 0 ? (changeValue / yesterdayValue) * 100 : 0;

      setPortfolioChange24h({
        value: changeValue,
        percent: changePercent,
      });
    } catch (err) {
      console.error("Failed to load portfolio data:", err);
      setError("Failed to load your portfolio. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [connected, account, fetchTokenMetadata, getAddressBySymbol]);

  useEffect(() => {
    loadPortfolioData();
  }, [loadPortfolioData]);

  // Helper function to find token metadata for a given address
  const getTokenMetadataByAddress = useCallback(
    (address?: string) => {
      if (!address) return null;
      return tokenMetadata[address] || null;
    },
    [tokenMetadata]
  );

  // Helper function to find token metadata for a given symbol
  const getTokenMetadataBySymbol = useCallback(
    (symbol?: string) => {
      if (!symbol) return null;

      // Check if we have a known address for this symbol
      const address = getAddressBySymbol(symbol);
      if (address && tokenMetadata[address]) {
        return tokenMetadata[address];
      }

      // Otherwise search through metadata for matching symbol
      return (
        Object.values(tokenMetadata).find(
          (metadata) => metadata.symbol?.toUpperCase() === symbol.toUpperCase()
        ) || null
      );
    },
    [tokenMetadata, getAddressBySymbol]
  );

  // Simple function to determine if a pool group is a vault pool
  const isVaultPool = (poolGroup: any): boolean => {
    return (
      poolGroup.positions?.length > 0 &&
      poolGroup.positions[0].positionType === "cetus-vault"
    );
  };

  // Chart options
  const chartOptions: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "area",
        height: 180,
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
        background: "transparent",
      },
      dataLabels: {
        enabled: false,
      },
      stroke: {
        curve: "smooth",
        width: 2,
        colors: ["#00c2ff"],
      },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.3,
          opacityTo: 0.1,
          stops: [0, 90, 100],
          colorStops: [
            {
              offset: 0,
              color: "#00c2ff",
              opacity: 0.4,
            },
            {
              offset: 100,
              color: "#00c2ff",
              opacity: 0,
            },
          ],
        },
      },
      grid: {
        show: false,
      },
      xaxis: {
        type: "datetime",
        categories: portfolioHistory.dates,
        labels: {
          show: false,
        },
        axisBorder: {
          show: false,
        },
        axisTicks: {
          show: false,
        },
      },
      yaxis: {
        labels: {
          show: false,
        },
      },
      tooltip: {
        x: {
          format: "yyyy-MM-dd",
        },
        y: {
          formatter: (value) => `$${value.toFixed(2)}`,
        },
        theme: "dark",
      },
      theme: {
        mode: "dark",
      },
    }),
    [portfolioHistory]
  );

  return (
    <div className="portfolio-page">
      <div className="content-container">
        {/* Updated navigation bar to match the other pages */}
        <div className="main-navigation">
          <Link to="/pools" className="nav-link">
            Pools
          </Link>
          <Link to="/positions" className="nav-link">
            My Positions
          </Link>
          <Link to="/portfolio" className="nav-link active">
            Portfolio
          </Link>
          <Link to="/pools?tab=vaults" className="nav-link">
            Vaults
          </Link>
        </div>

        {error ? (
          <div className="empty-state">
            <div className="empty-icon">⚠️</div>
            <h3>Error Loading Portfolio</h3>
            <p>{error}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => loadPortfolioData()}
            >
              Retry
            </button>
          </div>
        ) : !connected ? (
          <div className="empty-state">
            <div className="empty-icon">🔐</div>
            <h3>Wallet Not Connected</h3>
            <p>Please connect your wallet to view your portfolio.</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => wallet.select()}
            >
              Connect Wallet
            </button>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading portfolio...</div>
          </div>
        ) : !portfolioData ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3>No Portfolio Data</h3>
            <p>We couldn't find any assets in your portfolio.</p>
            <Link to="/pools" className="btn btn--primary">
              Explore Pools
            </Link>
          </div>
        ) : (
          <>
            <div className="portfolio-header">
              <h2>Your Portfolio</h2>
              <div className="portfolio-summary">
                <div className="portfolio-value-section">
                  <div className="total-value">
                    <span className="value-label">Total Value</span>
                    <span className="value-amount">
                      ${portfolioData.totalValue.toFixed(2)}
                    </span>
                    <div
                      className={`value-change ${
                        portfolioChange24h.value >= 0 ? "positive" : "negative"
                      }`}
                    >
                      <span className="change-icon">
                        {portfolioChange24h.value >= 0 ? (
                          <FaCaretUp />
                        ) : (
                          <FaCaretDown />
                        )}
                      </span>
                      <span className="change-amount">
                        ${Math.abs(portfolioChange24h.value).toFixed(2)}
                      </span>
                      <span className="change-percent">
                        {portfolioChange24h.percent.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  <div className="portfolio-chart">
                    <ReactApexChart
                      options={chartOptions}
                      series={[
                        {
                          name: "Portfolio Value",
                          data: portfolioHistory.values,
                        },
                      ]}
                      type="area"
                      height={180}
                    />
                  </div>
                </div>

                <div className="wallet-section">
                  <WalletTokensDropdown
                    walletTokens={portfolioData.walletTokens}
                    getTokenMetadataByAddress={getTokenMetadataByAddress}
                  />
                </div>
              </div>
            </div>

            <div className="positions-section">
              <h3>
                Your Positions{" "}
                <span className="positions-count">
                  ({portfolioData.positions.length})
                </span>
              </h3>

              {portfolioData.positions.length > 0 ? (
                <div className="positions-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Protocol</th>
                        <th>Position</th>
                        <th>Value</th>
                        <th>APR</th>
                      </tr>
                    </thead>
                    <tbody>
                      {portfolioData.positions.map(
                        (position: any, idx: number) => (
                          <tr key={`position-${idx}`}>
                            <td>
                              <ProtocolBadge
                                protocol={position.protocol}
                                protocolClass={position.protocol
                                  .toLowerCase()
                                  .replace(/[-\s]/g, "")}
                                isVault={isVaultPool(position)}
                              />
                            </td>
                            <td>
                              <PoolPair
                                tokenASymbol={position.tokenASymbol}
                                tokenBSymbol={position.tokenBSymbol}
                                tokenAAddress={position.tokenA}
                                tokenBAddress={position.tokenB}
                                tokenAMetadata={
                                  getTokenMetadataByAddress(position.tokenA) ||
                                  getTokenMetadataBySymbol(
                                    position.tokenASymbol
                                  )
                                }
                                tokenBMetadata={
                                  getTokenMetadataByAddress(position.tokenB) ||
                                  getTokenMetadataBySymbol(
                                    position.tokenBSymbol
                                  )
                                }
                              />
                            </td>
                            <td>${position.totalValueUsd.toFixed(2)}</td>
                            <td>{position.apr.toFixed(2)}%</td>
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-positions">
                  <p>
                    No positions found. Start by adding liquidity to a pool.
                  </p>
                  <Link to="/pools" className="btn btn--primary">
                    Explore Pools
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <style jsx>{`
        .portfolio-page {
          color: #fff;
          padding: 20px 0;
        }

        .main-navigation {
          display: flex;
          margin-bottom: 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-link {
          padding: 12px 24px;
          font-size: 16px;
          color: #787f92;
          text-decoration: none;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
        }

        .nav-link:hover {
          color: #a0a7b8;
        }

        .nav-link.active {
          color: #fff;
          border-bottom: 2px solid #00c2ff;
        }

        .portfolio-header {
          margin-bottom: 24px;
        }

        .portfolio-header h2 {
          font-size: 24px;
          margin-bottom: 16px;
        }

        .portfolio-summary {
          display: flex;
          gap: 24px;
          margin-bottom: 32px;
        }

        .portfolio-value-section {
          flex: 1;
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          padding: 20px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
        }

        .total-value {
          margin-bottom: 16px;
        }

        .value-label {
          font-size: 14px;
          color: #a0a7b8;
          display: block;
          margin-bottom: 4px;
        }

        .value-amount {
          font-size: 28px;
          font-weight: 600;
          display: block;
          margin-bottom: 4px;
        }

        .value-change {
          display: flex;
          align-items: center;
          font-size: 14px;
        }

        .value-change.positive {
          color: #00c48c;
        }

        .value-change.negative {
          color: #ff5252;
        }

        .change-icon {
          margin-right: 4px;
          display: flex;
          align-items: center;
        }

        .change-amount {
          margin-right: 4px;
        }

        .portfolio-chart {
          flex: 1;
          min-height: 180px;
        }

        .wallet-section {
          width: 350px;
        }

        .wallet-dropdown {
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow: hidden;
        }

        .wallet-header {
          padding: 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .wallet-header:hover {
          background: rgba(255, 255, 255, 0.05);
        }

        .wallet-title {
          display: flex;
          align-items: center;
        }

        .wallet-icon {
          margin-right: 12px;
          font-size: 20px;
        }

        .wallet-name {
          font-size: 14px;
          color: #a0a7b8;
          margin-bottom: 4px;
        }

        .wallet-value {
          font-size: 18px;
          font-weight: 600;
        }

        .dropdown-arrow {
          transition: transform 0.3s ease;
        }

        .dropdown-arrow.open {
          transform: rotate(180deg);
        }

        .wallet-content {
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }

        .wallet-tokens {
          max-height: 300px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
        }

        .wallet-tokens::-webkit-scrollbar {
          width: 8px;
        }

        .wallet-tokens::-webkit-scrollbar-thumb {
          background-color: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }

        .wallet-tokens::-webkit-scrollbar-track {
          background: transparent;
        }

        .wallet-token-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.03);
        }

        .token-info {
          display: flex;
          align-items: center;
        }

        .token-symbol {
          margin-left: 8px;
          font-weight: 500;
          color: #00c2ff;
        }

        .token-details {
          text-align: right;
        }

        .token-balance {
          font-size: 14px;
          text-align: right;
          margin-bottom: 2px;
        }

        .token-value {
          font-size: 14px;
          font-weight: 500;
        }

        .view-all-btn {
          width: 100%;
          padding: 12px;
          background: transparent;
          border: none;
          color: #00c2ff;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s;
        }

        .view-all-btn:hover {
          background: rgba(0, 194, 255, 0.1);
        }

        .positions-section {
          margin-bottom: 24px;
        }

        .positions-section h3 {
          font-size: 18px;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
        }

        .positions-count {
          font-size: 14px;
          color: #a0a7b8;
          margin-left: 8px;
          font-weight: normal;
        }

        .positions-table {
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow: hidden;
        }

        table {
          width: 100%;
          border-collapse: collapse;
        }

        table th {
          text-align: left;
          padding: 12px 16px;
          font-size: 14px;
          color: #a0a7b8;
          font-weight: 500;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        table td {
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        table tr:last-child td {
          border-bottom: none;
        }

        .token-icons {
          display: flex;
          align-items: center;
          margin-right: 8px;
        }

        .token-icons .token-icon:nth-child(2) {
          margin-left: -8px;
          z-index: 1;
          border: 1px solid rgba(0, 0, 0, 0.5);
        }

        .portfolio-pair {
          display: flex;
          align-items: center;
        }

        .pair-name {
          margin-left: 8px;
          font-weight: 500;
        }

        .token-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          overflow: hidden;
          background-color: #1a1f2e;
          position: relative;
          box-shadow: 0 0 8px rgba(0, 225, 255, 0.2);
        }

        .token-icon-sm {
          width: 24px;
          height: 24px;
          min-width: 24px;
        }

        .token-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .token-fallback {
          background: linear-gradient(135deg, #2a3042, #1e2433);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .token-fallback-letter {
          font-weight: bold;
          font-size: 12px;
          color: #fff;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
        }

        .sui-token {
          background: linear-gradient(135deg, #4bc1d2, #2b6eff);
          box-shadow: 0 0 10px rgba(0, 174, 240, 0.7);
        }

        .wal-token {
          background: linear-gradient(135deg, #94f9f0, #a770ef);
          box-shadow: 0 0 10px rgba(167, 112, 239, 0.7);
        }

        .hasui-token {
          background: linear-gradient(135deg, #ffd966, #ff6b6b);
          box-shadow: 0 0 10px rgba(255, 107, 107, 0.7);
        }

        .usdc-token,
        .wusdc-token {
          background: linear-gradient(135deg, #2775ca, #4dc1e1);
          box-shadow: 0 0 10px rgba(39, 117, 202, 0.7);
        }

        .cetus-token {
          background: linear-gradient(135deg, #00c2ff, #00aadd);
          box-shadow: 0 0 10px rgba(0, 194, 255, 0.7);
        }

        .empty-positions {
          padding: 32px;
          text-align: center;
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .empty-positions p {
          margin-bottom: 16px;
          color: #a0a7b8;
        }

        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
        }

        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(0, 194, 255, 0.3);
          border-top-color: rgba(0, 194, 255, 1);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 16px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .loading-text {
          color: #a0a7b8;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px;
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .empty-state h3 {
          margin-bottom: 8px;
        }

        .empty-state p {
          color: #a0a7b8;
          margin-bottom: 24px;
        }

        .btn--primary {
          background-color: #00c2ff;
          color: #0a1120;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          font-weight: 500;
        }

        .btn--primary:hover {
          background-color: #33cfff;
        }
      `}</style>
    </div>
  );
}

export default Portfolio;
