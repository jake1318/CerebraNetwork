import React, { useEffect, useState } from "react";
import { useDeepBook } from "../../contexts/DeepBookContext";
import "./OrderBook.scss";

interface OrderBookProps {
  poolKey: string;
}

interface OrderItem {
  price: number;
  quantity: number;
}

const OrderBook: React.FC<OrderBookProps> = ({ poolKey }) => {
  const { getOrderBook } = useDeepBook();
  const [orderBook, setOrderBook] = useState<{
    bids: OrderItem[];
    asks: OrderItem[];
  }>({
    bids: [],
    asks: [],
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        setLoading(true);
        setError(null);
        const book = await getOrderBook(poolKey, 10); // Get 10 levels on each side
        setOrderBook(book);
      } catch (err) {
        console.error("Error fetching order book:", err);
        setError("Failed to load order book");
      } finally {
        setLoading(false);
      }
    };

    fetchOrderBook();

    // Refresh order book every 5 seconds
    const intervalId = setInterval(fetchOrderBook, 5000);

    return () => clearInterval(intervalId);
  }, [poolKey]);

  // Format price and quantity properly
  const formatPrice = (price: number) => price.toFixed(6);
  const formatQuantity = (quantity: number) => quantity.toFixed(4);

  if (loading && orderBook.bids.length === 0 && orderBook.asks.length === 0) {
    return (
      <div className="orderbook">
        <h3>Order Book</h3>
        <div className="loading-spinner-small"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="orderbook">
        <h3>Order Book</h3>
        <div className="error-message-small">{error}</div>
      </div>
    );
  }

  return (
    <div className="orderbook">
      <h3>Order Book</h3>

      {/* Asks (sell orders) in reverse order (highest to lowest) */}
      <div className="orderbook__asks">
        <div className="orderbook__header">
          <div className="price">Price</div>
          <div className="quantity">Quantity</div>
          <div className="total">Total</div>
        </div>
        {orderBook.asks
          .slice()
          .reverse()
          .map((ask, index) => (
            <div key={`ask-${index}`} className="orderbook__row ask">
              <div className="price">{formatPrice(ask.price)}</div>
              <div className="quantity">{formatQuantity(ask.quantity)}</div>
              <div className="total">
                {formatQuantity(ask.price * ask.quantity)}
              </div>
              <div
                className="visual-bar"
                style={{
                  width: `${Math.min(
                    (ask.quantity /
                      Math.max(...orderBook.asks.map((a) => a.quantity))) *
                      100,
                    100
                  )}%`,
                }}
              ></div>
            </div>
          ))}
      </div>

      {/* Spread */}
      <div className="orderbook__spread">
        <span>
          Spread:{" "}
          {orderBook.asks.length && orderBook.bids.length
            ? formatPrice(orderBook.asks[0].price - orderBook.bids[0].price)
            : "0.00"}
        </span>
      </div>

      {/* Bids (buy orders) */}
      <div className="orderbook__bids">
        {orderBook.bids.map((bid, index) => (
          <div key={`bid-${index}`} className="orderbook__row bid">
            <div className="price">{formatPrice(bid.price)}</div>
            <div className="quantity">{formatQuantity(bid.quantity)}</div>
            <div className="total">
              {formatQuantity(bid.price * bid.quantity)}
            </div>
            <div
              className="visual-bar"
              style={{
                width: `${Math.min(
                  (bid.quantity /
                    Math.max(...orderBook.bids.map((b) => b.quantity))) *
                    100,
                  100
                )}%`,
              }}
            ></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OrderBook;
