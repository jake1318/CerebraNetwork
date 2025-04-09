import React, { useState, useEffect } from "react";
import "./TradingHistory.scss";

interface TradingHistoryProps {
  pair: {
    name: string;
    baseAsset: string;
    quoteAsset: string;
    baseAddress: string;
    quoteAddress: string;
  };
}

interface Trade {
  id: string;
  price: number;
  amount: number;
  total: number;
  time: string;
  type: "buy" | "sell";
}

// Define the Birdeye API response interfaces
interface BirdeyeApiResponse {
  data: {
    items: BirdeyeTradeItem[];
  };
}

interface BirdeyeTradeItem {
  quote: BirdeyeToken;
  base: BirdeyeToken;
  txHash: string;
  blockUnixTime: number;
  side: string;
  from: BirdeyeToken;
  to: BirdeyeToken;
}

interface BirdeyeToken {
  symbol: string;
  decimals: number;
  address: string;
  uiAmount: number;
}

const TradingHistory: React.FC<TradingHistoryProps> = ({ pair }) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string>("");

  // Define the number of trades to show
  const tradeLimit = 20;

  // Function to format current time for displaying last refresh time
  const formatRefreshTime = () => {
    const now = new Date();
    return now.toLocaleTimeString();
  };

  useEffect(() => {
    const fetchTrades = async () => {
      if (!pair.baseAddress) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Encode the address properly for the API call
        const encodedAddress = encodeURIComponent(pair.baseAddress);

        const options = {
          method: "GET",
          headers: {
            accept: "application/json",
            "x-chain": "sui",
            "X-API-KEY": "22430f5885a74d3b97e7cbd01c2140aa",
          },
        };

        const response = await fetch(
          `https://public-api.birdeye.so/defi/txs/token?address=${encodedAddress}&offset=0&limit=50&tx_type=swap&sort_type=desc`,
          options
        );

        if (!response.ok) {
          throw new Error(`API responded with status: ${response.status}`);
        }

        const data: BirdeyeApiResponse = await response.json();

        if (!data || !data.data || !data.data.items) {
          throw new Error("Invalid response format");
        }

        // Filter trades involving our pair
        const relevantTrades = data.data.items.filter((item) => {
          const hasBase =
            item.from.address === pair.baseAddress ||
            item.to.address === pair.baseAddress;
          const hasQuote =
            item.from.address === pair.quoteAddress ||
            item.to.address === pair.quoteAddress;
          return hasBase && hasQuote;
        });

        // Transform the Birdeye response to our Trade interface
        const formattedTrades: Trade[] = relevantTrades.map((item) => {
          // Determine trade type (buy/sell) based on whether base token is being bought or sold
          const isBuy = item.to.address === pair.baseAddress;

          // Get price by dividing the quote amount by the base amount
          const baseAmount = isBuy ? item.to.uiAmount : item.from.uiAmount;
          const quoteAmount = isBuy ? item.from.uiAmount : item.to.uiAmount;
          const price = quoteAmount / (baseAmount || 1);

          // Format the timestamp
          const date = new Date(item.blockUnixTime * 1000);
          const formattedTime = date.toLocaleTimeString();

          return {
            id: item.txHash,
            price: price,
            amount: baseAmount,
            total: quoteAmount,
            time: formattedTime,
            type: isBuy ? "buy" : "sell",
          };
        });

        // Limit to the requested number of trades
        const limitedTrades = formattedTrades.slice(0, tradeLimit);

        setTrades(limitedTrades);
        setLastRefresh(formatRefreshTime());
      } catch (err) {
        console.error("Error fetching trades:", err);
        setError((err as Error).message || "Failed to fetch trading history");
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();

    // Set up polling to refresh trades every 15 seconds
    const intervalId = setInterval(fetchTrades, 15000);

    // Clean up the interval on component unmount
    return () => clearInterval(intervalId);
  }, [pair.baseAddress, pair.quoteAddress]);

  return (
    <div className="trading-history">
      <div className="trading-history-header">
        <h3>Recent Trades</h3>
        {lastRefresh && (
          <div className="refresh-info">Last updated: {lastRefresh}</div>
        )}
      </div>

      <div className="trading-history-content">
        <div className="history-header-row">
          <span>Price ({pair.quoteAsset})</span>
          <span>Amount ({pair.baseAsset})</span>
          <span>Time</span>
        </div>

        <div className="history-rows">
          {loading && trades.length === 0 && (
            <div className="loading-message">Loading recent trades...</div>
          )}

          {error && <div className="error-message">{error}</div>}

          {!loading && !error && trades.length === 0 && (
            <div className="no-trades-message">No recent trades found.</div>
          )}

          {trades.map((trade) => (
            <div key={trade.id} className={`history-row ${trade.type}`}>
              <div className="price-col">${trade.price.toFixed(6)}</div>
              <div className="amount-col">{trade.amount.toFixed(6)}</div>
              <div className="time-col">{trade.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TradingHistory;
