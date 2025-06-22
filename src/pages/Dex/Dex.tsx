// src/pages/Dex/Dex.tsx
import React, { useState, useEffect, useRef } from "react";
import { useWallet } from "@suiet/wallet-kit";

import Chart from "./components/Chart";
import OrderForm from "./components/OrderForm";
import TradingHistory from "./components/TradingHistory";
import PairSelector from "./components/PairSelector";
import LimitOrderManager from "./components/LimitOrderManager";

import { blockvisionService } from "../../services/blockvisionService";
import { birdeyeService } from "../../services/birdeyeService";

import "./Dex.scss";

// --- Improved rate limits for Birdeye API ---
const BIRDEYE_REQUESTS_PER_SECOND = 45; // Using 45 out of 50 to leave some safety margin
const BATCH_SIZE = 15; // We can process bigger batches now
const DELAY_BETWEEN_REQUESTS = Math.floor(1000 / BIRDEYE_REQUESTS_PER_SECOND); // ~22ms between requests

// --- Token addresses for building your pairs list ---
const BASE_TOKEN_ADDRESSES = [
  "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  "0x2::sui::SUI",
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC",
  "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
  "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA",
  "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
  "0x3a5143bb1196e3bcdfab6203d1683ae29edd26294fc8bfeafe4aaa9d2704df37::coin::COIN",
  "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  "0x8993129d72e733985f7f1a00396cbd055bad6f817fee36576ce483c8bbb8b87b::sudeng::SUDENG",
  "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
  "0xb45fcfcc2cc07ce0702cc2d229621e046c906ef14d9b25e8e4d25f6e8763fef7::send::SEND",
  "0xe1b45a0e641b9955a20aa0ad1c1f4ad86aad8afb07296d4085e349a50e90bdca::blue::BLUE",
  "0xf22da9a24ad027cccb5f2d496cbe91de953d363513db08a3a734d361c7c17503::LOFI::LOFI",
  "0x3332b178c1513f32bca9cf711b0318c2bca4cb06f1a74211bac97a1eeb7f7259::LWA::LWA",
  "0xfe3afec26c59e874f3c1d60b8203cb3852d2bb2aa415df9548b8d688e6683f93::alpha::ALPHA",
  "0xfa7ac3951fdca92c5200d468d31a365eb03b2be9936fde615e69f0c1274ad3a0::BLUB::BLUB",
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
}

interface TokenMarketData {
  volume24h: number;
  high24h: number;
  low24h: number;
}

const Dex: React.FC = () => {
  const { connected } = useWallet();
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // For tracking progress during data fetch
  const [loadingProgress, setLoadingProgress] = useState(0);

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
        };
      },
      {
        name: "Unknown",
        symbol: coinType.split("::").pop() || "???",
        decimals: 0,
        logo: "",
        price: 0,
        change24h: 0,
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
        } as TradingPair;
      });

      setTradingPairs(pairs);
      if (pairs.length) setSelectedPair(pairs[0]);
    } catch (e: any) {
      console.error("loadPairs error:", e);
      setError(e.message || "Failed to load pairs");
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  // Auto‑refresh price & change
  const refreshSelectedPair = async (pair: TradingPair) => {
    try {
      // Use rate-limited version to avoid hitting limits during auto-refresh
      const bvData = await fetchBlockvisionData(pair.baseAddress);

      // Also refresh the volume and high/low data
      const beData = await fetchBirdeyeData(pair.baseAddress);

      setTradingPairs((prev) =>
        prev.map((p) =>
          p.baseAddress === pair.baseAddress
            ? {
                ...p,
                price: bvData.price,
                change24h: bvData.change24h,
                volume24h: beData.volume24h,
                high24h: beData.high24h || bvData.price,
                low24h: beData.low24h || bvData.price * 0.95,
              }
            : p
        )
      );

      setSelectedPair((curr) =>
        curr?.baseAddress === pair.baseAddress
          ? {
              ...curr,
              price: bvData.price,
              change24h: bvData.change24h,
              volume24h: beData.volume24h,
              high24h: beData.high24h || bvData.price,
              low24h: beData.low24h || bvData.price * 0.95,
            }
          : curr
      );
    } catch (e) {
      console.error("Refresh error:", e);
    }
  };

  const startRefreshInterval = (pair: TradingPair) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(
      () => refreshSelectedPair(pair),
      120_000
    );
  };

  // 👉 useEffect calls must not return a Promise! 👈
  useEffect(() => {
    loadPairs();
  }, []);

  useEffect(() => {
    if (selectedPair) {
      startRefreshInterval(selectedPair);
      // cleanup on unmount or when selectedPair changes
      return () => {
        if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
      };
    }
  }, [selectedPair]);

  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  const stats = selectedPair
    ? {
        price: selectedPair.price,
        change24h: selectedPair.change24h,
        volume24h: selectedPair.volume24h,
        high24h: selectedPair.high24h,
        low24h: selectedPair.low24h,
        logo: selectedPair.logo,
      }
    : {
        price: 0,
        change24h: 0,
        volume24h: 0,
        high24h: 0,
        low24h: 0,
        logo: "",
      };

  // Format volume for display - improved
  const formatVolume = (volume: number) => {
    if (!volume || volume === 0) return "$0";

    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(2)}M`;
    }

    if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(2)}K`;
    }

    return `$${volume.toFixed(2)}`;
  };

  return (
    <div className="dex-page">
      <div className="glow-1" />
      <div className="glow-2" />
      <div className="vertical-scan" />

      <div className="dex-page__container">
        {/* Header */}
        <div className="dex-page__header">
          <h1>DEX Trading</h1>
          <div className="header-actions">
            {isLoading && (
              <span className="loading-indicator">
                {loadingProgress > 0
                  ? `Loading... ${loadingProgress}%`
                  : "Updating…"}
              </span>
            )}
            <button onClick={loadPairs} disabled={isLoading}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {error && <div className="dex-error">{error}</div>}

        {selectedPair && (
          <div className="dex-page__grid">
            {/* Top Stats */}
            <div className="top-stats">
              <div className="stats-grid two-line-stats">
                <div className="ticker-cell">
                  <span className="ticker-text">{selectedPair.baseAsset}</span>
                  {stats.logo && (
                    <img
                      src={stats.logo}
                      alt={`${selectedPair.baseAsset} logo`}
                      className="token-logo"
                    />
                  )}
                </div>
                <span className="cell label">Price</span>
                <span className="cell label">24h Change</span>
                <span className="cell label">24h Volume</span>
                <span className="cell label">24h High</span>
                <span className="cell label">24h Low</span>

                <span
                  className={`cell value ${
                    stats.change24h >= 0 ? "positive" : "negative"
                  }`}
                >
                  ${stats.price.toFixed(stats.price < 1 ? 6 : 4)}
                </span>
                <span
                  className={`cell value ${
                    stats.change24h >= 0 ? "positive" : "negative"
                  }`}
                >
                  {stats.change24h >= 0 ? "+" : ""}
                  {stats.change24h.toFixed(2)}%
                </span>
                <span className="cell value">
                  {formatVolume(stats.volume24h)}
                </span>
                <span className="cell value">
                  ${stats.high24h.toFixed(stats.high24h < 1 ? 6 : 4)}
                </span>
                <span className="cell value">
                  ${stats.low24h.toFixed(stats.low24h < 1 ? 6 : 4)}
                </span>
              </div>
            </div>

            {/* Recent Trades */}
            <div className="trading-history-container">
              <TradingHistory pair={selectedPair} />
            </div>

            {/* Chart */}
            <div className="chart-panel">
              <Chart pair={selectedPair} />
            </div>

            {/* Pair Selector */}
            <div className="pair-selector-container">
              <PairSelector
                pairs={tradingPairs}
                selectedPair={selectedPair}
                onSelectPair={handleSelectPair}
              />
            </div>

            {/* Order Form */}
            <div className="order-form-container">
              <OrderForm
                pair={selectedPair}
                orderType={orderType}
                setOrderType={setOrderType}
                orderMode={orderMode}
                setOrderMode={setOrderMode}
              />
            </div>

            {/* Open/Closed Orders */}
            <div className="my-orders-container">
              <LimitOrderManager
                selectedPair={`${selectedPair.baseAddress}-${selectedPair.quoteAddress}`}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dex;
