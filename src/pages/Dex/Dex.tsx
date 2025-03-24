import React, { useState, useEffect } from "react";
import { useWallet } from "@suiet/wallet-kit";
import Chart from "./components/Chart";
import OrderBook from "./components/OrderBook";
import OrderForm from "./components/OrderForm";
import TradingHistory from "./components/TradingHistory";
import PairSelector from "./components/PairSelector";
import MyOrders from "./components/MyOrders";
import { birdeyeService } from "../../services/birdeyeService";
import "./Dex.scss";

// Token address mapping
export const TOKEN_ADDRESSES: Record<string, string> = {
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  BTC: "0x027792d9fed7f9844eb4839566001bb6f6cb4804f66aa2da6fe1ee242d896881::coin::COIN",
  ETH: "0xaf8cd5edc19c4512f4259f0bee101a40d41ebed738ade5874359610ef8eeced5::coin::COIN",
};

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
  baseAddress: string;
  quoteAddress: string;
}

// Initial trading pairs with USDC as quote asset
const initialPairs: TradingPair[] = [
  {
    id: "sui-usdc",
    name: "SUI/USDC",
    baseAsset: "SUI",
    quoteAsset: "USDC",
    price: 1.27,
    change24h: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    baseAddress: TOKEN_ADDRESSES.SUI,
    quoteAddress: TOKEN_ADDRESSES.USDC,
  },
  {
    id: "eth-usdc",
    name: "ETH/USDC",
    baseAsset: "ETH",
    quoteAsset: "USDC",
    price: 2142.65,
    change24h: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    baseAddress: TOKEN_ADDRESSES.ETH,
    quoteAddress: TOKEN_ADDRESSES.USDC,
  },
  {
    id: "btc-usdc",
    name: "BTC/USDC",
    baseAsset: "BTC",
    quoteAsset: "USDC",
    price: 56789.32,
    change24h: 0,
    volume24h: 0,
    high24h: 0,
    low24h: 0,
    baseAddress: TOKEN_ADDRESSES.BTC,
    quoteAddress: TOKEN_ADDRESSES.USDC,
  },
];

const Dex: React.FC = () => {
  const { connected } = useWallet();
  const [tradingPairs, setTradingPairs] = useState<TradingPair[]>(initialPairs);
  const [selectedPair, setSelectedPair] = useState<TradingPair>(
    initialPairs[0]
  );
  const [orderType, setOrderType] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<"limit" | "market">("limit");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Function to fetch token price and stats
  const fetchTokenStats = async () => {
    setIsLoading(true);

    try {
      // Get token list for stats
      const tokenListResponse = await birdeyeService.getTokenList();

      if (tokenListResponse && tokenListResponse.data) {
        // Create a map for quick lookups
        const tokenStatsMap = new Map();

        tokenListResponse.data.forEach((tokenData: any) => {
          if (tokenData.tokenAddress) {
            tokenStatsMap.set(tokenData.tokenAddress, {
              price: parseFloat(tokenData.price) || 0,
              change24h: parseFloat(tokenData.priceChange24h) || 0,
              volume24h: parseFloat(tokenData.volume24h) || 0,
              high24h: parseFloat(tokenData.high24h) || 0,
              low24h: parseFloat(tokenData.low24h) || 0,
            });
          }
        });

        // Update trading pairs with real stats
        const updatedPairs = tradingPairs.map((pair) => {
          const baseStats = tokenStatsMap.get(pair.baseAddress);

          if (baseStats) {
            return {
              ...pair,
              price: baseStats.price,
              change24h: baseStats.change24h,
              volume24h: baseStats.volume24h,
              high24h: baseStats.high24h,
              low24h: baseStats.low24h,
            };
          }

          return pair;
        });

        setTradingPairs(updatedPairs);

        // Update selected pair if it exists in the updated list
        const updatedSelectedPair = updatedPairs.find(
          (p) => p.id === selectedPair.id
        );
        if (updatedSelectedPair) {
          setSelectedPair(updatedSelectedPair);
        }
      }
    } catch (error) {
      console.error("Error fetching token stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch token stats on initial load
  useEffect(() => {
    fetchTokenStats();

    // Refresh stats every 5 minutes
    const intervalId = setInterval(fetchTokenStats, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, []);

  // Handle trading pair selection
  const handleSelectPair = (pair: TradingPair) => {
    setSelectedPair(pair);
  };

  // Handle order related events
  const handleOrderEvent = () => {
    // Refresh any relevant data after order operations
    console.log("Order event occurred");
  };

  // Trade Stats
  const tradingStats = {
    price: selectedPair.price,
    change24h: selectedPair.change24h,
    volume24h: selectedPair.volume24h,
    high24h: selectedPair.high24h,
    low24h: selectedPair.low24h,
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
              onClick={fetchTokenStats}
              disabled={isLoading}
            >
              ↻ Refresh
            </button>
            <PairSelector
              pairs={tradingPairs}
              selectedPair={selectedPair}
              onSelectPair={handleSelectPair}
            />
          </div>
        </div>

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
              ${tradingStats.high24h.toFixed(tradingStats.high24h < 1 ? 6 : 2)}
            </span>
          </div>
          <div className="stat low">
            <span className="label">24h Low:</span>
            <span className="value">
              ${tradingStats.low24h.toFixed(tradingStats.low24h < 1 ? 6 : 2)}
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
      </div>
    </div>
  );
};

export default Dex;
