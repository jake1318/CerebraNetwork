import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import Chart from "./components/Chart";
import OrderBook from "./components/OrderBook";
import OrderForm from "./components/OrderForm";
import TradingHistory from "./components/TradingHistory";
import PairSelector from "./components/PairSelector";
import "./Dex.scss";

// Trading pair interface
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
}

// Example data for the placeholder
const mockPairs: TradingPair[] = [
  {
    id: "sui-usdc",
    name: "SUI/USDC",
    baseAsset: "SUI",
    quoteAsset: "USDC",
    price: 1.27,
    change24h: 3.45,
    volume24h: 2456789,
    high24h: 1.32,
    low24h: 1.21,
  },
  {
    id: "eth-sui",
    name: "ETH/SUI",
    baseAsset: "ETH",
    quoteAsset: "SUI",
    price: 2142.65,
    change24h: -1.23,
    volume24h: 8765432,
    high24h: 2200.5,
    low24h: 2100.1,
  },
  {
    id: "btc-usdc",
    name: "BTC/USDC",
    baseAsset: "BTC",
    quoteAsset: "USDC",
    price: 56789.32,
    change24h: 2.56,
    volume24h: 12345678,
    high24h: 57500,
    low24h: 55800,
  },
];

const Dex: React.FC = () => {
  const { connected } = useWallet();
  const [selectedPair, setSelectedPair] = useState<TradingPair>(mockPairs[0]);
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");

  // Trade Stats
  const tradingStats = {
    price: selectedPair.price,
    change24h: selectedPair.change24h,
    volume24h: selectedPair.volume24h,
    high24h: selectedPair.high24h,
    low24h: selectedPair.low24h,
  };

  // Handle trading pair selection
  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
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
          <PairSelector
            pairs={mockPairs}
            selectedPair={selectedPair}
            onSelectPair={handleSelectPair}
          />
        </div>

        <div className="dex-page__trading-stats">
          <div className="stat price">
            <span className="label">Price:</span>
            <span
              className={`value ${
                tradingStats.change24h >= 0 ? "positive" : "negative"
              }`}
            >
              $
              {tradingStats.price.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
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
              {tradingStats.change24h}%
            </span>
          </div>
          <div className="stat volume">
            <span className="label">24h Volume:</span>
            <span className="value">
              ${(tradingStats.volume24h / 1000000).toFixed(2)}M
            </span>
          </div>
          <div className="stat high">
            <span className="label">24h High:</span>
            <span className="value">
              $
              {tradingStats.high24h.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="stat low">
            <span className="label">24h Low:</span>
            <span className="value">
              $
              {tradingStats.low24h.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        {/* New layout structure */}
        <div className="dex-page__trading-interface">
          {/* Top row - Chart and Order Form side by side */}
          <div className="trading-layout__top-row">
            {/* Chart container */}
            <div className="chart-container">
              <Chart pair={selectedPair} />
            </div>

            {/* Order form container */}
            <div className="order-form-container">
              {connected ? (
                <OrderForm
                  pair={selectedPair}
                  orderType={orderType}
                  setOrderType={setOrderType}
                  orderMode={orderMode}
                  setOrderMode={setOrderMode}
                />
              ) : (
                <div className="connect-prompt">
                  <h2>Connect Wallet</h2>
                  <p>Please connect your wallet to start trading</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom row - Market Depth and Recent Trades side by side */}
          <div className="trading-layout__bottom-row">
            {/* Market depth (OrderBook) container */}
            <div className="orderbook-container">
              <OrderBook pair={selectedPair} />
            </div>

            {/* Recent trades container */}
            <div className="history-container">
              <TradingHistory pair={selectedPair} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dex;
