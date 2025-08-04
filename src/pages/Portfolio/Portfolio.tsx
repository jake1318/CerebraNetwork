// src/pages/Portfolio/Portfolio.tsx
// Last Updated: 2025-08-03 23:48:23 UTC by jake1318

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "@suiet/wallet-kit";
import ReactApexChart from "react-apexcharts";
import { ApexOptions } from "apexcharts";
import {
  FaCaretUp,
  FaCaretDown,
  FaWallet,
  FaExchangeAlt,
  FaPiggyBank,
  FaSeedling,
  FaHandHoldingUsd,
  FaLock,
  FaChartLine,
  FaChartPie,
  FaLayerGroup,
  FaPlus,
  FaSearch,
  FaNetworkWired,
  FaInfoCircle,
  FaRegChartBar,
  FaRegClock,
  FaChevronDown,
  FaChevronUp,
  FaBars,
  FaTimes,
  FaRegLightbulb,
  FaRandom,
  FaRobot,
  FaUserCircle,
  FaExclamationTriangle,
  FaRedo,
  FaArrowRight,
  FaArrowDown,
  FaCog,
  FaFilter,
  FaCalendarAlt,
  FaSortAmountDown,
  FaNewspaper,
  FaGhost, // Added for Phantom icon
  FaWater, // Added for Slush icon
  FaHistory, // Added for Trade History icon
} from "react-icons/fa";
import { getSwapHistory } from "@7kprotocol/sdk-ts";

import "./Portfolio.scss";
import blockvisionService, {
  getScallopPortfolioData,
  PoolGroup,
} from "../../services/blockvisionService";
import * as birdeyeService from "../../services/birdeyeService";
import MarketDashboard from "./MarketDashboard";
import MarketNews from "../../components/portfolio/MarketNews";
import TradeHistory from "./components/TradeHistory"; // Import the new TradeHistory component

// Import components
import ProtocolBadge from "../PoolsPage/ProtocolBadge";
import PhantomWallet from "./PhantomWallet"; // Import PhantomWallet component
import SlushWallet from "./SlushWallet"; // Import SlushWallet component
// Note: PhantomProvider is now loaded at the App level, so we don't import it here

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

// Types for swap history
interface SwapHistoryItem {
  id: string;
  timestamp: number;
  fromToken: {
    address: string;
    symbol: string;
    amount: string;
    decimals: number;
  };
  toToken: {
    address: string;
    symbol: string;
    amount: string;
    decimals: number;
  };
  txHash: string;
  status: string;
  priceImpact?: number;
  slippage?: number;
  route?: string;
  fee?: string;
}

// Sidebar navigation component
function Sidebar({
  activeView,
  setActiveView,
  activeTab,
  setActiveTab,
  categoryData,
  setActiveWallet, // Updated prop
}: {
  activeView: string;
  setActiveView: (tab: string) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  categoryData: {
    all: { count: number; value: number };
    lpPools: { count: number; value: number };
    vaults: { count: number; value: number };
    farms: { count: number; value: number };
    lending: { count: number; value: number };
    staking: { count: number; value: number };
  };
  setActiveWallet: (wallet: "phantom" | "slush" | null) => void; // Updated prop
}) {
  const [sidebarActive, setSidebarActive] = useState(false);

  return (
    <>
      <div className={`sidebar ${sidebarActive ? "active" : ""}`}>
        <div className="sidebar__content">
          <div className="sidebar__nav">
            <div className="nav-section">
              <div className="section-title">OVERVIEW</div>
              <div className="nav-links">
                <button
                  className={`nav-link ${
                    activeView === "dashboard" ? "active" : ""
                  }`}
                  onClick={() => setActiveView("dashboard")}
                >
                  <span className="nav-icon">
                    <FaRegChartBar />
                  </span>
                  <span className="nav-label">Market Dashboard</span>
                </button>
                <button
                  className={`nav-link ${
                    activeView === "portfolio" ? "active" : ""
                  }`}
                  onClick={() => setActiveView("portfolio")}
                >
                  <span className="nav-icon">
                    <FaChartPie />
                  </span>
                  <span className="nav-label">Portfolio</span>
                </button>
                <button
                  className={`nav-link ${
                    activeView === "market_news" ? "active" : ""
                  }`}
                  onClick={() => setActiveView("market_news")}
                >
                  <span className="nav-icon">
                    <FaNewspaper />
                  </span>
                  <span className="nav-label">Market News</span>
                </button>
                {/* Add Trade History navigation link */}
                <button
                  className={`nav-link ${
                    activeView === "trade_history" ? "active" : ""
                  }`}
                  onClick={() => setActiveView("trade_history")}
                >
                  <span className="nav-icon">
                    <FaHistory />
                  </span>
                  <span className="nav-label">Trade History</span>
                </button>
              </div>
            </div>

            {activeView === "portfolio" && (
              <div className="nav-section">
                <div className="section-title">PORTFOLIO</div>
                <div className="nav-links">
                  <button
                    className={`nav-link ${
                      activeTab === "all" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("all")}
                  >
                    <span className="nav-icon">
                      <FaLayerGroup />
                    </span>
                    <span className="nav-label">All Positions</span>
                    {categoryData.all.count > 0 && (
                      <span className="nav-badge">
                        {categoryData.all.count}
                      </span>
                    )}
                    {categoryData.all.value > 0 && (
                      <span className="nav-value">
                        ${categoryData.all.value.toFixed(2)}
                      </span>
                    )}
                  </button>

                  <button
                    className={`nav-link ${
                      activeTab === "lp-pools" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("lp-pools")}
                  >
                    <span className="nav-icon">
                      <FaExchangeAlt />
                    </span>
                    <span className="nav-label">LP Pools</span>
                    {categoryData.lpPools.count > 0 && (
                      <span className="nav-badge">
                        {categoryData.lpPools.count}
                      </span>
                    )}
                    {categoryData.lpPools.value > 0 && (
                      <span className="nav-value">
                        ${categoryData.lpPools.value.toFixed(2)}
                      </span>
                    )}
                  </button>

                  <button
                    className={`nav-link ${
                      activeTab === "vaults" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("vaults")}
                  >
                    <span className="nav-icon">
                      <FaPiggyBank />
                    </span>
                    <span className="nav-label">Vaults</span>
                    {categoryData.vaults.count > 0 && (
                      <span className="nav-badge">
                        {categoryData.vaults.count}
                      </span>
                    )}
                    {categoryData.vaults.value > 0 && (
                      <span className="nav-value">
                        ${categoryData.vaults.value.toFixed(2)}
                      </span>
                    )}
                  </button>

                  <button
                    className={`nav-link ${
                      activeTab === "farms" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("farms")}
                  >
                    <span className="nav-icon">
                      <FaSeedling />
                    </span>
                    <span className="nav-label">Farms</span>
                    {categoryData.farms.count > 0 && (
                      <span className="nav-badge">
                        {categoryData.farms.count}
                      </span>
                    )}
                    {categoryData.farms.value > 0 && (
                      <span className="nav-value">
                        ${categoryData.farms.value.toFixed(2)}
                      </span>
                    )}
                  </button>

                  <button
                    className={`nav-link ${
                      activeTab === "lending" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("lending")}
                  >
                    <span className="nav-icon">
                      <FaHandHoldingUsd />
                    </span>
                    <span className="nav-label">Lending</span>
                    {categoryData.lending.count > 0 && (
                      <span className="nav-badge">
                        {categoryData.lending.count}
                      </span>
                    )}
                    {categoryData.lending.value > 0 && (
                      <span className="nav-value">
                        ${categoryData.lending.value.toFixed(2)}
                      </span>
                    )}
                  </button>

                  <button
                    className={`nav-link ${
                      activeTab === "staking" ? "active" : ""
                    }`}
                    onClick={() => setActiveTab("staking")}
                  >
                    <span className="nav-icon">
                      <FaLock />
                    </span>
                    <span className="nav-label">Staking</span>
                    {categoryData.staking.count > 0 && (
                      <span className="nav-badge">
                        {categoryData.staking.count}
                      </span>
                    )}
                    {categoryData.staking.value > 0 && (
                      <span className="nav-value">
                        ${categoryData.staking.value.toFixed(2)}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            )}

            <div className="nav-section">
              <div className="section-title">TOOLS</div>
              <div className="nav-links">
                <Link to="/search" className="nav-link">
                  <span className="nav-icon">
                    <FaRobot />
                  </span>
                  <span className="nav-label">AI Search</span>
                </Link>
                <Link to="/explore" className="nav-link">
                  <span className="nav-icon">
                    <FaSearch />
                  </span>
                  <span className="nav-label">Explorer</span>
                </Link>
                {/* Phantom Wallet button */}
                <button
                  className="nav-link"
                  onClick={() => {
                    // Log the status before opening
                    console.log(
                      "[Portfolio] Checking wallet status before opening modal:",
                      {
                        phantom: !!window.phantom,
                        phantomSui: !!window.phantom?.sui,
                        cerebraWallet: !!window.cerebraWallet,
                        cerebraShow: !!window.cerebraWallet?.show,
                        container: !!document.getElementById(
                          "phantom-wallet-container"
                        ),
                        origin: window.location.origin,
                      }
                    );
                    setActiveWallet("phantom");
                  }}
                >
                  <span className="nav-icon">
                    <FaGhost />
                  </span>
                  <span className="nav-label">Phantom Wallet</span>
                </button>
                {/* Slush Wallet button */}
                <button
                  className="nav-link"
                  onClick={() => setActiveWallet("slush")}
                >
                  <span className="nav-icon">
                    <FaWater />
                  </span>
                  <span className="nav-label">Slush Wallet</span>
                </button>
                <Link to="/settings" className="nav-link">
                  <span className="nav-icon">
                    <FaCog />
                  </span>
                  <span className="nav-label">Settings</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="sidebar__mobile-toggle"
        onClick={() => setSidebarActive(!sidebarActive)}
      >
        {sidebarActive ? <FaTimes /> : <FaBars />}
      </div>
    </>
  );
}

// Token icon component
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
  const isMountedRef = useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;

    let cancelled = false;
    (async () => {
      // Special case for haSUI - use local logo
      if (
        symbol.toLowerCase() === "hasui" ||
        (address && address.toLowerCase().includes("hasui"))
      ) {
        if (isMountedRef.current) {
          setLogoUrl("/haSui.webp");
          logoCache[id] = "/haSui.webp";
        }
        return;
      }

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

      if (url && !cancelled && isMountedRef.current) {
        logoCache[id] = url;
        setLogoUrl(url);
      }
    })();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
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
    <div className="token-pair">
      <div className="token-icons">
        <TokenIcon symbol={tokenASymbol} address={tokenAAddress} size="md" />
        {!isSingleToken && (
          <TokenIcon symbol={tokenBSymbol!} address={tokenBAddress} size="md" />
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

// Helper function to format addresses
function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.substring(0, 6)}...${address.substring(
    address.length - 4
  )}`;
}

// Helper function to format date
function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Wallet Assets Section Component
function WalletAssetsSection({ walletTokens }: { walletTokens: any[] }) {
  const [showAll, setShowAll] = useState(false);

  // Sort tokens by value from highest to lowest
  const sortedTokens = [...walletTokens]
    .filter((token) => parseFloat(token.usdValue || "0") > 0)
    .sort(
      (a, b) => parseFloat(b.usdValue || "0") - parseFloat(a.usdValue || "0")
    );

  // Calculate total wallet value
  const totalValue = sortedTokens.reduce(
    (sum, token) => sum + parseFloat(token.usdValue || "0"),
    0
  );

  return (
    <div className="wallet-assets">
      <div className="wallet-header">
        <h3>
          <FaWallet className="header-icon" />
          Wallet Assets
        </h3>
        <div className="wallet-total">Total: ${totalValue.toFixed(2)}</div>
      </div>

      <div className="assets-grid">
        {(showAll ? sortedTokens : sortedTokens.slice(0, 8)).map(
          (token, idx) => (
            <div className="asset-card" key={`wallet-token-${idx}`}>
              <div className="asset-card__header">
                <div className="token-info">
                  <TokenIcon
                    symbol={token.symbol}
                    address={token.coinType}
                    size="md"
                  />
                  <span className="token-symbol">{token.symbol}</span>
                </div>
                <div className="token-price">
                  ${parseFloat(token.priceUsd || "0").toFixed(2)}
                </div>
              </div>
              <div className="asset-card__body">
                <div className="token-stats">
                  <div className="token-balance">
                    {formatTokenBalance(token.balance, token.decimals)}
                  </div>
                  <div className="token-value">
                    ${parseFloat(token.usdValue || "0").toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {sortedTokens.length > 8 && (
        <div className="view-all-container">
          <button
            className="view-all-button"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? (
              <>
                Show Less <FaChevronUp className="button-icon" />
              </>
            ) : (
              <>
                View All Assets ({sortedTokens.length}){" "}
                <FaChevronDown className="button-icon" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// Portfolio value card component
function PortfolioValueCard({
  totalValue,
  portfolioChange24h,
  selectedTimeframe,
  setSelectedTimeframe,
  assetCount,
  positionCount,
  highestApy,
}: {
  totalValue: number;
  portfolioChange24h: { value: number; percent: number };
  selectedTimeframe: "7d" | "30d" | "1yr";
  setSelectedTimeframe: React.Dispatch<
    React.SetStateAction<"7d" | "30d" | "1yr">
  >;
  assetCount: number;
  positionCount: number;
  highestApy: number;
}) {
  return (
    <div className="dashboard-card dashboard-card--glass dashboard-card--hero portfolio-value-card">
      <div className="dashboard-card__header">
        <h2 className="card-title">
          <FaChartLine className="card-icon" />
          Portfolio Overview
        </h2>
        <div className="card-actions">
          <FaInfoCircle style={{ color: "#B1A5C8", cursor: "pointer" }} />
        </div>
      </div>

      <div className="dashboard-card__content">
        <div className="value-container">
          <div className="value-label">Total Value</div>
          <div className="total-value">${totalValue.toFixed(2)}</div>
        </div>

        <div className="value-metrics">
          <div className="metric">
            <div className="metric-label">24h Change</div>
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
              <span>({portfolioChange24h.percent.toFixed(2)}%)</span>
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Assets</div>
            <div className="metric-value">
              {assetCount} Tokens / {positionCount} Positions
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Highest APY</div>
            <div
              className="metric-value"
              style={{
                color: "#1ED760",
                textShadow: "0 0 10px rgba(30, 215, 96, 0.5)",
              }}
            >
              {highestApy.toFixed(1)}%
            </div>
          </div>
        </div>

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
          <button
            className={selectedTimeframe === "1yr" ? "active" : ""}
            onClick={() => setSelectedTimeframe("1yr")}
          >
            1Y
          </button>
        </div>
      </div>
    </div>
  );
}

// Distribution chart card - Updated to fix single color issue
function DistributionChartCard({
  title,
  icon,
  data,
}: {
  title: string;
  icon: React.ReactNode;
  data: {
    series: number[];
    labels: string[];
    colors: string[];
    totalValue: number;
  };
}) {
  // Ensure we have data to display
  const hasData = data.series.length > 0 && data.labels.length > 0;

  // Format series to be at least 0.01 to ensure visibility
  const formattedSeries = data.series.map(
    (value) => Math.max(value, data.totalValue * 0.0001) // Ensure minimum slice size
  );

  // Chart options
  const chartOptions: ApexOptions = {
    chart: {
      type: "donut",
      background: "transparent",
      fontFamily: "Inter, sans-serif",
      animations: {
        enabled: false, // Disable animations for stability
      },
    },
    colors: data.colors,
    labels: data.labels,
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: false,
    },
    tooltip: {
      enabled: true,
      theme: "dark",
      y: {
        formatter: (value: number) => {
          return `$${value.toFixed(2)} (${(
            (value / data.totalValue) *
            100
          ).toFixed(1)}%)`;
        },
      },
    },
    stroke: {
      width: 2,
      colors: ["#030924"],
    },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: "70%",
          background: "transparent",
          labels: {
            show: true,
            name: {
              show: false,
            },
            value: {
              show: false,
            },
            total: {
              show: true,
              label: "Total",
              formatter: function () {
                return `$${data.totalValue.toFixed(2)}`;
              },
              color: "#FFFFFF",
              fontSize: "16px",
              fontWeight: 600,
            },
          },
        },
      },
    },
    states: {
      hover: {
        filter: {
          type: "none",
        },
      },
      active: {
        filter: {
          type: "none",
        },
      },
    },
  };

  return (
    <div className="dashboard-card chart-card">
      <div className="dashboard-card__header">
        <h3 className="card-title">
          {icon}
          {title}
        </h3>
      </div>
      <div className="dashboard-card__content">
        <div
          className="chart-container"
          id={`chart-${title.replace(/\s+/g, "-").toLowerCase()}`}
        >
          {hasData ? (
            <ReactApexChart
              key={`chart-${title}-${data.series.join("-")}`}
              options={chartOptions}
              series={formattedSeries}
              type="donut"
              height={220}
              width="100%"
            />
          ) : (
            <div className="no-data-message">No data available</div>
          )}
        </div>
        <div className="chart-legend">
          {data.labels.map((label, index) => (
            <div className="legend-item" key={`${title}-legend-${index}`}>
              <div
                className="legend-color"
                style={{
                  backgroundColor: data.colors[index],
                }}
              ></div>
              <div className="legend-label">{label}</div>
              <div className="legend-value">
                ${data.series[index].toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Position card component for displaying individual position data
function PositionCard({ position }: { position: PoolGroup }) {
  const [expanded, setExpanded] = useState(false);

  const toggleDetails = () => {
    setExpanded(!expanded);
  };

  return (
    <div
      className={`position-card ${expanded ? "position-card--expanded" : ""}`}
    >
      <div className="position-card__header">
        <div className="protocol-badge">{position.protocol}</div>
        <PoolPair
          tokenASymbol={position.tokenASymbol}
          tokenBSymbol={position.tokenBSymbol}
          tokenAAddress={position.tokenA}
          tokenBAddress={position.tokenB}
        />
      </div>
      <div className="position-card__body">
        <div className="stats-grid">
          <div className="stat">
            <div className="stat-label">Value</div>
            <div className="stat-value value">
              ${position.totalValueUsd.toFixed(2)}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">APR</div>
            <div className="stat-value apr">{position.apr.toFixed(2)}%</div>
          </div>
        </div>
      </div>

      {/* Expanded details section */}
      {expanded && (
        <div className="position-card__details">
          <div className="details-header">Position Details</div>

          {/* Position ID */}
          <div className="detail-row">
            <div className="detail-label">Position ID</div>
            <div className="detail-value">
              {formatAddress(position.positions?.[0]?.id || "")}
            </div>
          </div>

          {/* Removed the Liquidity line as requested */}

          {/* Balances */}
          {position.positions?.[0]?.balanceA && (
            <div className="detail-row">
              <div className="detail-label">
                {position.tokenASymbol} Balance
              </div>
              <div className="detail-value">
                {formatTokenBalance(position.positions[0].balanceA)}
              </div>
            </div>
          )}

          {position.positions?.[0]?.balanceB && (
            <div className="detail-row">
              <div className="detail-label">
                {position.tokenBSymbol} Balance
              </div>
              <div className="detail-value">
                {formatTokenBalance(position.positions[0].balanceB)}
              </div>
            </div>
          )}

          {/* Position Type */}
          <div className="detail-row">
            <div className="detail-label">Type</div>
            <div className="detail-value">
              {position.positions?.[0]?.positionType || "Unknown"}
            </div>
          </div>

          {/* Out of Range Warning (for LP positions) */}
          {position.positions?.[0]?.isOutOfRange && (
            <div className="out-of-range-warning">
              <FaExclamationTriangle /> This position is out of range
            </div>
          )}
        </div>
      )}

      <div className="position-card__footer">
        <button className="action-button" onClick={toggleDetails}>
          {expanded ? (
            <>
              <FaChevronUp style={{ marginRight: "4px" }} /> Hide Details
            </>
          ) : (
            <>
              <FaChartLine style={{ marginRight: "4px" }} /> Details
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Function to fetch historical portfolio data
async function fetchPortfolioHistory(
  address: string,
  timeframe: "7d" | "30d" | "1yr" = "30d",
  abortSignal?: AbortSignal
): Promise<{ dates: string[]; values: number[] }> {
  try {
    // Check if the operation was aborted
    if (abortSignal?.aborted) {
      throw new Error("Operation was aborted");
    }

    // Use SUI price history as a proxy for portfolio history
    const suiToken = "0x2::sui::SUI";

    // Determine the correct interval based on the timeframe
    let interval;
    switch (timeframe) {
      case "7d":
        interval = "1d"; // Use daily intervals for 7d view
        break;
      case "30d":
        interval = "1w"; // Use weekly intervals for 30d view
        break;
      case "1yr":
        interval = "1M"; // Use monthly intervals for 1yr view
        break;
      default:
        interval = "1w";
    }

    // Check if getLineChartData function exists before calling it
    if (typeof birdeyeService.getLineChartData === "function") {
      try {
        // Check for abort
        if (abortSignal?.aborted) {
          throw new Error("Operation was aborted");
        }

        const historyData = await birdeyeService.getLineChartData(
          suiToken,
          interval
        );

        // Check for abort again after async operation
        if (abortSignal?.aborted) {
          throw new Error("Operation was aborted");
        }

        // Check if we got valid data
        if (
          historyData &&
          Array.isArray(historyData) &&
          historyData.length > 0
        ) {
          // Extract the dates and prices
          const dates: string[] = [];
          const values: number[] = [];

          // Get current portfolio value to use for scaling
          const latestValue = historyData[historyData.length - 1]?.price || 1;
          const currentPortfolioValue = address
            ? parseFloat(
                sessionStorage.getItem(`${address}_portfolioValue`) || "0"
              )
            : 0;
          const scaleFactor =
            currentPortfolioValue > 0
              ? currentPortfolioValue / latestValue
              : 100;

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
        }
      } catch (err) {
        // If aborted, rethrow
        if (abortSignal?.aborted) {
          throw err;
        }

        console.error("Error in getLineChartData:", err);
        // Fall through to the fallback below
      }
    } else {
      console.warn(
        "birdeyeService.getLineChartData is not available, using fallback data"
      );
    }

    // Check for abort
    if (abortSignal?.aborted) {
      throw new Error("Operation was aborted");
    }

    // If we get here, either:
    // 1. The function doesn't exist
    // 2. The API call failed
    // 3. The API returned invalid data
    // So we use our fallback logic

    // Determine the number of days to simulate based on timeframe
    const days = (() => {
      switch (timeframe) {
        case "7d":
          return 7;
        case "30d":
          return 30;
        case "1yr":
          return 365;
        default:
          return 30;
      }
    })();

    // Get the current portfolio value for scaling
    const currentPortfolioValue = address
      ? parseFloat(sessionStorage.getItem(`${address}_portfolioValue`) || "0")
      : 100; // Default to 100 if no value is stored

    // Generate fallback dates and values
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
      values.push(parseFloat((currentPortfolioValue * factor).toFixed(2)));
    }

    // Check if aborted or component unmounted
    if (abortSignal?.aborted) {
      throw new Error("Operation was aborted");
    }

    return { dates, values };
  } catch (error) {
    // If aborted, rethrow
    if (abortSignal?.aborted) {
      throw error;
    }

    console.error("Error fetching portfolio history:", error);
    // Return a minimal dataset in case of error
    return { dates: [], values: [] };
  }
}

// Swap History Component
function SwapHistoryList({ swaps }: { swaps: SwapHistoryItem[] }) {
  if (swaps.length === 0) {
    return (
      <div className="empty-activity">
        <div className="empty-icon">
          <FaExchangeAlt />
        </div>
        <h3>No Swap History</h3>
        <p>
          You haven't made any token swaps yet. Start trading to see your
          activity here.
        </p>
        <Link to="/trade" className="action-button">
          <FaExchangeAlt className="button-icon" /> Trade Now
        </Link>
      </div>
    );
  }

  return (
    <div className="activity-list">
      {swaps.map((swap) => (
        <div key={swap.id} className="activity-card">
          <div className="activity-card__header">
            <div className="activity-type swap">
              <FaExchangeAlt />
              <span>Swap</span>
            </div>
            <div className="activity-status">
              <span className={`status-badge ${swap.status.toLowerCase()}`}>
                {swap.status}
              </span>
            </div>
          </div>

          <div className="activity-card__body">
            <div className="swap-details">
              <div className="token-from">
                <div className="token-amount">
                  {formatTokenBalance(
                    swap.fromToken.amount,
                    swap.fromToken.decimals
                  )}{" "}
                  {swap.fromToken.symbol}
                </div>
              </div>

              <div className="swap-arrow">
                <FaArrowDown />
              </div>

              <div className="token-to">
                <div className="token-amount">
                  {formatTokenBalance(
                    swap.toToken.amount,
                    swap.toToken.decimals
                  )}{" "}
                  {swap.toToken.symbol}
                </div>
              </div>

              {swap.priceImpact !== undefined && (
                <div className="price-impact">
                  Price Impact:{" "}
                  <span
                    className={
                      parseFloat(swap.priceImpact.toString()) > 1
                        ? "warning"
                        : "normal"
                    }
                  >
                    {parseFloat(swap.priceImpact.toString()).toFixed(2)}%
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="activity-card__footer">
            <div className="activity-meta">
              <div className="activity-time">{formatDate(swap.timestamp)}</div>
              <a
                href={`https://explorer.sui.io/txblock/${swap.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="explorer-link"
              >
                View on Explorer <FaArrowRight className="icon-sm" />
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Activity Filters Component
function ActivityFilters({
  onFilterChange,
}: {
  onFilterChange: (filters: any) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    tokenPair: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    const newFilters = { ...filters, [name]: value };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  return (
    <div className="activity-filters">
      <button
        className="filter-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <FaFilter className="icon-sm" />
        Filters
        <FaChevronDown className={`icon-sm ${isExpanded ? "expanded" : ""}`} />
      </button>

      {isExpanded && (
        <div className="filter-options">
          <div className="filter-group">
            <label>Date Range</label>
            <div className="date-filters">
              <div className="date-input">
                <FaCalendarAlt className="input-icon" />
                <input
                  type="date"
                  name="startDate"
                  value={filters.startDate}
                  onChange={handleChange}
                  placeholder="From"
                />
              </div>
              <div className="date-input">
                <FaCalendarAlt className="input-icon" />
                <input
                  type="date"
                  name="endDate"
                  value={filters.endDate}
                  onChange={handleChange}
                  placeholder="To"
                />
              </div>
            </div>
          </div>

          <div className="filter-group">
            <label>Token Pair</label>
            <div className="token-pair-filter">
              <FaExchangeAlt className="input-icon" />
              <select
                name="tokenPair"
                value={filters.tokenPair}
                onChange={handleChange}
              >
                <option value="">All Pairs</option>
                <option value="SUI-USDC">SUI-USDC</option>
                <option value="SUI-USDT">SUI-USDT</option>
                <option value="SUI-WETH">SUI-WETH</option>
                <option value="USDC-USDT">USDC-USDT</option>
              </select>
            </div>
          </div>

          <button
            className="clear-filters"
            onClick={() => {
              const emptyFilters = {
                startDate: "",
                endDate: "",
                tokenPair: "",
              };
              setFilters(emptyFilters);
              onFilterChange(emptyFilters);
            }}
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}

// Activity View Component
function ActivityView({ wallet }: { wallet: any }) {
  const { connected, account } = wallet;
  const [swaps, setSwaps] = useState<SwapHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({});
  const [pagination, setPagination] = useState({
    offset: 0,
    limit: 10,
    hasMore: true,
  });

  // Ref to track component mounted state
  const isMountedRef = useRef(true);
  // Ref to keep track of fetch controller
  const abortControllerRef = useRef<AbortController | null>(null);

  // Updated loadSwapHistory function with better error handling and debugging
  const loadSwapHistory = useCallback(
    async (reset = false) => {
      if (!connected || !account?.address) return;
      if (!isMountedRef.current) return;

      // Cancel any existing requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create a new abort controller
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setLoading(true);
      setError(null);

      try {
        // Prepare parameters for our backend API
        const offset = reset ? 0 : pagination.offset;

        // Determine token pair filter if needed
        let tokenPairFilter = "";
        if ((filters as any)?.tokenPair) {
          const pair = (filters as any).tokenPair;
          if (pair === "SUI-USDC") {
            tokenPairFilter =
              "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI-0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
          }
          // Add other pairs as needed
        }

        console.log(
          `[Portfolio] Fetching swap history for address: ${account.address.substring(
            0,
            10
          )}...`
        );

        // Call our backend API that proxies the request to 7K's API
        const backendUrl = "/api/7k/trading-history";

        const response = await fetch(backendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: account.address,
            offset,
            limit: pagination.limit,
            tokenPair: tokenPairFilter || undefined,
          }),
          signal: abortController.signal,
        });

        // Check if we've been aborted
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        if (!response.ok) {
          // Handle backend errors
          let errorMessage = `Backend responded with status ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.message || errorMessage;
          } catch (e) {
            // If we can't parse the error response, just use the status message
          }
          throw new Error(errorMessage);
        }

        // Parse the response data
        const result = await response.json();

        // Check if we've been aborted after the async operation
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        if (!result.success) {
          throw new Error(result.message || "Failed to load swap history");
        }

        // Get the history array from the response
        const historyItems: SwapHistoryItem[] = result.history || [];

        console.log(
          `[Portfolio] Loaded ${historyItems.length} swap history items via backend proxy`
        );

        // Apply date filtering if needed
        let filteredHistory = historyItems;
        if ((filters as any)?.startDate || (filters as any)?.endDate) {
          const { startDate, endDate } = filters as any;
          filteredHistory = historyItems.filter((swap) => {
            const swapDate = new Date(swap.timestamp * 1000);
            let include = true;

            if (startDate) {
              const startDateObj = new Date(startDate);
              include = include && swapDate >= startDateObj;
            }

            if (endDate) {
              const endDateObj = new Date(endDate);
              endDateObj.setDate(endDateObj.getDate() + 1); // include the full end date
              include = include && swapDate < endDateObj;
            }

            return include;
          });

          if (filteredHistory.length !== historyItems.length) {
            console.log(
              `[Portfolio] Filtered to ${filteredHistory.length} items based on date range`
            );
          }
        }

        // Check if we've been aborted or component unmounted after filtering
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        // Update state with the new history data
        setSwaps((prev) =>
          reset ? filteredHistory : [...prev, ...filteredHistory]
        );

        // Update pagination "hasMore" flag
        const hasMore = result.count > offset + pagination.limit;
        setPagination((prev) => ({
          ...prev,
          offset: offset + pagination.limit,
          hasMore,
        }));

        console.log(
          `[Portfolio] Updated pagination - hasMore: ${hasMore}, new offset: ${
            offset + pagination.limit
          }`
        );
      } catch (err) {
        // Check if the error is due to abortion
        if (err instanceof DOMException && err.name === "AbortError") {
          console.log("[Portfolio] Swap history fetch was aborted");
          return;
        }

        // Check if component is still mounted
        if (!isMountedRef.current) {
          return;
        }

        console.error("Failed to load swap history:", err);

        // Show error message unless it's just an empty result
        if (
          err instanceof Error &&
          (err.message.includes("no history") || err.message.includes("empty"))
        ) {
          console.log("[Portfolio] No swap history found (expected)");
          // Just set empty array, don't show error
          if (reset) setSwaps([]);
        } else {
          setError(
            `Failed to load your swap history: ${
              err instanceof Error ? err.message : "Unknown error"
            }`
          );
        }
      } finally {
        // Only update loading state if component is still mounted
        if (isMountedRef.current) {
          setLoading(false);
        }

        // Clear the abort controller reference if it's the same one
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    },
    [connected, account, pagination.limit, pagination.offset, filters]
  );

  // Setup and cleanup
  useEffect(() => {
    isMountedRef.current = true;

    // Initial load
    loadSwapHistory(true);

    return () => {
      isMountedRef.current = false;

      // Abort any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [loadSwapHistory]);

  // Handle filter changes
  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters);
    loadSwapHistory(true);
  };

  return (
    <div className="activity-page">
      <div className="dashboard-grid dashboard-grid--single">
        <div className="dashboard-card dashboard-card--glass">
          <div className="dashboard-card__header">
            <h2 className="card-title">
              <FaRegClock className="card-icon" />
              Swap History
            </h2>
            <div className="card-actions">
              <FaInfoCircle style={{ color: "#B1A5C8", cursor: "pointer" }} />
            </div>
          </div>

          <div className="dashboard-card__content">
            {/* Activity Filters */}
            <ActivityFilters onFilterChange={handleFilterChange} />

            {/* Swap History or Loading/Error States */}
            {error ? (
              <div className="error-state">
                <div className="error-icon">
                  <FaExclamationTriangle />
                </div>
                <h3>Error Loading Activity</h3>
                <p>{error}</p>
                <button
                  className="retry-button"
                  onClick={() => loadSwapHistory(true)}
                >
                  <FaRedo className="button-icon" /> Try Again
                </button>
              </div>
            ) : !connected ? (
              <div className="empty-state">
                <div className="empty-icon">🔐</div>
                <h3>Connect Your Wallet</h3>
                <p>Please connect your wallet to view your activity history.</p>
                <button
                  className="action-button"
                  onClick={() => wallet.select()}
                >
                  <FaWallet className="button-icon" /> Connect Wallet
                </button>
              </div>
            ) : loading && swaps.length === 0 ? (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <div className="loading-text">Loading Activity</div>
                <div className="loading-subtext">
                  Fetching your swap history from the blockchain...
                </div>
              </div>
            ) : (
              <>
                <SwapHistoryList swaps={swaps} />

                {/* Load More Button */}
                {pagination.hasMore && !loading && (
                  <div className="load-more-container">
                    <button
                      className="load-more-button"
                      onClick={() => loadSwapHistory(false)}
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          Loading... <div className="button-spinner"></div>
                        </>
                      ) : (
                        <>
                          Load More <FaChevronDown className="button-icon" />
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Loading More Indicator */}
                {loading && swaps.length > 0 && (
                  <div className="loading-more">
                    <div className="loading-spinner-small"></div>
                    <span>Loading more activities...</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Empty positions component
function EmptyPositions({ activeTab }: { activeTab: string }) {
  return (
    <div className="empty-positions">
      <div className="empty-icon">
        <FaLayerGroup />
      </div>
      <h3>No Positions Found</h3>
      <p>
        {activeTab === "all"
          ? "You don't have any DeFi positions yet. Start by adding liquidity to a pool or staking your assets."
          : `You don't have any ${activeTab.replace(
              "-",
              " "
            )} positions. Explore opportunities to grow your portfolio.`}
      </p>
      <Link to="/explore" className="action-button">
        <FaSearch className="button-icon" /> Explore Opportunities
      </Link>
    </div>
  );
}

// Trade History View Component
function TradeHistoryView() {
  return (
    <div className="dashboard-grid dashboard-grid--single">
      <div className="dashboard-card dashboard-card--glass">
        <div className="dashboard-card__header">
          <h2 className="card-title">
            <FaHistory className="card-icon" />
            Trade History
          </h2>
        </div>
        <div className="dashboard-card__content">
          <TradeHistory />
        </div>
      </div>
    </div>
  );
}

function Portfolio() {
  console.log("Portfolio component initializing");
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
  const [selectedTimeframe, setSelectedTimeframe] = useState<
    "7d" | "30d" | "1yr"
  >("30d");

  // Active view and tab states
  const [activeView, setActiveView] = useState<string>("portfolio");
  const [activeTab, setActiveTab] = useState<string>("all");

  // State for controlling the visibility of wallet modals - using single state to track which is active
  const [activeWallet, setActiveWallet] = useState<"phantom" | "slush" | null>(
    null
  );

  // URL handling for direct access to sections
  const location = useLocation();
  const navigate = useNavigate();

  // Refs for handling async operations and unmounting
  const isMountedRef = useRef(true);
  const loadPositionsControllerRef = useRef<AbortController | null>(null);
  const loadScallopControllerRef = useRef<AbortController | null>(null);
  const loadWalletTokensControllerRef = useRef<AbortController | null>(null);
  const loadHistoryControllerRef = useRef<AbortController | null>(null);

  // Log the wallet integration status when the component mounts
  useEffect(() => {
    // Set mounted flag
    isMountedRef.current = true;

    // Check for wallet providers in a consistent way for debugging
    console.log("[Portfolio] Initial wallet provider status:", {
      phantom: !!window.phantom,
      phantomSui: !!window.phantom?.sui,
      cerebraWallet: !!window.cerebraWallet,
      cerebraShow: !!window.cerebraWallet?.show,
      container: !!document.getElementById("phantom-wallet-container"),
      origin: window.location.origin,
      isLocalhost: window.location.hostname === "localhost",
      protocol: window.location.protocol,
    });

    // Cleanup function
    return () => {
      console.log("Portfolio component unmounting, cleaning up...");
      isMountedRef.current = false;

      // Abort any in-flight requests
      [
        loadPositionsControllerRef,
        loadScallopControllerRef,
        loadWalletTokensControllerRef,
        loadHistoryControllerRef,
      ].forEach((ref) => {
        if (ref.current) {
          ref.current.abort();
          ref.current = null;
        }
      });
    };
  }, []);

  // Set initial view based on URL if provided
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const view = searchParams.get("view");
    const tab = searchParams.get("tab");

    if (view) {
      setActiveView(view);
    }

    if (tab) {
      setActiveTab(tab);
    }
  }, [location]);

  // Update URL when view/tab changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("view", activeView);
    if (activeView === "portfolio" && activeTab) {
      params.set("tab", activeTab);
    }
    navigate(`?${params.toString()}`, { replace: true });
  }, [activeView, activeTab, navigate]);

  // Fetch portfolio history data
  const loadPortfolioHistory = useCallback(
    async (currentValue: number) => {
      if (!connected || !account?.address || !isMountedRef.current) return;

      // Cancel any previous history fetch
      if (loadHistoryControllerRef.current) {
        loadHistoryControllerRef.current.abort();
      }

      // Create a new abort controller
      const abortController = new AbortController();
      loadHistoryControllerRef.current = abortController;

      try {
        // Store current portfolio value in session storage for reference
        sessionStorage.setItem(
          `${account.address}_portfolioValue`,
          currentValue.toString()
        );

        // Fetch real historical data based on selected timeframe
        const history = await fetchPortfolioHistory(
          account.address,
          selectedTimeframe,
          abortController.signal
        );

        // Check if aborted or component unmounted
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        if (history.dates.length > 0 && history.values.length > 0) {
          setPortfolioHistory(history);

          // Calculate 24h change using the last two data points
          const todayValue = history.values[history.values.length - 1];
          const yesterdayValue =
            history.values[history.values.length - 2] || todayValue;
          const changeValue = todayValue - yesterdayValue;
          const changePercent =
            yesterdayValue > 0 ? (changeValue / yesterdayValue) * 100 : 0;

          if (isMountedRef.current) {
            setPortfolioChange24h({
              value: changeValue,
              percent: changePercent,
            });
          }
        } else {
          // Fallback to a simple timeline with current value
          const days = (() => {
            switch (selectedTimeframe) {
              case "7d":
                return 7;
              case "30d":
                return 30;
              case "1yr":
                return 365;
              default:
                return 30;
            }
          })();

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

          // Check if aborted or component unmounted
          if (abortController.signal.aborted || !isMountedRef.current) {
            return;
          }

          setPortfolioHistory({ dates, values });

          // Calculate fallback 24h change
          if (values.length >= 2) {
            const todayValue = values[values.length - 1];
            const yesterdayValue = values[values.length - 2];
            const changeValue = todayValue - yesterdayValue;
            const changePercent =
              yesterdayValue > 0 ? (changeValue / yesterdayValue) * 100 : 0;

            if (isMountedRef.current) {
              setPortfolioChange24h({
                value: changeValue,
                percent: changePercent,
              });
            }
          }
        }
      } catch (error) {
        // Check if the error is due to abortion
        if (error instanceof DOMException && error.name === "AbortError") {
          console.log("[Portfolio] Portfolio history fetch was aborted");
          return;
        }

        // Only log if the component is still mounted
        if (isMountedRef.current) {
          console.error("Failed to load portfolio history:", error);
        }
      } finally {
        // Clear the abort controller reference if it's the same one
        if (loadHistoryControllerRef.current === abortController) {
          loadHistoryControllerRef.current = null;
        }
      }
    },
    [connected, account, selectedTimeframe]
  );

  // Fetch Scallop data only - separate from main portfolio loading
  const fetchScallopData = useCallback(async () => {
    if (!connected || !account?.address || !isMountedRef.current) return;

    // Cancel any previous scallop data fetch
    if (loadScallopControllerRef.current) {
      loadScallopControllerRef.current.abort();
    }

    // Create a new abort controller
    const abortController = new AbortController();
    loadScallopControllerRef.current = abortController;

    if (isMountedRef.current) {
      setLoadingScallop(true);
    }

    try {
      console.log("Fetching Scallop data for:", account.address);
      const data = await getScallopPortfolioData(account.address);

      // Check if aborted or component unmounted
      if (abortController.signal.aborted || !isMountedRef.current) {
        return;
      }

      console.log("Scallop data received:", data);

      // Make sure we have valid data before setting it
      if (data && isMountedRef.current) {
        setScallopData(data);
      }
    } catch (err) {
      // Check if the error is due to abortion
      if (err instanceof DOMException && err.name === "AbortError") {
        console.log("[Portfolio] Scallop data fetch was aborted");
        return;
      }

      // Only log if the component is still mounted
      if (isMountedRef.current) {
        console.error("Error fetching Scallop data:", err);
      }
    } finally {
      // Only update loading state if component is still mounted
      if (isMountedRef.current) {
        setLoadingScallop(false);
      }

      // Clear the abort controller reference if it's the same one
      if (loadScallopControllerRef.current === abortController) {
        loadScallopControllerRef.current = null;
      }
    }
  }, [connected, account]);

  // Create Scallop position cards function
  const createScallopPositionCards = useCallback(() => {
    if (!scallopData) return [];

    console.log("Creating Scallop position cards from:", scallopData);
    const scallopCards: PoolGroup[] = [];

    // Add lending positions
    if (scallopData.lendings && scallopData.lendings.length > 0) {
      console.log(
        `Processing ${scallopData.lendings.length} Scallop lending positions`
      );

      scallopData.lendings.forEach((lending: any, index: number) => {
        console.log(`Creating Scallop lending card for ${lending.symbol}`);

        // Make sure we have the required data
        if (!lending.coinType || !lending.symbol) {
          console.warn(
            "Missing required data for Scallop lending position:",
            lending
          );
          return;
        }

        const position: PoolGroup = {
          poolAddress: `scallop-lending-${lending.coinType}-${index}`, // Add index to ensure uniqueness
          poolName: `${lending.symbol} Supply`,
          protocol: "Scallop",
          positions: [
            {
              id: `scallop-lending-${lending.coinType}-${index}`,
              liquidity: lending.suppliedCoin.toString(),
              balanceA: lending.suppliedCoin.toString(),
              balanceB: "0",
              valueUsd: lending.suppliedValue,
              isOutOfRange: false,
              positionType: "scallop-lending",
            },
          ],
          totalLiquidity: lending.suppliedCoin,
          totalValueUsd: lending.suppliedValue,
          apr: lending.supplyApy * 100,
          tokenA: lending.coinType,
          tokenB: "",
          tokenASymbol: lending.symbol,
          tokenBSymbol: "",
        };

        scallopCards.push(position);
      });
    }

    // Add borrowing positions
    if (scallopData.borrowings && scallopData.borrowings.length > 0) {
      console.log(
        `Processing ${scallopData.borrowings.length} Scallop borrowing obligations`
      );

      scallopData.borrowings.forEach(
        (obligation: any, obligationIdx: number) => {
          if (obligation.borrowedPools && obligation.borrowedPools.length > 0) {
            console.log(
              `Processing ${obligation.borrowedPools.length} borrowed pools in obligation ${obligationIdx}`
            );

            obligation.borrowedPools.forEach((borrow: any, index: number) => {
              console.log(`Creating Scallop borrow card for ${borrow.symbol}`);

              // Make sure we have the required data
              if (!borrow.coinType || !borrow.symbol) {
                console.warn(
                  "Missing required data for Scallop borrow position:",
                  borrow
                );
                return;
              }

              const position: PoolGroup = {
                poolAddress: `scallop-borrow-${borrow.coinType}-${obligationIdx}-${index}`, // Ensure uniqueness
                poolName: `${borrow.symbol} Borrow`,
                protocol: "Scallop",
                positions: [
                  {
                    id: `scallop-borrow-${borrow.coinType}-${obligationIdx}-${index}`,
                    liquidity: borrow.borrowedCoin.toString(),
                    balanceA: borrow.borrowedCoin.toString(),
                    balanceB: "0",
                    valueUsd: borrow.borrowedValueInUsd,
                    isOutOfRange: false,
                    positionType: "scallop-borrow",
                  },
                ],
                totalLiquidity: borrow.borrowedCoin,
                totalValueUsd: borrow.borrowedValueInUsd,
                apr: borrow.borrowApy * 100,
                tokenA: borrow.coinType,
                tokenB: "",
                tokenASymbol: borrow.symbol,
                tokenBSymbol: "",
              };

              scallopCards.push(position);
            });
          }
        }
      );
    }

    console.log(`Created ${scallopCards.length} Scallop position cards`);
    return scallopCards;
  }, [scallopData]);

  // Directly combine pool positions with Scallop positions for display
  const allPositions = useMemo(() => {
    if (!scallopData || !poolPositions.length) return poolPositions;

    const scallopPositions = createScallopPositionCards();
    console.log(
      `Adding ${scallopPositions.length} Scallop positions to ${poolPositions.length} existing positions`
    );

    // Check if we already have any Scallop positions to avoid duplicates
    const hasScallopPositions = poolPositions.some(
      (p) => p.protocol === "Scallop"
    );

    if (hasScallopPositions || !scallopPositions.length) {
      return poolPositions;
    }

    return [...poolPositions, ...scallopPositions];
  }, [poolPositions, scallopData, createScallopPositionCards]);

  // Load positions - similar to the Positions page approach that works
  const loadPositions = useCallback(async () => {
    if (connected && account?.address && isMountedRef.current) {
      // Cancel any previous positions fetch
      if (loadPositionsControllerRef.current) {
        loadPositionsControllerRef.current.abort();
      }

      // Create a new abort controller
      const abortController = new AbortController();
      loadPositionsControllerRef.current = abortController;

      if (isMountedRef.current) {
        setLoading(true);
        setError(null);
      }

      try {
        console.log("Loading positions for Portfolio:", account.address);

        // Check if aborted or component unmounted
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        // Get all positions in one call (excluding wallet assets)
        const positions = await blockvisionService.getDefiPortfolio(
          account.address,
          undefined, // No specific protocol filter
          false // Exclude wallet assets
        );

        // Check if aborted or component unmounted after async call
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        console.log(`Loaded ${positions.length} positions`);

        // Debug: Check for Cetus positions
        console.log("Checking for Cetus positions:");
        positions.forEach((position) => {
          if (position.protocol === "Cetus") {
            console.log(
              `  Found Cetus position: ${position.poolName}, Type: ${position.positions[0]?.positionType}, Value: $${position.totalValueUsd}`
            );
          }
        });

        // Set positions in state if component still mounted
        if (isMountedRef.current) {
          setPoolPositions(positions);
        } else {
          return;
        }

        // Calculate the total value of all positions
        const totalPositionValue = positions.reduce(
          (sum, p) => sum + p.totalValueUsd,
          0
        );

        // Make sure we have Scallop data before using it
        const scallopValue = scallopData
          ? parseFloat(scallopData.totalSupplyValue || "0") +
            parseFloat(scallopData.totalCollateralValue || "0")
          : 0;

        // Calculate wallet value
        const walletValue = walletTokens.reduce(
          (sum, token) => sum + parseFloat(token.usdValue || "0"),
          0
        );

        // Check if aborted or component unmounted
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        // Generate portfolio data
        const portfolioTotalValue =
          totalPositionValue + scallopValue + walletValue;

        if (isMountedRef.current) {
          setPortfolioData({
            positions,
            positionValue: totalPositionValue,
            scallopValue,
            walletValue,
            totalValue: portfolioTotalValue,
          });
        } else {
          return;
        }

        // Load real portfolio history
        await loadPortfolioHistory(portfolioTotalValue);
      } catch (err) {
        // Check if the error is due to abortion
        if (err instanceof DOMException && err.name === "AbortError") {
          console.log("[Portfolio] Positions fetch was aborted");
          return;
        }

        // Only update state if component is still mounted
        if (isMountedRef.current) {
          console.error("Failed to load positions:", err);
          setError("Failed to load your positions. Please try again.");
        }
      } finally {
        // Only update loading state if component is still mounted
        if (isMountedRef.current) {
          setLoading(false);
        }

        // Clear the abort controller reference if it's the same one
        if (loadPositionsControllerRef.current === abortController) {
          loadPositionsControllerRef.current = null;
        }
      }
    }
  }, [
    connected,
    account,
    scallopData,
    walletTokens,
    loadPortfolioHistory,
    isMountedRef,
  ]);

  // Use separate effect for loading wallet tokens to avoid rate limiting
  const loadWalletTokens = useCallback(async () => {
    if (connected && account?.address && isMountedRef.current) {
      // Cancel any previous wallet tokens fetch
      if (loadWalletTokensControllerRef.current) {
        loadWalletTokensControllerRef.current.abort();
      }

      // Create a new abort controller
      const abortController = new AbortController();
      loadWalletTokensControllerRef.current = abortController;

      try {
        // Attempt to get wallet tokens but don't block main loading if it fails
        const walletTokensResponse = await blockvisionService.getWalletValue(
          account.address
        );

        // Check if aborted or component unmounted
        if (abortController.signal.aborted || !isMountedRef.current) {
          return;
        }

        if (
          walletTokensResponse &&
          walletTokensResponse.coins &&
          isMountedRef.current
        ) {
          setWalletTokens(walletTokensResponse.coins || []);
        }
      } catch (err) {
        // Check if the error is due to abortion
        if (err instanceof DOMException && err.name === "AbortError") {
          console.log("[Portfolio] Wallet tokens fetch was aborted");
          return;
        }

        // Only log if component is still mounted
        if (isMountedRef.current) {
          console.warn("Could not load wallet tokens:", err);
          // Non-fatal error, continue without wallet tokens
          setWalletTokens([]);
        }
      } finally {
        // Clear the abort controller reference if it's the same one
        if (loadWalletTokensControllerRef.current === abortController) {
          loadWalletTokensControllerRef.current = null;
        }
      }
    }
  }, [connected, account, isMountedRef]);

  // First fetch Scallop data
  useEffect(() => {
    fetchScallopData();
  }, [fetchScallopData]);

  // Load wallet tokens separately to avoid rate limiting
  useEffect(() => {
    // Add a small delay to avoid rate limiting
    const timer = setTimeout(() => {
      loadWalletTokens();
    }, 1000);

    return () => clearTimeout(timer);
  }, [loadWalletTokens]);

  // Then load positions once Scallop data and wallet tokens are available
  useEffect(() => {
    loadPositions();
  }, [loadPositions, walletTokens]);

  // Reload portfolio history when timeframe changes
  useEffect(() => {
    if (portfolioData?.totalValue) {
      loadPortfolioHistory(portfolioData.totalValue);
    }
  }, [selectedTimeframe, portfolioData?.totalValue, loadPortfolioHistory]);

  // Function to categorize positions
  const categorizePositions = (positions: PoolGroup[]) => {
    const categories = {
      lpPools: [] as PoolGroup[],
      vaults: [] as PoolGroup[],
      farms: [] as PoolGroup[],
      lending: [] as PoolGroup[],
      staking: [] as PoolGroup[],
    };

    positions.forEach((position) => {
      const positionType = position.positions[0]?.positionType || "";
      const protocol = position.protocol;
      const poolName = position.poolName.toLowerCase();

      // Debug logging to verify position types
      console.log(
        `Categorizing: ${protocol} - ${poolName} - Type: ${positionType}`
      );

      // Cetus vaults check
      if (
        positionType === "cetus-vault" ||
        (protocol === "Cetus" &&
          (positionType.includes("vault") || poolName.includes("vault")))
      ) {
        console.log(`  -> Categorized as vault: ${protocol} - ${poolName}`);
        categories.vaults.push(position);
        return;
      }

      // Cetus farms check
      if (
        positionType === "cetus-farm" ||
        (protocol === "Cetus" &&
          (positionType.includes("farm") || poolName.includes("farm")))
      ) {
        console.log(`  -> Categorized as farm: ${protocol} - ${poolName}`);
        categories.farms.push(position);
        return;
      }

      // Other protocol-based categorization
      if (protocol === "Haedal" || protocol === "haedal") {
        // Haedal goes into vaults
        categories.vaults.push(position);
      } else if (positionType.includes("vault") || poolName.includes("vault")) {
        categories.vaults.push(position);
      } else if (positionType.includes("farm") || poolName.includes("farm")) {
        categories.farms.push(position);
      } else if (
        positionType.includes("lend") ||
        positionType.includes("borrow") ||
        protocol === "Scallop" ||
        protocol === "SuiLend"
      ) {
        categories.lending.push(position);
      } else if (positionType.includes("staking") || protocol === "Suistake") {
        categories.staking.push(position);
      } else if (positionType.includes("lp") || position.tokenBSymbol) {
        // Most LP pools have two tokens
        categories.lpPools.push(position);
      } else {
        // Default to LP Pools
        categories.lpPools.push(position);
      }
    });

    return categories;
  };

  // Calculate portfolio metrics for overview section
  const calculatePortfolioMetrics = () => {
    // Calculate unique tokens count (from wallet + positions)
    const uniqueTokens = new Set<string>();

    // Add wallet tokens
    walletTokens.forEach((token) => {
      if (token.symbol) {
        uniqueTokens.add(token.symbol.toUpperCase());
      }
    });

    // Add position tokens
    allPositions.forEach((position) => {
      if (position.tokenASymbol) {
        uniqueTokens.add(position.tokenASymbol.toUpperCase());
      }
      if (position.tokenBSymbol) {
        uniqueTokens.add(position.tokenBSymbol.toUpperCase());
      }
    });

    // Count positions
    const positionCount = allPositions.length;

    // Calculate highest APY
    const allAprs = allPositions.map((position) => position.apr || 0);
    const highestApy = allAprs.length > 0 ? Math.max(...allAprs) : 0;

    return {
      tokenCount: uniqueTokens.size,
      positionCount,
      highestApy,
    };
  };

  // Categorize positions using allPositions instead of poolPositions
  const categorizedPositions = useMemo(() => {
    const categorized = categorizePositions(allPositions);

    // Debug info about categorization
    console.log("All positions after categorization:", allPositions.length);
    console.log(
      "Protocols represented:",
      [...new Set(allPositions.map((p) => p.protocol))].join(", ")
    );
    console.log("Categories count:", {
      lpPools: categorized.lpPools.length,
      vaults: categorized.vaults.length,
      farms: categorized.farms.length,
      lending: categorized.lending.length,
      staking: categorized.staking.length,
    });

    return categorized;
  }, [allPositions]);

  // Calculate category counts and values
  const lpPoolsCount = categorizedPositions.lpPools.length;
  const lpPoolsValue = categorizedPositions.lpPools.reduce(
    (sum, p) => sum + p.totalValueUsd,
    0
  );

  const vaultsCount = categorizedPositions.vaults.length;
  const vaultsValue = categorizedPositions.vaults.reduce(
    (sum, p) => sum + p.totalValueUsd,
    0
  );

  const farmsCount = categorizedPositions.farms.length;
  const farmsValue = categorizedPositions.farms.reduce(
    (sum, p) => sum + p.totalValueUsd,
    0
  );

  const lendingCount = categorizedPositions.lending.length;
  const lendingValue = categorizedPositions.lending.reduce(
    (sum, p) => sum + p.totalValueUsd,
    0
  );

  const stakingCount = categorizedPositions.staking.length;
  const stakingValue = categorizedPositions.staking.reduce(
    (sum, p) => sum + p.totalValueUsd,
    0
  );

  const totalCount = allPositions.length;
  const totalPositionsValue = allPositions.reduce(
    (sum, p) => sum + p.totalValueUsd,
    0
  );

  // Calculate wallet value
  const walletValue = walletTokens.reduce(
    (sum, token) => sum + parseFloat(token.usdValue || "0"),
    0
  );

  // Category data for sidebar
  const categoryData = {
    all: { count: totalCount, value: totalPositionsValue },
    lpPools: { count: lpPoolsCount, value: lpPoolsValue },
    vaults: { count: vaultsCount, value: vaultsValue },
    farms: { count: farmsCount, value: farmsValue },
    lending: { count: lendingCount, value: lendingValue },
    staking: { count: stakingCount, value: stakingValue },
    wallet: { count: walletTokens.length, value: walletValue },
  };

  // Helper to get visible positions based on active tab
  const getVisiblePositions = (): PoolGroup[] => {
    switch (activeTab) {
      case "lp-pools":
        return categorizedPositions.lpPools;
      case "vaults":
        return categorizedPositions.vaults;
      case "farms":
        return categorizedPositions.farms;
      case "lending":
        return categorizedPositions.lending;
      case "staking":
        return categorizedPositions.staking;
      default:
        return allPositions;
    }
  };

  const visiblePositions = getVisiblePositions();

  // Create protocol distribution data - UPDATED for pie chart fix
  const protocolDistributionData = useMemo(() => {
    // Calculate wallet value
    const walletValue = walletTokens.reduce(
      (sum, token) => sum + parseFloat(token.usdValue || "0"),
      0
    );

    const protocolMap: Record<string, number> = {};

    // Add wallet as a "protocol" if there are tokens
    if (walletValue > 0) {
      protocolMap["Wallet"] = walletValue;
    }

    // Sum values by protocol
    allPositions.forEach((position) => {
      if (!protocolMap[position.protocol]) {
        protocolMap[position.protocol] = 0;
      }
      protocolMap[position.protocol] += position.totalValueUsd;
    });

    // Convert to series format
    const series: number[] = [];
    const labels: string[] = [];
    const colors: string[] = [];

    // Define protocol-specific colors
    const protocolColors: Record<string, string> = {
      Wallet: "#FF9500",
      Cetus: "#4DA2FF",
      Scallop: "#6C5CE7",
      Haedal: "#00D2D3",
      Bluefin: "#FF00FF",
      Turbos: "#1ED760",
      SuiLend: "#FF5252",
      Suistake: "#55EFC4",
      Aftermath: "#FDCB6E",
    };

    // Sort protocols by value and create data arrays
    Object.entries(protocolMap)
      .sort((a, b) => b[1] - a[1])
      .forEach(([protocol, value]) => {
        if (value > 0) {
          labels.push(protocol);
          series.push(parseFloat(value.toFixed(2)));
          colors.push(protocolColors[protocol] || "#74B9FF");
        }
      });

    // Calculate total
    const totalValue = series.reduce((sum, val) => sum + val, 0);

    // Debug logging
    console.log("[Portfolio] Protocol Distribution Data:", {
      labels,
      series,
      colors,
      totalValue,
    });

    // Ensure we have at least two data points for the chart to render properly
    if (series.length === 1) {
      // Add a tiny "Other" section just to make the chart display properly
      labels.push("Other");
      series.push(0.01);
      colors.push("#999999");
    }

    return {
      series,
      labels,
      colors,
      totalValue,
    };
  }, [allPositions, walletTokens]);

  // Create category distribution data - UPDATED for pie chart fix
  const categoryDistributionData = useMemo(() => {
    // Calculate wallet value
    const walletValue = walletTokens.reduce(
      (sum, token) => sum + parseFloat(token.usdValue || "0"),
      0
    );

    const categories = {
      Wallet: walletValue,
      "LP Pools": categorizedPositions.lpPools.reduce(
        (sum, p) => sum + p.totalValueUsd,
        0
      ),
      Vaults: categorizedPositions.vaults.reduce(
        (sum, p) => sum + p.totalValueUsd,
        0
      ),
      Farms: categorizedPositions.farms.reduce(
        (sum, p) => sum + p.totalValueUsd,
        0
      ),
      Lending: categorizedPositions.lending.reduce(
        (sum, p) => sum + p.totalValueUsd,
        0
      ),
      Staking: categorizedPositions.staking.reduce(
        (sum, p) => sum + p.totalValueUsd,
        0
      ),
    };

    // Predefined colors for categories
    const categoryColors: Record<string, string> = {
      Wallet: "#FF9500",
      "LP Pools": "#4DA2FF",
      Lending: "#FF00FF",
      Vaults: "#6C5CE7",
      Farms: "#1ED760",
      Staking: "#55EFC4",
    };

    // Convert to series format and filter out zero values
    const series: number[] = [];
    const labels: string[] = [];
    const colors: string[] = [];

    Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .forEach(([category, value]) => {
        if (value > 0) {
          labels.push(category);
          series.push(parseFloat(value.toFixed(2)));
          colors.push(categoryColors[category] || "#74B9FF");
        }
      });

    // Calculate total
    const totalValue = series.reduce((sum, val) => sum + val, 0);

    // Debug logging
    console.log("[Portfolio] Category Distribution Data:", {
      labels,
      series,
      colors,
      totalValue,
    });

    // Ensure we have at least two data points for the chart to render properly
    if (series.length === 1) {
      // Add a tiny "Other" section just to make the chart display properly
      labels.push("Other");
      series.push(0.01);
      colors.push("#999999");
    }

    return {
      series,
      labels,
      colors,
      totalValue,
    };
  }, [categorizedPositions, walletTokens]);

  // Render the Portfolio View component
  const renderPortfolioView = () => {
    if (error) {
      return (
        <div className="error-state">
          <div className="error-icon">
            <FaExclamationTriangle />
          </div>
          <h3>Error Loading Portfolio</h3>
          <p>{error}</p>
          <button className="retry-button" onClick={() => loadPositions()}>
            <FaRedo className="button-icon" /> Try Again
          </button>
        </div>
      );
    }

    if (!connected) {
      return (
        <div className="empty-state">
          <div className="empty-icon">🔐</div>
          <h3>Connect Your Wallet</h3>
          <p>Please connect your wallet to view and manage your portfolio.</p>
          <button className="action-button" onClick={() => wallet.select()}>
            <FaWallet className="button-icon" /> Connect Wallet
          </button>
        </div>
      );
    }

    if (loading && !portfolioData) {
      return (
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div className="loading-text">Loading Portfolio Data</div>
          <div className="loading-subtext">
            Fetching your positions across DeFi protocols...
          </div>
        </div>
      );
    }

    if (!portfolioData && !scallopData && walletTokens.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>No Portfolio Data</h3>
          <p>
            We couldn't find any assets or positions in your portfolio. Start by
            exploring opportunities and adding assets.
          </p>
          <Link to="/explore" className="action-button">
            <FaSearch className="button-icon" /> Explore DeFi
          </Link>
        </div>
      );
    }

    // Get the portfolio metrics for the overview card
    const portfolioMetrics = calculatePortfolioMetrics();

    return (
      <>
        {/* Portfolio Value Card */}
        <div className="dashboard-grid dashboard-grid--single">
          <PortfolioValueCard
            totalValue={portfolioData?.totalValue || 0}
            portfolioChange24h={portfolioChange24h}
            selectedTimeframe={selectedTimeframe}
            setSelectedTimeframe={setSelectedTimeframe}
            assetCount={portfolioMetrics.tokenCount}
            positionCount={portfolioMetrics.positionCount}
            highestApy={portfolioMetrics.highestApy}
          />
        </div>

        {/* Distribution Charts */}
        <div className="dashboard-grid dashboard-grid--auto">
          <DistributionChartCard
            title="Distribution by Protocol"
            icon={<FaLayerGroup className="card-icon" />}
            data={protocolDistributionData}
          />
          <DistributionChartCard
            title="Distribution by Category"
            icon={<FaChartPie className="card-icon" />}
            data={categoryDistributionData}
          />
        </div>

        {/* Position Cards */}
        {visiblePositions.length > 0 ? (
          <div className="positions-grid">
            {visiblePositions.map((position, idx) => (
              <PositionCard key={`position-${idx}`} position={position} />
            ))}
          </div>
        ) : (
          <EmptyPositions activeTab={activeTab} />
        )}

        {/* Wallet Assets Section */}
        {walletTokens && walletTokens.length > 0 && (
          <WalletAssetsSection walletTokens={walletTokens} />
        )}
      </>
    );
  };

  // Render the view based on active section
  const renderActiveView = () => {
    switch (activeView) {
      case "dashboard":
        return <MarketDashboard />;
      case "market_news":
        return <MarketNews defaultQuery="CRYPTO" />;
      case "trade_history": // Add case for trade history view
        return <TradeHistoryView />;
      case "portfolio":
      default:
        return renderPortfolioView();
    }
  };

  // Apply the style fix for the footer issue and check wallet provider status
  useEffect(() => {
    // Check SDK/wallet status every time the wallet modals are toggled
    if (activeWallet) {
      console.log("[Portfolio] Wallet modal opened, checking SDK status:", {
        walletType: activeWallet,
        phantom: !!window.phantom,
        phantomSui: !!window.phantom?.sui,
        cerebraWallet: !!window.cerebraWallet,
        cerebraShow: !!window.cerebraWallet?.show,
        container: !!document.getElementById("phantom-wallet-container"),
        origin: window.location.origin,
        protocol: window.location.protocol,
      });
    }
  }, [activeWallet]);

  // Apply the style fix for the footer issue
  return (
    <div
      className="app-layout"
      style={{ overflowX: "hidden", position: "relative" }}
    >
      {/* Sidebar Navigation with position categories */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        categoryData={categoryData}
        setActiveWallet={setActiveWallet}
      />

      {/* Main Content */}
      <div className="main-content">
        <div className="page-content">
          <div className="portfolio-page">
            {/* Colorful background glows */}
            <div className="page-glow page-glow--blue"></div>
            <div className="page-glow page-glow--green"></div>
            <div className="page-glow page-glow--magenta"></div>

            {/* Render the active view */}
            {renderActiveView()}

            {/* Development Origin Notice */}
            {window.location.protocol !== "https:" &&
              window.location.hostname !== "localhost" && (
                <div
                  style={{
                    position: "fixed",
                    bottom: "10px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    backgroundColor: "rgba(255, 69, 0, 0.9)",
                    color: "white",
                    padding: "10px 20px",
                    borderRadius: "5px",
                    zIndex: 1000,
                    fontSize: "14px",
                    maxWidth: "90%",
                    textAlign: "center",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
                  }}
                >
                  <strong>Warning:</strong> Phantom Wallet requires HTTPS or
                  localhost. Current origin: {window.location.origin}
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Wallet Modals - only one can be active at a time */}
      {activeWallet === "phantom" && (
        <PhantomWallet onClose={() => setActiveWallet(null)} />
      )}

      {activeWallet === "slush" && (
        <SlushWallet onClose={() => setActiveWallet(null)} />
      )}
    </div>
  );
}

export default Portfolio;
