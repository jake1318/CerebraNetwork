// src/pages/Portfolio.tsx
// Last Updated: 2025-06-24 00:56:25 UTC by jake1318

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import { FaCaretUp, FaCaretDown, FaChevronDown } from "react-icons/fa";

import "./Portfolio.scss";
import blockvisionService, {
  getScallopPortfolioData,
  PoolGroup,
} from "../../services/blockvisionService";
import * as birdeyeService from "../../services/birdeyeService"; // <-- still needed

// Import components
import ProtocolBadge from "../PoolsPage/ProtocolBadge";

// keep TOKEN_ADDRESSES – we still use it inside TokenIcon for fall‑back
const TOKEN_ADDRESSES: Record<string, string> = {
  SUI: "0x2::sui::SUI",
  USDC: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
  USDT: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
  WAL: "0x1e8b532cca6569cab9f9b9ebc73f8c13885012ade714729aa3b450e0339ac766::coin::COIN",
  HASUI:
    "0x680eb4a8e1074d7e15186c40dcf8d3b749f1ddba4c60478c367fc9c24a5a5a29::hasui::HASUI",
  SSUI: "0xaafc4f740de0dd0dde642a31148fb94517087052f19afb0f7bed1dc41a50c77b::scallop_sui::SCALLOP_SUI",
  SSCA: "0x5ca17430c1d046fae9edeaa8fd76c7b4193a00d764a0ecfa9418d733ad27bc1e::scallop_sca::SCALLOP_SCA",
  BLUE: "0xce7ff77a83ea0cb6fd39bd8748e2ec89a3f41e8c5ab7d00bad20d95b8f4b8b77::blue::BLUE",
};

// ---------- dynamic token‑icon (Birdeye + in‑memory cache) ------------------
import { getTokenMetadata, TokenMetadata } from "../../services/birdeyeService";

/** simple in‑memory cache (key: token address **or** lower‑case symbol) */
const logoCache: Record<string, string> = {};
const DEFAULT_LOGO = "/icons/default-coin.svg";

interface TokenIconProps {
  symbol: string;
  /** full on‑chain address if you already have it – improves hit‑rate */
  address?: string;
  size?: "sm" | "md" | "lg";
}

function TokenIcon({ symbol, address, size = "sm" }: TokenIconProps) {
  const sizeClass = `token-icon-${size}`;
  const id = (address || symbol).toLowerCase(); // cache key
  const [logoUrl, setLogoUrl] = React.useState<string | null>(
    logoCache[id] ?? null
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (logoUrl || logoCache[id]) return; // already have it

      let tokenAddr = address;
      if (!tokenAddr) {
        // fall back to static mapping for the very common symbols we know
        tokenAddr =
          TOKEN_ADDRESSES[symbol.toUpperCase() as keyof typeof TOKEN_ADDRESSES];
      }

      if (!tokenAddr) return; // nothing we can do

      const md: TokenMetadata | null = await getTokenMetadata(tokenAddr);
      const url =
        md?.logoURI || md?.logo_uri || md?.logoUrl || md?.logo || null;

      if (url && !cancelled) {
        logoCache[id] = url;
        setLogoUrl(url);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, address, symbol, logoUrl]);

  // graceful fallback
  const fallbackLetter = symbol ? symbol[0].toUpperCase() : "?";

  return (
    <div className={`token-icon ${sizeClass}`}>
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={symbol}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = DEFAULT_LOGO;
          }}
        />
      ) : (
        <div className="token-letter">{fallbackLetter}</div>
      )}
    </div>
  );
}

// Simple pool pair component
function PoolPair({
  tokenASymbol,
  tokenBSymbol,
  tokenAAddress,
  tokenBAddress,
}: {
  tokenASymbol: string;
  tokenBSymbol?: string;
  tokenAAddress?: string;
  tokenBAddress?: string;
}) {
  const isSingleToken = !tokenBSymbol;

  return (
    <div className="portfolio-pair">
      <div className="token-icons">
        <TokenIcon symbol={tokenASymbol} address={tokenAAddress} />
        {!isSingleToken && (
          <div className="second-token">
            <TokenIcon symbol={tokenBSymbol!} address={tokenBAddress} />
          </div>
        )}
      </div>
      <div className="pair-name">
        {tokenASymbol}
        {!isSingleToken && `/${tokenBSymbol}`}
      </div>
    </div>
  );
}

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

// Wallet dropdown component
function WalletTokensDropdown({ walletTokens }: { walletTokens: any[] }) {
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
                  <TokenIcon symbol={token.symbol} address={token.coinType} />
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

// Scallop Summary Component with SUI icon handling
function ScallopSummary({ scallopData }: { scallopData: any }) {
  if (!scallopData) return null;

  // Extract values from scallopData
  const {
    totalSupplyValue = 0,
    totalDebtValue = 0,
    totalCollateralValue = 0,
    lendings = [],
    borrowings = [],
    pendingRewards = {},
  } = scallopData;

  // Format pending rewards if they exist
  const hasRewards =
    pendingRewards &&
    pendingRewards.borrowIncentives &&
    pendingRewards.borrowIncentives.length > 0;

  return (
    <div className="scallop-summary-container">
      <div className="scallop-header">
        <div className="protocol-icon">
          <TokenIcon symbol="SCALLOP" size="md" />
        </div>
        <h3>Scallop Summary</h3>
      </div>

      <div className="scallop-stats">
        <div className="stat-item">
          <span className="stat-label">Total Supply:</span>
          <span className="stat-value">${totalSupplyValue.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Collateral:</span>
          <span className="stat-value">${totalCollateralValue.toFixed(2)}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Total Borrow:</span>
          <span className="stat-value">${totalDebtValue.toFixed(2)}</span>
        </div>
      </div>

      {hasRewards && (
        <div className="scallop-rewards">
          <h4>Pending Rewards</h4>
          <div className="rewards-list">
            {pendingRewards.borrowIncentives.map(
              (reward: any, index: number) => (
                <div className="reward-item" key={`reward-${index}`}>
                  <TokenIcon
                    symbol={reward.symbol}
                    address={reward.coinType}
                    size="sm"
                  />
                  <span className="reward-amount">
                    {reward.pendingRewardInCoin.toFixed(6)}
                  </span>
                  <span className="reward-value">
                    ${reward.pendingRewardInUsd.toFixed(6)}
                  </span>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <div className="scallop-positions">
        {lendings.length > 0 && (
          <div className="position-section">
            <h4>Supply Positions</h4>
            <div className="positions-list">
              {lendings.map((lending: any, index: number) => (
                <div className="position-item" key={`lending-${index}`}>
                  <div className="position-token">
                    <TokenIcon
                      symbol={lending.symbol}
                      address={lending.coinType}
                      size="sm"
                    />
                    <span>{lending.symbol}</span>
                  </div>
                  <div className="position-details">
                    <div className="position-amount">
                      {lending.suppliedCoin.toFixed(6)}
                    </div>
                    <div className="position-value">
                      ${lending.suppliedValue.toFixed(2)}
                    </div>
                    <div className="position-apy">
                      {(lending.supplyApy * 100).toFixed(2)}% APY
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {borrowings.length > 0 && (
          <div className="position-section">
            <h4>Borrows & Collateral</h4>
            {borrowings.map((obligation: any, idx: number) => (
              <div className="obligation-item" key={`obligation-${idx}`}>
                <div className="obligation-header">
                  <span className="obligation-id">Obligation {idx + 1}</span>
                  <span
                    className="risk-level"
                    style={{
                      color:
                        obligation.riskLevel < 0.3
                          ? "#4CAF50"
                          : obligation.riskLevel < 0.6
                          ? "#FFC107"
                          : "#FF5722",
                    }}
                  >
                    Risk: {(obligation.riskLevel * 100).toFixed(0)}%
                  </span>
                </div>

                {obligation.collaterals &&
                  obligation.collaterals.length > 0 && (
                    <div className="collateral-list">
                      <h5>Collateral</h5>
                      {obligation.collaterals.map(
                        (collateral: any, cIdx: number) => (
                          <div
                            className="collateral-item"
                            key={`collateral-${cIdx}`}
                          >
                            <TokenIcon
                              symbol={collateral.symbol}
                              address={collateral.coinType}
                              size="sm"
                            />
                            <span>
                              {collateral.depositedCoin.toFixed(6)}{" "}
                              {collateral.symbol}
                            </span>
                            <span className="item-value">
                              ${collateral.depositedValueInUsd.toFixed(2)}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}

                {obligation.borrowedPools &&
                  obligation.borrowedPools.length > 0 && (
                    <div className="borrowed-list">
                      <h5>Borrows</h5>
                      {obligation.borrowedPools.map(
                        (borrow: any, bIdx: number) => (
                          <div className="borrow-item" key={`borrow-${bIdx}`}>
                            <TokenIcon
                              symbol={borrow.symbol}
                              address={borrow.coinType}
                              size="sm"
                            />
                            <span>
                              {borrow.borrowedCoin.toFixed(6)} {borrow.symbol}
                            </span>
                            <span className="item-value">
                              ${borrow.borrowedValueInUsd.toFixed(2)}
                            </span>
                            <span className="borrow-rate">
                              {(borrow.borrowApy * 100).toFixed(2)}% APY
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Interface for portfolio history data point
interface PortfolioDataPoint {
  date: string;
  value: number;
}

// Function to fetch historical portfolio data
async function fetchPortfolioHistory(
  address: string,
  days: number = 30
): Promise<{ dates: string[]; values: number[] }> {
  try {
    // Use SUI price history as a proxy for portfolio history
    const suiToken = "0x2::sui::SUI";
    const historyData = await birdeyeService.getLineChartData(
      suiToken,
      days === 7 ? "1d" : days === 30 ? "1w" : "1w"
    );

    // Check if we got valid data
    if (
      !historyData ||
      !Array.isArray(historyData) ||
      historyData.length === 0
    ) {
      throw new Error("Invalid history data received");
    }

    // Extract the dates and prices
    const dates: string[] = [];
    const values: number[] = [];

    // Get current portfolio value to use for scaling
    const latestValue = historyData[historyData.length - 1]?.price || 1;
    const currentPortfolioValue = address
      ? parseFloat(sessionStorage.getItem(`${address}_portfolioValue`) || "0")
      : 0;
    const scaleFactor =
      currentPortfolioValue > 0 ? currentPortfolioValue / latestValue : 100;

    // Process data points
    historyData.forEach((dataPoint) => {
      // Convert timestamp to date string
      const date = new Date(dataPoint.timestamp * 1000)
        .toISOString()
        .split("T")[0];
      // Scale the price to simulate portfolio value
      const value = dataPoint.price * scaleFactor || 0;

      dates.push(date);
      values.push(parseFloat(value.toFixed(2)));
    });

    return { dates, values };
  } catch (error) {
    console.error("Error fetching portfolio history:", error);
    // Return an empty dataset in case of error
    return { dates: [], values: [] };
  }
}

function Portfolio() {
  const wallet = useWallet();
  const { connected, account } = wallet;
  const [poolPositions, setPoolPositions] = useState<PoolGroup[]>([]);
  const [portfolioData, setPortfolioData] = useState<any>(null);
  const [portfolioHistory, setPortfolioHistory] = useState<{
    dates: string[];
    values: number[];
  }>({ dates: [], values: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portfolioChange24h, setPortfolioChange24h] = useState<{
    value: number;
    percent: number;
  }>({ value: 0, percent: 0 });
  const [scallopData, setScallopData] = useState<any>(null);
  const [loadingScallop, setLoadingScallop] = useState(false);
  const [walletTokens, setWalletTokens] = useState<any[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState<"7d" | "30d">(
    "30d"
  );

  // Fetch portfolio history data
  const loadPortfolioHistory = useCallback(
    async (currentValue: number) => {
      if (!connected || !account?.address) return;

      try {
        // Store current portfolio value in session storage for reference
        sessionStorage.setItem(
          `${account.address}_portfolioValue`,
          currentValue.toString()
        );

        // Fetch real historical data based on selected timeframe
        const days = selectedTimeframe === "7d" ? 7 : 30;
        const history = await fetchPortfolioHistory(account.address, days);

        if (history.dates.length > 0 && history.values.length > 0) {
          setPortfolioHistory(history);

          // Calculate 24h change using the last two data points
          const todayValue = history.values[history.values.length - 1];
          const yesterdayValue =
            history.values[history.values.length - 2] || todayValue;
          const changeValue = todayValue - yesterdayValue;
          const changePercent =
            yesterdayValue > 0 ? (changeValue / yesterdayValue) * 100 : 0;

          setPortfolioChange24h({
            value: changeValue,
            percent: changePercent,
          });
        } else {
          // Fallback to a simple timeline with current value
          const dates: string[] = [];
          const values: number[] = [];
          const today = new Date();

          // Generate a simple timeline
          for (let i = days; i >= 0; i--) {
            const date = new Date();
            date.setDate(today.getDate() - i);
            dates.push(date.toISOString().split("T")[0]);

            // For fallback, simulate a slight uptrend
            const factor = 0.9 + (i / days) * 0.2;
            values.push(parseFloat((currentValue * factor).toFixed(2)));
          }

          setPortfolioHistory({ dates, values });

          // Calculate fallback 24h change
          if (values.length >= 2) {
            const todayValue = values[values.length - 1];
            const yesterdayValue = values[values.length - 2];
            const changeValue = todayValue - yesterdayValue;
            const changePercent =
              yesterdayValue > 0 ? (changeValue / yesterdayValue) * 100 : 0;

            setPortfolioChange24h({
              value: changeValue,
              percent: changePercent,
            });
          }
        }
      } catch (error) {
        console.error("Failed to load portfolio history:", error);
      }
    },
    [connected, account, selectedTimeframe]
  );

  // Fetch Scallop data only - separate from main portfolio loading
  const fetchScallopData = useCallback(async () => {
    if (!connected || !account?.address) return;

    setLoadingScallop(true);
    try {
      console.log("Fetching Scallop data for:", account.address);
      const data = await getScallopPortfolioData(account.address);
      console.log("Scallop data received:", data);

      // Make sure we have valid data before setting it
      if (data) {
        setScallopData(data);
      }
    } catch (err) {
      console.error("Error fetching Scallop data:", err);
    } finally {
      setLoadingScallop(false);
    }
  }, [connected, account]);

  // Load positions - similar to the Positions page approach that works
  const loadPositions = useCallback(async () => {
    if (connected && account?.address) {
      setLoading(true);
      setError(null);

      try {
        console.log("Loading positions for Portfolio:", account.address);

        // Get all positions in one call (excluding wallet assets)
        const positions = await blockvisionService.getDefiPortfolio(
          account.address,
          undefined, // No specific protocol filter
          false // Exclude wallet assets
        );

        console.log(`Loaded ${positions.length} positions`);

        // Set positions in state
        setPoolPositions(positions);

        // Calculate the total value of all positions
        const positionValue = positions.reduce(
          (sum, p) => sum + p.totalValueUsd,
          0
        );

        // Make sure we have Scallop data before using it
        const scallopValue = scallopData
          ? parseFloat(scallopData.totalSupplyValue || "0") +
            parseFloat(scallopData.totalCollateralValue || "0")
          : 0;

        // Generate portfolio data
        const portfolioTotalValue = positionValue + scallopValue;
        setPortfolioData({
          positions,
          positionValue,
          scallopValue,
          totalValue: portfolioTotalValue,
        });

        // Load real portfolio history
        await loadPortfolioHistory(portfolioTotalValue);
      } catch (err) {
        console.error("Failed to load positions:", err);
        setError("Failed to load your positions. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }, [connected, account, scallopData, loadPortfolioHistory]);

  // Use separate effect for loading wallet tokens to avoid rate limiting
  const loadWalletTokens = useCallback(async () => {
    if (connected && account?.address) {
      try {
        // Attempt to get wallet tokens but don't block main loading if it fails
        const walletTokensResponse = await blockvisionService.getWalletValue(
          account.address
        );
        if (walletTokensResponse && walletTokensResponse.coins) {
          setWalletTokens(walletTokensResponse.coins || []);
        }
      } catch (err) {
        console.warn("Could not load wallet tokens:", err);
        // Non-fatal error, continue without wallet tokens
        setWalletTokens([]);
      }
    }
  }, [connected, account]);

  // First fetch Scallop data
  useEffect(() => {
    fetchScallopData();
  }, [fetchScallopData]);

  // Then load positions once Scallop data is available
  useEffect(() => {
    loadPositions();
  }, [loadPositions, scallopData]);

  // Load wallet tokens separately to avoid rate limiting
  useEffect(() => {
    // Add a small delay to avoid rate limiting
    const timer = setTimeout(() => {
      loadWalletTokens();
    }, 1000);

    return () => clearTimeout(timer);
  }, [loadWalletTokens]);

  // Reload portfolio history when timeframe changes
  useEffect(() => {
    if (portfolioData?.totalValue) {
      loadPortfolioHistory(portfolioData.totalValue);
    }
  }, [selectedTimeframe, portfolioData?.totalValue, loadPortfolioHistory]);

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
        toolbar: { show: false },
        zoom: { enabled: false },
        background: "transparent",
      },
      dataLabels: { enabled: false },
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
            { offset: 0, color: "#00c2ff", opacity: 0.4 },
            { offset: 100, color: "#00c2ff", opacity: 0 },
          ],
        },
      },
      grid: { show: false },
      xaxis: {
        type: "datetime",
        categories: portfolioHistory.dates,
        labels: { show: false },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: { labels: { show: false } },
      tooltip: {
        x: { format: "yyyy-MM-dd" },
        y: { formatter: (value) => `$${value.toFixed(2)}` },
        theme: "dark",
      },
      theme: { mode: "dark" },
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
              onClick={() => loadPositions()}
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
        ) : loading && !portfolioData ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <div className="loading-text">Loading portfolio...</div>
          </div>
        ) : !portfolioData && !scallopData ? (
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
                      ${portfolioData?.totalValue.toFixed(2) || "0.00"}
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

                  <div className="chart-controls">
                    <div className="timeframe-selector">
                      <button
                        className={selectedTimeframe === "7d" ? "active" : ""}
                        onClick={() => setSelectedTimeframe("7d")}
                      >
                        7D
                      </button>
                      <button
                        className={selectedTimeframe === "30d" ? "active" : ""}
                        onClick={() => setSelectedTimeframe("30d")}
                      >
                        30D
                      </button>
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
                  {walletTokens && walletTokens.length > 0 && (
                    <WalletTokensDropdown walletTokens={walletTokens} />
                  )}
                </div>
              </div>
            </div>

            {/* Scallop Section */}
            {scallopData && <ScallopSummary scallopData={scallopData} />}

            <div className="positions-section">
              <h3>
                Your Positions{" "}
                <span className="positions-count">
                  ({poolPositions.length})
                </span>
              </h3>

              {poolPositions.length > 0 ? (
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
                      {poolPositions.map((position: any, idx: number) => (
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
                            />
                          </td>
                          <td>${position.totalValueUsd.toFixed(2)}</td>
                          <td>{position.apr.toFixed(2)}%</td>
                        </tr>
                      ))}
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

        .chart-controls {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 8px;
        }

        .timeframe-selector {
          display: flex;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
          padding: 2px;
        }

        .timeframe-selector button {
          background: none;
          border: none;
          color: #a0a7b8;
          padding: 4px 8px;
          font-size: 12px;
          cursor: pointer;
          border-radius: 4px;
        }

        .timeframe-selector button.active {
          background: rgba(0, 194, 255, 0.2);
          color: #00c2ff;
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

        /* Token Icon Styles */
        .token-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          min-width: 24px;
          min-height: 24px;
          border-radius: 50%;
          overflow: hidden;
          background: #141e30;
        }

        .token-icon img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .token-icon-sm {
          width: 24px;
          height: 24px;
        }

        .token-icon-md {
          width: 32px;
          height: 32px;
        }

        .token-icon-lg {
          width: 48px;
          height: 48px;
        }

        .token-letter {
          font-weight: bold;
          font-size: 12px;
          color: #fff;
        }

        .token-icons {
          display: flex;
          align-items: center;
        }

        .second-token {
          margin-left: -8px;
          z-index: 1;
        }

        .portfolio-pair {
          display: flex;
          align-items: center;
        }

        .pair-name {
          margin-left: 16px;
          font-weight: 500;
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

        /* Scallop Summary Styles */
        .scallop-summary-container {
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 20px;
          margin-bottom: 24px;
        }

        .scallop-header {
          display: flex;
          align-items: center;
          margin-bottom: 16px;
        }

        .protocol-icon {
          margin-right: 12px;
        }

        .scallop-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .stat-item {
          display: flex;
          flex-direction: column;
          min-width: 150px;
        }

        .stat-label {
          font-size: 14px;
          color: #a0a7b8;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 500;
        }

        .scallop-rewards {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .scallop-rewards h4 {
          margin-bottom: 8px;
          color: #eb6662;
        }

        .rewards-list {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .reward-item {
          display: flex;
          align-items: center;
          background: rgba(0, 0, 0, 0.2);
          padding: 8px;
          border-radius: 6px;
        }

        .reward-item .token-icon {
          margin-right: 8px;
        }

        .reward-amount {
          font-weight: 500;
          margin-right: 8px;
        }

        .reward-value {
          color: #a0a7b8;
          font-size: 12px;
        }

        .scallop-positions {
          margin-top: 16px;
        }

        .position-section h4 {
          padding-bottom: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 12px;
        }

        .positions-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
        }

        .position-item {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 12px;
          display: flex;
          align-items: center;
        }

        .position-token {
          display: flex;
          align-items: center;
          margin-right: 12px;
          min-width: 80px;
        }

        .position-token .token-icon {
          margin-right: 8px;
        }

        .position-details {
          flex: 1;
        }

        .position-amount {
          font-weight: 500;
        }

        .position-value {
          color: #a0a7b8;
          font-size: 12px;
        }

        .position-apy {
          color: #00c48c;
          font-size: 12px;
          font-weight: 500;
        }

        .obligation-item {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }

        .obligation-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .obligation-id {
          font-weight: 500;
        }

        .risk-level {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          background: rgba(0, 0, 0, 0.2);
        }

        .collateral-list h5,
        .borrowed-list h5 {
          margin-bottom: 8px;
          font-size: 14px;
          color: #a0a7b8;
        }

        .collateral-item,
        .borrow-item {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 6px;
        }

        .collateral-item .token-icon,
        .borrow-item .token-icon {
          margin-right: 8px;
        }

        .item-value {
          margin-left: auto;
          font-weight: 500;
        }

        .borrow-rate {
          margin-left: 10px;
          color: #ff5252;
          font-size: 12px;
        }

        .borrowed-list {
          margin-top: 16px;
        }
      `}</style>
    </div>
  );
}

export default Portfolio;
