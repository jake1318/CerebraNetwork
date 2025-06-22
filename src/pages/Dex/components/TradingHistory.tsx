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
  timestamp: number; // Store timestamp in milliseconds
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

  // Helper function to check if addresses match, accounting for case sensitivity
  const addressesMatch = (addr1: string, addr2: string): boolean => {
    return addr1.toLowerCase() === addr2.toLowerCase();
  };

  useEffect(() => {
    console.log("Trading pair changed:", pair);
    // Clear trades state immediately when pair changes to reset UI
    setTrades([]);
    setLoading(true);
    setError(null);

    let intervalId: NodeJS.Timeout;
    let abortController: AbortController;

    const fetchTrades = async () => {
      if (!pair.baseAddress || !pair.quoteAddress) {
        setLoading(false);
        return;
      }

      // Create a new AbortController for this fetch request
      abortController = new AbortController();

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
          signal: abortController.signal,
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

        console.log("API Response:", data.data.items.length, "items");
        console.log("Current pair:", {
          baseAddress: pair.baseAddress,
          quoteAddress: pair.quoteAddress,
        });

        // Filter trades involving EXACTLY our pair - both base and quote must match
        const relevantTrades = data.data.items.filter((item) => {
          const isBaseFrom = addressesMatch(
            item.from.address,
            pair.baseAddress
          );
          const isQuoteTo = addressesMatch(item.to.address, pair.quoteAddress);

          const isBaseTo = addressesMatch(item.to.address, pair.baseAddress);
          const isQuoteFrom = addressesMatch(
            item.from.address,
            pair.quoteAddress
          );

          // Either: base→quote OR quote→base swap
          return (isBaseFrom && isQuoteTo) || (isBaseTo && isQuoteFrom);
        });

        console.log("Filtered trades:", relevantTrades.length);

        // Transform the Birdeye response to our Trade interface
        const formattedTrades: Trade[] = relevantTrades.map((item) => {
          // Determine trade type (buy/sell) based on whether base token is being bought or sold
          const isBuy = addressesMatch(item.to.address, pair.baseAddress);

          // Get price by dividing the quote amount by the base amount
          const baseAmount = isBuy ? item.to.uiAmount : item.from.uiAmount;
          const quoteAmount = isBuy ? item.from.uiAmount : item.to.uiAmount;
          const price = quoteAmount / (baseAmount || 1);

          // Format the timestamp
          const date = new Date(item.blockUnixTime * 1000);
          const formattedTime = date.toLocaleTimeString();

          return {
            id: item.txHash,
            price,
            amount: baseAmount,
            total: quoteAmount,
            time: formattedTime,
            timestamp: item.blockUnixTime * 1000, // convert to ms
            type: isBuy ? "buy" : "sell",
          };
        });

        // *** NEW: Accumulate until you've got 20, then cap at 20 ***
        setTrades((prev) => {
          // sort fetched newest-first
          const fetchedSorted = formattedTrades
            .slice() // clone
            .sort((a, b) => b.timestamp - a.timestamp);

          let merged: Trade[];
          if (prev.length < tradeLimit) {
            // build a Map of unique trades by id:
            const byId = new Map<string, Trade>();
            // 1) add newly fetched trades first (newest → oldest)
            for (const t of fetchedSorted) {
              byId.set(t.id, t);
            }
            // 2) then fill in with any previous trades we don't have yet
            for (const t of prev) {
              if (!byId.has(t.id)) {
                byId.set(t.id, t);
              }
            }
            // collect & resort
            merged = Array.from(byId.values()).sort(
              (a, b) => b.timestamp - a.timestamp
            );
          } else {
            // once we have 20, just take the top 20 from fresh data
            merged = fetchedSorted;
          }

          // cap at the tradeLimit (20)
          return merged.slice(0, tradeLimit);
        });

        setLastRefresh(formatRefreshTime());
      } catch (err) {
        // Only log errors that aren't abort errors (which happen during cleanup)
        if ((err as Error).name !== "AbortError") {
          console.error("Error fetching trades:", err);
          setError((err as Error).message || "Failed to fetch trading history");
        }
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchTrades();

    // Set up polling to refresh trades every 5 seconds
    intervalId = setInterval(fetchTrades, 5000);

    // Clean up the interval and abort any pending fetch on component unmount or when pair changes
    return () => {
      clearInterval(intervalId);
      if (abortController) {
        abortController.abort();
      }
    };
  }, [pair.baseAddress, pair.quoteAddress]); // Re-run effect when pair changes

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
