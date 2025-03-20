import React from "react";
import "./TradingHistory.scss";

interface TradingHistoryProps {
  pair: {
    name: string;
    baseAsset: string;
    quoteAsset: string;
  };
}

// Generate mock trading history
const generateMockTrades = (basePrice: number) => {
  const trades = [];
  const now = new Date();

  for (let i = 0; i < 15; i++) {
    // Random price around base price
    const priceOffset = (Math.random() - 0.5) * 0.01 * basePrice;
    const price = basePrice + priceOffset;

    // Random amount
    const amount = Math.random() * 2 + 0.1;

    // Random time within last hour
    const time = new Date(now.getTime() - Math.random() * 3600000);

    // Random buy/sell
    const isBuy = Math.random() > 0.5;

    trades.push({
      id: `trade-${i}`,
      price,
      amount,
      total: price * amount,
      time: time.toLocaleTimeString(),
      type: isBuy ? "buy" : "sell",
    });
  }

  // Sort by time (newest first)
  return trades.sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );
};

const TradingHistory: React.FC<TradingHistoryProps> = ({ pair }) => {
  // Mock base price (would come from real data in a production app)
  const basePrice = 56789.32;

  const trades = generateMockTrades(basePrice);

  return (
    <div className="trading-history">
      <div className="trading-history-header">
        <h3>Recent Trades</h3>
      </div>

      <div className="trading-history-content">
        <div className="history-header-row">
          <span>Price ({pair.quoteAsset})</span>
          <span>Amount ({pair.baseAsset})</span>
          <span>Time</span>
        </div>

        <div className="history-rows">
          {trades.map((trade) => (
            <div key={trade.id} className={`history-row ${trade.type}`}>
              <div className="price-col">${trade.price.toFixed(2)}</div>
              <div className="amount-col">{trade.amount.toFixed(4)}</div>
              <div className="time-col">{trade.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TradingHistory;
