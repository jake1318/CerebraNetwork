// src/pages/Dex/components/TradingHistory.tsx
// Last Updated: 2025-06-26 07:16:05 UTC by jake1318

import React, { useState, useEffect, useRef } from "react";
import "./TradingHistory.scss";

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

interface TradeData {
  type: "buy" | "sell";
  txDigest: string;
  eventSeq?: number; // Added eventSeq which exists in the API response
  timestamp: number;
  sender?: string; // Added sender which exists in the API response
  dex?: string; // Added dex which exists in the API response
  coinChanges: {
    amount: string;
    coinType: string;
    balance: string;
    logo: string;
    symbol: string;
    decimals: number;
  }[];
  price: string;
  usdValue: string;
}

interface ApiResponse {
  code: number;
  message: string;
  result: {
    data: TradeData[];
    nextPageCursor: string;
  };
}

interface TradingHistoryProps {
  pair: TradingPair;
}

const TradingHistory: React.FC<TradingHistoryProps> = ({ pair }) => {
  const [trades, setTrades] = useState<TradeData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastFetchedPairRef = useRef<string | null>(null);

  // Fetch real data from BlockVision API
  const fetchTrades = async (coinType: string) => {
    try {
      // Encode the coinType for the URL
      const encodedCoinType = encodeURIComponent(coinType);

      const options = {
        method: "GET",
        headers: {
          accept: "application/json",
          "x-api-key": "2ugIlviim3ywrgFI0BMniB9wdzU",
        },
      };

      const response = await fetch(
        `https://api.blockvision.org/v2/sui/coin/trades?coinType=${encodedCoinType}&type=buy,sell&limit=20`,
        options
      );

      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}: ${response.statusText}`
        );
      }

      const data: ApiResponse = await response.json();

      if (data.code === 200 && data.result && data.result.data) {
        // Only update the trades if this is still the current pair
        if (coinType === pair.baseAddress) {
          setTrades(data.result.data);
          setError(null);
        }
      } else {
        throw new Error(`API returned error: ${data.message}`);
      }
    } catch (err: any) {
      console.error("Error fetching trade data:", err);
      setError(err.message || "Failed to load trade data");
      // Don't clear existing trades on error - keep showing what we have
    } finally {
      // If this is initial loading, mark it as complete
      if (initialLoading) {
        setInitialLoading(false);
      }
    }
  };

  // Set up auto-refresh and initial fetch
  useEffect(() => {
    if (!pair || !pair.baseAddress) return;

    // Check if this is a new pair
    const isNewPair = lastFetchedPairRef.current !== pair.baseAddress;

    if (isNewPair) {
      // For a new pair, set initial loading to true
      setInitialLoading(true);
      // Update the ref to track current pair
      lastFetchedPairRef.current = pair.baseAddress;
    }

    // Fetch immediately
    fetchTrades(pair.baseAddress);

    // Set up auto-refresh interval
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    refreshTimerRef.current = setInterval(() => {
      fetchTrades(pair.baseAddress);
    }, 15000); // Refresh every 15 seconds

    // Clean up on unmount or when pair changes
    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [pair]);

  // Format timestamp
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Format price to have appropriate decimal places
  const formatPrice = (priceStr: string) => {
    const price = parseFloat(priceStr);
    return price < 1 ? price.toFixed(6) : price.toFixed(4);
  };

  // Find the relevant amount from coinChanges for the current pair
  const getTradeAmount = (trade: TradeData) => {
    // Find the coinChange that matches our pair's baseAddress
    const coinChange = trade.coinChanges.find(
      (change) => change.coinType === pair.baseAddress
    );

    if (coinChange) {
      return coinChange.balance;
    }

    // If we can't find an exact match, return the first one (should not happen)
    return trade.coinChanges[0]?.balance || "0";
  };

  // Generate a unique key for each trade
  const getUniqueTradeKey = (trade: TradeData, index: number) => {
    return `${trade.txDigest}-${trade.eventSeq || 0}-${
      trade.dex || ""
    }-${index}`;
  };

  return (
    <div className="trading-history">
      <div className="history-header">
        <div className="col price">Price</div>
        <div className="col amount">Amount</div>
        <div className="col time">Time</div>
      </div>

      <div className="history-list">
        {initialLoading ? (
          <div className="loading">Loading trades...</div>
        ) : error && trades.length === 0 ? (
          <div className="error">{error}</div>
        ) : trades.length > 0 ? (
          trades.map((trade, index) => (
            <div
              key={getUniqueTradeKey(trade, index)}
              className={`history-item ${trade.type}`}
            >
              <div className={`col price ${trade.type}`}>
                {formatPrice(trade.price)}
              </div>
              <div className="col amount">{getTradeAmount(trade)}</div>
              <div className="col time">{formatTime(trade.timestamp)}</div>
            </div>
          ))
        ) : (
          <div className="no-trades">No recent trades</div>
        )}
      </div>
    </div>
  );
};

export default TradingHistory;
