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

const Dex: React.FC = () => {
  const { connected } = useWallet();

  // State
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- 1) Fetch metadata & price from BlockVision ---
  const fetchBlockvisionData = async (coinType: string) => {
    try {
      const resp = await blockvisionService.getCoinDetail(coinType);
      if (resp?.data) {
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
      }
    } catch (err) {
      console.error("Blockvision error:", err);
    }
    return {
      name: "Unknown",
      symbol: "???",
      decimals: 0,
      logo: "",
      price: 0,
      change24h: 0,
    };
  };

  // --- 2) Fetch 24h volume/high/low from Birdeye in small batches ---
  const fetchBirdeyeDataInBatches = async (addresses: string[]) => {
    const results = new Map<
      string,
      { volume24h: number; high24h: number; low24h: number }
    >();
    const batchSize = 3;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const slice = addresses.slice(i, i + batchSize);
      await Promise.all(
        slice.map(async (addr) => {
          try {
            const resp = await birdeyeService.getPriceVolumeSingle(addr, "24h");
            if (resp?.data) {
              results.set(addr, {
                volume24h: resp.data.volumeUSD || 0,
                high24h: resp.data.high24h || 0,
                low24h: resp.data.low24h || 0,
              });
            } else {
              results.set(addr, { volume24h: 0, high24h: 0, low24h: 0 });
            }
          } catch (e) {
            console.error("Birdeye error:", e);
            results.set(addr, { volume24h: 0, high24h: 0, low24h: 0 });
          }
        })
      );
      // slight pause to respect rate limits
      await new Promise((r) => setTimeout(r, 250));
    }
    return results;
  };

  // --- 3) Build and load your trading pairs list on mount ---
  const loadPairs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const bvList = await Promise.all(
        BASE_TOKEN_ADDRESSES.map(fetchBlockvisionData)
      );
      const beMap = await fetchBirdeyeDataInBatches(BASE_TOKEN_ADDRESSES);

      const pairs: TradingPair[] = BASE_TOKEN_ADDRESSES.map((addr, idx) => {
        const bv = bvList[idx];
        const be = beMap.get(addr) || { volume24h: 0, high24h: 0, low24h: 0 };
        const baseSymbol =
          bv.symbol === "???" ? `token-${addr.slice(0, 8)}` : bv.symbol;
        return {
          id: `${baseSymbol}-usdc`.toLowerCase(),
          name: `${baseSymbol}/USDC`,
          baseAsset: baseSymbol,
          quoteAsset: "USDC",
          price: bv.price,
          change24h: bv.change24h,
          volume24h: be.volume24h,
          high24h: be.high24h,
          low24h: be.low24h,
          baseAddress: addr,
          quoteAddress: USDC_ADDRESS,
          logo: bv.logo,
        };
      });

      setTradingPairs(pairs);
      if (pairs.length > 0) setSelectedPair(pairs[0]);
    } catch (err: any) {
      console.error("loadPairs error:", err);
      setError(err.message || "Error loading trading pairs.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- 4) Auto‑refresh price & change for the selected pair every minute ---
  const refreshSelectedPair = async (pair: TradingPair) => {
    try {
      const resp = await blockvisionService.getCoinDetail(pair.baseAddress);
      if (resp?.data) {
        const d = resp.data;
        const newPrice = d.price ? parseFloat(String(d.price)) : 0;
        const newChange = d.priceChangePercentage24H
          ? parseFloat(String(d.priceChangePercentage24H))
          : 0;

        setTradingPairs((prev) =>
          prev.map((p) =>
            p.baseAddress === pair.baseAddress
              ? { ...p, price: newPrice, change24h: newChange }
              : p
          )
        );
        setSelectedPair((prev) =>
          prev && prev.baseAddress === pair.baseAddress
            ? { ...prev, price: newPrice, change24h: newChange }
            : prev
        );
      }
    } catch (e) {
      console.error("Error refreshing selected pair", e);
    }
  };

  const startRefreshInterval = (pair: TradingPair) => {
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(
      () => refreshSelectedPair(pair),
      60_000
    );
  };

  // --- Effects ---
  useEffect(() => {
    loadPairs();
  }, []);

  useEffect(() => {
    if (selectedPair) startRefreshInterval(selectedPair);
  }, [selectedPair]);

  // --- Handlers ---
  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  // --- Prepare the stats for rendering ---
  const stats = selectedPair
    ? {
        price: selectedPair.price,
        change24h: selectedPair.change24h,
        volume24h: selectedPair.volume24h,
        high24h: selectedPair.high24h,
        low24h: selectedPair.low24h,
        logo: selectedPair.logo,
      }
    : { price: 0, change24h: 0, volume24h: 0, high24h: 0, low24h: 0, logo: "" };

  return (
    <div className="dex-page">
      <div className="glow-1" />
      <div className="glow-2" />
      <div className="vertical-scan" />

      <div className="dex-page__container">
        {/* Header */}
        <div className="dex-page__header">
          <h1>Advanced Trading</h1>
          <div className="header-actions">
            {isLoading && (
              <span className="loading-indicator">Updating data…</span>
            )}
            <button onClick={loadPairs} disabled={isLoading}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="dex-error">
            <p>{error}</p>
          </div>
        )}

        {/* Grid Layout */}
        {selectedPair && (
          <div className="dex-page__grid">
            {/* Top Stats (full width) */}
            <div className="top-stats">
              <div className="stats-grid two-line-stats">
                <div className="ticker-cell">
                  <span className="ticker-text">{selectedPair.baseAsset}</span>
                  {stats.logo && (
                    <img src={stats.logo} alt="" className="token-logo" />
                  )}
                </div>

                {/* Labels */}
                <span className="cell label">Price</span>
                <span className="cell label">24h Change</span>
                <span className="cell label">24h Volume</span>
                <span className="cell label">24h High</span>
                <span className="cell label">24h Low</span>

                {/* Values */}
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
                  ${stats.volume24h.toLocaleString()}
                </span>
                <span className="cell value">
                  ${stats.high24h.toFixed(stats.high24h < 1 ? 6 : 4)}
                </span>
                <span className="cell value">
                  ${stats.low24h.toFixed(stats.low24h < 1 ? 6 : 4)}
                </span>
              </div>
            </div>

            {/* Left: Recent Trades */}
            <div className="trading-history-container">
              <TradingHistory pair={selectedPair} />
            </div>

            {/* Center: Chart */}
            <div className="chart-panel">
              <div className="chart-wrapper">
                <Chart pair={selectedPair} />
              </div>
            </div>

            {/* Right: Pair Selector */}
            <div className="pair-selector-container">
              <PairSelector
                pairs={tradingPairs}
                selectedPair={selectedPair}
                onSelectPair={handleSelectPair}
              />
            </div>

            {/* Bottom under Chart: Order Form */}
            <div className="order-form-container">
              <OrderForm
                pair={selectedPair}
                orderType={orderType}
                setOrderType={setOrderType}
                orderMode={orderMode}
                setOrderMode={setOrderMode}
              />
            </div>

            {/* Bottom under Selector: Open/Closed Orders */}
            <div className="my-orders-container">
              <LimitOrderManager
                selectedPair={
                  selectedPair
                    ? `${selectedPair.baseAddress}-${selectedPair.quoteAddress}`
                    : undefined
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dex;
