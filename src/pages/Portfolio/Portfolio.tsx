// src/pages/Portfolio/Portfolio.tsx
// Last Updated: 2025-07-08 02:20:40 UTC by jake1318

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
import * as birdeyeService from "../../services/birdeyeService";

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
      // Special case for haSUI - use local logo
      if (
        symbol.toLowerCase() === "hasui" ||
        (address && address.toLowerCase().includes("hasui"))
      ) {
        setLogoUrl("/haSui.webp");
        logoCache[id] = "/haSui.webp";
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
    <div className="wallet-assets-section">
      <div className="section-header">
        <h3>Wallet Assets</h3>
        <div className="total-value">Total: ${totalValue.toFixed(2)}</div>
      </div>

      <div className="wallet-assets-grid">
        {(showAll ? sortedTokens : sortedTokens.slice(0, 8)).map(
          (token, idx) => (
            <div className="wallet-asset-card" key={`wallet-token-${idx}`}>
              <div className="asset-header">
                <TokenIcon
                  symbol={token.symbol}
                  address={token.coinType}
                  size="md"
                />
                <span className="asset-symbol">{token.symbol}</span>
              </div>
              <div className="asset-details">
                <div className="asset-balance">
                  {formatTokenBalance(token.balance, token.decimals)}
                </div>
                <div className="asset-value">
                  ${parseFloat(token.usdValue || "0").toFixed(2)}
                </div>
              </div>
            </div>
          )
        )}
      </div>

      {sortedTokens.length > 8 && (
        <div className="view-all-container">
          <button className="view-all-btn" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show Less" : `View All Assets (${sortedTokens.length})`}
          </button>
        </div>
      )}
    </div>
  );
}

// Portfolio Charts Row component
function PortfolioChartsRow({
  portfolioHistory,
  portfolioChange24h,
  allPositions,
  categorizedPositions,
  walletTokens,
  selectedTimeframe,
  setSelectedTimeframe,
}: {
  portfolioHistory: { dates: string[]; values: number[] };
  portfolioChange24h: { value: number; percent: number };
  allPositions: PoolGroup[];
  categorizedPositions: {
    lpPools: PoolGroup[];
    vaults: PoolGroup[];
    farms: PoolGroup[];
    lending: PoolGroup[];
    staking: PoolGroup[];
  };
  walletTokens: any[];
  selectedTimeframe: "7d" | "30d" | "1yr";
  setSelectedTimeframe: React.Dispatch<
    React.SetStateAction<"7d" | "30d" | "1yr">
  >;
}) {
  // Calculate total wallet value
  const walletValue = useMemo(
    () =>
      walletTokens.reduce(
        (sum, token) => sum + parseFloat(token.usdValue || "0"),
        0
      ),
    [walletTokens]
  );

  // Create distribution data by protocol
  const protocolData = useMemo(() => {
    const protocolMap: Record<string, number> = {};

    // Add wallet as a "protocol"
    if (walletValue > 0) {
      protocolMap["Wallet"] = walletValue;
    }

    let totalValue = walletValue;

    // Group by protocol and sum values
    allPositions.forEach((position) => {
      if (!protocolMap[position.protocol]) {
        protocolMap[position.protocol] = 0;
      }
      protocolMap[position.protocol] += position.totalValueUsd;
      totalValue += position.totalValueUsd;
    });

    // Convert to series format
    const series: number[] = [];
    const labels: string[] = [];
    const colors: string[] = [];

    // Define default colors
    const defaultColors = [
      "#ff9500", // Wallet
      "#00c2ff", // Cetus
      "#6c5ce7", // Scallop
      "#00d2d3", // Haedal
      "#e84393", // Bluefin
      "#00b894", // Turbos
      "#ff5252", // SuiLend
      "#55efc4", // Suistake
      "#fdcb6e", // Aftermath
      "#74b9ff", // Other
    ];

    Object.entries(protocolMap)
      .sort((a, b) => b[1] - a[1]) // Sort by value descending
      .forEach(([protocol, value], index) => {
        labels.push(protocol);
        series.push(parseFloat(value.toFixed(2)));

        // Assign specific colors to common protocols
        let color;
        switch (protocol.toLowerCase()) {
          case "wallet":
            color = "#ff9500";
            break;
          case "cetus":
            color = "#00c2ff";
            break;
          case "scallop":
            color = "#6c5ce7";
            break;
          case "haedal":
            color = "#00d2d3";
            break;
          case "bluefin":
            color = "#e84393";
            break;
          case "turbos":
            color = "#00b894";
            break;
          case "suilend":
            color = "#ff5252";
            break;
          case "suistake":
            color = "#55efc4";
            break;
          default:
            color = defaultColors[index % defaultColors.length];
        }
        colors.push(color);
      });

    return { series, labels, colors, totalValue };
  }, [allPositions, walletValue]);

  // Create distribution data by category
  const categoryData = useMemo(() => {
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

    const totalValue = Object.values(categories).reduce(
      (sum, value) => sum + value,
      0
    );

    // Convert to series format and sort by value
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);

    const series: number[] = [];
    const labels: string[] = [];
    const colors: string[] = [
      "#ff9500", // Wallet
      "#00c2ff", // LP Pools
      "#ff9900", // Lending
      "#6c5ce7", // Vaults
      "#00d2d3", // Farms
      "#e84393", // Staking
    ];

    // Predefined colors for categories
    const categoryColors: Record<string, string> = {
      Wallet: "#ff9500",
      "LP Pools": "#00c2ff",
      Lending: "#ff9900",
      Vaults: "#6c5ce7",
      Farms: "#00d2d3",
      Staking: "#e84393",
    };

    // Create arrays for series, labels, and colors
    const categoryOrder: string[] = [];
    entries.forEach(([category, value]) => {
      if (value > 0) {
        labels.push(category);
        series.push(parseFloat(value.toFixed(2)));
        categoryOrder.push(category);
      }
    });

    // Create colors array that follows the same order as labels
    const orderedColors = labels.map(
      (label) => categoryColors[label] || "#74b9ff"
    );

    return { series, labels, colors: orderedColors, totalValue };
  }, [categorizedPositions, walletValue]);

  // Protocol chart options - removed dollar amount from tooltip
  const protocolOptions = useMemo(
    () => ({
      chart: {
        type: "donut",
        background: "transparent",
        height: 180,
      },
      dataLabels: {
        enabled: false,
      },
      tooltip: {
        y: {
          formatter: (value: number) => {
            return `${((value / protocolData.totalValue) * 100).toFixed(1)}%`;
          },
        },
        theme: "dark",
      },
      legend: {
        show: false,
      },
      labels: protocolData.labels,
      colors: protocolData.colors,
      plotOptions: {
        pie: {
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
                show: false,
              },
            },
          },
        },
      },
    }),
    [protocolData]
  );

  // Category chart options - removed dollar amount from tooltip
  const categoryOptions = useMemo(
    () => ({
      chart: {
        type: "donut",
        background: "transparent",
        height: 180,
      },
      dataLabels: {
        enabled: false,
      },
      tooltip: {
        y: {
          formatter: (value: number) => {
            return `${((value / categoryData.totalValue) * 100).toFixed(1)}%`;
          },
        },
        theme: "dark",
      },
      legend: {
        show: false,
      },
      labels: categoryData.labels,
      colors: categoryData.colors,
      plotOptions: {
        pie: {
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
                show: false,
              },
            },
          },
        },
      },
    }),
    [categoryData]
  );

  // Get the latest portfolio value
  const currentValue = protocolData.totalValue.toFixed(2);

  return (
    <div className="portfolio-charts-row">
      {/* First box: Portfolio Value - Removed chart, showing just the total value */}
      <div className="chart-box portfolio-value-chart">
        <div className="chart-header">
          <div>
            <h3>Portfolio Value</h3>
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
          <div className="timeframe-selector-container">
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

        {/* Display total value instead of chart */}
        <div className="portfolio-value-display">
          <div className="total-value-label">Total Value</div>
          <div className="total-value-amount">${currentValue}</div>
        </div>
      </div>

      {/* Second box: By Protocol chart */}
      <div className="chart-box protocol-chart">
        <div className="chart-container">
          <div className="chart-header">
            <h3>By Protocol</h3>
          </div>
          <div className="chart-content-with-legend">
            <div className="chart-donut">
              <ReactApexChart
                options={protocolOptions}
                series={protocolData.series}
                type="donut"
                height={180}
              />
            </div>
            <div className="chart-legend-vertical">
              {protocolData.labels.map((label, index) => (
                <div className="legend-item" key={`protocol-legend-${index}`}>
                  <div
                    className="legend-color"
                    style={{
                      backgroundColor: protocolData.colors[index] || "#00c2ff",
                    }}
                  ></div>
                  <div className="legend-label">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Third box: By Category chart */}
      <div className="chart-box category-chart">
        <div className="chart-container">
          <div className="chart-header">
            <h3>By Category</h3>
          </div>
          <div className="chart-content-with-legend">
            <div className="chart-donut">
              <ReactApexChart
                options={categoryOptions}
                series={categoryData.series}
                type="donut"
                height={180}
              />
            </div>
            <div className="chart-legend-vertical">
              {categoryData.labels.map((label, index) => (
                <div className="legend-item" key={`category-legend-${index}`}>
                  <div
                    className="legend-color"
                    style={{
                      backgroundColor: categoryData.colors[index] || "#00c2ff",
                    }}
                  ></div>
                  <div className="legend-label">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Interface for portfolio history data point
interface PortfolioDataPoint {
  date: string;
  value: number;
}

// Position card component for displaying individual position data
function PositionCard({ position }: { position: PoolGroup }) {
  return (
    <div className="position-card">
      <div className="position-card-header">
        <div className="protocol-badge">
          <ProtocolBadge
            protocol={position.protocol}
            protocolClass={position.protocol
              .toLowerCase()
              .replace(/[-\s]/g, "")}
            isVault={position.positions[0]?.positionType === "cetus-vault"}
          />
        </div>
        <div className="position-pair">
          <PoolPair
            tokenASymbol={position.tokenASymbol}
            tokenBSymbol={position.tokenBSymbol}
            tokenAAddress={position.tokenA}
            tokenBAddress={position.tokenB}
          />
        </div>
      </div>
      <div className="position-card-stats">
        <div className="stat">
          <span className="stat-label">Value</span>
          <span className="stat-value">
            ${position.totalValueUsd.toFixed(2)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">APR</span>
          <span className="stat-value">{position.apr.toFixed(2)}%</span>
        </div>
      </div>
    </div>
  );
}

// Function to fetch historical portfolio data
async function fetchPortfolioHistory(
  address: string,
  timeframe: "7d" | "30d" | "1yr" = "30d"
): Promise<{ dates: string[]; values: number[] }> {
  try {
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

    const historyData = await birdeyeService.getLineChartData(
      suiToken,
      interval
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
  const [selectedTimeframe, setSelectedTimeframe] = useState<
    "7d" | "30d" | "1yr"
  >("30d");

  // Active tab state for position sections
  const [activeTab, setActiveTab] = useState<string>("all");

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

        const history = await fetchPortfolioHistory(
          account.address,
          selectedTimeframe
        );

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

        // Debug: Check for Cetus positions
        console.log("Checking for Cetus positions:");
        positions.forEach((position) => {
          if (position.protocol === "Cetus") {
            console.log(
              `  Found Cetus position: ${position.poolName}, Type: ${position.positions[0]?.positionType}, Value: $${position.totalValueUsd}`
            );
          }
        });

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

        // Calculate wallet value
        const walletValue = walletTokens.reduce(
          (sum, token) => sum + parseFloat(token.usdValue || "0"),
          0
        );

        // Generate portfolio data
        const portfolioTotalValue = positionValue + scallopValue + walletValue;
        setPortfolioData({
          positions,
          positionValue,
          scallopValue,
          walletValue,
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
  }, [connected, account, scallopData, walletTokens, loadPortfolioHistory]);

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

  // Calculate category counts
  const lpPoolsCount = categorizedPositions.lpPools.length;
  const vaultsCount = categorizedPositions.vaults.length;
  const farmsCount = categorizedPositions.farms.length;
  const lendingCount = categorizedPositions.lending.length;
  const stakingCount = categorizedPositions.staking.length;
  const totalCount = allPositions.length;

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

  return (
    <div className="portfolio-page">
      <div className="content-container">
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
        ) : !portfolioData && !scallopData && walletTokens.length === 0 ? (
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

              {/* Charts Row - All Three Charts */}
              {(portfolioHistory.dates.length > 0 ||
                allPositions.length > 0 ||
                walletTokens.length > 0) && (
                <PortfolioChartsRow
                  portfolioHistory={portfolioHistory}
                  portfolioChange24h={portfolioChange24h}
                  allPositions={allPositions}
                  categorizedPositions={categorizedPositions}
                  walletTokens={walletTokens}
                  selectedTimeframe={selectedTimeframe}
                  setSelectedTimeframe={setSelectedTimeframe}
                />
              )}
            </div>

            {/* Position Sections Tabs */}
            <div className="positions-section">
              <div className="section-tabs">
                <button
                  className={`section-tab ${
                    activeTab === "all" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("all")}
                >
                  All <span className="tab-count">{totalCount}</span>
                </button>

                <button
                  className={`section-tab ${
                    activeTab === "lp-pools" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("lp-pools")}
                >
                  LP Pools <span className="tab-count">{lpPoolsCount}</span>
                </button>

                <button
                  className={`section-tab ${
                    activeTab === "vaults" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("vaults")}
                >
                  Vaults <span className="tab-count">{vaultsCount}</span>
                </button>

                <button
                  className={`section-tab ${
                    activeTab === "farms" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("farms")}
                >
                  Farms <span className="tab-count">{farmsCount}</span>
                </button>

                <button
                  className={`section-tab ${
                    activeTab === "lending" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("lending")}
                >
                  Lending <span className="tab-count">{lendingCount}</span>
                </button>

                <button
                  className={`section-tab ${
                    activeTab === "staking" ? "active" : ""
                  }`}
                  onClick={() => setActiveTab("staking")}
                >
                  Staking <span className="tab-count">{stakingCount}</span>
                </button>
              </div>

              {visiblePositions.length > 0 ? (
                <div className="positions-grid">
                  {visiblePositions.map((position, idx) => (
                    <PositionCard key={`position-${idx}`} position={position} />
                  ))}
                </div>
              ) : (
                <div className="empty-positions">
                  <p>
                    {activeTab === "all"
                      ? "No positions found. Start by adding liquidity to a pool."
                      : `No ${activeTab.replace("-", " ")} positions found.`}
                  </p>
                  <Link to="/pools" className="btn btn--primary">
                    Explore Pools
                  </Link>
                </div>
              )}
            </div>

            {/* Wallet Assets Section - Now moved to the bottom */}
            {walletTokens && walletTokens.length > 0 && (
              <WalletAssetsSection walletTokens={walletTokens} />
            )}
          </>
        )}
      </div>
      <style jsx>{`
        .portfolio-page {
          color: #fff;
          padding: 20px 0;
        }

        .portfolio-header {
          margin-bottom: 24px;
        }

        .portfolio-header h2 {
          font-size: 24px;
          margin-bottom: 16px;
        }

        /* Portfolio Charts Row Styles */
        .portfolio-charts-row {
          display: flex;
          gap: 16px;
          margin-bottom: 24px;
        }

        .chart-box {
          flex: 1;
          min-width: 0;
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 16px;
          display: flex;
          flex-direction: column;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .chart-header h3 {
          font-size: 16px;
          font-weight: 500;
          margin: 0;
        }

        /* Portfolio value display styles */
        .portfolio-value-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 180px;
        }

        .total-value-label {
          font-size: 16px;
          color: #a0a7b8;
          margin-bottom: 10px;
        }

        .total-value-amount {
          font-size: 32px;
          font-weight: 600;
          color: #00c2ff;
        }

        .timeframe-selector-container {
          display: flex;
          align-items: center;
        }

        .chart-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chart-content-with-legend {
          display: flex;
          align-items: center;
        }

        .chart-donut {
          flex: 1;
          min-width: 0;
        }

        .chart-legend-vertical {
          width: 100px;
          padding-left: 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: -20px; /* Move up a bit to align with the chart */
        }

        .chart-container {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .chart-total-value {
          font-size: 14px;
          font-weight: 600;
          color: #00c2ff;
        }

        .chart-legend {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px;
          margin-top: 8px;
        }

        .legend-item {
          display: flex;
          align-items: center;
          font-size: 12px;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          margin-right: 4px;
        }

        .legend-more {
          font-size: 12px;
          color: #a0a7b8;
        }

        .value-change {
          display: flex;
          align-items: center;
          font-size: 14px;
          margin-top: 4px;
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
          min-width: 32px;
        }

        .timeframe-selector button.active {
          background: rgba(0, 194, 255, 0.2);
          color: #00c2ff;
        }

        /* Wallet Assets Section */
        .wallet-assets-section {
          margin-top: 32px;
          margin-bottom: 24px;
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          padding: 20px;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .section-header h3 {
          font-size: 18px;
          font-weight: 500;
          margin: 0;
        }

        .total-value {
          font-size: 16px;
          font-weight: 600;
          color: #00c2ff;
        }

        .wallet-assets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        .wallet-asset-card {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 10px;
          padding: 12px;
          transition: all 0.2s;
        }

        .wallet-asset-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 10px rgba(0, 0, 0, 0.1);
        }

        .asset-header {
          display: flex;
          align-items: center;
          margin-bottom: 8px;
        }

        .asset-symbol {
          margin-left: 8px;
          font-weight: 500;
          font-size: 16px;
        }

        .asset-details {
          margin-top: 8px;
        }

        .asset-balance {
          font-weight: 500;
          font-size: 15px;
          margin-bottom: 4px;
        }

        .asset-value {
          color: #a0a7b8;
          font-size: 14px;
        }

        .view-all-container {
          margin-top: 16px;
          text-align: center;
        }

        .view-all-btn {
          background: none;
          border: none;
          color: #00c2ff;
          cursor: pointer;
          font-size: 14px;
          padding: 8px 16px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }

        .view-all-btn:hover {
          background-color: rgba(0, 194, 255, 0.1);
        }

        /* Section Tabs */
        .section-tabs {
          display: flex;
          overflow-x: auto;
          margin-bottom: 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .section-tab {
          background: none;
          border: none;
          padding: 12px 16px;
          color: #a0a7b8;
          font-size: 15px;
          cursor: pointer;
          border-bottom: 2px solid transparent;
          transition: all 0.2s;
          white-space: nowrap;
          position: relative;
        }

        .section-tab:hover {
          color: #d0d7e8;
        }

        .section-tab.active {
          color: #00c2ff;
          border-bottom: 2px solid #00c2ff;
        }

        .tab-count {
          font-size: 12px;
          background: rgba(0, 194, 255, 0.1);
          padding: 2px 6px;
          border-radius: 10px;
          margin-left: 6px;
        }

        .positions-section {
          margin-bottom: 24px;
        }

        .positions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }

        .position-card {
          background: rgba(20, 30, 48, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          overflow: hidden;
          transition: all 0.2s;
        }

        .position-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2);
          border: 1px solid rgba(0, 194, 255, 0.2);
        }

        .position-card-header {
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .position-card-stats {
          padding: 16px;
          display: flex;
          justify-content: space-between;
        }

        .stat {
          display: flex;
          flex-direction: column;
        }

        .stat-label {
          font-size: 13px;
          color: #a0a7b8;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 16px;
          font-weight: 500;
        }

        .protocol-badge {
          display: flex;
          align-items: center;
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

        /* Responsive design */
        @media (max-width: 1200px) {
          .portfolio-charts-row {
            flex-wrap: wrap;
          }

          .chart-box {
            min-width: calc(50% - 8px);
            flex: 1 1 calc(50% - 8px);
          }

          .portfolio-value-chart {
            flex-basis: 100%;
            margin-bottom: 16px;
          }

          .chart-content-with-legend {
            flex-direction: column;
          }

          .chart-legend-vertical {
            width: 100%;
            flex-direction: row;
            flex-wrap: wrap;
            justify-content: center;
            margin-top: 8px;
            padding-left: 0;
          }
        }

        @media (max-width: 768px) {
          .portfolio-charts-row {
            flex-direction: column;
          }

          .chart-box {
            width: 100%;
            margin-bottom: 16px;
          }

          .positions-grid,
          .wallet-assets-grid {
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          }

          .section-tabs {
            flex-wrap: nowrap;
            overflow-x: auto;
            padding-bottom: 5px;
          }

          .section-tab {
            padding: 8px 12px;
            font-size: 14px;
          }

          .chart-legend-vertical .legend-item {
            margin-bottom: 4px;
          }

          .timeframe-selector button {
            padding: 4px 6px;
            font-size: 11px;
            min-width: 28px;
          }
        }

        @media (max-width: 480px) {
          .wallet-assets-grid {
            grid-template-columns: 1fr;
          }

          .timeframe-selector button {
            padding: 3px 5px;
            font-size: 10px;
            min-width: 26px;
          }
        }
      `}</style>
    </div>
  );
}

export default Portfolio;
