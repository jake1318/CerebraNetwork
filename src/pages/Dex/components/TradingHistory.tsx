// src/pages/Dex/components/TradingHistory.tsx
// Last Updated: 2025-06-25 06:32:45 UTC by jake1318

import React, { useState, useEffect } from "react";
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

interface Trade {
  id: string;
  price: number;
  amount: number;
  total: number;
  timestamp: Date;
  type: "buy" | "sell";
}

interface TradingHistoryProps {
  pair: TradingPair;
}

const TradingHistory: React.FC<TradingHistoryProps> = ({ pair }) => {
  const [trades, setTrades] = useState<Trade[]>([]);

  // Mock data generation
  useEffect(() => {
    if (!pair) return;

    // Generate mock trades
    const mockTrades: Trade[] = [];
    const basePrice = pair.price;
    const now = new Date();

    for (let i = 0; i < 30; i++) {
      // Create variation around the base price
      const priceVariation = (Math.random() * 0.01 - 0.005) * basePrice;
      const price = basePrice + priceVariation;

      // Random amount between 0.1 and 5
      const amount = Math.random() * 4.9 + 0.1;

      // Calculate total
      const total = price * amount;

      // Random timestamp within the last hour
      const timestamp = new Date(now.getTime() - Math.random() * 3600000);

      // Random type (buy/sell)
      const type = Math.random() > 0.5 ? "buy" : "sell";

      mockTrades.push({
        id: `trade-${i}-${Date.now()}`,
        price,
        amount,
        total,
        timestamp,
        type,
      });
    }

    // Sort by timestamp (most recent first)
    mockTrades.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    setTrades(mockTrades);
  }, [pair]);

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="trading-history">
      <div className="history-header">
        <div className="col price">Price</div>
        <div className="col amount">Amount</div>
        <div className="col time">Time</div>
      </div>

      <div className="history-list">
        {trades.length > 0 ? (
          trades.map((trade) => (
            <div key={trade.id} className={`history-item ${trade.type}`}>
              <div className="col price">{trade.price.toFixed(6)}</div>
              <div className="col amount">{trade.amount.toFixed(4)}</div>
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
