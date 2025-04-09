import React from "react";
import "./OrderBook.scss";

interface OrderBookProps {
  pair: {
    name: string;
    baseAsset: string;
    quoteAsset: string;
  };
}

// Generate mock order book data
const generateMockOrders = (isBuy: boolean, basePrice: number) => {
  const orders = [];
  const direction = isBuy ? -1 : 1;

  for (let i = 0; i < 12; i++) {
    const priceOffset =
      direction * (i * 0.01 * basePrice + Math.random() * 0.005 * basePrice);
    const price = basePrice + priceOffset;
    const amount = Math.random() * 10 + 0.5;
    const total = price * amount;

    orders.push({
      price,
      amount,
      total,
      depth: i * 10 + Math.random() * 5,
    });
  }

  return isBuy ? orders.reverse() : orders;
};

const OrderBook: React.FC<OrderBookProps> = ({ pair }) => {
  // Mock base price (would come from real data in a production app)
  const basePrice = 56789.32;

  const buyOrders = generateMockOrders(true, basePrice);
  const sellOrders = generateMockOrders(false, basePrice);

  return (
    <div className="order-book">
      <div className="order-book-header">
        <h3>Order Book</h3>
        <div className="order-book-controls">
          <button className="active">All</button>
          <button>Buys</button>
          <button>Sells</button>
        </div>
      </div>

      <div className="order-book-content">
        <div className="order-book-header-row">
          <span>Price ({pair.quoteAsset})</span>
          <span>Amount ({pair.baseAsset})</span>
          <span>Total</span>
        </div>

        {/* Sell orders (asks) */}
        <div className="sell-orders">
          {sellOrders.map((order, index) => (
            <div key={`sell-${index}`} className="order-row sell">
              <div className="price-col">${order.price.toFixed(2)}</div>
              <div className="amount-col">{order.amount.toFixed(4)}</div>
              <div className="total-col">${order.total.toFixed(2)}</div>
              <div
                className="depth-indicator sell"
                style={{ width: `${order.depth}%` }}
              ></div>
            </div>
          ))}
        </div>

        {/* Current price indicator */}
        <div className="current-price">
          <div className="price-value">${basePrice.toFixed(2)}</div>
        </div>

        {/* Buy orders (bids) */}
        <div className="buy-orders">
          {buyOrders.map((order, index) => (
            <div key={`buy-${index}`} className="order-row buy">
              <div className="price-col">${order.price.toFixed(2)}</div>
              <div className="amount-col">{order.amount.toFixed(4)}</div>
              <div className="total-col">${order.total.toFixed(2)}</div>
              <div
                className="depth-indicator buy"
                style={{ width: `${order.depth}%` }}
              ></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrderBook;
