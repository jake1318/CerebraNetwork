import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import Chart from "./components/Chart";
import OrderBook from "./components/OrderBook";
import OrderForm from "./components/OrderForm";
import TradingHistory from "./components/TradingHistory";
import PairSelector from "./components/PairSelector";
import MyOrders from "./components/MyOrders";
import { blockvisionService } from "../../services/blockvisionService";
import { birdeyeService } from "../../services/birdeyeService";
import "./Dex.scss";

/**
 * List of custom tokens to trade against USDC.
 * Each entry is the coinType on Sui.
 */
const BASE_TOKEN_ADDRESSES = [
  "0x06864a6f921804860930db6ddbe2e16acdf8504495ea7481637a1c8b9a8fe54b::cetus::CETUS", // CETUS
  "0x2::sui::SUI", // SUI
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP", // DEEP
  "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH", // ETH
  "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC", // WBTC
  "0xa99b8952d4f7d947ea77fe0ecdcc9e5fc0bcab2841d6e2a5aa00c3044e5544b5::navx::NAVX", // NAVX
  "0x7016aae72cfc67f2fadf55769c0a7dd54291a583b63051a5ed71081cce836ac6::sca::SCA", // SCA
  "0xb7844e289a8410e50fb3ca48d69eb9cf29e27d223ef90353fe1bd8e27ff8f3f8::coin::COIN", // WSOL
  "0xb848cce11ef3a8f62eccea6eb5b35a12c4c2b1ee1af7755d02d7bd6218e8226f::coin::COIN", // WBNB
  "0x3a5143bb1196e3bcdfab6203d1683ae29edd26294fc8bfeafe4aaa9d2704df37::coin::COIN", // APT
];

/** USDC token address on Sui (quote token). Replace if needed. */
const USDC_ADDRESS =
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";

interface TradingPair {
  id: string; // e.g. "CETUS-USDC"
  name: string; // e.g. "CETUS/USDC"
  baseAsset: string; // e.g. "CETUS"
  quoteAsset: string; // e.g. "USDC"
  price: number; // current price in USDC
  change24h: number; // 24h price change %
  volume24h: number; // 24h volume in USD
  high24h: number; // 24h high (if available)
  low24h: number; // 24h low (if available)
  baseAddress: string; // coinType of the base token
  quoteAddress: string; // coinType of the quote token (USDC)
}

const Dex: React.FC = () => {
  const { connected } = useWallet();
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>([]);
  const [selectedPair, setSelectedPair] = useState<TradingPair | null>(null);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetch metadata from Blockvision for a single token address.
   * Adjust if you want to use axios or any other approach
   * (this example uses blockvisionService as given).
   */
  const fetchBlockvisionMeta = async (coinType: string) => {
    try {
      const resp = await blockvisionService.getCoinDetail(coinType);
      // Typically returns { name, symbol, decimals, logo, ... }
      if (resp && resp.data) {
        return {
          name: resp.data.name || "Unknown",
          symbol: resp.data.symbol || "???",
          decimals: resp.data.decimals || 0,
        };
      }
    } catch (err) {
      console.error(`Blockvision meta error for ${coinType}:`, err);
    }
    return { name: "Unknown", symbol: "???", decimals: 0 };
  };

  /**
   * Fetch price & volume from Birdeye's "Price Volume Single" endpoint
   * or use a multi request. For now let's do single calls in a loop.
   */
  const fetchBirdeyePriceVolume = async (coinType: string) => {
    try {
      // This endpoint: GET /defi/price_volume/single?address=<addr>&type=24h
      // Implemented in birdeyeService as needed. If you have a helper, call it here.
      const response = await birdeyeService.getPriceVolumeSingle(
        coinType,
        "24h"
      );
      if (response && response.data) {
        return {
          price: response.data.price || 0,
          priceChangePercent: response.data.priceChangePercent || 0,
          volumeUSD: response.data.volumeUSD || 0,
          // high24h, low24h not always provided in /price_volume/single
          // so you may parse them from a different endpoint if needed
          high24h: response.data.high24h || 0,
          low24h: response.data.low24h || 0,
        };
      }
    } catch (err) {
      console.error(`Birdeye price-volume error for ${coinType}:`, err);
    }
    return {
      price: 0,
      priceChangePercent: 0,
      volumeUSD: 0,
      high24h: 0,
      low24h: 0,
    };
  };

  /**
   * Load all token metadata + price/volume data, build TradingPair array.
   */
  const loadPairs = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1) Fetch blockvision metadata in parallel
      const metaPromises = BASE_TOKEN_ADDRESSES.map((addr) =>
        fetchBlockvisionMeta(addr)
      );
      const metaList = await Promise.all(metaPromises);

      // 2) Fetch birdeye price/volume in parallel
      const priceVolumePromises = BASE_TOKEN_ADDRESSES.map((addr) =>
        fetchBirdeyePriceVolume(addr)
      );
      const priceVolumeList = await Promise.all(priceVolumePromises);

      // 3) Combine to form TradingPair objects
      const builtPairs = BASE_TOKEN_ADDRESSES.map((addr, idx) => {
        const meta = metaList[idx];
        const pv = priceVolumeList[idx];

        // For an ID, use something like "CETUS-USDC" or fallback
        const id = `${meta.symbol || "Token"}-USDC`.toLowerCase();

        return {
          id,
          name: `${meta.symbol}/USDC`,
          baseAsset: meta.symbol,
          quoteAsset: "USDC",
          price: pv.price,
          change24h: pv.priceChangePercent,
          volume24h: pv.volumeUSD,
          high24h: pv.high24h,
          low24h: pv.low24h,
          baseAddress: addr,
          quoteAddress: USDC_ADDRESS,
        };
      });

      setTradingPairs(builtPairs);
      // Select the first pair by default (CETUS/USDC in this example)
      if (builtPairs.length > 0) {
        setSelectedPair(builtPairs[0]);
      }
    } catch (err: any) {
      console.error("Failed to load pairs:", err);
      setError(err.message || "Error loading trading pairs.");
    } finally {
      setIsLoading(false);
    }
  };

  // On component mount, load the token data
  useEffect(() => {
    loadPairs();
  }, []);

  // If you want to refresh stats (price, volume) periodically,
  // you could create a separate function or reuse loadPairs,
  // but be mindful not to re-fetch metadata every time.
  // For simplicity, skip or do partial refresh.

  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  const handleOrderEvent = () => {
    console.log("Order event occurred");
    // If you want to refresh data after placing an order, you can do so here
  };

  // For current stats of the selected pair
  const tradingStats = selectedPair
    ? {
        price: selectedPair.price,
        change24h: selectedPair.change24h,
        volume24h: selectedPair.volume24h,
        high24h: selectedPair.high24h,
        low24h: selectedPair.low24h,
      }
    : {
        price: 0,
        change24h: 0,
        volume24h: 0,
        high24h: 0,
        low24h: 0,
      };

  return (
    <div className="dex-page">
      {/* Add glow effects */}
      <div className="glow-1"></div>
      <div className="glow-2"></div>

      {/* Add vertical scan line */}
      <div className="vertical-scan"></div>

      <div className="dex-page__container">
        <div className="dex-page__header">
          <h1>Advanced Trading</h1>
          <div className="header-actions">
            {isLoading && (
              <div className="loading-indicator">Updating market data...</div>
            )}
            <button
              className="refresh-button"
              onClick={() => loadPairs()}
              disabled={isLoading}
            >
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
                <div className="chart-container">
                  <Chart pair={selectedPair} />
                </div>
                <div className="orderbook-container">
                  <OrderBook pair={selectedPair} />
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
                  <MyOrders
                    onOrderCancel={handleOrderEvent}
                    onOrderClaim={handleOrderEvent}
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
