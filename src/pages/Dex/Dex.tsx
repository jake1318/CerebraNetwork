// src/pages/Dex/Dex.tsx
// Last Updated: 2025-06-26 06:18:23 UTC by jake1318

import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@suiet/wallet-kit";

import Chart from "./components/Chart";
import OrderForm from "./components/OrderForm";
import TradingHistory from "./components/TradingHistory";
import PairSelector from "./components/PairSelector";
import MyOrders from "./components/MyOrders";

import {
  blockvisionService,
  getCoinMarketDataPro,
  getCoinOhlcv,
  CoinMarketData,
} from "../../services/blockvisionService";
import { birdeyeService } from "../../services/birdeyeService";

import "./Dex.scss";

// --- Improved rate limits for Birdeye API ---
const BIRDEYE_REQUESTS_PER_SECOND = 45; // Using 45 out of 50 to leave some safety margin
const BATCH_SIZE = 15; // We can process bigger batches now
const DELAY_BETWEEN_REQUESTS = Math.floor(1000 / BIRDEYE_REQUESTS_PER_SECOND); // ~22ms between requests

// --- Token addresses for building your pairs list ---
const BASE_TOKEN_ADDRESSES = [
  "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  "0x3e8e9423d80e1774a7ca128fccd8bf5f1f7753be658c5e645929037f7c819040::lbtc::LBTC",
  "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA",
  "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC",
  "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
  "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
  "0x3a5143bb1196e3bcdfab6203d1683ae29edd26294fc8bfeafe4aaa9d2704df37::coin::COIN",
  "0x8993129d72e733985f7f1a00396cbd055bad6f817fee36576ce483c8bbb8b87b::sudeng::SUDENG",
  "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
  "0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND",
  "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE",
  "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI",
  "0x3332b178c1513f32bca9cf711b0318c2bca4cb06f1a74211bac97a1eeb7f7259::LWA::LWA",
  "0xfe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA",
  "0xfa7ac3951fdca92c5200d468d31a365eb03b2be9936fde615e69f0c1274ad3a0::BLUB::BLUB",
  "0x4c981f3ff786cdb9e514da897ab8a953647dae2ace9679e8358eec1e3e8871ac::dmc::DMC",
];

const USDC_ADDRESS =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

interface TradingPair {
  id: string;
  name: string;
  baseAsset: string;
  quoteAsset: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  baseAddress: string;
  quoteAddress: string;
  logo?: string;
  marketCap?: number; // Added marketCap field
}

interface TokenMarketData {
  volume24h: number;
  high24h: number;
  low24h: number;
}

const Dex: React.FC = () => {
  const { connected, account } = useWallet();
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [showPairSelector, setShowPairSelector] = useState(false);

  // State for market data from BlockVision API
  const [marketData, setMarketData] = useState<CoinMarketData | null>(null);
  const [marketDataLoading, setMarketDataLoading] = useState<boolean>(false);
  const [marketDataError, setMarketDataError] = useState<string | null>(null);

  // For tracking progress during data fetch
  const [loadingProgress, setLoadingProgress] = useState(0);

  // State to trigger refreshing orders
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0);

  // Add a lastFetchTimestamp for rate limiting
  const lastFetchTimestampRef = useRef<Record<string, number>>({});

  // Sleep utility for rate limiting
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // Rate limited API call helper
  async function rateLimitedCall<T>(
    apiCall: () => Promise<T>,
    errorValue: T,
    retryCount = 3,
    initialDelay = 500
  ): Promise<T> {
    let lastError;
    for (let attempt = 0; attempt < retryCount; attempt++) {
      try {
        // Wait longer on each retry attempt
        if (attempt > 0) {
          await sleep(initialDelay * Math.pow(2, attempt)); // Exponential backoff
        }
        return await apiCall();
      } catch (err: any) {
        lastError = err;
        const status = err?.response?.status;

        // For rate limiting errors (429), wait longer
        if (status === 429) {
          console.log(
            `Rate limit hit (attempt ${attempt + 1}), waiting before retry...`
          );
          await sleep(2000 * (attempt + 1)); // Wait longer for rate limit errors
        } else {
          // For other errors, shorter wait
          await sleep(500);
        }
      }
    }

    console.error("API call failed after retries:", lastError);
    return errorValue;
  }

  // Strictly rate limited fetch for BlockVision data
  const fetchBlockvisionData = async (coinType: string) => {
    return rateLimitedCall(
      async () => {
        const resp = await blockvisionService.getCoinDetail(coinType);
        const d = resp.data;
        return {
          name: d.name || "Unknown",
          symbol: d.symbol || "???",
          decimals: d.decimals || 0,
          logo: d.logo || "",
          price: d.price ? parseFloat(String(d.price)) : 0,
          change24h: d.priceChangePercentage24H
            ? parseFloat(String(d.priceChangePercentage24H))
            : 0,
          marketCap: d.marketCap ? parseFloat(String(d.marketCap)) : 0,
        };
      },
      {
        name: "Unknown",
        symbol: coinType.split("::").pop() || "???",
        decimals: 0,
        logo: "",
        price: 0,
        change24h: 0,
        marketCap: 0,
      }
    );
  };

  // Get 24h high/low from historical chart data
  const fetchHighLowFromChartData = async (
    address: string
  ): Promise<{ high24h: number; low24h: number }> => {
    return rateLimitedCall(
      async () => {
        try {
          // Get historical data for the past 24 hours
          const chartData = await birdeyeService.getLineChartData(
            address,
            "1d"
          );

          if (chartData && chartData.length > 1) {
            // Extract price values
            const prices = chartData.map((point) => Number(point.value));

            // Calculate high/low
            const high24h = Math.max(...prices);
            const low24h = Math.min(...prices);

            console.log(
              `Calculated high/low for ${address} from ${chartData.length} data points: High=${high24h}, Low=${low24h}`
            );
            return { high24h, low24h };
          } else {
            console.warn(`Not enough chart data points for ${address}`);
            return { high24h: 0, low24h: 0 };
          }
        } catch (err) {
          console.error(
            `Error fetching chart data for high/low for ${address}:`,
            err
          );
          return { high24h: 0, low24h: 0 };
        }
      },
      { high24h: 0, low24h: 0 }
    );
  };

  // Strictly rate limited fetch for Birdeye data
  const fetchBirdeyeData = async (
    address: string
  ): Promise<TokenMarketData> => {
    return rateLimitedCall(
      async () => {
        try {
          // First try to get volume data
          const volumeData = await birdeyeService.getPriceVolumeSingle(
            address,
            "24h"
          );

          // Then get high/low from chart data
          const { high24h, low24h } = await fetchHighLowFromChartData(address);

          // Extract volume information
          let volume24h = 0;
          if (volumeData) {
            if (typeof volumeData === "object" && volumeData !== null) {
              if (
                volumeData.volumeUSD !== undefined &&
                volumeData.volumeUSD !== null
              ) {
                volume24h = Number(volumeData.volumeUSD);
              } else if (
                volumeData.volume24hUSD !== undefined &&
                volumeData.volume24hUSD !== null
              ) {
                volume24h = Number(volumeData.volume24hUSD);
              } else if (
                volumeData.v24hUSD !== undefined &&
                volumeData.v24hUSD !== null
              ) {
                volume24h = Number(volumeData.v24hUSD);
              } else if (
                volumeData.data?.volumeUSD !== undefined &&
                volumeData.data.volumeUSD !== null
              ) {
                volume24h = Number(volumeData.data.volumeUSD);
              } else if (
                volumeData.data?.volume24hUSD !== undefined &&
                volumeData.data.volume24hUSD !== null
              ) {
                volume24h = Number(volumeData.data.volume24hUSD);
              } else if (
                volumeData.data?.volume !== undefined &&
                volumeData.data.volume !== null
              ) {
                volume24h = Number(volumeData.data.volume);
              }
            }
          }

          return {
            volume24h,
            high24h,
            low24h,
          };
        } catch (err) {
          console.error(`Error fetching Birdeye data for ${address}:`, err);
          return { volume24h: 0, high24h: 0, low24h: 0 };
        }
      },
      { volume24h: 0, high24h: 0, low24h: 0 }
    );
  };

  // Fetch Birdeye data with optimized rate limiting for higher capacity
  const fetchBirdeyeDataInSequence = async (
    addresses: string[]
  ): Promise<Map<string, TokenMarketData>> => {
    const results = new Map<string, TokenMarketData>();

    // Process tokens in batches with the new higher rate limits
    for (let i = 0; i < addresses.length; i += BATCH_SIZE) {
      const batch = addresses.slice(
        i,
        Math.min(i + BATCH_SIZE, addresses.length)
      );

      // Update loading progress
      setLoadingProgress(
        Math.min(99, Math.floor(((i + batch.length) / addresses.length) * 100))
      );

      // Process batch in parallel with the higher limit
      const batchPromises = batch.map(async (addr, index) => {
        // Add small delay between requests in the batch to distribute them
        if (index > 0) {
          await sleep(DELAY_BETWEEN_REQUESTS);
        }

        const data = await fetchBirdeyeData(addr);
        results.set(addr, data);
      });

      // Wait for all requests in batch to complete
      await Promise.all(batchPromises);

      // Small wait between batches just to be safe
      if (i + BATCH_SIZE < addresses.length) {
        await sleep(100);
      }
    }

    return results;
  };

  // Function to fetch market data from BlockVision with rate limiting
  const fetchMarketData = async (baseAddress: string) => {
    if (!baseAddress) return;

    // Check if we've fetched this data recently (within the last 10 seconds)
    const now = Date.now();
    const lastFetch = lastFetchTimestampRef.current[baseAddress] || 0;
    const timeSinceLastFetch = now - lastFetch;

    // Only fetch if it's been more than 10 seconds since the last fetch for this address
    if (timeSinceLastFetch < 10000) {
      console.log(
        `Skipping BlockVision API call for ${baseAddress} - last call was ${Math.floor(
          timeSinceLastFetch / 1000
        )}s ago`
      );
      return;
    }

    setMarketDataLoading(true);
    setMarketDataError(null);

    try {
      // Get detailed market data from BlockVision
      const data = await getCoinMarketDataPro(baseAddress);

      // Update last fetch timestamp
      lastFetchTimestampRef.current[baseAddress] = now;

      console.log("BlockVision market data:", data);
      setMarketData(data);

      // Also update the selected pair with this new data if needed
      if (selectedPair && selectedPair.baseAddress === baseAddress) {
        setSelectedPair((prevPair) => {
          if (!prevPair) return null;
          return {
            ...prevPair,
            price: parseFloat(data.priceInUsd),
            change24h: parseFloat(data.market.hour24.priceChange),
            volume24h: data.volume24H,
            marketCap: parseFloat(data.marketCap || "0"),
            high24h:
              parseFloat(data.market.hour24.highPrice || "0") ||
              prevPair.high24h,
            low24h:
              parseFloat(data.market.hour24.lowPrice || "0") || prevPair.low24h,
          };
        });
      }
    } catch (error) {
      console.error("Error fetching market data:", error);
      setMarketDataError("Failed to load market data");
    } finally {
      setMarketDataLoading(false);
    }
  };

  // Build trading pairs
  const loadPairs = async () => {
    setIsLoading(true);
    setError(null);
    setLoadingProgress(0);

    try {
      // Fetch BlockVision data (we can do this in parallel since it's a different API)
      const bvPromise = Promise.all(
        BASE_TOKEN_ADDRESSES.map(fetchBlockvisionData)
      );

      // Fetch Birdeye data
      const bePromise = fetchBirdeyeDataInSequence(BASE_TOKEN_ADDRESSES);

      // Wait for both data fetches to complete
      const [bvList, beMap] = await Promise.all([bvPromise, bePromise]);

      const pairs = BASE_TOKEN_ADDRESSES.map((addr, idx) => {
        const bv = bvList[idx];
        const be = beMap.get(addr) || { volume24h: 0, high24h: 0, low24h: 0 };

        const sym =
          bv.symbol === "???"
            ? addr.split("::").pop() || addr.slice(0, 8)
            : bv.symbol;
        return {
          id: `${sym.toLowerCase()}-usdc`,
          name: `${sym}/USDC`,
          baseAsset: sym,
          quoteAsset: "USDC",
          price: bv.price,
          change24h: bv.change24h,
          volume24h: be.volume24h,
          high24h: be.high24h || bv.price, // Use price as fallback if high24h is 0
          low24h: be.low24h || bv.price * 0.95, // Use 95% of price as fallback if low24h is 0
          baseAddress: addr,
          quoteAddress: USDC_ADDRESS,
          logo: bv.logo,
          marketCap: bv.marketCap || 0, // Added market cap
        } as TradingPair;
      });

      setTradingPairs(pairs);
      if (pairs.length) {
        setSelectedPair(pairs[0]);
        // Also fetch market data for the first pair
        fetchMarketData(pairs[0].baseAddress);
      }
    } catch (e: any) {
      console.error("loadPairs error:", e);
      setError(e.message || "Failed to load pairs");
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  // Auto‑refresh price & change - update to respect the rate limiting
  const refreshSelectedPair = async (pair: TradingPair) => {
    if (!pair?.baseAddress) return;

    try {
      // Use BlockVision API for market data with rate limiting
      fetchMarketData(pair.baseAddress);
    } catch (e) {
      console.error("Refresh error:", e);
    }
  };

  const startRefreshInterval = (pair: TradingPair) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(
      () => refreshSelectedPair(pair),
      20000 // Update every 20 seconds
    );
  };

  // Handle order placement success - refresh orders
  const handleOrderSuccess = () => {
    // Trigger a refresh of orders by incrementing the counter
    setOrdersRefreshTrigger((prev) => prev + 1);
  };

  // Format large numbers for display
  const formatNumber = (num: number) => {
    if (!num || isNaN(num)) return "$0";

    if (num >= 1_000_000_000) {
      return `$${(num / 1_000_000_000).toFixed(2)}B`;
    }

    if (num >= 1_000_000) {
      return `$${(num / 1_000_000).toFixed(2)}M`;
    }

    if (num >= 1_000) {
      return `$${(num / 1_000).toFixed(2)}K`;
    }

    return `$${num.toFixed(2)}`;
  };

  // useEffect calls must not return a Promise!
  useEffect(() => {
    loadPairs();
  }, []);

  // Modified useEffect to respect rate limiting
  useEffect(() => {
    if (selectedPair) {
      // Immediately fetch market data when pair changes, but only if we haven't fetched recently
      fetchMarketData(selectedPair.baseAddress);

      // Start the refresh interval
      startRefreshInterval(selectedPair);

      // cleanup on unmount or when selectedPair changes
      return () => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      };
    }
  }, [selectedPair]);

  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
    setShowPairSelector(false);
  };

  // Use market data when available, fall back to selectedPair
  const stats =
    marketDataLoading || marketDataError || !marketData
      ? {
          price: selectedPair?.price || 0,
          change24h: selectedPair?.change24h || 0,
          volume24h: selectedPair?.volume24h || 0,
          high24h: selectedPair?.high24h || 0,
          low24h: selectedPair?.low24h || 0,
          logo: selectedPair?.logo || "",
          marketCap: selectedPair?.marketCap || 0,
        }
      : {
          price: parseFloat(marketData.priceInUsd),
          change24h: parseFloat(marketData.market.hour24.priceChange),
          volume24h: marketData.volume24H,
          high24h:
            parseFloat(marketData.market.hour24.highPrice || "0") ||
            selectedPair?.high24h ||
            0,
          low24h:
            parseFloat(marketData.market.hour24.lowPrice || "0") ||
            selectedPair?.low24h ||
            0,
          logo: selectedPair?.logo || "",
          marketCap: parseFloat(marketData.marketCap || "0"),
        };

  return (
    <div className="dex-container">
      <div className="dex-content">
        {/* Top section with chart and pair selector */}
        <div className="top-section">
          {/* Main chart area */}
          <div className="dex-main-chart">
            <div className="pair-header">
              {selectedPair && (
                <>
                  {/* Left side: Pair info */}
                  <div className="header-left">
                    <span className="pair-name">
                      {selectedPair.baseAsset}/USDC
                    </span>
                    <span className="pair-price">
                      ${stats.price.toFixed(stats.price < 1 ? 6 : 4)}
                    </span>
                    <span
                      className={`pair-change ${
                        stats.change24h >= 0 ? "positive" : "negative"
                      }`}
                    >
                      {stats.change24h >= 0 ? "+" : ""}
                      {stats.change24h.toFixed(2)}%
                    </span>

                    {/* Stats directly in the header */}
                    <div className="header-stats">
                      <div className="stat-item">
                        <span className="stat-label">24h High</span>
                        <span className="stat-value">
                          ${stats.high24h.toFixed(stats.high24h < 1 ? 6 : 4)}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">24h Low</span>
                        <span className="stat-value">
                          ${stats.low24h.toFixed(stats.low24h < 1 ? 6 : 4)}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">24h Volume</span>
                        <span className="stat-value">
                          {formatNumber(stats.volume24h)}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Market Cap</span>
                        <span className="stat-value">
                          {formatNumber(stats.marketCap)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Price Chart label */}
                  <div className="header-right">
                    <span className="chart-label">Price Chart</span>
                  </div>
                </>
              )}
            </div>

            {/* Mobile stats row - only displayed on smaller screens */}
            {selectedPair && (
              <div className="mobile-stats-row">
                <div className="stat-item">
                  <span className="stat-label">24h High</span>
                  <span className="stat-value">
                    ${stats.high24h.toFixed(stats.high24h < 1 ? 6 : 4)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">24h Low</span>
                  <span className="stat-value">
                    ${stats.low24h.toFixed(stats.low24h < 1 ? 6 : 4)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">24h Volume</span>
                  <span className="stat-value">
                    {formatNumber(stats.volume24h)}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Market Cap</span>
                  <span className="stat-value">
                    {formatNumber(stats.marketCap)}
                  </span>
                </div>
              </div>
            )}

            <div className="chart-container">
              {selectedPair && (
                <Chart pair={selectedPair} enhancedData={stats} />
              )}
            </div>
          </div>

          {/* Pair selector panel */}
          <div className="pair-selector-panel">
            <div className="panel-header">
              <div className="panel-title">Select Pair</div>
              <button
                className="refresh-btn"
                onClick={loadPairs}
                disabled={isLoading}
              >
                {isLoading ? `${loadingProgress}%` : "↻"}
              </button>
            </div>
            <div className="panel-content">
              <PairSelector
                pairs={tradingPairs}
                selectedPair={selectedPair}
                onSelectPair={handleSelectPair}
              />
            </div>
          </div>
        </div>

        {/* Bottom section with order form, orders, and recent trades */}
        <div className="bottom-section">
          {/* Order form panel */}
          <div className="order-form-panel">
            <div className="panel-header">
              <div className="tab-buttons">
                <button
                  className={`tab-btn ${orderMode === "limit" ? "active" : ""}`}
                  onClick={() => setOrderMode("limit")}
                >
                  Limit
                </button>
                <button
                  className={`tab-btn ${
                    orderMode === "market" ? "active" : ""
                  }`}
                  onClick={() => setOrderMode("market")}
                >
                  Market
                </button>
              </div>
            </div>
            <div className="panel-content">
              {selectedPair && (
                <OrderForm
                  pair={selectedPair}
                  orderType={orderType}
                  setOrderType={setOrderType}
                  orderMode={orderMode}
                  setOrderMode={setOrderMode}
                  onOrderSuccess={handleOrderSuccess}
                />
              )}
            </div>
          </div>

          {/* Order manager panel */}
          <div className="orders-panel">
            <div className="panel-content">
              <MyOrders
                onOrderCancel={() =>
                  setOrdersRefreshTrigger((prev) => prev + 1)
                }
                onOrderClaim={() => setOrdersRefreshTrigger((prev) => prev + 1)}
                key={`orders-${ordersRefreshTrigger}`}
              />
            </div>
          </div>

          {/* Recent trades panel */}
          <div className="recent-trades-panel">
            <div className="panel-header">
              <div className="panel-title">Recent Trades</div>
            </div>
            <div className="panel-content">
              {selectedPair && <TradingHistory pair={selectedPair} />}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  );
};

export default Dex;
