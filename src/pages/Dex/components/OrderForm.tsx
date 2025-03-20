import React, { useState } from "react";
import "./OrderForm.scss";

interface OrderFormProps {
  pair: {
    name: string;
    baseAsset: string;
    quoteAsset: string;
    price: number;
  };
  orderType: "buy" | "sell";
  setOrderType: (type: "buy" | "sell") => void;
  orderMode: "limit" | "market";
  setOrderMode: (mode: "limit" | "market") => void;
}

const OrderForm: React.FC<OrderFormProps> = ({
  pair,
  orderType,
  setOrderType,
  orderMode,
  setOrderMode,
}) => {
  const [price, setPrice] = useState<string>(pair.price.toString());
  const [amount, setAmount] = useState<string>("");
  const [total, setTotal] = useState<string>("");

  // Update total when price or amount changes
  const updateTotal = (newPrice: string, newAmount: string) => {
    if (newPrice && newAmount) {
      const calculatedTotal = parseFloat(newPrice) * parseFloat(newAmount);
      if (!isNaN(calculatedTotal)) {
        setTotal(calculatedTotal.toFixed(2));
      }
    } else {
      setTotal("");
    }
  };

  // Handle price change
  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPrice = e.target.value;
    setPrice(newPrice);
    updateTotal(newPrice, amount);
  };

  // Handle amount change
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value;
    setAmount(newAmount);
    updateTotal(price, newAmount);
  };

  // Handle total change
  const handleTotalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTotal = e.target.value;
    setTotal(newTotal);

    if (newTotal && price && parseFloat(price) > 0) {
      const calculatedAmount = parseFloat(newTotal) / parseFloat(price);
      setAmount(calculatedAmount.toFixed(6));
    }
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // In a real app, this would connect to your trading API or smart contract
    console.log("Order submitted:", {
      pair: pair.name,
      type: orderType,
      mode: orderMode,
      price: orderMode === "limit" ? parseFloat(price) : "Market",
      amount: parseFloat(amount),
      total: parseFloat(total),
    });

    // Reset form
    setAmount("");
    setTotal("");
  };

  // Quick amount selector percentages
  const amountPercentages = [25, 50, 75, 100];

  // Calculate available balance (mock data)
  const availableBalance = {
    base: orderType === "buy" ? 0 : 1.234, // Mock base token balance
    quote: orderType === "buy" ? 10000 : 0, // Mock quote token balance
  };

  // Handle percentage selection
  const handlePercentageClick = (percentage: number) => {
    if (orderType === "buy") {
      // For buy, calculate based on available quote asset
      const maxTotal = availableBalance.quote * (percentage / 100);
      setTotal(maxTotal.toFixed(2));

      if (price && parseFloat(price) > 0) {
        const calculatedAmount = maxTotal / parseFloat(price);
        setAmount(calculatedAmount.toFixed(6));
      }
    } else {
      // For sell, calculate based on available base asset
      const maxAmount = availableBalance.base * (percentage / 100);
      setAmount(maxAmount.toFixed(6));

      if (price) {
        const calculatedTotal = maxAmount * parseFloat(price);
        setTotal(calculatedTotal.toFixed(2));
      }
    }
  };

  return (
    <div className="order-form">
      <div className="order-form-header">
        <h3>Place Order</h3>
        <div className="order-type-selector">
          <button
            className={orderType === "buy" ? "active buy" : ""}
            onClick={() => setOrderType("buy")}
          >
            Buy
          </button>
          <button
            className={orderType === "sell" ? "active sell" : ""}
            onClick={() => setOrderType("sell")}
          >
            Sell
          </button>
        </div>
      </div>

      <div className="order-mode-selector">
        <button
          className={orderMode === "limit" ? "active" : ""}
          onClick={() => setOrderMode("limit")}
        >
          Limit
        </button>
        <button
          className={orderMode === "market" ? "active" : ""}
          onClick={() => setOrderMode("market")}
        >
          Market
        </button>
      </div>

      <form className="order-form-content" onSubmit={handleSubmit}>
        {orderMode === "limit" && (
          <div className="form-group">
            <label>Price ({pair.quoteAsset})</label>
            <div className="input-wrapper">
              <input
                type="number"
                step="0.01"
                value={price}
                onChange={handlePriceChange}
                placeholder={`Price in ${pair.quoteAsset}`}
                required
              />
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Amount ({pair.baseAsset})</label>
          <div className="input-wrapper">
            <input
              type="number"
              step="0.000001"
              value={amount}
              onChange={handleAmountChange}
              placeholder={`Amount in ${pair.baseAsset}`}
              required
            />
          </div>
        </div>

        <div className="form-group">
          <label>Total ({pair.quoteAsset})</label>
          <div className="input-wrapper">
            <input
              type="number"
              step="0.01"
              value={total}
              onChange={handleTotalChange}
              placeholder={`Total in ${pair.quoteAsset}`}
              required
            />
          </div>
        </div>

        <div className="percentage-selector">
          {amountPercentages.map((percentage) => (
            <button
              key={percentage}
              type="button"
              onClick={() => handlePercentageClick(percentage)}
            >
              {percentage}%
            </button>
          ))}
        </div>

        <div className="balance-display">
          <span>Available:</span>
          {orderType === "buy" ? (
            <span>
              {availableBalance.quote.toFixed(2)} {pair.quoteAsset}
            </span>
          ) : (
            <span>
              {availableBalance.base.toFixed(6)} {pair.baseAsset}
            </span>
          )}
        </div>

        <button
          type="submit"
          className={`submit-button ${orderType}`}
          disabled={
            !amount ||
            parseFloat(amount) <= 0 ||
            !total ||
            parseFloat(total) <= 0
          }
        >
          {orderType === "buy"
            ? `Buy ${pair.baseAsset}`
            : `Sell ${pair.baseAsset}`}
        </button>
      </form>
    </div>
  );
};

export default OrderForm;
