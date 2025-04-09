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

// Updated token list
const BASE_TOKEN_ADDRESSES = [
  // CETUS
  "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS",
  // SUI
  "0x2::sui::SUI",
  // DEEP
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
  // ETH
  "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  // WBTC
  "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC",
  // NAVX
  "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX",
  // SCA
  "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA",
  // WSOL
  "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN",
  // APT
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
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchBlockvisionData = async (coinType: string) => {
    try {
      const resp = await blockvisionService.getCoinDetail(coinType);
      if (resp && resp.data) {
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

  // fetch Birdeye data in small batches
  const fetchBirdeyeDataInBatches = async (addresses: string[]) => {
    const results = new Map<
      string,
      { volume24h: number; high24h: number; low24h: number }
    >();
    const batchSize = 3;

    for (let i = 0; i < addresses.length; i += batchSize) {
      const slice = addresses.slice(i, i + batchSize);
      const slicePromises = slice.map(async (addr) => {
        try {
          const resp = await birdeyeService.getPriceVolumeSingle(addr, "24h");
          if (resp && resp.data) {
            results.set(addr, {
              volume24h: resp.data.volumeUSD || 0,
              high24h: resp.data.high24h || 0,
              low24h: resp.data.low24h || 0,
            });
          } else {
            results.set(addr, { volume24h: 0, high24h: 0, low24h: 0 });
          }
        } catch (err) {
          console.error("Birdeye error:", err);
          results.set(addr, { volume24h: 0, high24h: 0, low24h: 0 });
        }
      });
      await Promise.all(slicePromises);
      // short delay before next batch
      await new Promise((res) => setTimeout(res, 250));
    }
    return results;
  };

  const loadPairs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1) blockvision data in parallel
      const bvPromises = BASE_TOKEN_ADDRESSES.map(fetchBlockvisionData);
      const bvList = await Promise.all(bvPromises);

      // 2) birdeye data in small batches
      const beMap = await fetchBirdeyeDataInBatches(BASE_TOKEN_ADDRESSES);

      // combine
      const pairs: TradingPair[] = BASE_TOKEN_ADDRESSES.map((addr, idx) => {
        const bv = bvList[idx];
        const be = beMap.get(addr) || { volume24h: 0, high24h: 0, low24h: 0 };
        const shortAddr = addr.slice(0, 8);
        const baseSymbol =
          bv.symbol === "???" ? `token-${shortAddr}` : bv.symbol;
        const id = `${baseSymbol}-usdc`.toLowerCase();
        return {
          id,
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
      if (pairs.length > 0) {
        setSelectedPair(pairs[0]);
      }
    } catch (err: any) {
      console.error("loadPairs error:", err);
      setError(err.message || "Error loading trading pairs.");
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSelectedPair = async (pair: TradingPair) => {
    try {
      const resp = await blockvisionService.getCoinDetail(pair.baseAddress);
      if (resp && resp.data) {
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
        setSelectedPair((prev) => {
          if (!prev) return null;
          if (prev.baseAddress === pair.baseAddress) {
            return { ...prev, price: newPrice, change24h: newChange };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error("Error refreshing selected pair", err);
    }
  };

  const startRefreshInterval = (pair: TradingPair) => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }
    const timer = setInterval(() => {
      refreshSelectedPair(pair);
    }, 60000);
    refreshTimerRef.current = timer;
  };

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    loadPairs();
  }, []);

  useEffect(() => {
    if (selectedPair) {
      startRefreshInterval(selectedPair);
    }
  }, [selectedPair]);

  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  const tradingStats = selectedPair
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

  return (
    <div className="dex-page">
      {/* Glow effects */}
      <div className="glow-1"></div>
      <div className="glow-2"></div>
      {/* Vertical scan */}
      <div className="vertical-scan"></div>

      <div className="dex-page__container">
        <div className="dex-page__header">
          <h1>Advanced Trading</h1>
          <div className="header-actions">
            {isLoading && (
              <div className="loading-indicator">Updating market data...</div>
            )}
            <button onClick={loadPairs} disabled={isLoading}>
              ↻ Refresh
            </button>
            {selectedPair && (
              <PairSelector
                pairs={tradingPairs}
                selectedPair={selectedPair}
                onSelectPair={handleSelectPair}
              />
            )}
          </div>
        </div>

        {error && (
          <div className="dex-error">
            <p>{error}</p>
          </div>
        )}

        {selectedPair && (
          <>
            <div className="dex-page__trading-stats">
              <div className="stat price">
                {tradingStats.logo && (
                  <img
                    src={tradingStats.logo}
                    alt={selectedPair.baseAsset}
                    style={{ width: 24, height: 24, marginRight: 6 }}
                  />
                )}
                <span className="label">Price:</span>
                <span
                  className={`value ${
                    tradingStats.change24h >= 0 ? "positive" : "negative"
                  }`}
                >
                  ${tradingStats.price.toFixed(tradingStats.price < 1 ? 6 : 2)}
                </span>
              </div>
              <div className="stat change">
                <span className="label">24h Change:</span>
                <span
                  className={`value ${
                    tradingStats.change24h >= 0 ? "positive" : "negative"
                  }`}
                >
                  {tradingStats.change24h >= 0 ? "+" : ""}
                  {tradingStats.change24h.toFixed(2)}%
                </span>
              </div>
              <div className="stat volume">
                <span className="label">24h Volume:</span>
                <span className="value">
                  $
                  {tradingStats.volume24h.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
              <div className="stat high">
                <span className="label">24h High:</span>
                <span className="value">
                  $
                  {tradingStats.high24h.toFixed(
                    tradingStats.high24h < 1 ? 6 : 2
                  )}
                </span>
              </div>
              <div className="stat low">
                <span className="label">24h Low:</span>
                <span className="value">
                  $
                  {tradingStats.low24h.toFixed(tradingStats.low24h < 1 ? 6 : 2)}
                </span>
              </div>
            </div>

            <div className="dex-page__content">
              <div className="chart-order-section">
                <div className="chart-wrapper">
                  <Chart pair={selectedPair} />
                </div>

                <div className="order-form-container">
                  <OrderForm
                    pair={selectedPair}
                    orderType={orderType}
                    setOrderType={setOrderType}
                    orderMode={orderMode}
                    setOrderMode={setOrderMode}
                  />
                </div>
              </div>

              <div className="trading-history-section">
                <div className="trading-history-container">
                  <TradingHistory pair={selectedPair} />
                </div>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Dex;
